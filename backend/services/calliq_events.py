"""Durable, sanitized event metadata; webhooks never determine final outcomes."""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
import os
import weakref

from services.calliq_outcomes import (
    interpret_statistics,
    StatisticsSnapshot,
    statistics_signature,
    real_extension,
)

from services.calliq_policy import policy_settings

logger = logging.getLogger(__name__)
EVENTS = {
    "NOTIFY_START",
    "NOTIFY_INTERNAL",
    "NOTIFY_ANSWER",
    "NOTIFY_END",
    "NOTIFY_OUT_START",
    "NOTIFY_OUT_END",
    "NOTIFY_RECORD",
}
_locks = weakref.WeakValueDictionary()
_tasks = set()


def extension(value):
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        return None
    return str(value).strip() or None


def event_metadata(params):
    external = params.get("pbx_call_id")
    if (
        not isinstance(external, str)
        or not external.strip()
        or len(external) > 255
        or params.get("event") not in EVENTS
    ):
        return None
    event = {
        "event": params["event"],
        "channel": extension(params.get("internal")),
        "last_internal": extension(params.get("last_internal")),
        "transfer_from": extension(params.get("transfer_from")),
        "disposition": str(params.get("disposition") or "").strip().lower() or None,
        "recording_id": str(params.get("call_id_with_rec") or "") or None,
        "provider_start": str(params.get("call_start") or "") or None,
    }
    event["id"] = hashlib.sha256(json.dumps(event, sort_keys=True).encode()).hexdigest()
    return external.strip(), event


def summarize_events(events):
    # Set/graph based, independent of HTTP delivery order. Conflicting evidence stays unknown.
    answered = {
        real_extension(e["channel"])
        for e in events
        if real_extension(e.get("channel"))
        and (e["event"] == "NOTIFY_ANSWER" or e.get("disposition") == "answered")
    }
    explicit = {
        real_extension(e["last_internal"])
        for e in events
        if real_extension(e.get("last_internal")) and e.get("disposition") == "answered"
    }
    transferred = {
        real_extension(e["transfer_from"])
        for e in events
        if real_extension(e.get("transfer_from")) and e["event"] == "NOTIFY_ANSWER"
    }
    candidates = explicit or (answered - transferred)
    ambiguous = False
    if len(candidates) == 1:
        channel = next(iter(candidates))
        role = "answered"
    elif answered:
        channel = None
        role = "unknown"
        ambiguous = True
    else:
        targets = {
            real_extension(e.get(key))
            for e in events
            for key in ("channel", "last_internal", "transfer_from")
            if real_extension(e.get(key))
        }
        channel = next(iter(targets)) if len(targets) == 1 else None
        role = "target" if channel else "unknown"
        ambiguous = len(targets) > 1
    kinds = {e["event"] for e in events}
    direction = (
        "inbound"
        if "NOTIFY_START" in kinds
        else (
            "outbound"
            if "NOTIFY_OUT_START" in kinds
            else (
                "inbound"
                if "NOTIFY_END" in kinds and "NOTIFY_OUT_END" not in kinds
                else "unknown"
            )
        )
    )
    return {
        "channel": channel,
        "channel_role": role,
        "direction": direction,
        "channel_state": (
            "resolved" if channel else "ambiguous" if ambiguous else "unknown"
        ),
    }


