"""Real CRM webhook/exporter -> real CallIQ ASGI app; all provider IO is mocked."""

import asyncio
import os
from datetime import datetime
from pathlib import Path
import sys
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI

from routers import telephony
from services.calliq_client import CalliqClient
from services import calliq_events as events


async def drain():
    for _ in range(10):
        tasks = list(telephony._calliq_tasks | events._tasks)
        if not tasks:
            return
        await asyncio.gather(*tasks)
        await asyncio.sleep(0)
    raise AssertionError("Background tasks did not drain")


@pytest_asyncio.fixture
async def bridge(clean_db, monkeypatch, tmp_path):
    calliq = Path(
        os.getenv(
            "CALLIQ_TEST_ROOT",
            str(Path(__file__).resolve().parents[4] / "calliq-events"),
        )
    )
    assert (
        calliq / "app/main.py"
    ).is_file(), "Set CALLIQ_TEST_ROOT to the isolated CallIQ checkout"
    sys.path.insert(0, str(calliq))
    from sqlalchemy import create_engine
    from app import db as dbmod
    from app.config import get_settings
    from app.api import calls
    from app.main import app as calliq_app
    from app.models import Call

    # Separate request sessions need independent connections, as in production.
    engine = create_engine(
        "sqlite:///" + str(tmp_path / "bridge.db"),
        connect_args={"check_same_thread": False},
    )
    monkeypatch.setattr(dbmod, "_engine", engine)
    monkeypatch.setattr(dbmod, "_SessionLocal", None)
    monkeypatch.setattr(get_settings(), "media_dir", str(tmp_path / "calliq-audio"))
    dbmod.init_db()
    transcriptions = []

    def synthetic_asr(cid):
        transcriptions.append(cid)
        with dbmod._get_session_maker()() as db:
            call = db.get(Call, cid)
            call.status = "done"
            call.transcript = "Synthetic transcript"
            call.metrics = '{"duration_sec":1}'
            call.duration_sec = 1
            db.commit()

    monkeypatch.setattr(calls, "process_call", synthetic_asr)
    monkeypatch.chdir(tmp_path)
    (tmp_path / "uploads").mkdir()
    (tmp_path / "uploads/synthetic.mp3").write_bytes(b"synthetic-audio")
    monkeypatch.setattr(telephony, "get_database", lambda: clean_db)
    monkeypatch.setattr(telephony, "_capture_call_attribution", AsyncMock())
    monkeypatch.setattr(
        telephony, "_resolve_contact_name", AsyncMock(return_value="Synthetic Contact")
    )
    monkeypatch.setattr(
        telephony,
        "_download_call_record",
        AsyncMock(return_value=("/uploads/synthetic.mp3", None)),
    )
    monkeypatch.setenv("CALLIQ_EVENT_SYNC_ENABLED", "true")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=calliq_app), base_url="http://calliq-local"
    ) as iq:
        assert (
            await iq.post(
                "/auth/register",
                json={"email": "synthetic@example.com", "password": "synthetic123"},
            )
        ).status_code == 201
        token = (
            await iq.post(
                "/auth/login",
                json={"email": "synthetic@example.com", "password": "synthetic123"},
            )
        ).json()["access_token"]
        headers = {"Authorization": "Bearer " + token}
        pid = (
            await iq.post(
                "/projects", headers=headers, json={"name": "Synthetic project"}
            )
        ).json()["id"]
        await iq.put(
            "/operators",
            headers=headers,
            json={"project_id": pid, "channel": "100", "name": "Operator A"},
        )
        await iq.put(
            "/operators",
            headers=headers,
            json={"project_id": pid, "channel": "101", "name": "Operator B"},
        )
        for key, value in {
            "CALLIQ_URL": "https://calliq.test",
            "CALLIQ_EMAIL": "synthetic@example.com",
            "CALLIQ_PASSWORD": "synthetic123",
            "CALLIQ_PROJECT_ID": str(pid),
        }.items():
            monkeypatch.setenv(key, value)
        exporter = CalliqClient()
        await exporter._client.aclose()

        async def forward(request):
            assert request.url.host == "calliq.test"
            result = await iq.request(
                request.method,
                request.url.raw_path.decode(),
                content=await request.aread(),
                headers=dict(request.headers),
            )
            return httpx.Response(result.status_code, json=result.json())

        exporter._client = httpx.AsyncClient(transport=httpx.MockTransport(forward))
        monkeypatch.setattr(telephony, "get_calliq_client", lambda: exporter)
        crm_app = FastAPI()
        crm_app.include_router(telephony.router)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=crm_app), base_url="http://crm-local"
        ) as crm:

            async def send(kind, **kwargs):
                payload = dict(
                    event=kind,
                    pbx_call_id="synthetic-pbx",
                    call_start="2026-10-22 10:00:00",
                    caller_id="+77771234567",
                    **kwargs
                )
                result = await crm.post("/api/telephony/webhook/events", json=payload)
                assert result.status_code == 200, result.text
                await drain()

            yield NS(
                send=send,
                iq=iq,
                headers=headers,
                db=clean_db,
                exporter=exporter,
                transcriptions=transcriptions,
                pid=pid,
            )
        await drain()
        await exporter.aclose()
    engine.dispose()


async def calls(bridge):
    return (await bridge.iq.get("/calls", headers=bridge.headers)).json()


