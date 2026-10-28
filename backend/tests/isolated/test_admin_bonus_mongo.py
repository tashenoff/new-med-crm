"""Real MongoDB integration. Run with --noconftest, on a dedicated port only.

ADMIN_BONUS_TEST_MONGO_URL must be mongodb://127.0.0.1:27198. Each test owns a
new synthetic database. No .env, default client or production data is used.
"""
import asyncio
from datetime import datetime, timezone
import os
from types import SimpleNamespace
from uuid import uuid4

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.uri_parser import parse_uri
import pytest
import pytest_asyncio

from services.accounting_ledger_service import AccountingLedgerService, ordinary_ledger_totals
from services.admin_bonus_service import AdminBonusService


@pytest_asyncio.fixture
async def synthetic_db(monkeypatch):
    uri = os.environ.get("ADMIN_BONUS_TEST_MONGO_URL")
    if not uri:
        pytest.skip("Dedicated synthetic MongoDB was not requested")
    parsed = parse_uri(uri)
    assert parsed["nodelist"] == [("127.0.0.1", 27198)] and not parsed["options"]
    monkeypatch.setenv("ADMIN_BONUS_TIMEZONE", "Asia/Almaty")
    name = "admin_bonus_synthetic_" + uuid4().hex
    client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=3000)
    database = client[name]
    try:
        yield database
    finally:
        assert name.startswith("admin_bonus_synthetic_") and database.client is client
        await client.drop_database(name)
        client.close()


async def seed(db, kind="percentage", value=10):
    await db.admin_bonus_settings.insert_one(dict(_id="global", enabled=True, rate_type=kind,
        rate_value=value, revision="revision-original"))
    await db.doctors.insert_one(dict(id="doctor", payment_mode="general", payment_type="percentage", payment_value=20))
    await db.users.insert_many([dict(id="cashier-a", full_name="Synthetic employee A"), dict(id="cashier-b", full_name="Synthetic employee B")])
    await db.patients.insert_one(dict(id="patient", full_name="Synthetic patient"))
    await db.service_prices.insert_many([dict(id=key, service_type="regular") for key in ("consultation", "blood", "urine")])
    rows = [dict(service_row_id=key, service_id=key, service_name=key, total_price=price,
                 quantity=1, occurrence_ids=[key + "-occurrence"], payment_status="unpaid")
            for key, price in (("consultation", 7000), ("blood", 3500), ("urine", 3000))]
    await db.treatment_plans.insert_one(dict(id="plan", patient_id="patient", assigned_doctor_id="doctor",
        total_cost=13500, paid_amount=0, payment_status="unpaid", services=rows))


def command(paid, operation_id=None):
    return dict(operation_id=operation_id or str(uuid4()), amount_kzt=paid,
                discount_amount_kzt=0, payment_source="cash", payment_method="cash")


async def pay(db, row, paid, actor="cashier-a", body=None):
    return await AccountingLedgerService(db, sync_payment=False).record_ordinary_service(
        "plan", row, "service_receipt", body or command(paid), actor)


def clock(monkeypatch, instant):
    import services.accounting_ledger_service as ledger
    class ClockMeta(type):
        def __instancecheck__(cls, value):
            return isinstance(value, datetime)
    class Clock(datetime, metaclass=ClockMeta):
        @classmethod
        def now(cls, tz=None):
            return instant
    monkeypatch.setattr(ledger, "datetime", Clock)


async def test_two_months_exact_paid_positions_two_collectors_and_doctor_pay(synthetic_db, monkeypatch):
    db = synthetic_db
    await seed(db)
    clock(monkeypatch, datetime(2026, 9, 30, 18, 59, tzinfo=timezone.utc))
    await pay(db, "urine", 3000)
    clock(monkeypatch, datetime(2026, 10, 1, tzinfo=timezone.utc))
    await pay(db, "consultation", 7000, "cashier-b")
    await pay(db, "blood", 3500, "cashier-b")
    september = await AdminBonusService(db).report("2026-09")
    october = await AdminBonusService(db).report("2026-10")
    assert sum(row["basis_amount_kzt"] for row in september["rows"]) == 3000
    assert sum(row["basis_amount_kzt"] for row in october["rows"]) == 10500
    assert september["employees"][0]["bonus_amount_kzt"] == 300
    assert october["employees"][0]["bonus_amount_kzt"] == 1050
    assert october["timezone"] == "Asia/Almaty"
    assert september["rows"][0]["employee_name"] == "Synthetic employee A"
    assert october["rows"][0]["patient_name"] == "Synthetic patient"
    assert (await AdminBonusService(db).report("2026-10", "cashier-a"))["total"] == 0
    plan = await db.treatment_plans.find_one({"id": "plan"})
    assert plan["paid_amount"] == 13500 and plan["payment_status"] == "paid"
    assert ordinary_ledger_totals(plan, "doctor", datetime(2026, 9, 1), datetime(2026, 9, 30, 23, 59, 59, 999999)) == (3000, 600, [])
    assert ordinary_ledger_totals(plan, "doctor", datetime(2026, 10, 1), datetime(2026, 11, 1)) == (10500, 2100, [])


