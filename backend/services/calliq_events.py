"""Durable, sanitized event metadata; webhooks never determine final outcomes."""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
import os
import weakref

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
        e["channel"]
        for e in events
        if e.get("channel")
        and (e["event"] == "NOTIFY_ANSWER" or e.get("disposition") == "answered")
    }
    explicit = {
        e["last_internal"]
        for e in events
        if e.get("last_internal") and e.get("disposition") == "answered"
    }
    transferred = {
        e["transfer_from"]
        for e in events
        if e.get("transfer_from") and e["event"] == "NOTIFY_ANSWER"
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
            e.get("channel") or e.get("last_internal")
            for e in events
            if e.get("channel") or e.get("last_internal")
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
    document = await db.telephony_calls.find_one({"pbx_call_id": external})
    if document is None:
        return None  # Do not create CRM identity/cards from a metadata helper.
    key = {"_id": document["_id"]}
    prior = document.get("calliq_events", [])
    if any(e.get("id") == event["id"] for e in prior):
        return document
    if len(prior) >= 200:
        await db.telephony_calls.update_one(
            key, {"$set": {"calliq_sync_error": "event_limit_requires_review"}}
        )
        return document
    # MongoDB's set operation deduplicates delivery, while an atomic revision orders snapshots.
    await db.telephony_calls.update_one(
        key,
        {
            "$addToSet": {"calliq_events": event},
            "$inc": {"calliq_revision": 1},
            "$set": {
                "calliq_delivery_pending": True,
                "calliq_reconcile_pending": True,
                "calliq_reconcile_attempts": 0,
                "calliq_delivery_attempts": 0,
                "calliq_reconcile_after": datetime.utcnow() + timedelta(seconds=90),
            },
        },
    )
    for _ in range(5):
        current = await db.telephony_calls.find_one(key)
        events = current.get("calliq_events", [])
        if len(events) > 200:
            await db.telephony_calls.update_one(
                key, {"$set": {"calliq_sync_error": "event_limit_requires_review"}}
            )
            return current
        state = summarize_events(events)
        state["call_outcome"] = current.get("provider_outcome", "unknown")
        state["status"] = current.get("provider_status", "pending")
        state["disposition"] = current.get("provider_disposition")
        result = await db.telephony_calls.update_one(
            {**key, "calliq_revision": current["calliq_revision"]}, {"$set": state}
        )
        if result.matched_count:
            return await db.telephony_calls.find_one(key)
    raise RuntimeError(
        "Concurrent call metadata update; persisted events retained for reconciliation"
    )


def snapshot(document, project_id):
    evidence = document.get("provider_evidence") or {
        "state": "pending",
        "source": "pending",
        "scope": "unknown",
        "reason": "awaiting_statistics",
    }
    state = summarize_events(document.get("calliq_events", []))
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


def interpret_statistics(external_id, rows, checked_at, events=()):
    matched = [
        r for r in rows if isinstance(r, dict) and r.get("pbx_call_id") == external_id
    ]
    ids = sorted({str(r["call_id"]) for r in matched if r.get("call_id") is not None})
    channels = {
        e.get("channel")
        for e in events
        if e.get("channel") and e.get("event") == "NOTIFY_ANSWER"
    }
    recordings = {e.get("recording_id") for e in events if e.get("recording_id")}
    answered = [
        r
        for r in matched
        if r.get("disposition") == "answered"
        and r.get("call_id") is not None
        and (extension(r.get("sip")) in channels or str(r["call_id"]) in recordings)
    ]
    # A provider-confirmed answered leg proves an answer. Negative legs never prove a final whole-call miss.
    if answered:
        return {
            "provider_outcome": "answered",
            "provider_status": "answered",
            "provider_disposition": "answered",
            "provider_evidence": {
                "state": "confirmed",
                "source": "zadarma_statistics",
                "scope": "leg",
                "checked_at": checked_at,
                "provider_call_ids": [str(r["call_id"]) for r in answered],
                "reason": "answered_leg_in_provider_statistics",
            },
        }
    return {
        "provider_outcome": "unknown",
        "provider_status": "pending",
        "provider_disposition": None,
        "provider_evidence": {
            "state": "partial" if matched else "pending",
            "source": "zadarma_statistics",
            "scope": "leg" if matched else "unknown",
            "checked_at": checked_at,
            "provider_call_ids": ids,
            "reason": (
                "whole_call_finality_not_documented"
                if matched
                else "not_yet_in_statistics"
            ),
        },
    }


async def statistics_pages(service, start, end, direction):
    rows = []
    for skip in range(0, 20000, 1000):
        response = await service.get_pbx_statistics(
            start,
            end,
            skip=skip,
            call_type={"inbound": "in", "outbound": "out"}.get(direction),
        )
        if response.get("status") != "success" or not isinstance(
            response.get("stats"), list
        ):
            raise RuntimeError("Invalid provider statistics response")
        page = response["stats"]
        rows.extend(page)
        if len(page) < 1000:
            return rows
    raise RuntimeError(
        "Statistics pagination incomplete; no final outcome may be inferred"
    )


async def reconcile_document(db, document, service, client, now=None, rows=None):
    now = now or datetime.utcnow()
    starts = {
        e.get("provider_start")
        for e in document.get("calliq_events", [])
        if e.get("provider_start")
    }
    if len(starts) != 1:
        raise RuntimeError(
            "Provider call_start missing or conflicting; no phone/time guessing"
        )
    # The provider's original wall-clock value is used, not silently relabelled UTC.
    start = datetime.strptime(next(iter(starts)), "%Y-%m-%d %H:%M:%S")
    if rows is None:
        rows = await statistics_pages(
            service,
            (start - timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M:%S"),
            (start + timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S"),
            document.get("direction", "unknown"),
        )
    state = interpret_statistics(
        document["pbx_call_id"],
        rows,
        now.replace(tzinfo=timezone.utc).isoformat(),
        document.get("calliq_events", []),
    )
    # Never allow a later incomplete snapshot to erase a confirmed provider answer.
    if document.get("provider_outcome") == "answered":
        state = {
            k: document[k]
            for k in [
                "provider_outcome",
                "provider_status",
                "provider_disposition",
                "provider_evidence",
            ]
        }
    attempts = document.get("calliq_reconcile_attempts", 0) + 1
    state.update(
        status=state["provider_status"],
        call_outcome=state["provider_outcome"],
        disposition=state["provider_disposition"],
        calliq_delivery_pending=True,
        calliq_reconcile_attempts=attempts,
        calliq_reconcile_pending=state["provider_outcome"] == "unknown"
        and attempts < 6,
        calliq_reconcile_after=now
        + timedelta(seconds=min(3600, 600 * 2 ** min(attempts - 1, 3))),
    )
    result = await db.telephony_calls.update_one(
        {"_id": document["_id"], "calliq_revision": document["calliq_revision"]},
        {"$set": state, "$inc": {"calliq_revision": 1}},
    )
    if result.matched_count:
        await deliver_metadata(db, {"_id": document["_id"]}, client)


async def reconcile_pending(db, service, client):
    now = datetime.utcnow()
    # Only explicitly queued new events; never an automatic historical backfill.
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
            starts = {
                e.get("provider_start")
                for e in document.get("calliq_events", [])
                if e.get("provider_start")
            }
            if len(starts) != 1:
                raise RuntimeError("Provider call_start not established")
            date = (
                datetime.strptime(next(iter(starts)), "%Y-%m-%d %H:%M:%S")
                .date()
                .isoformat()
            )
            if date not in pages_cache:
                try:
                    pages_cache[date] = await statistics_pages(
                        service, date + " 00:00:00", date + " 23:59:59", "unknown"
                    )
                except Exception as error:
                    pages_cache[date] = error
            if isinstance(pages_cache[date], Exception):
                raise RuntimeError("Shared statistics request deferred")
            await reconcile_document(
                db, document, service, client, now, pages_cache[date]
            )
        except Exception:
            attempts = document.get("calliq_reconcile_attempts", 0) + 1
            await db.telephony_calls.update_one(
                {
                    "_id": document["_id"],
                    "calliq_revision": document["calliq_revision"],
                },
                {
                    "$set": {
                        "calliq_sync_error": "statistics_reconciliation_deferred",
                        "calliq_reconcile_attempts": attempts,
                        "calliq_reconcile_pending": attempts < 6,
                        "calliq_reconcile_after": now + timedelta(minutes=10),
                    }
                },
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
    async def worker():
        while True:
            try:
                await reconcile_pending(db, service, client)
            except Exception:
                logger.warning("CallIQ reconciliation deferred (details suppressed)")
            await asyncio.sleep(600)  # Provider explicitly discourages minute polling.

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
