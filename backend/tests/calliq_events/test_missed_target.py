"""Recipients of missed calls come from exact PBX statistics, never defaults."""

from copy import deepcopy
from datetime import timedelta
from types import SimpleNamespace as NS

import pytest

from services import calliq_events as events
from services.calliq_outcomes import StatisticsSnapshot, interpret_statistics


def lifecycle():
    return [{"event": "NOTIFY_START"}, {"event": "NOTIFY_END", "channel": "0"}]


def decide(targets=("201",), known=("201",)):
    rows = [
        {
            "pbx_call_id": "synthetic",
            "call_id": f"leg-{sip}",
            "sip": sip,
            "disposition": "no answer",
            "seconds": 0,
            "is_recorded": "0",
        }
        for sip in ("0", *targets)
    ]
    result = interpret_statistics(
        "synthetic",
        rows,
        "2026-10-22T12:00:00Z",
        lifecycle(),
        known_extensions=known,
        direction="inbound",
        complete=True,
        quiet_seconds=1800,
        stable_seconds=1200,
        allow_derived=True,
    )
    return result


def export(result, sequence=None):
    return events.snapshot(
        {
            "pbx_call_id": "synthetic",
            "calliq_revision": 2,
            "calliq_events": lifecycle() if sequence is None else sequence,
            **result,
        },
        7,
    )


def test_unique_normalized_statistics_target_survives_export_without_answer():
    state = decide((" 201 ",))
    payload = export(state)
    assert payload["outcome"] == "missed"
    assert (payload["channel"], payload["channel_role"], payload["channel_state"]) == (
        "201",
        "target",
        "resolved",
    )
    assert state["provider_target"]["channels"] == ["201"]


@pytest.mark.parametrize("known", [("201",), ("201", "202")])
def test_multiple_statistics_recipients_never_choose_one_even_if_only_one_is_mapped(
    known,
):
    payload = export(decide(("201", "202"), known))
    assert payload["outcome"] == "missed"
    assert payload["channel"] is None and payload["channel_state"] == "ambiguous"


def test_webhook_transfer_or_conflicting_target_is_not_overridden():
    state = decide()
    sequence = [
        {"event": "NOTIFY_START", "channel": "202"},
        {"event": "NOTIFY_END", "channel": "203"},
    ]
    assert export(state, sequence)["channel_state"] == "ambiguous"
    assert export(state, [sequence[0]])["channel"] is None
    assert export(state, [sequence[0]])["channel_state"] == "ambiguous"
    assert (
        export(
            state, [{"event": "NOTIFY_END", "channel": "201", "last_internal": "202"}]
        )["channel_state"]
        == "ambiguous"
    )


def test_unknown_or_pending_never_reuses_prior_statistics_target():
    state = decide()
    for outcome in ("unknown", "pending", "review_required", "answered"):
        changed = deepcopy(state)
        changed["provider_outcome"] = outcome
        assert export(changed)["channel"] is None
    assert decide(("202",))["provider_outcome"] == "unknown"
    assert decide(("202",))["provider_target"] is None


def test_another_known_failed_recipient_prevents_individual_attribution():
    rows = [
        {
            "pbx_call_id": "synthetic",
            "call_id": "one",
            "sip": "201",
            "disposition": "no answer",
            "seconds": 0,
            "is_recorded": "0",
        },
        {
            "pbx_call_id": "synthetic",
            "call_id": "two",
            "sip": "202",
            "disposition": "call failed",
            "seconds": 0,
            "is_recorded": "0",
        },
    ]
    state = interpret_statistics(
        "synthetic",
        rows,
        "2026-10-22T12:00:00Z",
        lifecycle(),
        known_extensions=["201", "202"],
        direction="inbound",
        complete=True,
        quiet_seconds=1800,
        stable_seconds=1200,
        allow_derived=True,
    )
    assert export(state)["channel"] is None
    assert export(state)["channel_state"] == "ambiguous"


@pytest.mark.asyncio
async def test_late_unique_event_clears_old_statistics_target(clean_db):
    await clean_db.telephony_calls.insert_one(
        {
            "pbx_call_id": "synthetic",
            "calliq_revision": 2,
            "calliq_events": [],
            **decide(),
        }
    )
    document = await events.observe_event(
        clean_db,
        {"pbx_call_id": "synthetic", "event": "NOTIFY_INTERNAL", "internal": "202"},
    )
    assert "provider_target" not in document
    assert document["provider_outcome"] == "unknown"
    assert events.snapshot(document, 7)["channel"] == "202"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "recipient_sips,expected_channel,expected_name",
    [
        ((" 100 ",), "100", "Operator A"),
        ((100,), "100", "Operator A"),
        (("100", "101"), None, None),
        (("100", "999"), None, None),
    ],
)
async def test_stats_only_target_reaches_real_calliq_operator_join(
    bridge, monkeypatch, recipient_sips, expected_channel, expected_name
):
    # Fixture is defined in test_bridge; explicitly imported below for reuse.
    monkeypatch.setenv("CALLIQ_DERIVED_MISSED_ENABLED", "true")
    monkeypatch.setenv("ZADARMA_SIP_INTERNAL", "100")
    await bridge.send("NOTIFY_START")
    await bridge.send("NOTIFY_END", internal="0")
    doc = await bridge.db.telephony_calls.find_one({"pbx_call_id": "synthetic-pbx"})
    start = doc["calliq_last_event_at"]
    shape = [
        {
            "pbx_call_id": "synthetic-pbx",
            "call_id": f"row-{sip}",
            "sip": sip,
            "disposition": "no answer",
            "seconds": 0,
            "is_recorded": "0",
        }
        for sip in ("0", *recipient_sips)
    ]
    for minutes in (20, 30):
        await events.reconcile_document(
            bridge.db,
            doc,
            NS(),
            bridge.exporter,
            start + timedelta(minutes=minutes),
            StatisticsSnapshot(shape, direction="inbound", complete=True),
        )
        doc = await bridge.db.telephony_calls.find_one({"pbx_call_id": "synthetic-pbx"})
    response = await bridge.iq.get(
        "/calls/page",
        headers=bridge.headers,
        params={"project_id": bridge.pid, "outcome": "missed", "limit": 1},
    )
    item = response.json()["items"][0]
    assert response.json()["total"] == 1
    assert (item["channel"], item["operator_name"], item["channel_role"]) == (
        expected_channel,
        expected_name,
        "target" if expected_channel else "unknown",
    )
    assert not item["has_audio"] and not bridge.transcriptions
    # Retry delivery uses the same logical call; the KPI cannot count the retry twice.
    await bridge.exporter.upsert_metadata(events.snapshot(doc, bridge.pid))
    assert (
        await bridge.iq.get(
            "/calls/page", headers=bridge.headers, params={"outcome": "missed"}
        )
    ).json()["total"] == 1


from test_bridge import bridge  # noqa: E402,F401 -- shared real ASGI fixture
