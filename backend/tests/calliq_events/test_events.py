import asyncio
from datetime import datetime, timedelta
import itertools
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import pytest

from services import calliq_events as events


def event(kind, **kwargs):
    return events.event_metadata(
        dict(
            event=kind,
            pbx_call_id="synthetic-pbx",
            call_start="2026-10-22 10:00:00",
            **kwargs
        )
    )[1]


@pytest.mark.parametrize(
    "value,expected",
    [
        (" 100 ", "100"),
        (100, "100"),
        (None, None),
        ("", None),
        (True, None),
        (["100"], None),
    ],
)
def test_channel_normalization(value, expected):
    assert events.extension(value) == expected


@pytest.mark.parametrize(
    "value,expected",
    [
        ("0", False),
        ("1", True),
        ("false", False),
        ("true", True),
        (False, False),
        (True, True),
        (0, False),
        (1, True),
    ],
)
def test_api_recording_flag_model_does_not_use_string_truthiness(value, expected):
    from models.telephony import TelephonyCall

    document = TelephonyCall(
        phone_number="synthetic",
        direction="inbound",
        status="pending",
        is_recorded=value,
    )
    assert document.is_recorded is expected


def test_lineage_order_independent_and_transfer():
    sequence = [
        event("NOTIFY_START"),
        event("NOTIFY_ANSWER", internal="100"),
        event("NOTIFY_ANSWER", internal="101", transfer_from="100"),
        event(
            "NOTIFY_END", internal="100", last_internal="101", disposition="answered"
        ),
    ]
    for permutation in itertools.permutations(sequence):
        state = events.summarize_events(permutation)
        assert (
            state["channel"] == "101"
            and state["direction"] == "inbound"
            and state["channel_role"] == "answered"
        )


def test_ambiguous_and_unknown_no_default_assignment():
    assert events.summarize_events([event("NOTIFY_RECORD")])["channel"] is None
    state = events.summarize_events(
        [event("NOTIFY_ANSWER", internal="100"), event("NOTIFY_ANSWER", internal="101")]
    )
    assert state["channel"] is None and state["channel_state"] == "ambiguous"


@pytest.mark.parametrize(
    "rows",
    [
        [],
        [
            {
                "pbx_call_id": "other",
                "call_id": "r",
                "sip": "100",
                "disposition": "answered",
            }
        ],
        [
            {
                "pbx_call_id": "synthetic-pbx",
                "call_id": "r",
                "sip": "999",
                "disposition": "answered",
            }
        ],
        [
            {
                "pbx_call_id": "synthetic-pbx",
                "call_id": "r",
                "sip": "100",
                "disposition": "no answer",
            }
        ],
        [
            {
                "pbx_call_id": "synthetic-pbx",
                "call_id": "r",
                "sip": "100",
                "disposition": "busy",
            }
        ],
    ],
)
def test_no_invented_whole_call_outcome(rows):
    result = events.interpret_statistics(
        "synthetic-pbx",
        rows,
        "2026-10-22T12:00:00Z",
        [event("NOTIFY_ANSWER", internal="100")],
    )
    assert result["provider_outcome"] == "unknown"


def test_verified_answer_requires_exact_call_and_leg_or_recording():
    row = {
        "pbx_call_id": "synthetic-pbx",
        "call_id": "synthetic-r",
        "sip": 100,
        "disposition": "answered",
    }
    assert (
        events.interpret_statistics("synthetic-pbx", [row], "now", [])[
            "provider_outcome"
        ]
        == "unknown"
    )
    state = events.interpret_statistics(
        "synthetic-pbx", [row], "now", [event("NOTIFY_ANSWER", internal=" 100 ")]
    )
    assert state["provider_outcome"] == "answered" and state["provider_evidence"][
        "provider_call_ids"
    ] == ["synthetic-r"]
    assert (
        events.interpret_statistics(
            "synthetic-pbx",
            [row],
            "now",
            [event("NOTIFY_RECORD", call_id_with_rec="synthetic-r")],
        )["provider_outcome"]
        == "answered"
    )