async def observe_event(db, params):
    parsed = event_metadata(params)
    if parsed is None:
        return None
    external, event = parsed
    settings = policy_settings()
    for _ in range(5):
        document = await db.telephony_calls.find_one({"pbx_call_id": external})
        if document is None:
            return None
        key = {"_id": document["_id"]}
        prior = document.get("calliq_events", [])
        if any(item.get("id") == event["id"] for item in prior):
            return document
        if len(prior) >= 200:
            await db.telephony_calls.update_one(
                key, {"$set": {"calliq_sync_error": "event_limit_requires_review"}}
            )
            return document
        now = datetime.utcnow()
        state = summarize_events(prior + [event])
        outcome = document.get("provider_outcome", "unknown")
        if outcome in ("missed", "review_required"):
            outcome = "unknown"
            state.update(
                provider_outcome="unknown",
                provider_status="pending",
                provider_disposition=None,
                provider_evidence={
                    "state": "pending",
                    "source": "pending",
                    "scope": "unknown",
                    "reason": "late_activity_requires_reconciliation",
                },
            )
        state.update(
            call_outcome=outcome,
            status="answered" if outcome == "answered" else "pending",
            disposition=(
                document.get("provider_disposition") if outcome == "answered" else None
            ),
            calliq_delivery_pending=True,
            calliq_last_event_at=now,
            calliq_reconcile_pending=True,
            calliq_reconcile_attempts=0,
            calliq_delivery_attempts=0,
            calliq_reconcile_after=now
            + timedelta(seconds=settings.initial_delay_seconds),
        )
        version = document.get("calliq_revision")
        condition = {
            **key,
            "calliq_revision": version if version is not None else {"$exists": False},
        }
        result = await db.telephony_calls.update_one(
            condition,
            {
                "$set": state,
                "$addToSet": {"calliq_events": event},
                "$inc": {"calliq_revision": 1},
                "$unset": {
                    "calliq_statistics_signature": "",
                    "calliq_statistics_seen_at": "",
                    "calliq_missed_followup_scheduled": "",
                    "provider_target": "",
                },
            },
        )
        if result.matched_count:
            return await db.telephony_calls.find_one(key)
    raise RuntimeError("Concurrent metadata update; sender may retry")


def snapshot(document, project_id):
    evidence = document.get("provider_evidence") or {
        "state": "pending",
        "source": "pending",
        "scope": "unknown",
        "reason": "awaiting_statistics",
    }
    state = summarize_events(document.get("calliq_events", []))
    target = document.get("provider_target")
    if document.get("provider_outcome") == "missed" and target:
        if target.get("channel_state") == "ambiguous":
            state.update(
                channel=None, channel_role="unknown", channel_state="ambiguous"
            )
        elif state["channel_state"] == "unknown" and target.get("channel"):
            state.update(
                {k: target[k] for k in ("channel", "channel_role", "channel_state")}
            )
        elif state["channel"] and target.get("channel") not in (None, state["channel"]):
            state.update(
                channel=None, channel_role="unknown", channel_state="ambiguous"
            )
    return {
        "project_id": int(project_id),
        "external_source": "medcrm_zadarma",
        "external_id": document["pbx_call_id"],
        "revision": document["calliq_revision"],
        **state,
        "outcome": document.get("provider_outcome", "unknown"),
        "legs": [
            {k: e.get(k) for k in ["channel", "transfer_from", "event", "disposition"]}
            for e in document.get("calliq_events", [])
        ],
        "evidence": evidence,
    }


async def deliver_metadata(db, key, client):
    if not client.is_configured():
        return
    lock = _locks.setdefault(str(key["_id"]), asyncio.Lock())
    async with lock:
        current = await db.telephony_calls.find_one(key)
        if not current or not current.get("calliq_revision"):
            return
        if (
            not current.get("calliq_delivery_pending")
            or current.get("calliq_delivery_attempts", 0) >= 6
        ):
            return
        attempts = current.get("calliq_delivery_attempts", 0) + 1
        try:
            result = await client.upsert_metadata(snapshot(current, client.project_id))
            await db.telephony_calls.update_one(
                {**key, "calliq_revision": current["calliq_revision"]},
                {
                    "$set": {
                        "calliq_delivery_pending": False,
                        "calliq_metadata_id": result["id"],
                        "calliq_sync_error": None,
                        "calliq_delivery_attempts": attempts,
                    }
                },
            )
        except Exception:
            await db.telephony_calls.update_one(
                {**key, "calliq_revision": current["calliq_revision"]},
                {
                    "$set": {
                        "calliq_sync_error": "metadata_delivery_failed",
                        "calliq_delivery_pending": attempts < 6,
                        "calliq_delivery_attempts": attempts,
                    }
                },
            )
            logger.warning("CallIQ metadata delivery deferred (details suppressed)")


def schedule_delivery(db, key, client):
    task = asyncio.create_task(deliver_metadata(db, key, client))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


def statistics_window(document):
    values = {
        event.get("provider_start")
        for event in document.get("calliq_events", [])
        if event.get("provider_start")
    }
    if not values:
        raise RuntimeError("Provider call_start missing")
    starts = [datetime.strptime(value, "%Y-%m-%d %H:%M:%S") for value in values]
    if max(starts) - min(starts) > timedelta(days=2):
        raise RuntimeError("Conflicting provider dates")
    # Keep the original provider wall clock. Include the following day for midnight-crossing legs.
    return (
        min(starts).strftime("%Y-%m-%d 00:00:00"),
        (max(starts) + timedelta(days=1)).strftime("%Y-%m-%d 23:59:59"),
    )


