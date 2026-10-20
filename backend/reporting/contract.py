"""Closed contract for a bounded report of explicit, recorded ledger receipts."""
from datetime import date, datetime, time, timedelta, timezone
import re
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, StrictInt, StrictStr, field_validator, model_validator

TIMEZONE = "Asia/Bishkek"
PATH = "/api/reporting/finance/summary"
SCOPE = "finance.summary.read"
MAX_DAYS = 366
MAX_EVENTS = 50_000
MAX_RESPONSE_BYTES = 16_384
LIMITATIONS = (
    "Not total clinic cashflow, profit, net receipts or earned revenue.",
    "Booking deposits, patient-deposit assignments, refunds, expenses and legacy balances are outside this metric.",
    "Advance/deposit allocations, completions, list prices and plan paid_amount are not new receipts.",
)


class ReportError(Exception):
    STATUSES = {"AUTH_REQUIRED": 401, "FORBIDDEN": 403, "INVALID_PERIOD": 422,
                "INVALID_ARGUMENTS": 422, "INCOMPLETE_ACCOUNTING": 409,
                "SOURCE_DATA_INVALID": 409, "SOURCE_UNAVAILABLE": 503,
                "REPORTING_UNCONFIGURED": 503, "SOURCE_CONTRACT_INVALID": 502,
                "UNKNOWN_TOOL": 422}

    def __init__(self, code):
        self.code = code if code in self.STATUSES else "SOURCE_UNAVAILABLE"
        self.status = self.STATUSES[self.code]
        super().__init__(self.code)


class ClosedModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)


class Period(ClosedModel):
    date_from: StrictStr
    date_to: StrictStr
    timezone: Literal["Asia/Bishkek"]
    start_utc: StrictStr
    end_utc_exclusive: StrictStr


def parse_period(arguments):
    if type(arguments) is not dict or set(arguments) != {"date_from", "date_to"}:
        raise ReportError("INVALID_ARGUMENTS")
    try:
        values = [arguments[key] for key in ("date_from", "date_to")]
        if any(type(value) is not str or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value, re.ASCII) for value in values):
            raise ValueError
        first, last = map(date.fromisoformat, values)
        if not 1 <= (last - first).days + 1 <= MAX_DAYS:
            raise ValueError
        zone = ZoneInfo(TIMEZONE)
        start = datetime.combine(first, time(), zone).astimezone(timezone.utc)
        end = datetime.combine(last + timedelta(days=1), time(), zone).astimezone(timezone.utc)
        return Period(date_from=values[0], date_to=values[1], timezone=TIMEZONE,
                      start_utc=start.isoformat().replace("+00:00", "Z"),
                      end_utc_exclusive=end.isoformat().replace("+00:00", "Z"))
    except (ValueError, OverflowError):
        raise ReportError("INVALID_PERIOD") from None


class Scope(ClosedModel):
    subject_id: StrictStr
    agent_id: StrictStr
    clinic_id: StrictStr


class FinanceReport(ClosedModel):
    metric: Literal["gross_recorded_plan_receipts"]
    coverage_scope: Literal["explicit_service_receipts_and_plan_advances_only"]
    period: Period
    date_basis: Literal["occurred_at"]
    currency: Literal["KZT"]
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
        from decimal import Decimal
        values = [self.service_receipts_kzt, self.plan_advances_kzt, self.gross_recorded_receipts_kzt]
        if any(not re.fullmatch(r"(?:0|[1-9]\d{0,12})\.\d{2}", value, re.ASCII) for value in values):
            raise ValueError("Invalid money DTO")
        if Decimal(values[0]) + Decimal(values[1]) != Decimal(values[2]):
            raise ValueError("Inconsistent total")
        if self.receipt_event_count == 0 and Decimal(values[2]) != 0:
            raise ValueError("No receipts without events")
        if not 0 <= self.receipt_event_count <= MAX_EVENTS or self.limitations != LIMITATIONS:
            raise ValueError("Invalid bounded report")
        return self


class Envelope(ClosedModel):
    scope: Scope
    report: FinanceReport
