"""Real MongoDB integration. Run with --noconftest, on a dedicated port only.

ADMIN_BONUS_TEST_MONGO_URL must be mongodb://127.0.0.1:27198. Each test owns a
new synthetic database. No .env, default client or production data is used.
"""
import asyncio
from datetime import datetime, timezone
import os
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

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


@pytest.mark.parametrize("kind,value,expected", [
    ("fixed", 80, {"consultation": 80, "blood": 80, "urine": 80}),
    ("percentage", 5, {"consultation": 350, "blood": 175, "urine": 150}),
])
async def test_batch_payment_records_each_position_with_one_setting_snapshot(synthetic_db, monkeypatch, kind, value, expected):
    db = synthetic_db
    await seed(db, kind, value)
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
    assert {e["service_row_id"]: e["admin_bonus"]["amount_kzt"] for e in receipts} == expected
    assert len(receipts) == 3
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


@pytest.mark.parametrize("kind,value", [("percentage", 5), ("fixed", 100)])
@pytest.mark.parametrize("analysis", [False, True])
async def test_single_source_position_is_ineligible_for_both_rates(synthetic_db, kind, value, analysis):
    db = synthetic_db
    await seed(db, kind, value)
    plan = await db.treatment_plans.find_one({"id": "plan"})
    urine = next(row for row in plan["services"] if row["service_row_id"] == "urine")
    await db.treatment_plans.update_one({"id": "plan"}, {"$set": {
        "services": [urine], "total_cost": 3000, "consultation_sheet_id": "synthetic-assignment"}})
    if analysis:
        await db.service_prices.update_one({"id": "urine"}, {"$set": {"service_type": "analysis"}})
    body = command(3000)
    first = await pay(db, "urine", 3000, body=body)
    snapshot = await db.treatment_plans.find_one({"id": "plan"})
    assert snapshot["paid_amount"] == 3000 and snapshot["payment_status"] == "paid"
    assert "admin_bonus" not in first["event"]
    assert (await pay(db, "urine", 3000, "cashier-b", body=body)) == first
    from services.admin_bonus_period import report_context
    report = await AdminBonusService(db).report(report_context()["current_month"])
    assert report["total"] == 0 and report["rows"] == [] and report["employees"] == []
    assert (await db.treatment_plans.find_one({"id": "plan"}))["accounting_events"] == snapshot["accounting_events"]


@pytest.mark.parametrize("kind,value", [("percentage", 5), ("fixed", 100)])
async def test_separate_single_position_plans_of_one_patient_do_not_combine(synthetic_db, kind, value):
    from copy import deepcopy
    db = synthetic_db
    await seed(db, kind, value)
    original = await db.treatment_plans.find_one({"id": "plan"})
    urine = next(row for row in original["services"] if row["service_row_id"] == "urine")
    await db.treatment_plans.update_one({"id": "plan"}, {"$set": {"services": [urine], "total_cost": 3000}})
    other = deepcopy(original)
    other.pop("_id")
    other.update(id="other-plan", services=[deepcopy(urine)], total_cost=3000)
    await db.treatment_plans.insert_one(other)
    await pay(db, "urine", 3000)
    result = await AccountingLedgerService(db, sync_payment=False).record_ordinary_service(
        "other-plan", "urine", "service_receipt", command(3000), "cashier-b")
    assert "admin_bonus" not in result["event"]
    for identity in ("plan", "other-plan"):
        plan = await db.treatment_plans.find_one({"id": identity})
        assert "admin_bonus" not in plan["accounting_events"][0]


@pytest.mark.parametrize("kind,value,first,second", [("percentage", 5, 150, 525), ("fixed", 100, 100, 200)])
async def test_eligible_source_counts_all_positions_across_months(synthetic_db, monkeypatch, kind, value, first, second):
    db = synthetic_db
    await seed(db, kind, value)
    clock(monkeypatch, datetime(2026, 9, 15, tzinfo=timezone.utc))
    await pay(db, "urine", 3000)
    clock(monkeypatch, datetime(2026, 10, 15, tzinfo=timezone.utc))
    await pay(db, "consultation", 7000, "cashier-b")
    await pay(db, "blood", 3500, "cashier-b")
    september = await AdminBonusService(db).report("2026-09")
    october = await AdminBonusService(db).report("2026-10")
    assert [row["basis_amount_kzt"] for row in september["rows"]] == [3000]
    assert sum(row["basis_amount_kzt"] for row in october["rows"]) == 10500
    assert september["employees"][0]["bonus_amount_kzt"] == first
    assert october["employees"][0]["bonus_amount_kzt"] == second
    assert len(september["rows"]) == 1 and len(october["rows"]) == 2


