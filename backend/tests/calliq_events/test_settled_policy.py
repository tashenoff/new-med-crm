"""Observed provider shapes plus explicit synthetic lifecycle; never real API calls."""

from copy import deepcopy
from datetime import datetime, timedelta
import json
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import AsyncMock

import pytest

from services import calliq_events as events
from services.calliq_outcomes import (
    interpret_statistics,
    StatisticsSnapshot,
    recording_flag,
)

FIXTURE = json.loads((Path(__file__).with_name("provider_shapes.json")).read_text())


def rows(name="C005"):
    return deepcopy(FIXTURE["calls"][name]["rows"])


def terminal():
    return [
        {"event": "NOTIFY_START"},
        {
            "event": "NOTIFY_END",
            "channel": "201",
            "provider_start": "2000-01-01 10:00:00",
            "disposition": "no answer",
        },
    ]


def decide(data=None, **overrides):
    options = dict(
        known_extensions=["201"],
        direction="inbound",
        complete=True,
        quiet_seconds=901,
        stable_seconds=601,
        allow_derived=True,
    )
    options.update(overrides)
    return interpret_statistics(
        "example-C005",
        rows() if data is None else data,
        "2026-10-22T10:00:00Z",
        terminal(),
        **options
    )


def test_observed_c001_answer_uses_real_extension_not_sip_zero():
    result = interpret_statistics(
        "example-C001", rows("C001"), "now", known_extensions=["201"]
    )
    assert result["provider_outcome"] == "answered"
    assert result["provider_evidence"]["provider_call_ids"] == ["R002"]


def test_user_confirmed_c005_matches_explicit_derived_policy():
    assert FIXTURE["calls"]["C005"]["ground_truth"] == "user_confirmed_missed"
    result = decide()
    assert (
        result["provider_outcome"] == "missed"
        and result["provider_disposition"] == "no answer"
    )
    proof = result["provider_evidence"]
    assert (
        proof["state"] == "derived"
        and proof["scope"] == "pbx_group"
        and proof["policy"] == "inbound_settled_v1"
    )


@pytest.mark.parametrize(
    "options",
    [
        {"direction": "outbound"},
        {"direction": "unknown"},
        {"complete": False},
        {"quiet_seconds": 899},
        {"stable_seconds": 599},
        {"known_extensions": []},
    ],
)
def test_incomplete_or_unsettled_conditions_never_missed(options):
    assert decide(**options)["provider_outcome"] == "unknown"


@pytest.mark.parametrize(
    "field,value",
    [
        ("disposition", "busy"),
        ("disposition", "cancel"),
        ("disposition", "unrecognized"),
        ("seconds", 1),
        ("seconds", None),
        ("is_recorded", "unknown"),
        ("is_recorded", "1"),
        ("call_id", None),
    ],
)
def test_unknown_or_conflicting_group_never_missed(field, value):
    data = rows()
    data[1][field] = value
    assert decide(data)["provider_outcome"] == "unknown"


def test_no_terminal_no_target_no_answer_and_wrong_call_never_missed():
    data = rows()
    assert (
        interpret_statistics(
            "example-C005",
            data,
            "now",
            [],
            known_extensions=["201"],
            direction="inbound",
            complete=True,
            quiet_seconds=1000,
            stable_seconds=1000,
        )["provider_outcome"]
        == "unknown"
    )
    assert (
        decide([row for row in data if row["sip"] != "201"])["provider_outcome"]
        == "unknown"
    )
    for row in data:
        row["disposition"] = "call failed"
    assert decide(data)["provider_outcome"] == "unknown"
    assert (
        interpret_statistics(
            "foreign",
            rows(),
            "now",
            terminal(),
            known_extensions=["201"],
            direction="inbound",
            complete=True,
            quiet_seconds=1000,
            stable_seconds=1000,
        )["provider_outcome"]
        == "unknown"
    )


def test_sip_zero_answer_is_neither_human_answer_nor_safe_missed():
    data = rows()
    data[0]["disposition"] = "answered"
    data[0]["seconds"] = 6
    assert decide(data)["provider_outcome"] == "unknown"
    assert (
        interpret_statistics(
            "example-C005",
            [data[0]],
            "now",
            [{"event": "NOTIFY_RECORD", "recording_id": data[0]["call_id"]}],
        )["provider_outcome"]
        == "unknown"
    )


def test_unmapped_answer_blocks_missed_and_observed_answer_conflicts_with_negative():
    data = rows()
    data[2].update(sip="999", disposition="answered", seconds=10)
    assert decide(data)["provider_outcome"] == "unknown"
    assert (
        interpret_statistics(
            "example-C005",
            rows(),
            "now",
            terminal() + [{"event": "NOTIFY_ANSWER", "channel": "201"}],
            known_extensions=["201"],
            direction="inbound",
            complete=True,
            quiet_seconds=1000,
            stable_seconds=1000,
        )["provider_outcome"]
        == "unknown"
    )


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
        (None, None),
        ("unknown", None),
    ],
)
def test_explicit_provider_recording_flag(value, expected):
    assert recording_flag(value) is expected


