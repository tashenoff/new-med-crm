"""Clinic services rendered by plan created_at; no patient PII; no ledger completeness gate."""
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re
from typing import Literal

from pydantic import StrictInt, StrictStr, field_validator, model_validator

from .contract import ClosedModel, Period, ReportError, Scope
from .payroll import MAX_RECORDS, check_size
from .service import CoverageEvidence, Snapshot, aggregate

PATH = "/api/reporting/finance/services-rendered"
SCOPE = "finance.services_rendered.read"
PERMISSION = "finance_view"
MAX_ITEMS = 2_000
MAX_RESPONSE_BYTES = 32_768
MAX_SERVICE_NAME = 256
MAX_CATEGORY = 128
MONEY = r"(?:0|[1-9]\d{0,12})\.\d{2}"
SIGNED_MONEY = r"-?(?:0|[1-9]\d{0,12})\.\d{2}"
LIMITATIONS = (
    "Services rendered from treatment plans by plan created_at in the requested Asia/Bishkek period; not ledger cashflow or payroll.",
    "Paid uses service payment_status and proportional plan paid_amount/total_cost; does not require ledger completeness (unlike amounts due).",
    "Category and doctor filters are omitted in v1; empty service names are skipped; outstanding may be negative when paid is over-allocated.",
)


class ServiceRenderedItem(ClosedModel):
    service_name: StrictStr
    category: StrictStr
    price: StrictStr
    total_expected: StrictStr
    total_paid: StrictStr
    total_outstanding: StrictStr
    quantity_total: StrictInt

    @model_validator(mode="after")
    def validate_row(self):
        name = self.service_name.strip()
        if not name or name != self.service_name or len(name) > MAX_SERVICE_NAME:
            raise ValueError("Invalid service_name")
        if not self.category or len(self.category) > MAX_CATEGORY:
            raise ValueError("Invalid category")
        if (not re.fullmatch(MONEY, self.price, re.ASCII)
                or not re.fullmatch(MONEY, self.total_expected, re.ASCII)
                or not re.fullmatch(MONEY, self.total_paid, re.ASCII)
                or not re.fullmatch(SIGNED_MONEY, self.total_outstanding, re.ASCII)):
            raise ValueError("Invalid money DTO")
        expected, paid, outstanding = map(Decimal, (self.total_expected, self.total_paid, self.total_outstanding))
        if outstanding != expected - paid:
            raise ValueError("Inconsistent outstanding")
        if self.quantity_total < 0:
            raise ValueError("Invalid quantity")
        return self


class ServicesRenderedTotals(ClosedModel):
    total_expected: StrictStr
    total_paid: StrictStr
    total_outstanding: StrictStr
    services_count: StrictInt

    @model_validator(mode="after")
    def validate_totals(self):
        if (not re.fullmatch(MONEY, self.total_expected, re.ASCII)
                or not re.fullmatch(MONEY, self.total_paid, re.ASCII)
                or not re.fullmatch(SIGNED_MONEY, self.total_outstanding, re.ASCII)):
            raise ValueError("Invalid money DTO")
        expected, paid, outstanding = map(Decimal, (self.total_expected, self.total_paid, self.total_outstanding))
        if outstanding != expected - paid or self.services_count < 0:
            raise ValueError("Inconsistent totals")
        return self


class ServicesRenderedReport(ClosedModel):
    metric: Literal["clinic_services_rendered"]
    period: Period
    date_basis: Literal["plan_created_at"]
    currency: Literal["KZT"]
    items: tuple[ServiceRenderedItem, ...]
    totals: ServicesRenderedTotals
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
    def validate_aggregate(self):
        if (len(self.items) > MAX_ITEMS
                or len({row.service_name for row in self.items}) != len(self.items)
                or self.limitations != LIMITATIONS
                or self.totals.services_count != len(self.items)):
            raise ValueError("Invalid services-rendered aggregate")
        expected = sum((Decimal(row.total_expected) for row in self.items), Decimal(0))
        paid = sum((Decimal(row.total_paid) for row in self.items), Decimal(0))
        outstanding = sum((Decimal(row.total_outstanding) for row in self.items), Decimal(0))
        if (expected != Decimal(self.totals.total_expected)
                or paid != Decimal(self.totals.total_paid)
                or outstanding != Decimal(self.totals.total_outstanding)):
            raise ValueError("Invalid services-rendered totals")
        return self


class ServicesRenderedEnvelope(ClosedModel):
    scope: Scope
    report: ServicesRenderedReport


@dataclass(frozen=True)
class ServicesRenderedSnapshot:
    plans: tuple[dict, ...]
    coverage: CoverageEvidence


def money_src(value):
    try:
        if value is None or value == "":
            raise ValueError
        if type(value) not in (str, int, float, Decimal):
            raise ValueError
        result = Decimal(str(value))
        if not result.is_finite() or result < 0 or result > Decimal("9999999999999.99"):
            raise ValueError
        return result.quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
    except (ValueError, InvalidOperation, TypeError):
        raise ReportError("SOURCE_DATA_INVALID") from None


def quantity_src(value):
    try:
        if value is None:
            value = 1
        result = Decimal(str(value))
        if not result.is_finite() or result < 0 or result != result.to_integral_value():
            raise ValueError
        return int(result)
    except (ValueError, InvalidOperation, TypeError, OverflowError):
        raise ReportError("SOURCE_DATA_INVALID") from None