async def statistics_pages(service, start, end, direction):
    rows = []
    for skip in range(0, 20000, 1000):
        response = await service.get_pbx_statistics(
            start,
            end,
            skip=skip,
            call_type={"inbound": "in", "outbound": "out"}.get(direction),
        )
        if (
            not isinstance(response, dict)
            or response.get("status") != "success"
            or not isinstance(response.get("stats"), list)
        ):
            raise RuntimeError("Invalid provider statistics response")
        page = response["stats"]
        rows.extend(page)
        if len(page) < 1000:
            return StatisticsSnapshot(rows, direction=direction, complete=True)
    raise RuntimeError(
        "Statistics pagination incomplete; no final outcome may be inferred"
    )


async def known_extensions(db):
    rows = (
        await db.staff.find({"extension": {"$exists": True}})
        .limit(2000)
        .to_list(length=2000)
    )
    values = {real_extension(row.get("extension")) for row in rows}
    # Only an explicitly configured extension, never TelephonyService's default 100.
    values.add(real_extension(os.getenv("ZADARMA_SIP_INTERNAL")))
    return values - {None}


def naive_utc(value):
    return (
        value.astimezone(timezone.utc).replace(tzinfo=None)
        if isinstance(value, datetime) and value.tzinfo
        else value
    )


def age_seconds(document, now):
    value = naive_utc(document.get("calliq_last_event_at"))
    return max(0, (now - value).total_seconds()) if isinstance(value, datetime) else 0


def review_state(reason, now, evidence=None):
    evidence = dict(
        evidence
        or {
            "state": "pending",
            "source": "pending",
            "scope": "unknown",
            "provider_call_ids": [],
        }
    )
    evidence.update(
        reason=("review_required: " + reason)[:255],
        checked_at=now.replace(tzinfo=timezone.utc).isoformat(),
    )
    return {
        "provider_outcome": "review_required",
        "provider_status": "review_required",
        "provider_disposition": None,
        "provider_evidence": evidence,
    }


async def reconcile_document(db, document, service, client, now=None, rows=None):
    now = naive_utc(now or datetime.utcnow())
    settings = policy_settings()
    direction = summarize_events(document.get("calliq_events", []))["direction"]
    if direction == "unknown":
        direction = document.get("direction", "unknown")
    if rows is None:
        start, end = statistics_window(document)
        rows = await statistics_pages(service, start, end, direction)
    signature = statistics_signature(document["pbx_call_id"], rows)
    seen = naive_utc(document.get("calliq_statistics_seen_at"))
    same = document.get("calliq_statistics_signature") == signature and isinstance(
        seen, datetime
    )
    stable = max(0, (now - seen).total_seconds()) if same else 0
    state = interpret_statistics(
        document["pbx_call_id"],
        rows,
        now.replace(tzinfo=timezone.utc).isoformat(),
        document.get("calliq_events", []),
        known_extensions=await known_extensions(db),
        direction=direction,
        complete=getattr(rows, "complete", False)
        and getattr(rows, "direction", None) == direction,
        quiet_seconds=age_seconds(document, now),
        stable_seconds=stable,
        allow_derived=settings.derived_enabled,
        quiet_required_seconds=settings.quiet_seconds,
        stable_required_seconds=settings.stable_seconds,
    )
    if document.get("provider_outcome") == "answered":
        state = {
            key: document[key]
            for key in (
                "provider_outcome",
                "provider_status",
                "provider_disposition",
                "provider_evidence",
            )
        }
    reason = state["provider_evidence"].get("reason", "")
    waiting = reason in (
        "awaiting_configured_quiet_period",
        "awaiting_second_complete_snapshot",
    ) and isinstance(document.get("calliq_last_event_at"), datetime)
    attempts = document.get("calliq_reconcile_attempts", 0) + (0 if waiting else 1)
    if state["provider_outcome"] == "unknown" and (
        attempts >= settings.max_attempts
        or age_seconds(document, now) >= settings.review_after_seconds
        or document.get("provider_outcome") == "missed"
        or reason == "derived_policy_not_enabled"
    ):
        state = review_state(
            state["provider_evidence"]["reason"], now, state["provider_evidence"]
        )
    pending = state["provider_outcome"] == "unknown"
    delay = (
        settings.interval_seconds
        if waiting
        else min(3600, settings.interval_seconds * 2 ** max(0, min(attempts - 1, 3)))
    )
    followup = document.get("calliq_missed_followup_scheduled", False)
    if state["provider_outcome"] == "missed" and not followup:
        pending = True
        delay = settings.followup_seconds
        followup = True
    state.update(
        status=state["provider_status"],
        call_outcome=state["provider_outcome"],
        disposition=state["provider_disposition"],
        calliq_delivery_pending=True,
        calliq_delivery_attempts=0,
        calliq_reconcile_attempts=attempts,
        calliq_reconcile_pending=pending,
        calliq_reconcile_after=now + timedelta(seconds=delay),
        calliq_statistics_signature=signature,
        calliq_statistics_seen_at=seen if same else now,
        calliq_missed_followup_scheduled=followup,
    )
    result = await db.telephony_calls.update_one(
        {"_id": document["_id"], "calliq_revision": document["calliq_revision"]},
        {"$set": state, "$inc": {"calliq_revision": 1}},
    )
    if result.matched_count:
        await deliver_metadata(db, {"_id": document["_id"]}, client)


