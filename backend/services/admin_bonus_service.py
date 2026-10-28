"""Prospective administrator bonuses stored atomically with their receipt.

There is no historical backfill. Advance/deposit and payment reversal flows
are outside this module and remain untouched.
"""
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

SETTINGS_ID = "global"
RECEIPT_KINDS = {f"{unit}_receipt" for unit in ("service", "component", "session")}


def amount(value):
    from services.accounting_ledger_service import money
    return money(value, "bonus value")


def target_key(event):
    return (event.get("service_row_id"), event.get("component_id"), event.get("session_id"))


def attach_bonuses(plan, appended, setting):
    """Called before the plan CAS; replay and concurrency share its atomicity."""
    if not setting:
        return appended
    history = list(plan.get("accounting_events") or [])
    rows = plan.get("services") or []
    for event in appended:
        if event.get("kind") not in RECEIPT_KINDS or amount(event.get("amount_kzt", 0)) <= 0:
            history.append(event)
            continue
        parent = next((r for r in rows if r.get("service_row_id") == event.get("service_row_id")), {})
        target = next((c for c in parent.get("components", []) if c.get("component_id") == event.get("component_id")), parent) if event.get("component_id") else parent
        bonus = dict(policy="admin_bonus_v1", setting_revision=setting["revision"],
                     rate_type=setting.get("rate_type"), rate_value=setting.get("rate_value"),
                     enabled=setting["enabled"], currency="KZT", status="disabled",
                     recipient_user_id=event.get("recorded_by"),
                     paid_at=event["occurred_at"], basis_amount_kzt=event["amount_kzt"],
                     amount_kzt=0, patient_id=plan.get("patient_id"),
                     service_name=target.get("service_name") or target.get("name") or event.get("service_id"))
        if setting["enabled"]:
            if not event.get("recorded_by"):
                raise HTTPException(409, "Authenticated collecting employee is required")
            elif setting["rate_type"] == "fixed" and any(
                    old.get("kind") in RECEIPT_KINDS and target_key(old) == target_key(event)
                    and amount(old.get("amount_kzt", 0)) > 0 for old in history):
                bonus["status"] = "first_payment_already_recorded"
            else:
                value = amount(setting["rate_value"])
                earned = (amount(event["amount_kzt"]) * value / 100
                          if setting["rate_type"] == "percentage" else value)
                bonus.update(status="accrued", amount_kzt=float(earned.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)))
        event["admin_bonus"] = bonus
        history.append(event)
    return appended