@pytest.mark.asyncio
@pytest.mark.parametrize("recording_flag", ["0", False, "false", "1", True, "true"])
async def test_no_audio_no_missed_or_transcript_invented(bridge, recording_flag):
    await bridge.send("NOTIFY_START")
    await bridge.send(
        "NOTIFY_END",
        internal=" 100 ",
        disposition="no answer",
        is_recorded=recording_flag,
    )
    data = await calls(bridge)
    assert (
        len(data) == 1
        and data[0]["channel"] == "100"
        and data[0]["operator_name"] == "Operator A"
    )
    assert (
        data[0]["call_outcome"] == "unknown"
        and data[0]["direction"] == "inbound"
        and not data[0]["has_audio"]
    )
    detail = (
        await bridge.iq.get("/calls/" + str(data[0]["id"]), headers=bridge.headers)
    ).json()
    assert (
        detail["transcript"] is None
        and detail["analysis"] is None
        and detail["metrics"] is None
    )
    assert not bridge.transcriptions
    assert (await bridge.db.telephony_calls.find_one({"pbx_call_id": "synthetic-pbx"}))[
        "status"
    ] == "pending"


@pytest.mark.asyncio
async def test_standard_answer_and_record_fix_line_loss(bridge):
    await bridge.send("NOTIFY_START")
    await bridge.send("NOTIFY_ANSWER", internal=100)
    await bridge.send("NOTIFY_END", internal="100", disposition="answered")
    await bridge.send("NOTIFY_RECORD", call_id_with_rec="synthetic-r1")
    data = await calls(bridge)
    assert (
        len(data) == 1
        and data[0]["channel"] == "100"
        and data[0]["operator_name"] == "Operator A"
        and data[0]["has_audio"]
    )
    assert (
        data[0]["call_outcome"] == "unknown"
    )  # Webhook answered is not a verified API outcome.
    provider = NS(
        get_pbx_statistics=AsyncMock(
            return_value={
                "status": "success",
                "stats": [
                    {
                        "pbx_call_id": "synthetic-pbx",
                        "call_id": "synthetic-r1",
                        "sip": 100,
                        "disposition": "answered",
                    }
                ],
            }
        )
    )
    document = await bridge.db.telephony_calls.find_one(
        {"pbx_call_id": "synthetic-pbx"}
    )
    await events.reconcile_document(bridge.db, document, provider, bridge.exporter)
    assert (await calls(bridge))[0]["call_outcome"] == "answered"
    await bridge.send("NOTIFY_END", internal="101", disposition="no answer")
    assert (await calls(bridge))[0]["call_outcome"] == "answered"
    assert (await calls(bridge))[0]["channel"] == "100"


@pytest.mark.asyncio
async def test_record_first_late_line_no_retranscription_and_duplicates(bridge):
    await bridge.send("NOTIFY_RECORD", call_id_with_rec="synthetic-r1")
    initial = (await calls(bridge))[0]
    assert initial["channel"] is None
    await bridge.send("NOTIFY_ANSWER", internal=" 100 ")
    await bridge.send("NOTIFY_START")
    await bridge.send("NOTIFY_RECORD", call_id_with_rec="synthetic-r1")
    data = await calls(bridge)
    assert (
        len(data) == 1
        and data[0]["id"] == initial["id"]
        and data[0]["channel"] == "100"
    )
    assert len(bridge.transcriptions) == 1


@pytest.mark.asyncio
async def test_transfer_multiple_recordings_stay_one_logical_call(bridge):
    await bridge.send("NOTIFY_START")
    await bridge.send("NOTIFY_ANSWER", internal="100")
    await bridge.send("NOTIFY_RECORD", call_id_with_rec="synthetic-r1")
    await bridge.send("NOTIFY_ANSWER", internal="101", transfer_from="100")
    await bridge.send(
        "NOTIFY_END", internal="100", last_internal="101", disposition="answered"
    )
    await bridge.send("NOTIFY_RECORD", call_id_with_rec="synthetic-r2")
    data = await calls(bridge)
    assert (
        len(data) == 1
        and data[0]["channel"] == "101"
        and data[0]["operator_name"] == "Operator B"
    )
    detail = (
        await bridge.iq.get("/calls/" + str(data[0]["id"]), headers=bridge.headers)
    ).json()
    assert len(detail["recordings"]) == 2 and len(bridge.transcriptions) == 2


@pytest.mark.asyncio
async def test_negative_foreign_and_wrong_leg_statistics_do_not_claim_finality(bridge):
    await bridge.send("NOTIFY_START")
    await bridge.send("NOTIFY_ANSWER", internal="100")
    provider = NS(
        get_pbx_statistics=AsyncMock(
            return_value={
                "status": "success",
                "stats": [
                    {
                        "pbx_call_id": "other",
                        "call_id": "foreign",
                        "sip": 100,
                        "disposition": "answered",
                    },
                    {
                        "pbx_call_id": "synthetic-pbx",
                        "call_id": "wrong-leg",
                        "sip": 999,
                        "disposition": "answered",
                    },
                    {
                        "pbx_call_id": "synthetic-pbx",
                        "call_id": "negative",
                        "sip": 100,
                        "disposition": "no answer",
                    },
                ],
            }
        )
    )
    for _ in range(2):
        document = await bridge.db.telephony_calls.find_one(
            {"pbx_call_id": "synthetic-pbx"}
        )
        await events.reconcile_document(bridge.db, document, provider, bridge.exporter)
    assert (await calls(bridge))[0]["call_outcome"] == "unknown"
