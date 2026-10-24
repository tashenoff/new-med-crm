"""Fixed-collection, projected, bounded snapshot reads; no Mongo client creation."""
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal

from .contract import MAX_EVENTS, ReportError
from .live_access import bounded_find
from .grok_oauth import CLIENT_ID
from .payroll import MAX_RECORDS, PayrollSnapshot, check_size
from .service import CoverageEvidence, NON_RECEIPTS, RECEIPTS, Snapshot, amount, instant

EVIDENCE = {"paid_amount", "paid", "paid_from_deposit", "cash_amount", "deposit", "deposit_amount",
    "deposit_balance", "extra_deposit", "payment_date", "paid_at", "payment_status"}
TARGET = EVIDENCE | {"id", "service_id", "serviceId", "service_row_id", "component_id", "session_id",
    "doctor_id", "total_price", "price", "price_per_unit", "session_price", "quantity", "quantity_completed",
    "completed_units", "completed", "completed_at", "completion_date", "execution_status", "status",
    "discount_amount", "discount_total", "occurrence_ids", "is_complex", "is_course", "payment_type", "date"}
EVENT = {"event_id", "kind", "amount_kzt", "currency", "occurred_at", "recorded_at", "plan_id",
    "service_row_id", "component_id", "session_id", "doctor_id", "service_id", "operation_id",
    "request_hash", "recorded_by", "payment_source", "payment_method", "payment_method_id",
    "payment_method_name", "discount_amount_kzt", "occurrence_id", "completion_occurrence_id", "date",
    "compensation_amount_kzt", "compensation_snapshot", "service_catalog_snapshot", "appointment_id"}


def plan_projection():
    fields = {"id", "clinic_id", "assigned_doctor_id", "doctor_id", "compensation_policy", "payment_completion_policy",
              "advance_balance_kzt"} | EVIDENCE
    fields |= {"accounting_events." + key for key in EVENT}
    for prefix in ("services", "services.components", "services.sessions", "services.components.sessions"):
        fields |= {prefix + "." + key for key in TARGET}
        fields.add(prefix + ".service_catalog_snapshot")
        for legacy in ("payments", "receipts"):
            fields.add(prefix + "." + legacy + ".amount")
    fields |= {"payments.amount", "receipts.amount"}
    return {"_id": 0, **{field: 1 for field in fields}}


def doctor_projection():
    from compensation import COMPENSATION_FIELDS
    # services contains catalog IDs and commission configuration, not medical records.
    return {"_id": 0, "id": 1, "clinic_id": 1, "is_active": 1,
            **{key: 1 for key in COMPENSATION_FIELDS}}


APPOINTMENTS = {"_id": 0, "id": 1, "clinic_id": 1, "doctor_id": 1, "status": 1, "appointment_date": 1}


def funded(events):
    return sum((amount(row.get("amount_kzt")) for row in events if row.get("kind") in RECEIPTS
                or str(row.get("kind", "")).endswith(("_advance_allocation", "_deposit_allocation"))), Decimal(0))


def evidence(item):
    return (any(item.get(key) for key in EVIDENCE - {"payment_status"})
            or item.get("payment_status") in {"paid", "part_paid", "partially_paid"}
            or bool(item.get("payments") or item.get("receipts")))


def verify_finance_plan(plan):
    events = plan.get("accounting_events", [])
    if type(events) is not list or any(type(row) is not dict for row in events):
        raise ReportError("INCOMPLETE_ACCOUNTING")
    if any(row.get("plan_id") != plan.get("id") for row in events):
        raise ReportError("SOURCE_DATA_INVALID")
    if not events and (evidence(plan) or plan.get("advance_balance_kzt")):
        raise ReportError("INCOMPLETE_ACCOUNTING")
    if plan.get("payments") or plan.get("receipts"):
        raise ReportError("INCOMPLETE_ACCOUNTING")
    # Stored balances are coverage checks only; they never become receipt amounts.
    if plan.get("paid_amount") is not None and amount(plan["paid_amount"]) != funded(events):
        raise ReportError("INCOMPLETE_ACCOUNTING")
    advance = sum((amount(row.get("amount_kzt")) * (1 if row.get("kind") == "plan_advance" else -1)
                   for row in events if row.get("kind") == "plan_advance"
                   or str(row.get("kind", "")).endswith("_advance_allocation")), Decimal(0))
    if advance < 0 or (plan.get("advance_balance_kzt") is not None and amount(plan["advance_balance_kzt"]) != advance):
        raise ReportError("INCOMPLETE_ACCOUNTING")
    deposit = sum((amount(row.get("amount_kzt")) * (1 if row.get("kind") == "patient_deposit_received" else -1)
                   for row in events if row.get("kind") == "patient_deposit_received"
                   or str(row.get("kind", "")).endswith("_deposit_allocation")), Decimal(0))
    if deposit < 0 or (plan.get("deposit_balance") is not None and amount(plan["deposit_balance"]) != deposit):
        raise ReportError("INCOMPLETE_ACCOUNTING")
    if plan.get("deposit_amount") or plan.get("extra_deposit"):
        # These ambiguous historical aliases cannot certify a recorded-only receipt total.
        raise ReportError("INCOMPLETE_ACCOUNTING")
    for key in ("deposit_amount", "deposit_balance", "extra_deposit"):
        if plan.get(key) and not any(row.get("kind") in {"plan_advance", "patient_deposit_received"} for row in events):
            raise ReportError("INCOMPLETE_ACCOUNTING")

    def target(item, parent, component=None, session=None):
        if item.get("payments") or item.get("receipts"):
            raise ReportError("INCOMPLETE_ACCOUNTING")
        matching = [row for row in events if row.get("service_row_id") == parent
                    and row.get("component_id") == component and row.get("session_id") == session]
        if evidence(item) and (not parent or not matching):
            raise ReportError("INCOMPLETE_ACCOUNTING")
        if item.get("paid_amount") is not None and amount(item["paid_amount"]) != funded(matching):
            raise ReportError("INCOMPLETE_ACCOUNTING")
        if item.get("paid") and funded(matching) == 0:
            raise ReportError("INCOMPLETE_ACCOUNTING")

    for row in plan.get("services") or []:
        parent = row.get("service_row_id")
        if row.get("paid_amount") is not None and amount(row["paid_amount"]) != funded(
                [event for event in events if event.get("service_row_id") == parent]):
            raise ReportError("INCOMPLETE_ACCOUNTING")
        if row.get("components"):
            for component in row["components"]:
                target(component, parent, component.get("component_id"))
        elif row.get("sessions"):
            for session in row["sessions"]:
                target(session, parent, session=session.get("session_id") or session.get("id"))
        else:
            target(row, parent)
    return events


