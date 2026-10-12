import asyncio
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi import FastAPI

from routers import telephony
from services.calliq_client import CalliqClient


@pytest.mark.parametrize("existing", [True, False])
async def test_record_upload(clean_db, monkeypatch, tmp_path, existing):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "uploads").mkdir()
    (tmp_path / "uploads" / "record.mp3").write_bytes(b"audio")
    monkeypatch.setattr(telephony, "get_database", lambda: clean_db)
    monkeypatch.setattr(telephony, "_download_call_record", AsyncMock(return_value=("/uploads/record.mp3", None)))
    staff_id = (await clean_db.staff.insert_one({"extension": "100", "full_name": "Operator Name"})).inserted_id
    client = MagicMock()
    client.is_configured.return_value = True
    client.upload_call = AsyncMock(return_value=42)
    client.get_call = AsyncMock(return_value={"metrics": {}, "transcript": "hello"})
    monkeypatch.setattr(telephony, "get_calliq_client", lambda: client)
    if existing:
        await clean_db.telephony_calls.insert_one({"pbx_call_id": "pbx", "contact_name": "Contact"})
    app = FastAPI()
    app.include_router(telephony.router)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as http:
            response = await http.post("/api/telephony/webhook/events", json={
                "event": "NOTIFY_RECORD", "pbx_call_id": "pbx", "call_id_with_rec": "rec", "last_internal": "100"})
        assert response.json() == {"status": "ok"}
        await asyncio.gather(*list(telephony._calliq_tasks))
        client.upload_call.assert_awaited_once_with(str(telephony.Path("uploads") / "record.mp3"), "Operator Name", "100")
        doc = await clean_db.telephony_calls.find_one({"pbx_call_id": "pbx"})
        assert doc["calliq_call_id"] == 42
        assert doc["calliq_status"] == "done"
        assert doc["calliq_metrics"] == {}
        assert doc["calliq_transcript"] == "hello"
    finally:
        await clean_db.staff.delete_one({"_id": staff_id})


async def test_record_pushes_channel_from_existing_call(clean_db, monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "uploads").mkdir()
    (tmp_path / "uploads" / "record.mp3").write_bytes(b"audio")
    await clean_db.telephony_calls.insert_one({
        "pbx_call_id": "pbx-x", "raw_payload": {"internal": "100"}})
    monkeypatch.setattr(telephony, "get_database", lambda: clean_db)
    monkeypatch.setattr(telephony, "_download_call_record", AsyncMock(return_value=("/uploads/record.mp3", None)))
    client = MagicMock()
    client.is_configured.return_value = True
    client.upload_call = AsyncMock(return_value=42)
    client.get_call = AsyncMock(return_value={"metrics": {}})
    monkeypatch.setattr(telephony, "get_calliq_client", lambda: client)
    app = FastAPI()
    app.include_router(telephony.router)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as http:
        response = await asyncio.wait_for(http.post("/api/telephony/webhook/events", json={
            "event": "NOTIFY_RECORD", "pbx_call_id": "pbx-x", "call_id_with_rec": "r"}), 2)
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    await asyncio.gather(*list(telephony._calliq_tasks))
    client.upload_call.assert_awaited_once()
    assert client.upload_call.await_args.args[2] == "100"


async def test_unconfigured_record_no_network(clean_db, monkeypatch, tmp_path):
    monkeypatch.delenv("CALLIQ_URL", raising=False)
    client = CalliqClient()
    client.upload_call = AsyncMock(side_effect=AssertionError("network forbidden"))
    monkeypatch.setattr(telephony, "get_calliq_client", lambda: client)
    monkeypatch.setattr(telephony, "get_database", lambda: clean_db)
    monkeypatch.setattr(telephony, "_download_call_record", AsyncMock(return_value=(None, None)))
    app = FastAPI()
    app.include_router(telephony.router)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as http:
            response = await http.post("/api/telephony/webhook/events", json={"event": "NOTIFY_RECORD", "call_id_with_rec": "rec"})
        assert response.json() == {"status": "ok"}
        client.upload_call.assert_not_awaited()
    finally:
        await client.aclose()


@pytest.mark.parametrize("results, expected, polls", [
    ([{"metrics": None}, {"metrics": {"score": 5}, "transcript": "text"}], "done", 2),
    ([{"status": "error"}], "error", 1),
    ([{"metrics": None}] * 6, "sent", 6),
])
async def test_polling_updates_exact_document(clean_db, monkeypatch, results, expected, polls):
    first = (await clean_db.telephony_calls.insert_one({"pbx_call_id": "same"})).inserted_id
    second = (await clean_db.telephony_calls.insert_one({"pbx_call_id": "same"})).inserted_id
    client = MagicMock()
    client.upload_call = AsyncMock(return_value=12)
    client.get_call = AsyncMock(side_effect=results)
    sleep = AsyncMock()
    monkeypatch.setattr(telephony.asyncio, "sleep", sleep)
    await telephony._push_call_to_calliq(client, "record.mp3", None, "", {"_id": second}, clean_db)
    assert "calliq_call_id" not in await clean_db.telephony_calls.find_one({"_id": first})
    doc = await clean_db.telephony_calls.find_one({"_id": second})
    assert doc["calliq_status"] == expected
    assert doc["calliq_call_id"] == 12
    assert client.get_call.await_count == polls
    assert sleep.await_count == polls - 1


async def test_upload_failure_is_contained(clean_db):
    inserted = await clean_db.telephony_calls.insert_one({"pbx_call_id": "pbx"})
    client = MagicMock()
    client.upload_call = AsyncMock(side_effect=RuntimeError("offline"))
    await telephony._push_call_to_calliq(client, "record.mp3", None, "100", {"_id": inserted.inserted_id}, clean_db)
    assert "calliq_call_id" not in await clean_db.telephony_calls.find_one({"_id": inserted.inserted_id})


async def test_webhook_does_not_wait_for_upload(clean_db, monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "uploads").mkdir()
    (tmp_path / "uploads" / "record.mp3").write_bytes(b"audio")
    monkeypatch.setattr(telephony, "get_database", lambda: clean_db)
    client = MagicMock()
    client.is_configured.return_value = True
    started, release = asyncio.Event(), asyncio.Event()

    async def upload(*args):
        started.set()
        await release.wait()
        return 42

    client.upload_call = AsyncMock(side_effect=upload)
    client.get_call = AsyncMock(return_value={"metrics": {}})
    monkeypatch.setattr(telephony, "get_calliq_client", lambda: client)
    app = FastAPI()
    app.include_router(telephony.router)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as http:
        response = await asyncio.wait_for(http.post("/api/telephony/webhook/events", json={
            "event": "NOTIFY_RECORD", "recording_url": "/uploads/record.mp3", "internal": "100"}), 2)
    try:
        assert response.json() == {"status": "ok"}
        await asyncio.wait_for(started.wait(), 2)
        assert not release.is_set()
    finally:
        release.set()
        await asyncio.gather(*list(telephony._calliq_tasks))
