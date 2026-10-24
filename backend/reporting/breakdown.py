"""Finance receipt breakdown by Asia/Bishkek day and event kind; same period rules as summary."""
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo
import re
from typing import Literal

from pydantic import StrictInt, StrictStr, field_validator, model_validator

from .contract import ClosedModel, Period, ReportError, Scope, TIMEZONE
from .service import RECEIPTS, CoverageEvidence, Snapshot, aggregate, amount, instant

PATH = "/api/reporting/finance/breakdown"
SCOPE = "finance.breakdown.read"
PERMISSION = "finance_view"
MAX_DAYS = 366
MAX_KINDS = 16
MAX_RESPONSE_BYTES = 65_536
LIMITATIONS = (
    "Breakdown of the same gross recorded plan receipts metric as get_finance_summary.",
    "Buckets use occurred_at converted to Asia/Bishkek calendar days; allocations and non-receipts are excluded.",
    "Unknown kinds, incomplete coverage or contradictory duplicates refuse the report without amounts.",
)


class DayBucket(ClosedModel):
    date: StrictStr
    service_receipts_kzt: StrictStr
    plan_advances_kzt: StrictStr
    gross_recorded_receipts_kzt: StrictStr
    receipt_event_count: StrictInt

    @model_validator(mode="after")
    def validate_row(self):
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", self.date, re.ASCII):
            raise ValueError("Invalid day")
        values = [self.service_receipts_kzt, self.plan_advances_kzt, self.gross_recorded_receipts_kzt]
        if any(not re.fullmatch(r"(?:0|[1-9]\d{0,12})\.\d{2}", value, re.ASCII) for value in values):
            raise ValueError("Invalid money DTO")
        if Decimal(values[0]) + Decimal(values[1]) != Decimal(values[2]):
            raise ValueError("Inconsistent day total")
        if self.receipt_event_count < 0:
            raise ValueError("Invalid count")
        return self


class KindBucket(ClosedModel):
    kind: StrictStr
    amount_kzt: StrictStr
    receipt_event_count: StrictInt

    @model_validator(mode="after")
    def validate_row(self):
        if self.kind not in RECEIPTS | {"plan_advance"}:
            raise ValueError("Invalid kind")
        if not re.fullmatch(r"(?:0|[1-9]\d{0,12})\.\d{2}", self.amount_kzt, re.ASCII):
            raise ValueError("Invalid money DTO")
        if self.receipt_event_count < 0:
            raise ValueError("Invalid count")
        return self


class FinanceBreakdownReport(ClosedModel):
    metric: Literal["gross_recorded_plan_receipts_breakdown"]
    coverage_scope: Literal["explicit_service_receipts_and_plan_advances_only"]
    period: Period
    date_basis: Literal["occurred_at"]
    currency: Literal["KZT"]
    by_day: tuple[DayBucket, ...]
    by_kind: tuple[KindBucket, ...]
    service_receipts_kzt: StrictStr
    plan_advances_kzt: StrictStr
    gross_recorded_receipts_kzt: StrictStr
    receipt_event_count: StrictInt
    complete_within_declared_scope: Literal[True]
    limitations: tuple[StrictStr, StrictStr, StrictStr]
    data_source: Literal["synthetic_demo", "crm_api"]

    @field_validator("complete_within_declared_scope", mode="before")
    @classmethod
    def genuine_complete_flag(cls, value):
        if value is not True:
            raise ValueError("No implicit completeness")
        return value

    @model_validator(mode="after")
    def validate_totals(self):
        values = [self.service_receipts_kzt, self.plan_advances_kzt, self.gross_recorded_receipts_kzt]
        if any(not re.fullmatch(r"(?:0|[1-9]\d{0,12})\.\d{2}", value, re.ASCII) for value in values):
            raise ValueError("Invalid money DTO")
        if Decimal(values[0]) + Decimal(values[1]) != Decimal(values[2]):
            raise ValueError("Inconsistent total")
        if (len(self.by_day) > MAX_DAYS or len({row.date for row in self.by_day}) != len(self.by_day)
                or len(self.by_kind) > MAX_KINDS or len({row.kind for row in self.by_kind}) != len(self.by_kind)
                or self.limitations != LIMITATIONS
                or sum((row.receipt_event_count for row in self.by_day), 0) != self.receipt_event_count
                or sum((row.receipt_event_count for row in self.by_kind), 0) != self.receipt_event_count
                or sum((Decimal(row.gross_recorded_receipts_kzt) for row in self.by_day), Decimal(0)) != Decimal(values[2])
                or sum((Decimal(row.amount_kzt) for row in self.by_kind), Decimal(0)) != Decimal(values[2])):
            raise ValueError("Invalid breakdown")
        return self


class FinanceBreakdownEnvelope(ClosedModel):
    scope: Scope
    report: FinanceBreakdownReport


def local_day(timestamp: datetime) -> str:
    return timestamp.astimezone(ZoneInfo(TIMEZONE)).date().isoformat()


def breakdown(snapshot, scope, period):
    summary = aggregate(snapshot, scope, period)
    start, end = instant(period.start_utc), instant(period.end_utc_exclusive)
    days = defaultdict(lambda: [Decimal(0), Decimal(0), 0])
    kinds = defaultdict(lambda: [Decimal(0), 0])
    seen = {}
    for event in snapshot.events:
        if not isinstance(event, dict) or event.get("clinic_id") != scope.clinic_id:
            continue
        kind = event.get("kind")
        if kind not in RECEIPTS | {"plan_advance"}:
            continue
        event_id = event.get("event_id")
        timestamp, value = instant(event.get("occurred_at")), amount(event.get("amount_kzt"))
        fingerprint = (kind, timestamp, value, "KZT")
        if event_id in seen:
            if seen[event_id] != fingerprint:
                raise ReportError("SOURCE_DATA_INVALID")
            continue
        seen[event_id] = fingerprint
        if not (start <= timestamp < end):
            continue
        day = local_day(timestamp)
        if kind == "plan_advance":
            days[day][1] += value
        else:
            days[day][0] += value
        days[day][2] += 1
        kinds[kind][0] += value
        kinds[kind][1] += 1
    by_day = tuple(DayBucket(
        date=day, service_receipts_kzt=f"{receipts:.2f}", plan_advances_kzt=f"{advances:.2f}",
        gross_recorded_receipts_kzt=f"{receipts + advances:.2f}", receipt_event_count=count)
        for day, (receipts, advances, count) in sorted(days.items()))
    by_kind = tuple(KindBucket(kind=kind, amount_kzt=f"{total:.2f}", receipt_event_count=count)
                    for kind, (total, count) in sorted(kinds.items()))
    return FinanceBreakdownReport(
        metric="gross_recorded_plan_receipts_breakdown",
        coverage_scope="explicit_service_receipts_and_plan_advances_only", period=period,
        date_basis="occurred_at", currency="KZT", by_day=by_day, by_kind=by_kind,
        service_receipts_kzt=summary.service_receipts_kzt, plan_advances_kzt=summary.plan_advances_kzt,
        gross_recorded_receipts_kzt=summary.gross_recorded_receipts_kzt,
        receipt_event_count=summary.receipt_event_count, complete_within_declared_scope=True,
        limitations=LIMITATIONS, data_source=summary.data_source)