@pytest.mark.asyncio
async def test_pagination_complete_and_invalid_response():
    provider = NS(
        get_pbx_statistics=AsyncMock(
            side_effect=[
                {"status": "success", "stats": [{}] * 1000},
                {"status": "success", "stats": []},
            ]
        )
    )
    assert (
        len(await events.statistics_pages(provider, "start", "end", "inbound")) == 1000
    )
    assert provider.get_pbx_statistics.await_args.kwargs == {
        "skip": 1000,
        "call_type": "in",
    }
    provider.get_pbx_statistics = AsyncMock(
        return_value={"status": "error", "stats": []}
    )
    with pytest.raises(RuntimeError):
        await events.statistics_pages(provider, "start", "end", "inbound")


@pytest.mark.asyncio
async def test_observation_duplicate_durable_and_late_line(clean_db):
    await clean_db.telephony_calls.insert_one(
        {"_id": "synthetic-id", "pbx_call_id": "synthetic-pbx", "status": "pending"}
    )
    record = {
        "event": "NOTIFY_RECORD",
        "pbx_call_id": "synthetic-pbx",
        "call_id_with_rec": "r",
    }
    first = await events.observe_event(clean_db, record)
    duplicate = await events.observe_event(clean_db, record)
    assert first["calliq_revision"] == duplicate["calliq_revision"] == 1
    late = await events.observe_event(
        clean_db,
        {"event": "NOTIFY_ANSWER", "pbx_call_id": "synthetic-pbx", "internal": 100},
    )
    assert (
        late["channel"] == "100"
        and late["call_outcome"] == "unknown"
        and late["status"] == "pending"
    )
    assert len(late["calliq_events"]) == 2


@pytest.mark.asyncio
async def test_delivery_retry_bound_and_restart_recovery(clean_db):
    await clean_db.telephony_calls.insert_one(
        {
            "_id": "s",
            "pbx_call_id": "synthetic-pbx",
            "calliq_revision": 1,
            "calliq_delivery_pending": True,
            "calliq_events": [],
        }
    )
    client = NS(
        project_id="1",
        is_configured=lambda: True,
        upsert_metadata=AsyncMock(side_effect=RuntimeError("synthetic")),
    )
    for _ in range(8):
        await events.deliver_metadata(clean_db, {"_id": "s"}, client)
    assert client.upsert_metadata.await_count == 6
    document = await clean_db.telephony_calls.find_one({"_id": "s"})
    assert not document["calliq_delivery_pending"] and document["calliq_sync_error"]
    await clean_db.telephony_calls.update_one(
        {"_id": "s"},
        {"$set": {"calliq_delivery_pending": True, "calliq_delivery_attempts": 0}},
    )
    client.upsert_metadata = AsyncMock(return_value={"id": 7})
    await events.deliver_metadata(clean_db, {"_id": "s"}, client)
    assert (await clean_db.telephony_calls.find_one({"_id": "s"}))[
        "calliq_metadata_id"
    ] == 7


@pytest.mark.asyncio
async def test_reconcile_does_not_downgrade_answer(clean_db):
    document = {
        "_id": "s",
        "pbx_call_id": "synthetic-pbx",
        "calliq_revision": 1,
        "calliq_events": [event("NOTIFY_ANSWER", internal=100)],
        "provider_outcome": "answered",
        "provider_status": "answered",
        "provider_disposition": "answered",
        "provider_evidence": {
            "state": "confirmed",
            "scope": "leg",
            "source": "zadarma_statistics",
            "provider_call_ids": ["r"],
        },
    }
    await clean_db.telephony_calls.insert_one(document)
    provider = NS(
        get_pbx_statistics=AsyncMock(return_value={"status": "success", "stats": []})
    )
    client = NS(is_configured=lambda: False)
    await events.reconcile_document(clean_db, document, provider, client)
    result = await clean_db.telephony_calls.find_one({"_id": "s"})
    assert result["status"] == "answered" and result["call_outcome"] == "answered"


