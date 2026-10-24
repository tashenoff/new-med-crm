"""Clinic-level outstanding amounts due; opaque plan ids only, no patient PII."""
from dataclasses import dataclass
from decimal import Decimal
import re
from typing import Literal

from pydantic import StrictInt, StrictStr, field_validator, model_validator

from .contract import ClosedModel, Period, ReportError, Scope
from .payroll import MAX_RECORDS, check_size
from .service import CoverageEvidence, Snapshot, aggregate, amount

PATH = "/api/reporting/finance/amounts-due"
SCOPE = "finance.amounts_due.read"
PERMISSION = "finance_view"
MAX_PLANS = 5_000
MAX_RESPONSE_BYTES = 32_768
LIMITATIONS = (
    "Current unpaid treatment-plan balances (amounts due), not period cashflow or profit.",
    "Payable uses verified service row totals minus payment discounts; funded uses ledger receipts and allocations only.",
    "Legacy plans without a complete ledger, missing prices, or contradictory balances refuse the report.",
)


class PlanDue(ClosedModel):
    plan_id: StrictStr
    payable_kzt: StrictStr
    funded_kzt: StrictStr
    due_kzt: StrictStr

    @model_validator(mode="after")
    def validate_row(self):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", self.plan_id):
            raise ValueError("Invalid plan identity")
        values = [self.payable_kzt, self.funded_kzt, self.due_kzt]
        if any(not re.fullmatch(r"(?:0|[1-9]\d{0,12})\.\d{2}", value, re.ASCII) for value in values):
            raise ValueError("Invalid money DTO")
        payable, funded_value, due = map(Decimal, values)
        if funded_value > payable or due != payable - funded_value or due < 0:
            raise ValueError("Inconsistent plan due")
        return self


class AmountsDueReport(ClosedModel):
    metric: Literal["clinic_treatment_plan_amounts_due"]
    period: Period
    date_basis: Literal["point_in_time_plan_balances"]
    currency: Literal["KZT"]
    plans: tuple[PlanDue, ...]
    payable_kzt: StrictStr
    funded_kzt: StrictStr
    due_kzt: StrictStr
    plan_count: StrictInt
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
        values = [self.payable_kzt, self.funded_kzt, self.due_kzt]
        if any(not re.fullmatch(r"(?:0|[1-9]\d{0,12})\.\d{2}", value, re.ASCII) for value in values):
            raise ValueError("Invalid money DTO")
        payable, funded_value, due = map(Decimal, values)
        if (len(self.plans) > MAX_PLANS or len({row.plan_id for row in self.plans}) != len(self.plans)
                or self.plan_count != len(self.plans) or self.limitations != LIMITATIONS
                or sum((Decimal(row.payable_kzt) for row in self.plans), Decimal(0)) != payable
                or sum((Decimal(row.funded_kzt) for row in self.plans), Decimal(0)) != funded_value
                or sum((Decimal(row.due_kzt) for row in self.plans), Decimal(0)) != due
                or due != payable - funded_value):
            raise ValueError("Invalid amounts-due aggregate")
        return self


class AmountsDueEnvelope(ClosedModel):
    scope: Scope
    report: AmountsDueReport


@dataclass(frozen=True)
class AmountsDueSnapshot:
    plans: tuple[dict, ...]
    coverage: CoverageEvidence


def money_field(value):
    if value is None or value == "":
        return None
    return amount(value)


def payment_discount(service):
    if service.get("is_complex") and isinstance(service.get("components"), list) and service["components"]:
        return sum((money_field(component.get("discount_amount")) or Decimal(0)
                    for component in service["components"]), Decimal(0))
    raw = service.get("discount_amount")
    if raw is None and service.get("is_complex"):
        raw = service.get("discount_total")
    return money_field(raw) or Decimal(0)


def plan_payable(plan):
    services = plan.get("services")
    if isinstance(services, list) and services and all(
            isinstance(service, dict) and money_field(service.get("total_price")) is not None for service in services):
        return sum((max(Decimal(0), money_field(service["total_price"]) - payment_discount(service))
                    for service in services), Decimal(0))
    total = money_field(plan.get("total_cost"))
    if total is None:
        raise ReportError("INCOMPLETE_ACCOUNTING")
    return total


def calculate(snapshot, scope, period):
    from .live_source import funded, verify_finance_plan
    if not isinstance(snapshot, AmountsDueSnapshot) or not isinstance(snapshot.coverage, CoverageEvidence):
        raise ReportError("INCOMPLETE_ACCOUNTING")
    aggregate(Snapshot((), snapshot.coverage), scope, period)
    if type(snapshot.plans) is not tuple or len(snapshot.plans) > MAX_RECORDS:
        raise ReportError("INCOMPLETE_ACCOUNTING")
    remaining = [50_000]
    rows = []
    for plan in snapshot.plans:
        if not isinstance(plan, dict) or not plan.get("clinic_id"):
            raise ReportError("INCOMPLETE_ACCOUNTING")
        if plan["clinic_id"] != scope.clinic_id:
            continue
        check_size(plan, remaining)
        plan_id = plan.get("id")
        if type(plan_id) is not str or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", plan_id):
            raise ReportError("SOURCE_DATA_INVALID")
        events = verify_finance_plan(plan)
        payable = plan_payable(plan)
        funded_value = funded(events)
        if plan.get("paid_amount") is not None and amount(plan["paid_amount"]) != funded_value:
            raise ReportError("INCOMPLETE_ACCOUNTING")
        if funded_value > payable:
            raise ReportError("INCOMPLETE_ACCOUNTING")
        due = payable - funded_value
        rows.append(PlanDue(plan_id=plan_id, payable_kzt=f"{payable:.2f}",
                            funded_kzt=f"{funded_value:.2f}", due_kzt=f"{due:.2f}"))
    if len(rows) > MAX_PLANS:
        raise ReportError("INCOMPLETE_ACCOUNTING")
    rows = tuple(sorted(rows, key=lambda row: row.plan_id))
    payable = sum((Decimal(row.payable_kzt) for row in rows), Decimal(0))
    funded_total = sum((Decimal(row.funded_kzt) for row in rows), Decimal(0))
    due_total = sum((Decimal(row.due_kzt) for row in rows), Decimal(0))
    if payable > Decimal("9999999999999.99"):
        raise ReportError("SOURCE_DATA_INVALID")
    return AmountsDueReport(
        metric="clinic_treatment_plan_amounts_due", period=period,
        date_basis="point_in_time_plan_balances", currency="KZT", plans=rows,
        payable_kzt=f"{payable:.2f}", funded_kzt=f"{funded_total:.2f}", due_kzt=f"{due_total:.2f}",
        plan_count=len(rows), complete_within_declared_scope=True,
        limitations=LIMITATIONS, data_source=snapshot.coverage.data_source)