async def reconcile_pending(db, service, client):
    settings = policy_settings()
    now = datetime.utcnow()
    documents = (
        await db.telephony_calls.find(
            {"calliq_reconcile_pending": True, "calliq_reconcile_after": {"$lte": now}}
        )
        .limit(50)
        .to_list(length=50)
    )
    pages_cache = {}
    for document in documents:
        try:
            start, end = statistics_window(document)
            direction = summarize_events(document.get("calliq_events", []))["direction"]
            if direction == "unknown":
                direction = document.get("direction", "unknown")
            key = (start, end, direction)
            if key not in pages_cache:
                try:
                    pages_cache[key] = await statistics_pages(
                        service, start, end, direction
                    )
                except Exception as error:
                    pages_cache[key] = error
            if isinstance(pages_cache[key], Exception):
                raise RuntimeError("Shared statistics request deferred")
            await reconcile_document(
                db, document, service, client, now, pages_cache[key]
            )
        except Exception:
            attempts = document.get("calliq_reconcile_attempts", 0) + 1
            exhausted = (
                attempts >= settings.max_attempts
                or age_seconds(document, now) >= settings.review_after_seconds
                or document.get("provider_outcome") == "missed"
            )
            state = {
                "calliq_sync_error": "statistics_reconciliation_deferred",
                "calliq_reconcile_attempts": attempts,
                "calliq_reconcile_pending": not exhausted,
                "calliq_reconcile_after": now
                + timedelta(seconds=settings.interval_seconds),
            }
            update = {"$set": state}
            if exhausted and document.get("provider_outcome") != "answered":
                state.update(
                    review_state("statistics_unavailable_or_incomplete", now),
                    status="review_required",
                    call_outcome="review_required",
                    disposition=None,
                    calliq_delivery_pending=True,
                    calliq_delivery_attempts=0,
                )
                update["$inc"] = {"calliq_revision": 1}
            await db.telephony_calls.update_one(
                {
                    "_id": document["_id"],
                    "calliq_revision": document["calliq_revision"],
                },
                update,
            )
    deliveries = (
        await db.telephony_calls.find({"calliq_delivery_pending": True})
        .limit(50)
        .to_list(length=50)
    )
    for document in deliveries:
        await deliver_metadata(db, {"_id": document["_id"]}, client)


@asynccontextmanager
async def reconciliation_lifespan(db, service, client):
    settings = policy_settings()

    async def worker():
        while True:
            try:
                await reconcile_pending(db, service, client)
            except Exception:
                logger.warning("CallIQ reconciliation deferred (details suppressed)")
            await asyncio.sleep(
                settings.interval_seconds
            )  # Provider explicitly discourages minute polling.

    task = (
        asyncio.create_task(worker())
        if os.getenv("CALLIQ_EVENT_SYNC_ENABLED", "false").lower() == "true"
        else None
    )
    try:
        yield
    finally:
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        if _tasks:
            await asyncio.gather(*list(_tasks), return_exceptions=True)
