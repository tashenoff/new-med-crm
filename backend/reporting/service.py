"""Pure aggregation; no Mongo imports, mutation APIs, balance inference or backfill."""
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from .contract import FinanceReport, LIMITATIONS, MAX_EVENTS, ReportError

RECEIPTS = frozenset({"service_receipt", "session_receipt", "component_receipt"})
NON_RECEIPTS = frozenset({
    "service_advance_allocation", "session_advance_allocation", "component_advance_allocation",
    "patient_deposit_received", "service_deposit_allocation", "session_deposit_allocation",
    "component_deposit_allocation", "service_completion", "session_completion", "component_completion",
})


@dataclass(frozen=True)
class CoverageEvidence:
    clinic_id: str
    start_utc: datetime
    end_utc_exclusive: datetime
    clinic_boundary_verified: bool
    event_sources_complete: bool
    unresolved_legacy_records: int
    data_source: str


@dataclass(frozen=True)
class Snapshot:
    events: tuple[dict, ...]
    coverage: CoverageEvidence


def instant(value):
    try:
        if type(value) is str:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
            raise ValueError
        return value.astimezone(timezone.utc)
    except (ValueError, TypeError, OverflowError):
        raise ReportError("SOURCE_DATA_INVALID") from None


def amount(value):
    try:
        if type(value) not in (str, int, float, Decimal):
            raise ValueError
        result = Decimal(str(value))
        if not result.is_finite() or result < 0 or result > Decimal("9999999999999.99") or result.quantize(Decimal(".01")) != result:
            raise ValueError
        return result
    except (ValueError, InvalidOperation):
        raise ReportError("SOURCE_DATA_INVALID") from None


def aggregate(snapshot, scope, period):
    if not isinstance(snapshot, Snapshot) or not isinstance(snapshot.coverage, CoverageEvidence):
        raise ReportError("INCOMPLETE_ACCOUNTING")
    coverage = snapshot.coverage
    if coverage.clinic_id != scope.clinic_id:
        raise ReportError("FORBIDDEN")
    start, end = instant(period.start_utc), instant(period.end_utc_exclusive)
    if (coverage.clinic_boundary_verified is not True or coverage.event_sources_complete is not True
            or type(coverage.unresolved_legacy_records) is not int or coverage.unresolved_legacy_records != 0
            or instant(coverage.start_utc) > start or instant(coverage.end_utc_exclusive) < end
            or coverage.data_source not in ("synthetic_demo", "crm_api")):
        raise ReportError("INCOMPLETE_ACCOUNTING")
    if not isinstance(snapshot.events, tuple) or len(snapshot.events) > MAX_EVENTS:
        raise ReportError("INCOMPLETE_ACCOUNTING")
    receipts, advances, count = Decimal("0"), Decimal("0"), 0
    seen = {}
    for event in snapshot.events:
        if not isinstance(event, dict) or type(event.get("clinic_id")) is not str or not event["clinic_id"]:
            raise ReportError("INCOMPLETE_ACCOUNTING")
        if event["clinic_id"] != scope.clinic_id:
            continue
        kind = event.get("kind")
        if type(kind) is not str or kind not in RECEIPTS | NON_RECEIPTS | {"plan_advance"}:
            raise ReportError("INCOMPLETE_ACCOUNTING")
        if kind in NON_RECEIPTS:
            continue
        event_id = event.get("event_id")
        if type(event_id) is not str or not 1 <= len(event_id) <= 128 or event.get("currency") != "KZT":
            raise ReportError("SOURCE_DATA_INVALID")
        timestamp, value = instant(event.get("occurred_at")), amount(event.get("amount_kzt"))
        fingerprint = (kind, timestamp, value, "KZT")
        if event_id in seen:
            if seen[event_id] != fingerprint:
                raise ReportError("SOURCE_DATA_INVALID")
            continue
        seen[event_id] = fingerprint
        if start <= timestamp < end:
            if kind == "plan_advance":
                advances += value
            else:
                receipts += value
            count += 1
    if receipts + advances > Decimal("9999999999999.99"):
        raise ReportError("SOURCE_DATA_INVALID")
    return FinanceReport(metric="gross_recorded_plan_receipts",
        coverage_scope="explicit_service_receipts_and_plan_advances_only", period=period,
        date_basis="occurred_at", currency="KZT", service_receipts_kzt=f"{receipts:.2f}",
        plan_advances_kzt=f"{advances:.2f}", gross_recorded_receipts_kzt=f"{receipts+advances:.2f}",
        receipt_event_count=count, complete_within_declared_scope=True,
        limitations=LIMITATIONS, data_source=coverage.data_source)