@pytest.mark.asyncio
async def test_all_pages_include_answer_after_negative_first_page():
    data = rows()
    foreign = [{"pbx_call_id": "other"}] * 994
    positive = {
        "pbx_call_id": "example-C005",
        "call_id": "late-real-answer",
        "sip": "201",
        "disposition": "answered",
        "seconds": 25,
        "is_recorded": "1",
    }
    service = NS(
        get_pbx_statistics=AsyncMock(
            side_effect=[
                {"status": "success", "stats": data + foreign},
                {"status": "success", "stats": [positive]},
            ]
        )
    )
    snapshot = await events.statistics_pages(service, "start", "end", "inbound")
    assert (
        snapshot.complete
        and snapshot.direction == "inbound"
        and service.get_pbx_statistics.await_count == 2
    )
    assert decide(snapshot)["provider_outcome"] == "answered"


def test_provider_wall_clock_window_includes_midnight_without_timezone_guess():
    document = {
        "calliq_events": [
            {"provider_start": "2000-01-01 23:59:59"},
            {"provider_start": "2000-01-02 00:00:02"},
        ]
    }
    assert events.statistics_window(document) == (
        "2000-01-01 00:00:00",
        "2000-01-03 23:59:59",
    )


@pytest.mark.asyncio
async def test_known_extensions_never_uses_default_100(clean_db, monkeypatch):
    monkeypatch.delenv("ZADARMA_SIP_INTERNAL", raising=False)
    assert await events.known_extensions(clean_db) == set()
    await clean_db.staff.insert_one({"extension": " 201 "})
    monkeypatch.setenv("ZADARMA_SIP_INTERNAL", "0")
    assert await events.known_extensions(clean_db) == {"201"}


@pytest.mark.asyncio
async def test_bounded_missed_then_followup_answer_corrects_it(clean_db, monkeypatch):
    monkeypatch.setenv("CALLIQ_DERIVED_MISSED_ENABLED", "true")
    monkeypatch.setenv("ZADARMA_SIP_INTERNAL", "201")
    start = datetime(2026, 10, 22, 10)
    doc = {
        "_id": "test",
        "pbx_call_id": "example-C005",
        "calliq_revision": 1,
        "calliq_events": terminal(),
        "calliq_last_event_at": start,
    }
    await clean_db.telephony_calls.insert_one(doc)
    snapshot = StatisticsSnapshot(rows(), direction="inbound", complete=True)
    offline = NS(is_configured=lambda: False)
    await events.reconcile_document(
        clean_db, doc, NS(), offline, start + timedelta(minutes=20), snapshot
    )
    doc = await clean_db.telephony_calls.find_one({"_id": "test"})
    assert doc["provider_outcome"] == "unknown"
    await events.reconcile_document(
        clean_db, doc, NS(), offline, start + timedelta(minutes=30), snapshot
    )
    doc = await clean_db.telephony_calls.find_one({"_id": "test"})
    assert doc["provider_outcome"] == "missed" and doc["calliq_reconcile_pending"]
    assert doc["calliq_reconcile_after"] == start + timedelta(minutes=90)
    positive = rows()
    positive[1].update(disposition="answered", seconds=25, is_recorded="1")
    await events.reconcile_document(
        clean_db,
        doc,
        NS(),
        offline,
        start + timedelta(minutes=90),
        StatisticsSnapshot(positive, direction="inbound", complete=True),
    )
    doc = await clean_db.telephony_calls.find_one({"_id": "test"})
    assert doc["provider_outcome"] == "answered" and not doc["calliq_reconcile_pending"]


@pytest.mark.asyncio
async def test_retry_exhaustion_is_visible_review_not_eternal_pending(
    clean_db, monkeypatch
):
    monkeypatch.setenv("ZADARMA_SIP_INTERNAL", "201")
    now = datetime.utcnow()
    doc = {
        "_id": "test",
        "pbx_call_id": "example-C005",
        "calliq_revision": 1,
        "calliq_reconcile_attempts": 5,
        "calliq_events": terminal(),
        "calliq_last_event_at": now - timedelta(hours=1),
    }
    await clean_db.telephony_calls.insert_one(doc)
    await events.reconcile_document(
        clean_db,
        doc,
        NS(),
        NS(is_configured=lambda: False),
        now,
        StatisticsSnapshot([], direction="inbound", complete=True),
    )
    doc = await clean_db.telephony_calls.find_one({"_id": "test"})
    assert (
        doc["provider_outcome"] == "review_required"
        and not doc["calliq_reconcile_pending"]
    )


