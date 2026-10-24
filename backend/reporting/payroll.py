"""Bounded projection of the existing SalaryService over detached clinic records.

No database connection and no payout inference. The default HTTP source is closed.
"""
from copy import deepcopy
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
import re
from typing import Literal

from pydantic import StrictStr, field_validator, model_validator

from .contract import ClosedModel, Period, ReportError, Scope
from .service import CoverageEvidence, Snapshot, aggregate, amount, instant

PATH = "/api/reporting/payroll/summary"
SCOPE = "payroll.summary.read"
PERMISSION = "payroll_view"
MAX_DOCTORS = 100
MAX_RECORDS = 5000
LIMITATIONS = (
    "Accrued compensation from existing SalaryService rules, not a salary payment ledger.",
    "Paid and outstanding are unavailable: no verified salary payout ledger or opening balance.",
    "No debt is inferred by subtracting unrelated period accruals and payments.",
)


class DoctorAccrual(ClosedModel):
    doctor_id: StrictStr
    accrued_kzt: StrictStr

    @model_validator(mode="after")
    def validate_row(self):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", self.doctor_id):
            raise ValueError("Invalid doctor identity")
        if not re.fullmatch(r"(?:0|[1-9]\d{0,12})\.\d{2}", self.accrued_kzt, re.ASCII):
            raise ValueError("Invalid amount")
        return self


class PayrollReport(ClosedModel):
    metric: Literal["existing_salary_service_accrual"]
    period: Period
    date_basis: Literal["existing_earning_rules_with_explicit_utc_bounds"]
    currency: Literal["KZT"]
    doctors: tuple[DoctorAccrual, ...]
    accrued_kzt: StrictStr
    paid_kzt: None
    outstanding_kzt: None
    payout_status: Literal["unavailable_no_verified_payout_ledger"]
    accrual_complete: Literal[True]
    limitations: tuple[StrictStr, StrictStr, StrictStr]
    data_source: Literal["synthetic_demo", "crm_api"]

    @field_validator("accrual_complete", mode="before")
    @classmethod
    def strict_complete(cls, value):
        if value is not True:
            raise ValueError("No implicit completeness")
        return value

    @model_validator(mode="after")
    def validate_totals(self):
        if (len(self.doctors) > MAX_DOCTORS or len({row.doctor_id for row in self.doctors}) != len(self.doctors)
                or self.limitations != LIMITATIONS
                or not re.fullmatch(r"(?:0|[1-9]\d{0,12})\.\d{2}", self.accrued_kzt, re.ASCII)
                or sum((Decimal(row.accrued_kzt) for row in self.doctors), Decimal(0)) != Decimal(self.accrued_kzt)):
            raise ValueError("Invalid payroll aggregate")
        return self


class PayrollEnvelope(ClosedModel):
    scope: Scope
    report: PayrollReport


@dataclass(frozen=True)
class PayrollSnapshot:
    doctors: tuple[dict, ...]
    plans: tuple[dict, ...]
    appointments: tuple[dict, ...]
    coverage: CoverageEvidence


def values_at(record, path):
    if not path:
        return record if isinstance(record, list) else [record]
    if isinstance(record, list):
        return [value for row in record for value in values_at(row, path)]
    if not isinstance(record, dict):
        return []
    return values_at(record.get(path[0]), path[1:])