class AdminBonusService:
    def __init__(self, db):
        self.db = db

    async def setting(self):
        return await self.db.admin_bonus_settings.find_one({"_id": SETTINGS_ID})

    @staticmethod
    def public_setting(document):
        if not document:
            return dict(enabled=False, rate_type=None, rate_value=None, revision=None)
        return {key: document.get(key) for key in
                ("enabled", "rate_type", "rate_value", "revision", "updated_at", "updated_by")}

    async def save_setting(self, body, user_id):
        previous = await self.setting()
        if body.expected_revision != (previous or {}).get("revision"):
            raise HTTPException(409, "Bonus setting changed; refresh before saving")
        if body.enabled and (body.rate_type is None or body.rate_value is None):
            raise HTTPException(422, "Choose a fixed amount or percentage before enabling bonuses")
        value = amount(body.rate_value) if body.rate_value is not None else None
        if body.rate_type == "percentage" and value is not None and value > 100:
            raise HTTPException(422, "Bonus percentage cannot exceed 100")
        if (body.rate_type is None) != (value is None):
            raise HTTPException(422, "Rate type and value must be supplied together")
        now = datetime.now(timezone.utc)
        fields = dict(enabled=body.enabled, rate_type=body.rate_type,
                      rate_value=float(value) if value is not None else None,
                      revision=str(uuid4()), updated_at=now, updated_by=user_id)
        try:
            if previous:
                result = await self.db.admin_bonus_settings.update_one(
                    {"_id": SETTINGS_ID, "revision": body.expected_revision},
                    {"$set": fields, "$push": {"history": deepcopy(fields)}})
                if not result.matched_count:
                    raise HTTPException(409, "Bonus setting changed; refresh before saving")
            else:
                await self.db.admin_bonus_settings.insert_one(dict(_id=SETTINGS_ID, **fields, history=[deepcopy(fields)]))
        except DuplicateKeyError:
            raise HTTPException(409, "Bonus setting changed; refresh before saving") from None
        return self.public_setting(fields)

    async def report(self, month, employee_id=None, offset=0, limit=100):
        from services.admin_bonus_period import bonus_timezone, month_bounds
        zone = bonus_timezone()
        start, end = month_bounds(month, zone)
        match = {"admin_bonus.paid_at": {"$gte": start, "$lt": end}}
        if employee_id:
            match["admin_bonus.recipient_user_id"] = employee_id
        # Filter and paginate in Mongo; the full patient/plan never leaves this service.
        pipeline = [
            {"$match": {"accounting_events.admin_bonus.paid_at": {"$gte": start, "$lt": end}}},
            {"$project": {"_id": 0, "accounting_events": 1}},
            {"$unwind": "$accounting_events"},
            {"$replaceRoot": {"newRoot": "$accounting_events"}},
            {"$match": match},
            {"$sort": {"admin_bonus.paid_at": -1, "event_id": 1}},
            {"$facet": {
                "rows": [{"$skip": offset}, {"$limit": limit}],
                "employees": [{"$group": {"_id": "$admin_bonus.recipient_user_id",
                    "bonus_amount_kzt": {"$sum": "$admin_bonus.amount_kzt"},
                    "payments": {"$sum": 1}}}],
                "count": [{"$count": "value"}],
            }},
        ]
        result = await self.db.treatment_plans.aggregate(pipeline).to_list(length=1)
        result = result[0] if result else {}
        rows = []
        people = {}
        async def name(identity):
            if not identity:
                return None
            if identity not in people:
                member = await self.db.users.find_one({"id": identity}, {"full_name": 1})
                if member is None:
                    member = await self.db.users.find_one({"_id": identity}, {"full_name": 1})
                if member is None:
                    from bson import ObjectId
                    if ObjectId.is_valid(identity):
                        member = await self.db.users.find_one({"_id": ObjectId(identity)}, {"full_name": 1})
                if member is None:
                    member = await self.db.staff.find_one({"_id": identity}, {"full_name": 1})
                people[identity] = (member or {}).get("full_name") or identity
            return people[identity]
        for event in result.get("rows", []):
            from services.accounting_ledger_service import utc_datetime
            bonus = deepcopy(event["admin_bonus"])
            bonus["paid_at"] = utc_datetime(bonus["paid_at"])
            patient = await self.db.patients.find_one({"id": bonus.get("patient_id")}, {"full_name": 1})
            rows.append(dict(event_id=event["event_id"], operation_id=event["operation_id"],
                plan_id=event["plan_id"], service_row_id=event["service_row_id"],
                component_id=event.get("component_id"), session_id=event.get("session_id"),
                employee_name=await name(bonus.get("recipient_user_id")),
                patient_name=(patient or {}).get("full_name") or bonus.get("patient_id"),
                payment_method=event.get("payment_method_name") or event.get("payment_method"),
                **bonus))
        employees = [dict(user_id=e["_id"], employee_name=await name(e["_id"]),
                          **{k: v for k, v in e.items() if k != "_id"}) for e in result.get("employees", [])]
        for employee in employees:
            employee["bonus_amount_kzt"] = round(employee["bonus_amount_kzt"], 2)
        return dict(month=month, timezone=zone.key, period_start_utc=start, period_end_utc_exclusive=end,
                    rows=rows, employees=employees,
                    total=(result.get("count") or [{"value": 0}])[0]["value"], offset=offset, limit=limit)