async def test_concurrent_retry_same_event_has_one_bonus(synthetic_db):
    db = synthetic_db
    await seed(db, "fixed", 80)
    body = command(300)
    results = await asyncio.gather(*(pay(db, "urine", 300, f"cashier-{i}", body) for i in range(20)))
    assert all(result == results[0] for result in results)
    plan = await db.treatment_plans.find_one({"id": "plan"})
    assert len(plan["accounting_events"]) == 1 and plan["paid_amount"] == 300
    assert plan["accounting_events"][0]["admin_bonus"]["amount_kzt"] == 80
    assert plan["accounting_events"][0]["admin_bonus"]["recipient_user_id"] == plan["accounting_events"][0]["recorded_by"]


async def test_concurrent_distinct_partial_payments_fixed_once(synthetic_db):
    db = synthetic_db
    await seed(db, "fixed", 80)
    async def retry(index):
        body = command(100)
        for attempt in range(10):
            try:
                return await pay(db, "urine", 100, f"cashier-{index}", body)
            except HTTPException as exc:
                if exc.status_code != 409 or attempt == 9:
                    raise
    await asyncio.gather(*(retry(i) for i in range(12)))
    plan = await db.treatment_plans.find_one({"id": "plan"})
    bonuses = [e["admin_bonus"] for e in plan["accounting_events"]]
    assert len(bonuses) == 12 and plan["paid_amount"] == 1200
    assert sum(b["amount_kzt"] for b in bonuses) == 80
    assert sum(b["status"] == "accrued" for b in bonuses) == 1


async def test_batch_payment_records_each_position_with_one_setting_snapshot(synthetic_db, monkeypatch):
    db = synthetic_db
    await seed(db, "fixed", 80)
    await db.treatment_plans.update_one({"id": "plan"}, {"$set": {"payment_completion_policy": "full_payment_v1"}})
    async def no_crm_sync(self, plan_id):
        pass
    monkeypatch.setattr(AccountingLedgerService, "_sync_payment", no_crm_sync)
    from services.payment_completion_service import PaymentCompletionService
    body = command(13500)
    await PaymentCompletionService(db).settle_remaining("plan", body, "cashier-a")
    plan = await db.treatment_plans.find_one({"id": "plan"})
    receipts = [e for e in plan["accounting_events"] if e["kind"] == "service_receipt"]
    assert {e["amount_kzt"] for e in receipts} == {7000, 3500, 3000}
    assert sum(e["admin_bonus"]["amount_kzt"] for e in receipts) == 240
    assert all(e["admin_bonus"]["setting_revision"] == "revision-original" for e in receipts)
    await PaymentCompletionService(db).settle_remaining("plan", body, "cashier-b")
    assert (await db.treatment_plans.find_one({"id": "plan"}))["accounting_events"] == plan["accounting_events"]


async def test_new_tariff_preserves_existing_snapshot_and_report_pagination(synthetic_db):
    db = synthetic_db
    await seed(db)
    await pay(db, "urine", 100)
    await db.admin_bonus_settings.update_one({"_id": "global"}, {"$set": {"rate_value": 20, "revision": "revision-next"}})
    await pay(db, "urine", 100, "cashier-b")
    plan = await db.treatment_plans.find_one({"id": "plan"})
    assert [e["admin_bonus"]["amount_kzt"] for e in plan["accounting_events"]] == [10, 20]
    from services.admin_bonus_period import report_context
    month = report_context()["current_month"]
    first = await AdminBonusService(db).report(month, limit=1)
    second = await AdminBonusService(db).report(month, offset=1, limit=1)
    assert first["total"] == second["total"] == 2
    assert first["rows"][0]["event_id"] != second["rows"][0]["event_id"]
    assert sum(e["bonus_amount_kzt"] for e in first["employees"]) == 30