@pytest.mark.parametrize("kind,value,expected", [("percentage", 5, [50, 100, 175]), ("fixed", 100, [100, 0, 100])])
async def test_two_position_source_partial_payments_preserve_rate_semantics(synthetic_db, kind, value, expected):
    db = synthetic_db
    await seed(db, kind, value)
    plan = await db.treatment_plans.find_one({"id": "plan"})
    await db.treatment_plans.update_one({"id": "plan"}, {"$set": {
        "services": [row for row in plan["services"] if row["service_row_id"] != "consultation"], "total_cost": 6500}})
    payments = [await pay(db, "urine", 1000), await pay(db, "urine", 2000, "cashier-b"), await pay(db, "blood", 3500)]
    assert [payment["event"]["admin_bonus"]["amount_kzt"] for payment in payments] == expected
    assert all(payment["event"]["admin_bonus"]["recipient_user_id"] in ("cashier-a", "cashier-b") for payment in payments)


@pytest.mark.parametrize("kind,value,historical", [("percentage", 5, 50), ("fixed", 100, 100)])
async def test_threshold_does_not_rewrite_preexisting_single_position_bonus(synthetic_db, kind, value, historical):
    from copy import deepcopy
    from services.admin_bonus_period import report_context
    db = synthetic_db
    await seed(db, kind, value)
    plan = await db.treatment_plans.find_one({"id": "plan"})
    await db.treatment_plans.update_one({"id": "plan"}, {"$set": {
        "services": [row for row in plan["services"] if row["service_row_id"] == "urine"], "total_cost": 3000}})
    await pay(db, "urine", 1000)
    before = await db.treatment_plans.find_one({"id": "plan"})
    receipt = before["accounting_events"][0]
    # Seed a pre-rule snapshot without recalculating or migrating old data.
    receipt["admin_bonus"] = dict(policy="admin_bonus_v1", setting_revision="historical-rate",
        rate_type=kind, rate_value=value, enabled=True, currency="KZT", status="accrued",
        recipient_user_id="cashier-a", paid_at=receipt["occurred_at"], basis_amount_kzt=1000,
        amount_kzt=historical, patient_id="patient", service_name="urine")
    await db.treatment_plans.update_one({"id": "plan"}, {"$set": {"accounting_events": before["accounting_events"]}})
    original = deepcopy(receipt["admin_bonus"])
    second = await pay(db, "urine", 2000, "cashier-b")
    assert "admin_bonus" not in second["event"]
    after = await db.treatment_plans.find_one({"id": "plan"})
    assert after["accounting_events"][0]["admin_bonus"] == original
    report = await AdminBonusService(db).report(report_context()["current_month"])
    assert report["total"] == 1 and report["rows"][0]["amount_kzt"] == historical
    assert report["rows"][0]["setting_revision"] == "historical-rate"


async def stage_source(db, shape, count, mixed=False):
    if shape == "course":
        row = dict(service_row_id="stage-row", service_id="consultation", service_name="Synthetic course",
            is_course=True, payment_type="per_session", quantity=count, quantity_total=count,
            session_price=1000, total_price=count * 1000, payment_status="unpaid",
            sessions=[dict(session_id=f"step-{index}", price=1000) for index in range(count)])
    else:
        catalogs = ("consultation", "blood", "urine")
        row = dict(service_row_id="stage-row", service_id="complex", service_name="Synthetic complex",
            is_complex=True, quantity=1, total_price=count * 1000, payment_status="unpaid",
            components=[dict(component_id=f"step-{index}", service_id=catalogs[index],
                service_name=f"Synthetic stage {index}", price=1000, quantity=1,
                occurrence_ids=[f"stage-occurrence-{index}"]) for index in range(count)])
        await db.service_prices.insert_one(dict(id="complex", service_type="complex"))
    rows = [row]
    if mixed:
        rows.append(dict(service_row_id="plain-row", service_id="urine", service_name="Synthetic analysis",
            total_price=2000, quantity=1, occurrence_ids=["plain-occurrence"], payment_status="unpaid"))
    await db.treatment_plans.update_one({"id": "plan"}, {"$set": {
        "services": rows, "total_cost": count * 1000 + (2000 if mixed else 0),
        "payment_completion_policy": "full_payment_v1"}})
    return row


async def stage_payment(db, shape, step, amount_kzt, actor="cashier-a", body=None):
    ledger = AccountingLedgerService(db, sync_payment=False)
    payment = body or command(amount_kzt)
    if shape == "course":
        return await ledger.record_session("plan", "consultation", step,
            dict(payment, service_row_id="stage-row", session_id=step), actor)
    return await ledger.record_ordinary_service("plan", "stage-row", "component_receipt",
        payment, actor, component_id=step)


@pytest.mark.parametrize("kind,value", [("percentage", 5), ("fixed", 100)])
@pytest.mark.parametrize("shape", ["course", "complex"])
async def test_single_stage_source_has_no_bonus_and_parent_is_not_a_second_position(synthetic_db, kind, value, shape):
    from services.payment_completion_service import payment_positions
    from services.admin_bonus_period import report_context
    db = synthetic_db
    await seed(db, kind, value)
    row = await stage_source(db, shape, 1)
    assert len(list(payment_positions([row]))) == 1
    body = command(1000)
    first = await stage_payment(db, shape, "step-0", 1000, body=body)
    assert "admin_bonus" not in first["event"]
    before = await db.treatment_plans.find_one({"id": "plan"})
    await stage_payment(db, shape, "step-0", 1000, "cashier-b", body=body)
    after = await db.treatment_plans.find_one({"id": "plan"})
    assert after["accounting_events"] == before["accounting_events"]
    assert after["paid_amount"] == 1000 and after["payment_status"] == "paid"
    assert (await AdminBonusService(db).report(report_context()["current_month"]))["total"] == 0