class LiveReadAdapter:
    def __init__(self, db, binding, *, principal_id=None):
        self.db, self.binding = db, binding
        if principal_id not in (None, CLIENT_ID):
            raise ReportError("REPORTING_UNCONFIGURED")
        self.principal_id = binding.agent_id if principal_id is None else principal_id

    def guard(self, scope):
        self.binding.verify(self.db)
        if (scope.subject_id != self.binding.owner_id or scope.agent_id != self.principal_id
                or scope.clinic_id != self.binding.clinic_id):
            raise ReportError("FORBIDDEN")

    async def records(self, collection, projection, session):
        rows = await bounded_find(collection, {}, projection, limit=MAX_RECORDS, session=session)
        remaining = [50_000]
        result, identifiers = [], set()
        for row in rows:
            check_size(row, remaining)
            if (type(row) is not dict or type(row.get("id")) is not str or not row["id"]
                    or row["id"] in identifiers or row.get("clinic_id") not in (None, self.binding.clinic_id)):
                raise ReportError("INCOMPLETE_ACCOUNTING")
            identifiers.add(row["id"])
            result.append({**deepcopy(row), "clinic_id": self.binding.clinic_id})
        return tuple(result)

    def coverage(self, scope, period):
        return CoverageEvidence(scope.clinic_id, instant(period.start_utc), instant(period.end_utc_exclusive),
                                True, True, 0, "crm_api")

    async def finance(self, scope, period):
        self.guard(scope)
        # A real Mongo snapshot session is required. Unsupported deployments fail closed;
        # there is no fallback to drifting collection reads or a write transaction.
        async with await self.db.client.start_session(snapshot=True) as session:
            plans = await self.records(self.db.treatment_plans, plan_projection(), session)
        events, owners = [], {}
        for plan in plans:
            for row in verify_finance_plan(plan):
                identifier = row.get("event_id")
                if identifier in owners and owners[identifier] != plan["id"]:
                    raise ReportError("SOURCE_DATA_INVALID")
                owners[identifier] = plan["id"]
                if row.get("kind") not in RECEIPTS | NON_RECEIPTS | {"plan_advance"}:
                    raise ReportError("INCOMPLETE_ACCOUNTING")
                if len(events) >= MAX_EVENTS:
                    raise ReportError("INCOMPLETE_ACCOUNTING")
                when = row.get("occurred_at")
                if not isinstance(when, datetime):
                    raise ReportError("SOURCE_DATA_INVALID")
                # Existing Motor/BSON naive datetimes represent UTC, not local time.
                when = when.replace(tzinfo=timezone.utc) if when.tzinfo is None else when.astimezone(timezone.utc)
                events.append({key: row.get(key) for key in ("event_id", "kind", "amount_kzt", "currency")}
                              | {"occurred_at": when, "clinic_id": scope.clinic_id})
        return Snapshot(tuple(events), self.coverage(scope, period))

    async def payroll(self, scope, period):
        self.guard(scope)
        async with await self.db.client.start_session(snapshot=True) as session:
            doctors = await self.records(self.db.doctors, doctor_projection(), session)
            plans = await self.records(self.db.treatment_plans, plan_projection(), session)
            appointments = await self.records(self.db.appointments, APPOINTMENTS, session)
        # SalaryService requires a full_name for its legacy internal DTO. Do not fetch it.
        doctors = tuple({**doctor, "full_name": "withheld"} for doctor in doctors)
        return PayrollSnapshot(doctors, plans, appointments, self.coverage(scope, period))