@pytest.mark.asyncio
async def test_late_unique_activity_reopens_derived_missed(clean_db):
    await clean_db.telephony_calls.insert_one(
        {
            "_id": "test",
            "pbx_call_id": "example-C005",
            "calliq_revision": 2,
            "provider_outcome": "missed",
            "calliq_events": [],
            "calliq_statistics_signature": "old",
            "calliq_statistics_seen_at": datetime.utcnow(),
        }
    )
    doc = await events.observe_event(
        clean_db,
        {"event": "NOTIFY_ANSWER", "pbx_call_id": "example-C005", "internal": "201"},
    )
    assert doc["provider_outcome"] == "unknown" and doc["status"] == "pending"
    assert "calliq_statistics_signature" not in doc and doc["calliq_reconcile_pending"]


def test_derived_policy_requires_opt_in_and_configured_thresholds(monkeypatch):
    from services.calliq_policy import policy_settings

    monkeypatch.delenv("CALLIQ_DERIVED_MISSED_ENABLED", raising=False)
    assert policy_settings().derived_enabled is False
    assert decide(allow_derived=False)["provider_outcome"] == "unknown"
    monkeypatch.setenv("CALLIQ_MISSED_QUIET_SECONDS", "1800")
    settings = policy_settings()
    assert settings.quiet_seconds == 1800
    assert decide(quiet_required_seconds=1800)["provider_outcome"] == "unknown"
    assert (
        decide(quiet_required_seconds=1800, quiet_seconds=1800)["provider_outcome"]
        == "missed"
    )
    monkeypatch.setenv("CALLIQ_MISSED_STABLE_SECONDS", "30")
    with pytest.raises(ValueError):
        policy_settings()


@pytest.mark.asyncio
async def test_concurrent_duplicate_event_has_one_revision_and_keeps_answer(clean_db):
    import asyncio

    await clean_db.telephony_calls.insert_one(
        {
            "_id": "test",
            "pbx_call_id": "example",
            "provider_outcome": "answered",
            "provider_status": "answered",
            "provider_disposition": "answered",
        }
    )
    payload = {
        "event": "NOTIFY_END",
        "pbx_call_id": "example",
        "internal": "201",
        "disposition": "no answer",
    }
    await asyncio.gather(*(events.observe_event(clean_db, payload) for _ in range(5)))
    doc = await clean_db.telephony_calls.find_one({"_id": "test"})
    assert (
        doc["calliq_revision"] == 1
        and len(doc["calliq_events"]) == 1
        and doc["status"] == "answered"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("phase", [1, 299, 301, 510, 599])
async def test_default_schedule_finalizes_healthy_sample_in_15_to_25_minutes(
    clean_db, monkeypatch, phase
):
    monkeypatch.setenv("CALLIQ_DERIVED_MISSED_ENABLED", "true")
    monkeypatch.setenv("ZADARMA_SIP_INTERNAL", "201")
    base = datetime(2026, 10, 22, 10)
    end = base + timedelta(seconds=phase)
    doc = {
        "_id": "timing",
        "pbx_call_id": "example-C005",
        "calliq_revision": 1,
        "calliq_events": terminal(),
        "calliq_last_event_at": end,
        "calliq_reconcile_after": end + timedelta(seconds=90),
    }
    await clean_db.telephony_calls.insert_one(doc)
    for tick in range(600, 3601, 600):
        now = base + timedelta(seconds=tick)
        doc = await clean_db.telephony_calls.find_one({"_id": "timing"})
        if doc["calliq_reconcile_after"] > now:
            continue
        await events.reconcile_document(
            clean_db,
            doc,
            NS(),
            NS(is_configured=lambda: False),
            now,
            StatisticsSnapshot(rows(), direction="inbound", complete=True),
        )
        doc = await clean_db.telephony_calls.find_one({"_id": "timing"})
        if doc["provider_outcome"] == "missed":
            assert 900 <= (now - end).total_seconds() <= 1500
            break
    else:
        raise AssertionError(
            "Healthy sample did not finalize on bounded default schedule"
        )


@pytest.mark.asyncio
async def test_disabled_derived_policy_finishes_as_review_not_missed(
    clean_db, monkeypatch
):
    monkeypatch.delenv("CALLIQ_DERIVED_MISSED_ENABLED", raising=False)
    monkeypatch.setenv("ZADARMA_SIP_INTERNAL", "201")
    start = datetime.utcnow() - timedelta(hours=1)
    doc = {
        "_id": "disabled",
        "pbx_call_id": "example-C005",
        "calliq_revision": 1,
        "calliq_events": terminal(),
        "calliq_last_event_at": start,
    }
    await clean_db.telephony_calls.insert_one(doc)
    for now in (start + timedelta(minutes=30), start + timedelta(minutes=40)):
        doc = await clean_db.telephony_calls.find_one({"_id": "disabled"})
        await events.reconcile_document(
            clean_db,
            doc,
            NS(),
            NS(is_configured=lambda: False),
            now,
            StatisticsSnapshot(rows(), direction="inbound", complete=True),
        )
    doc = await clean_db.telephony_calls.find_one({"_id": "disabled"})
    assert (
        doc["provider_outcome"] == "review_required"
        and not doc["calliq_reconcile_pending"]
    )