async def test_analysis_without_doctor_receives_same_admin_rate(synthetic_db):
    db = synthetic_db
    await seed(db)
    await db.treatment_plans.update_one({"id": "plan"}, {"$unset": {"assigned_doctor_id": ""}})
    await db.service_prices.update_one({"id": "blood"}, {"$set": {"laboratory_id": "synthetic-lab"}})
    item = (await pay(db, "blood", 3500))["event"]
    assert item["doctor_id"] is None and item["compensation_amount_kzt"] == 0
    assert item["admin_bonus"]["amount_kzt"] == 350


async def test_concurrent_configuration_updates_preserve_history(synthetic_db):
    service = AdminBonusService(synthetic_db)
    first = await service.save_setting(SimpleNamespace(enabled=True, rate_type="percentage", rate_value=10, expected_revision=None), "manager-a")
    results = await asyncio.gather(*(service.save_setting(SimpleNamespace(enabled=True, rate_type="fixed", rate_value=value,
        expected_revision=first["revision"]), manager) for value, manager in ((75, "manager-a"), (80, "manager-b"))), return_exceptions=True)
    assert sum(isinstance(result, HTTPException) and result.status_code == 409 for result in results) == 1
    document = await service.setting()
    assert len(document["history"]) == 2
    assert document["history"][0]["rate_type"] == "percentage" and document["history"][0]["rate_value"] == 10
    assert document["history"][1]["revision"] == document["revision"]


@pytest.mark.parametrize("storage", ["id", "string_id", "object_id", "staff_only"])
async def test_register_resolves_server_account_identity_variants(synthetic_db, storage):
    from bson import ObjectId
    db = synthetic_db
    await seed(db)
    identity = "cashier-a"
    if storage != "id":
        await db.users.delete_one({"id": identity})
        if storage == "object_id":
            object_id = ObjectId()
            identity = str(object_id)
            await db.users.insert_one(dict(_id=object_id, full_name="Synthetic legacy employee"))
        elif storage == "string_id":
            await db.users.insert_one(dict(_id=identity, full_name="Synthetic legacy employee"))
        else:
            await db.staff.insert_one(dict(_id=identity, full_name="Synthetic legacy employee"))
    await pay(db, "urine", 100, identity)
    from services.admin_bonus_period import report_context
    report = await AdminBonusService(db).report(report_context()["current_month"])
    assert report["rows"][0]["recipient_user_id"] == identity
    assert report["rows"][0]["employee_name"] == ("Synthetic employee A" if storage == "id" else "Synthetic legacy employee")


async def test_clinic_month_edges_include_start_exclude_end_and_keep_utc_receipts(synthetic_db, monkeypatch):
    db = synthetic_db
    await seed(db)
    instants = [datetime(2026, 9, 30, 18, 59, 59, 999000, tzinfo=timezone.utc),
                datetime(2026, 9, 30, 19, tzinfo=timezone.utc),
                datetime(2026, 10, 31, 18, 59, 59, 999000, tzinfo=timezone.utc),
                datetime(2026, 10, 31, 19, tzinfo=timezone.utc)]
    for amount, instant in zip((100, 200, 300, 400), instants):
        clock(monkeypatch, instant)
        await pay(db, "urine", amount)
    september = await AdminBonusService(db).report("2026-09")
    october = await AdminBonusService(db).report("2026-10")
    november = await AdminBonusService(db).report("2026-11")
    assert [sum(row["basis_amount_kzt"] for row in result["rows"]) for result in (september, october, november)] == [100, 500, 400]
    assert october["period_start_utc"] == instants[1]
    assert october["period_end_utc_exclusive"] == instants[3]
    plan = await db.treatment_plans.find_one({"id": "plan"})
    assert [event["occurred_at"].replace(tzinfo=timezone.utc) for event in plan["accounting_events"]] == instants
    assert all(row["paid_at"].tzinfo == timezone.utc for row in october["rows"])