def matches(record, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(matches(record, clause) for clause in expected):
                return False
        elif isinstance(expected, dict) and set(expected) == {"$in"}:
            if not any(value in expected["$in"] for value in values_at(record, key.split("."))):
                return False
        elif isinstance(expected, dict):
            raise ReportError("SOURCE_CONTRACT_INVALID")
        elif not any(value == expected for value in values_at(record, key.split("."))):
            return False
    return True


def check_size(value, remaining, depth=0):
    remaining[0] -= 1
    if remaining[0] < 0 or depth > 24:
        raise ReportError("INCOMPLETE_ACCOUNTING")
    if isinstance(value, dict):
        for child in value.values():
            check_size(child, remaining, depth + 1)
    elif isinstance(value, (tuple, list)):
        for child in value:
            check_size(child, remaining, depth + 1)


class Records:
    """Only the two read methods used by SalaryService; there are no write methods."""
    def __init__(self, records):
        self.records = records

    def find(self, query):
        return Records(tuple(row for row in self.records if matches(row, query)))

    async def to_list(self, limit):
        return deepcopy(list(self.records))


async def calculate(snapshot, scope, period):
    if not isinstance(snapshot, PayrollSnapshot):
        raise ReportError("INCOMPLETE_ACCOUNTING")
    # Reuse exactly the coverage checks of the finance report, without inferring events.
    aggregate(Snapshot((), snapshot.coverage), scope, period)
    scoped = []
    remaining = [50_000]
    for records in (snapshot.doctors, snapshot.plans, snapshot.appointments):
        if type(records) is not tuple or len(records) > MAX_RECORDS:
            raise ReportError("INCOMPLETE_ACCOUNTING")
        selected = []
        for record in records:
            if not isinstance(record, dict) or not record.get("clinic_id"):
                raise ReportError("INCOMPLETE_ACCOUNTING")
            if record["clinic_id"] == scope.clinic_id:
                check_size(record, remaining)
                selected.append(deepcopy(record))
        identifiers = [row.get("id") for row in selected]
        if (any(type(identifier) is not str or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", identifier) for identifier in identifiers)
                or len(set(identifiers)) != len(identifiers)):
            raise ReportError("SOURCE_DATA_INVALID")
        scoped.append(tuple(selected))
    if len(scoped[0]) > MAX_DOCTORS:
        raise ReportError("INCOMPLETE_ACCOUNTING")
    # Lazy import: registering the closed route never opens the legacy services package.
    from services.salary_service import SalaryService

    start = instant(period.start_utc).replace(tzinfo=None)
    end = (instant(period.end_utc_exclusive) - timedelta(microseconds=1)).replace(tzinfo=None)

    class BoundedSalaryService(SalaryService):
        # Existing formulas/snapshot validation are unchanged; only explicit period bounds
        # replace the old endpoint's implicit naive day boundaries.
        async def _calculate_appointments_revenue(self, doctor_id, *_):
            return await super()._calculate_appointments_revenue(doctor_id, start, end)

        async def _calculate_treatment_plans_salary(self, doctor, doctor_id, *_):
            return await super()._calculate_treatment_plans_salary(doctor, doctor_id, start, end)

    class DetachedClinic:
        doctors = Records(scoped[0])
        treatment_plans = Records(scoped[1])
        appointments = Records(scoped[2])

    result = await BoundedSalaryService(DetachedClinic()).get_doctor_salary_report(period.date_from, period.date_to)
    if result.get("compensation_currency") != "KZT" or type(result.get("salary_data")) is not list:
        raise ReportError("INCOMPLETE_ACCOUNTING")
    # Do not invent payouts. Incomplete doctors may be omitted only when their zero
    # period accrual is independently proven (idle consultation-mode gaps).
    SAFE_IDLE = frozenset({"consultation_mode_unavailable"})

    def proven_idle(row):
        if type(row) is not dict:
            return False
        blockers = row.get("accounting_blockers") or []
        if type(blockers) is not list or not blockers:
            return False
        codes = set()
        for entry in blockers:
            if type(entry) is not dict or type(entry.get("code")) is not str:
                return False
            codes.add(entry["code"])
        if not codes <= SAFE_IDLE:
            return False
        try:
            zero = (
                amount(row.get("calculated_salary") or 0) == 0
                and amount(row.get("treatment_plans_revenue") or 0) == 0
                and amount(row.get("appointments_revenue") or 0) == 0
                and (row.get("total_appointments") or 0) == 0
            )
        except ReportError:
            return False
        return zero is True

    complete, blocked = [], []
    for row in result["salary_data"]:
        if type(row) is not dict or type(row.get("doctor_id")) is not str:
            raise ReportError("INCOMPLETE_ACCOUNTING")
        if row.get("compensation_complete") is True and not (row.get("accounting_blockers") or []):
            complete.append(row)
        else:
            blocked.append(row)
    if any(not proven_idle(row) for row in blocked):
        raise ReportError("INCOMPLETE_ACCOUNTING")
    doctors = tuple(DoctorAccrual(doctor_id=row["doctor_id"], accrued_kzt=f"{amount(row['calculated_salary']):.2f}")
                    for row in complete)
    total = amount(sum((Decimal(row.accrued_kzt) for row in doctors), Decimal(0)))
    if not blocked and amount(result["summary"]["total_salary"]) != total:
        raise ReportError("SOURCE_DATA_INVALID")
    return PayrollReport(metric="existing_salary_service_accrual", period=period,
        date_basis="existing_earning_rules_with_explicit_utc_bounds", currency="KZT", doctors=doctors,
        accrued_kzt=f"{total:.2f}", paid_kzt=None, outstanding_kzt=None,
        payout_status="unavailable_no_verified_payout_ledger", accrual_complete=True,
        limitations=LIMITATIONS, data_source=snapshot.coverage.data_source)