@pytest.mark.parametrize("kind,value,per_stage", [("percentage", 5, 50), ("fixed", 100, 100)])
@pytest.mark.parametrize("mode", ["staged", "aggregate"])
async def test_five_session_course_qualifies_per_session_with_partial_payment_and_retry(synthetic_db, monkeypatch, kind, value, per_stage, mode):
    from services.payment_completion_service import payment_positions, PaymentCompletionService
    from services.admin_bonus_period import report_context
    db = synthetic_db
    await seed(db, kind, value)
    row = await stage_source(db, "course", 5)
    assert len(list(payment_positions([row]))) == 5
    if mode == "aggregate":
        monkeypatch.setattr(AccountingLedgerService, "_sync_payment", AsyncMock())
        body = command(5000)
        await PaymentCompletionService(db).settle_remaining("plan", body, "cashier-a")
        before = await db.treatment_plans.find_one({"id": "plan"})
        await PaymentCompletionService(db).settle_remaining("plan", body, "cashier-b")
    else:
        first = await stage_payment(db, "course", "step-0", 400)
        assert first["event"]["admin_bonus"]["amount_kzt"] == (20 if kind == "percentage" else 100)
        await stage_payment(db, "course", "step-0", 600, "cashier-b")
        for index in range(1, 5):
            body = command(1000)
            await stage_payment(db, "course", f"step-{index}", 1000, "cashier-b", body=body)
        before = await db.treatment_plans.find_one({"id": "plan"})
        await stage_payment(db, "course", "step-4", 1000, "cashier-a", body=body)
    after = await db.treatment_plans.find_one({"id": "plan"})
    assert after["accounting_events"] == before["accounting_events"]
    assert after["paid_amount"] == 5000 and after["payment_status"] == "paid"
    report = await AdminBonusService(db).report(report_context()["current_month"])
    assert report["total"] == (5 if mode == "aggregate" else 6)
    totals = {}
    for receipt in report["rows"]:
        totals[receipt["session_id"]] = totals.get(receipt["session_id"], 0) + receipt["amount_kzt"]
    assert totals == {f"step-{index}": per_stage for index in range(5)}
    assert sum(row["basis_amount_kzt"] for row in report["rows"]) == 5000


@pytest.mark.parametrize("kind,value", [("percentage", 5), ("fixed", 100)])
@pytest.mark.parametrize("shape", ["course", "complex"])
async def test_mixed_source_one_stage_and_one_analysis_qualifies_as_two(synthetic_db, kind, value, shape):
    from services.payment_completion_service import payment_positions
    db = synthetic_db
    await seed(db, kind, value)
    await stage_source(db, shape, 1, mixed=True)
    plan = await db.treatment_plans.find_one({"id": "plan"})
    assert len(list(payment_positions(plan["services"]))) == 2
    first = await stage_payment(db, shape, "step-0", 1000)
    second = await AccountingLedgerService(db, sync_payment=False).record_ordinary_service(
        "plan", "plain-row", "service_receipt", command(2000), "cashier-b")
    assert first["event"]["admin_bonus"]["amount_kzt"] == (50 if kind == "percentage" else 100)
    assert second["event"]["admin_bonus"]["amount_kzt"] == 100


@pytest.mark.parametrize("kind,value,per_stage", [("percentage", 5, 50), ("fixed", 100, 100)])
async def test_one_complex_row_with_three_stages_counts_three_and_accrues_separately(synthetic_db, monkeypatch, kind, value, per_stage):
    from services.payment_completion_service import payment_positions, PaymentCompletionService
    from services.admin_bonus_period import report_context
    db = synthetic_db
    await seed(db, kind, value)
    row = await stage_source(db, "complex", 3)
    assert len(list(payment_positions([row]))) == 3
    monkeypatch.setattr(AccountingLedgerService, "_sync_payment", AsyncMock())
    body = command(3000)
    await PaymentCompletionService(db).settle_remaining("plan", body, "cashier-a")
    report = await AdminBonusService(db).report(report_context()["current_month"])
    assert report["total"] == 3
    assert {row["component_id"]: row["amount_kzt"] for row in report["rows"]} == {
        f"step-{index}": per_stage for index in range(3)}
    before = await db.treatment_plans.find_one({"id": "plan"})
    await PaymentCompletionService(db).settle_remaining("plan", body, "cashier-b")
    assert (await db.treatment_plans.find_one({"id": "plan"}))["accounting_events"] == before["accounting_events"]