@pytest.mark.asyncio
async def test_reconciliation_failures_bounded_and_history_not_scanned(clean_db):
    await clean_db.telephony_calls.insert_many(
        [
            {"_id": "historical", "pbx_call_id": "old", "status": "missed"},
            {
                "_id": "new",
                "pbx_call_id": "synthetic-pbx",
                "calliq_revision": 1,
                "calliq_events": [event("NOTIFY_END", disposition="no answer")],
                "calliq_reconcile_pending": True,
                "calliq_reconcile_after": datetime.utcnow() - timedelta(seconds=1),
            },
        ]
    )
    provider = NS(
        get_pbx_statistics=AsyncMock(side_effect=RuntimeError("provider unavailable"))
    )
    for _ in range(8):
        await clean_db.telephony_calls.update_one(
            {"_id": "new"},
            {
                "$set": {
                    "calliq_reconcile_after": datetime.utcnow() - timedelta(seconds=1)
                }
            },
        )
        await events.reconcile_pending(
            clean_db, provider, NS(is_configured=lambda: False)
        )
    assert provider.get_pbx_statistics.await_count == 6
    assert (await clean_db.telephony_calls.find_one({"_id": "historical"})) == {
        "_id": "historical",
        "pbx_call_id": "old",
        "status": "missed",
    }


@pytest.mark.asyncio
async def test_worker_disabled_by_default_and_enabled_lifecycle(clean_db, monkeypatch):
    monkeypatch.delenv("CALLIQ_EVENT_SYNC_ENABLED", raising=False)
    reconcile = AsyncMock()
    monkeypatch.setattr(events, "reconcile_pending", reconcile)
    async with events.reconciliation_lifespan(clean_db, NS(), NS()):
        await asyncio.sleep(0)
        reconcile.assert_not_awaited()
    monkeypatch.setenv("CALLIQ_EVENT_SYNC_ENABLED", "true")
    async with events.reconciliation_lifespan(clean_db, NS(), NS()):
        await asyncio.sleep(0)
        reconcile.assert_awaited_once()


@pytest.mark.asyncio
async def test_statistics_wrapper_uses_existing_signed_transport(monkeypatch):
    from services.telephony_service import telephony_service

    request = AsyncMock(return_value={"status": "success", "stats": []})
    monkeypatch.setattr(telephony_service, "_api_request", request)
    await telephony_service.get_pbx_statistics(
        "start", "end", skip=1000, call_type="in"
    )
    request.assert_awaited_once_with(
        "GET",
        "statistics/pbx",
        params={
            "start": "start",
            "end": "end",
            "version": 2,
            "skip": 1000,
            "limit": 1000,
            "call_type": "in",
        },
    )


@pytest.mark.asyncio
async def test_incomplete_pagination_never_produces_result():
    provider = NS(
        get_pbx_statistics=AsyncMock(
            return_value={"status": "success", "stats": [{}] * 1000}
        )
    )
    with pytest.raises(RuntimeError, match="incomplete"):
        await events.statistics_pages(provider, "start", "end", "unknown")
    assert provider.get_pbx_statistics.await_count == 20


@pytest.mark.asyncio
async def test_expired_metadata_token_refreshes_once(monkeypatch):
    import httpx
    from services.calliq_client import CalliqClient

    for key, value in {
        "URL": "https://calliq.test",
        "EMAIL": "synthetic@example.com",
        "PASSWORD": "synthetic",
        "PROJECT_ID": "1",
    }.items():
        monkeypatch.setenv("CALLIQ_" + key, value)
    requests = []

    async def respond(request):
        requests.append(request.url.path)
        if request.url.path == "/auth/login":
            return httpx.Response(200, json={"access_token": "new-token"})
        if request.headers["Authorization"] == "Bearer expired":
            return httpx.Response(401)
        return httpx.Response(200, json={"id": 7})

    client = CalliqClient()
    await client._client.aclose()
    client._client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    client._token = "expired"
    try:
        assert await client.upsert_metadata({"project_id": 1}) == {"id": 7}
        assert requests == ["/calls/metadata", "/auth/login", "/calls/metadata"]
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_failed_daily_request_is_shared_across_batch(clean_db):
    for key in ("a", "b"):
        await clean_db.telephony_calls.insert_one(
            {
                "_id": key,
                "pbx_call_id": key,
                "calliq_revision": 1,
                "calliq_events": [event("NOTIFY_END")],
                "calliq_reconcile_pending": True,
                "calliq_reconcile_after": datetime.utcnow() - timedelta(seconds=1),
            }
        )
    provider = NS(get_pbx_statistics=AsyncMock(side_effect=RuntimeError("unavailable")))
    await events.reconcile_pending(clean_db, provider, NS(is_configured=lambda: False))
    provider.get_pbx_statistics.assert_awaited_once()
    for key in ("a", "b"):
        assert (await clean_db.telephony_calls.find_one({"_id": key}))[
            "calliq_reconcile_attempts"
        ] == 1