def created_at_utc(value):
    if not isinstance(value, datetime):
        raise ReportError("SOURCE_DATA_INVALID")
    # Existing Motor/BSON naive datetimes represent UTC, not local time.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def format_money(value: Decimal) -> str:
    quantized = value.quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
    return f"{quantized:.2f}"


def calculate(snapshot, scope, period):
    if not isinstance(snapshot, ServicesRenderedSnapshot) or not isinstance(snapshot.coverage, CoverageEvidence):
        raise ReportError("INCOMPLETE_ACCOUNTING")
    aggregate(Snapshot((), snapshot.coverage), scope, period)
    if type(snapshot.plans) is not tuple or len(snapshot.plans) > MAX_RECORDS:
        raise ReportError("INCOMPLETE_ACCOUNTING")
    start = datetime.fromisoformat(period.start_utc.replace("Z", "+00:00"))
    end = datetime.fromisoformat(period.end_utc_exclusive.replace("Z", "+00:00"))
    remaining = [50_000]
    groups = OrderedDict()
    for plan in snapshot.plans:
        if not isinstance(plan, dict) or not plan.get("clinic_id"):
            raise ReportError("INCOMPLETE_ACCOUNTING")
        if plan["clinic_id"] != scope.clinic_id:
            continue
        check_size(plan, remaining)
        created = created_at_utc(plan.get("created_at"))
        if not (start <= created < end):
            continue
        services = plan.get("services")
        if services is None:
            continue
        if type(services) is not list:
            raise ReportError("INCOMPLETE_ACCOUNTING")
        if not services:
            continue
        for svc in services:
            if type(svc) is not dict:
                raise ReportError("INCOMPLETE_ACCOUNTING")
            raw_name = svc.get("service_name", "")
            if type(raw_name) is not str:
                raise ReportError("SOURCE_DATA_INVALID")
            svc_name = raw_name.strip()
            if not svc_name:
                continue
            if len(svc_name) > MAX_SERVICE_NAME:
                raise ReportError("SOURCE_DATA_INVALID")
            category = svc.get("category", "Без категории")
            if category is None or category == "":
                category = "Без категории"
            if type(category) is not str or not category.strip() or len(category) > MAX_CATEGORY:
                raise ReportError("SOURCE_DATA_INVALID")
            category = category.strip()
            unit_price = money_src(svc.get("price_per_unit", svc.get("price", 0)))
            total_price = money_src(svc.get("total_price", 0))
            quantity = quantity_src(svc.get("quantity_total", svc.get("quantity", 1)))
            if svc_name not in groups:
                groups[svc_name] = {
                    "service_name": svc_name,
                    "category": category,
                    "price": unit_price,
                    "total_expected": Decimal("0"),
                    "total_paid": Decimal("0"),
                    "quantity_total": 0,
                }
            groups[svc_name]["total_expected"] += total_price
            groups[svc_name]["quantity_total"] += quantity
            if svc.get("payment_status") == "paid":
                groups[svc_name]["total_paid"] += total_price

        plan_paid_raw = plan.get("paid_amount", 0)
        plan_total_raw = plan.get("total_cost", 0)
        plan_paid = money_src(0 if plan_paid_raw is None else plan_paid_raw)
        plan_total = money_src(0 if plan_total_raw is None else plan_total_raw)
        if plan_paid > 0 and plan_total > 0:
            for svc in services:
                if type(svc) is not dict:
                    raise ReportError("INCOMPLETE_ACCOUNTING")
                raw_name = svc.get("service_name", "")
                if type(raw_name) is not str:
                    raise ReportError("SOURCE_DATA_INVALID")
                svc_name = raw_name.strip()
                if not svc_name or svc_name not in groups:
                    continue
                svc_total = money_src(svc.get("total_price", 0))
                if svc_total > 0 and svc.get("payment_status") != "paid":
                    groups[svc_name]["total_paid"] += plan_paid * (svc_total / plan_total)

    items = []
    for row in groups.values():
        expected = row["total_expected"].quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
        paid = row["total_paid"].quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
        outstanding = expected - paid
        if expected > Decimal("9999999999999.99") or paid > Decimal("9999999999999.99"):
            raise ReportError("SOURCE_DATA_INVALID")
        if abs(outstanding) > Decimal("9999999999999.99"):
            raise ReportError("SOURCE_DATA_INVALID")
        items.append(ServiceRenderedItem(
            service_name=row["service_name"],
            category=row["category"],
            price=format_money(row["price"]),
            total_expected=format_money(expected),
            total_paid=format_money(paid),
            total_outstanding=format_money(outstanding),
            quantity_total=row["quantity_total"],
        ))
    if len(items) > MAX_ITEMS:
        raise ReportError("INCOMPLETE_ACCOUNTING")
    items = tuple(sorted(items, key=lambda row: (-Decimal(row.total_expected), row.service_name)))
    total_expected = sum((Decimal(row.total_expected) for row in items), Decimal(0))
    total_paid = sum((Decimal(row.total_paid) for row in items), Decimal(0))
    total_outstanding = total_expected - total_paid
    return ServicesRenderedReport(
        metric="clinic_services_rendered",
        period=period,
        date_basis="plan_created_at",
        currency="KZT",
        items=items,
        totals=ServicesRenderedTotals(
            total_expected=format_money(total_expected),
            total_paid=format_money(total_paid),
            total_outstanding=format_money(total_outstanding),
            services_count=len(items),
        ),
        complete_within_declared_scope=True,
        limitations=LIMITATIONS,
        data_source=snapshot.coverage.data_source,
    )
