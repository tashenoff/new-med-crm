"""Bounded, explicit policy over provider rows; no invented whole-call API field."""

import hashlib
import json
import math

POLICY = "inbound_settled_v1"
QUIET_SECONDS = 900
STABLE_SECONDS = 600


def extension(value):
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        return None
    return str(value).strip() or None


def real_extension(value):
    value = extension(value)
    return value if value and value.isdigit() and int(value) > 0 else None


def recording_flag(value):
    if isinstance(value, bool):
        return value
    if type(value) is int and value in (0, 1):
        return value == 1
    if isinstance(value, str):
        value = value.strip().lower()
        if value in ("0", "false"):
            return False
        if value in ("1", "true"):
            return True
    return None


def seconds(value):
    if isinstance(value, bool):
        return None
    try:
        value = float(value)
        return value if math.isfinite(value) and value >= 0 else None
    except (ValueError, TypeError):
        return None


class StatisticsSnapshot(list):
    def __init__(self, rows, *, direction="unknown", complete=False):
        super().__init__(rows)
        self.direction = direction
        self.complete = complete


def matched_rows(external_id, rows):
    return [
        row
        for row in rows
        if isinstance(row, dict) and row.get("pbx_call_id") == external_id
    ]


def statistics_signature(external_id, rows):
    normalized = [
        {
            key: row.get(key)
            for key in ("call_id", "sip", "disposition", "seconds", "is_recorded")
        }
        for row in matched_rows(external_id, rows)
    ]
    serialized = sorted(
        json.dumps(row, sort_keys=True, default=str) for row in normalized
    )
    return hashlib.sha256(json.dumps(serialized).encode()).hexdigest()


def interpret_statistics(
    external_id,
    rows,
    checked_at,
    events=(),
    *,
    known_extensions=(),
    direction="unknown",
    complete=False,
    quiet_seconds=0,
    stable_seconds=0,
    allow_derived=False,
    quiet_required_seconds=QUIET_SECONDS,
    stable_required_seconds=STABLE_SECONDS,
):
    matched = matched_rows(external_id, rows)
    ids = sorted(
        {str(row["call_id"]) for row in matched if row.get("call_id") is not None}
    )
    known = {real_extension(value) for value in known_extensions} - {None}
    answering = {
        real_extension(event.get("channel"))
        for event in events
        if event.get("event") == "NOTIFY_ANSWER"
    } - {None}
    recordings = {
        str(event["recording_id"]) for event in events if event.get("recording_id")
    }
    answered = [
        row
        for row in matched
        if row.get("disposition") == "answered"
        and row.get("call_id") is not None
        and real_extension(row.get("sip"))
        and (
            real_extension(row.get("sip")) in known | answering
            or str(row["call_id"]) in recordings
        )
    ]
    evidence = {
        "state": "partial" if matched else "pending",
        "source": "zadarma_statistics",
        "scope": "leg" if matched else "unknown",
        "checked_at": checked_at,
        "provider_call_ids": ids,
        "reason": "not_yet_in_statistics",
    }
    result = {
        "provider_outcome": "unknown",
        "provider_status": "pending",
        "provider_disposition": None,
        "provider_evidence": evidence,
        "provider_target": None,
    }
    if answered:
        evidence.update(
            state="confirmed",
            scope="leg",
            reason="answered_real_extension_in_statistics",
            provider_call_ids=[str(row["call_id"]) for row in answered],
        )
        result.update(
            provider_outcome="answered",
            provider_status="answered",
            provider_disposition="answered",
        )
        return result
    reason = "not_yet_in_statistics"
    target_channels = {
        real_extension(event.get(key))
        for event in events
        for key in ("channel", "last_internal", "transfer_from")
    } - {None}
    targets = target_channels & known
    if not targets:
        targets = {real_extension(row.get("sip")) for row in matched} & known
    if matched:
        if not complete:
            reason = "statistics_not_complete"
        elif direction != "inbound":
            reason = "negative_policy_requires_inbound_direction"
        elif not any(event.get("event") == "NOTIFY_END" for event in events):
            reason = "awaiting_terminal_event"
        elif quiet_seconds < quiet_required_seconds:
            reason = "awaiting_configured_quiet_period"
        elif stable_seconds < stable_required_seconds:
            reason = "awaiting_second_complete_snapshot"
        elif not targets:
            reason = "real_target_extension_not_established"
        elif answering or recordings:
            reason = "webhook_answer_or_recording_conflicts_with_negative_statistics"
        elif any(row.get("disposition") == "answered" for row in matched):
            reason = "unattributed_or_sip_zero_answer_requires_review"
        elif any(
            row.get("call_id") is None
            or row.get("disposition") not in ("no answer", "call failed")
            or seconds(row.get("seconds")) != 0
            or recording_flag(row.get("is_recorded")) is not False
            for row in matched
        ):
            reason = "negative_group_unknown_or_conflicting_fields"
        elif any(
            not any(real_extension(row.get("sip")) == target for row in matched)
            for target in targets
        ):
            reason = "target_extension_missing_from_statistics"
        elif not any(
            real_extension(row.get("sip")) in targets
            and row.get("disposition") == "no answer"
            for row in matched
        ):
            reason = "no_provider_no_answer_on_real_target"
        elif not allow_derived:
            reason = "derived_policy_not_enabled"
        else:
            # A no-answer leg establishes an attempted recipient, never an answerer.
            # Include unmapped real lines when detecting ambiguity; the staff directory
            # must not silently turn a ring group into one person's missed call.
            recipients = {
                real_extension(row.get("sip"))
                for row in matched
                if real_extension(row.get("sip"))
                and (
                    row.get("disposition") == "no answer"
                    or (row.get("disposition") == "call failed"
                        and real_extension(row.get("sip")) in known)
                )
            }
            unique = next(iter(recipients)) if len(recipients) == 1 else None
            target = unique if unique in known else None
            evidence.update(
                state="derived",
                scope="pbx_group",
                policy=POLICY,
                pagination_complete=True,
                terminal_event_seen=True,
                quiet_seconds=int(quiet_seconds),
                stable_seconds=int(stable_seconds),
                quiet_required_seconds=quiet_required_seconds,
                stable_required_seconds=stable_required_seconds,
                reason="settled_inbound_negative_group",
            )
            result.update(
                provider_outcome="missed",
                provider_status="missed",
                provider_disposition="no answer",
                provider_target={
                    "channel": target,
                    "channel_role": "target" if target else "unknown",
                    "channel_state": "resolved" if target else "ambiguous" if len(recipients) > 1 else "unknown",
                    "channels": sorted(recipients),
                },
            )
            return result
    evidence["reason"] = reason
    return result
