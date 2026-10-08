"""DB-forbidden ordinary/course/component ledger slices; use --noconftest."""

import asyncio
import importlib
import socket
import sys
from copy import deepcopy
from datetime import datetime, timezone
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException


@pytest.fixture
def modules(monkeypatch):
    import motor.motor_asyncio
    import pymongo

    def forbidden(*args, **kwargs):
        raise AssertionError("Database/network access is forbidden")

    monkeypatch.setattr(pymongo, "MongoClient", forbidden)
    monkeypatch.setattr(motor.motor_asyncio, "AsyncIOMotorClient", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    database = ModuleType("database")
    database.db = Mock()
    database.get_database = Mock(return_value=database.db)
    monkeypatch.setitem(sys.modules, "database", database)
    dependencies = ModuleType("crm.dependencies")
    dependencies.get_database = database.get_database
    monkeypatch.setitem(sys.modules, "crm.dependencies", dependencies)
    return SimpleNamespace(
        ledger=importlib.import_module("services.accounting_ledger_service"),
        plans=importlib.import_module("services.treatment_plan_service"),
        routes=importlib.import_module("routers.treatment_plans"),
        sheets=importlib.import_module("services.consultation_service"),
    )


def memory_db(kind="hybrid", value=50, percent=20):
    document = dict(id="plan", patient_id="patient", assigned_doctor_id="doctor",
                    paid_amount=0, total_cost=1000, payment_status="unpaid",
                    services=[dict(service_id="catalog", service_row_id="row",
                                   total_price=1000, quantity=2, quantity_completed=0,
                                   occurrence_ids=["first", "second"], payment_status="unpaid")])
    settings = dict(id="doctor", payment_mode="general", payment_type=kind,
                    payment_value=value, hybrid_percentage_value=percent, currency="KZT")
    db = Mock()
    db.treatment_plans.find_one = AsyncMock(side_effect=lambda query: deepcopy(document))
    db.doctors.find_one = AsyncMock(side_effect=lambda query: deepcopy(settings))

    async def update(query, changes):
        for key, expected in query.items():
            if key == "accounting_events.0":
                if bool(document.get("accounting_events")) != expected["$exists"]:
                    return SimpleNamespace(matched_count=0)
            elif key == "accounting_events.operation_id":
                if any(event["operation_id"] == expected["$ne"] for event in document.get("accounting_events", [])):
                    return SimpleNamespace(matched_count=0)
            elif document.get(key) != expected:
                return SimpleNamespace(matched_count=0)
        document.update(deepcopy(changes.get("$set", {})))
        if "$push" in changes:
            document.setdefault("accounting_events", []).append(deepcopy(changes["$push"]["accounting_events"]))
        return SimpleNamespace(matched_count=1)

    db.treatment_plans.update_one = AsyncMock(side_effect=update)
    return db, document, settings


def receipt(**changes):
    return dict(dict(operation_id=str(uuid4()), amount_kzt=300, discount_amount_kzt=200,
                     payment_source="cash", payment_method="cash"), **changes)


def command(modules, db, body, kind="service_receipt", occurrence=None):
    return modules.ledger.AccountingLedgerService(db).record_ordinary_service(
        "plan", "row", kind, body, "recorder", occurrence)


def course_db():
    db, saved, settings = memory_db()
    saved["services"][0].update(is_course=True, payment_type="per_session", session_price=500,
        sessions=[dict(session_id="session-a", date="2026-10-08", price=500),
                  dict(session_id="session-b", date="2026-10-09", price=500)])
    return db, saved, settings


def test_stable_session_receipt_records_actual_partial_amount_atomically(modules, monkeypatch):
    db, saved, settings = course_db()
    monkeypatch.setattr(modules.routes, "db", db)
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    body = dict(session_id="session-a", operation_id=str(uuid4()), amount_kzt=200,
                funding_source="cash", payment_method="card")
    result = asyncio.run(modules.routes.mark_session_paid("plan", "catalog", "session-a",
        SimpleNamespace(id="recorder"), body))
    assert result["event"]["kind"] == "session_receipt"
    assert result["event"]["session_id"] == "session-a"
    assert result["event"]["amount_kzt"] == 200
    assert result["event"]["compensation_amount_kzt"] == 40
    session = result["plan"]["services"][0]["sessions"][0]
    assert session["paid_amount"] == 200
    assert session["amount_due_kzt"] == 300
    assert session["paid"] is False
    assert "$push" in db.treatment_plans.update_one.call_args.args[1]
    db.appointments.find.assert_not_called()
    db.payment_logs.insert_one.assert_not_called()


def test_session_receipt_payroll_verifies_stable_identity(modules, monkeypatch):
    db, saved, settings = course_db()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    asyncio.run(modules.ledger.AccountingLedgerService(db).record_session("plan", "catalog", "session-a",
        dict(session_id="session-a", operation_id=str(uuid4()), amount_kzt=200,
             funding_source="cash", payment_method="card"), "recorder"))
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    assert modules.ledger.ordinary_ledger_totals(saved, "doctor", start, now) == (200, 40, [])
    saved["accounting_events"][0]["session_id"] = "session-b"
    assert modules.ledger.ordinary_ledger_totals(saved, "doctor", start, now)[2][0]["code"] == "invalid_accounting_event"


def test_schedule_session_completion_accrues_fixed_once_and_replays(modules, monkeypatch):
    db, saved, settings = course_db()
    monkeypatch.setattr(modules.routes, "db", db)
    body = dict(session_id="session-a", date="2026-10-08", operation_id=str(uuid4()))
    user = SimpleNamespace(id="recorder", full_name="Recorder")
    saved.update(title="Plan", created_by="recorder", created_by_name="Recorder")
    result = asyncio.run(modules.routes.complete_course_session("plan", "catalog", body, user))
    assert result["event"]["kind"] == "session_completion"
    assert result["event"]["amount_kzt"] == 0
    assert result["event"]["compensation_amount_kzt"] == 50
    assert result["plan"]["services"][0]["sessions"][0]["completed"] is True
    assert result["plan"]["services"][0]["quantity_completed"] == 1
    settings["payment_value"] = 99
    assert asyncio.run(modules.routes.complete_course_session("plan", "catalog", body, user)) == result
    with pytest.raises(HTTPException) as duplicate:
        asyncio.run(modules.routes.complete_course_session("plan", "catalog", dict(body, operation_id=str(uuid4())), user))
    assert duplicate.value.status_code == 409
    assert db.treatment_plans.update_one.await_count == 1
    now = datetime.now(timezone.utc)
    assert modules.ledger.ordinary_ledger_totals(saved, "doctor", now.replace(hour=0, minute=0, second=0, microsecond=0), now) == (0, 50, [])


def test_procedure_route_completes_course_by_session_not_counter(modules, monkeypatch):
    db, saved, settings = course_db()
    monkeypatch.setattr(modules.routes, "db", db)
    user = SimpleNamespace(id="recorder")
    result = asyncio.run(modules.routes.mark_service_procedure_completed("plan", "catalog", user,
        dict(session_id="session-b", operation_id=str(uuid4()))))
    assert result["event"]["session_id"] == "session-b"
    assert result["plan"]["services"][0]["sessions"][1]["completed"] is True
    assert not result["plan"]["services"][0]["sessions"][0].get("completed")


def test_session_advance_partial_settlement_retries_conflicts_and_bounds(modules, monkeypatch):
    db, saved, settings = course_db()
    monkeypatch.setattr(modules.routes, "db", db)
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    service = modules.ledger.AccountingLedgerService(db)
    asyncio.run(service.record_plan_advance("plan", dict(operation_id=str(uuid4()), amount=600,
        payment_purpose="plan_advance", payment_method="card"), "recorder"))
    body = dict(session_id="session-a", operation_id=str(uuid4()), amount_kzt=200, funding_source="plan_advance")
    user = SimpleNamespace(id="recorder")
    result = asyncio.run(modules.routes.mark_session_paid("plan", "catalog", "session-a", user, body))
    assert result["event"]["kind"] == "session_advance_allocation"
    assert result["event"]["compensation_amount_kzt"] == 40
    assert result["plan"]["advance_balance_kzt"] == 400
    settings["hybrid_percentage_value"] = 30
    assert asyncio.run(modules.routes.mark_session_paid("plan", "catalog", "session-a", user, body)) == result
    with pytest.raises(HTTPException) as conflict:
        asyncio.run(modules.routes.mark_session_paid("plan", "catalog", "session-a", user, dict(body, amount_kzt=201)))
    assert conflict.value.status_code == 409
    with pytest.raises(HTTPException) as overpaid:
        asyncio.run(modules.routes.mark_session_paid("plan", "catalog", "session-a", user,
            dict(body, operation_id=str(uuid4()), amount_kzt=301)))
    assert overpaid.value.status_code == 422
    settled = asyncio.run(modules.routes.mark_session_paid("plan", "catalog", "session-a", user,
        dict(body, operation_id=str(uuid4()), amount_kzt=300)))
    assert settled["plan"]["services"][0]["sessions"][0]["paid"] is True
    assert settled["event"]["compensation_amount_kzt"] == 90
    assert settled["plan"]["paid_amount"] == 500
    now = datetime.now(timezone.utc)
    assert modules.ledger.ordinary_ledger_totals(saved, "doctor", now.replace(hour=0, minute=0, second=0, microsecond=0), now) == (500, 130, [])


def test_session_explicit_unsettled_amount_is_receipt_bound_not_payment_evidence(modules, monkeypatch):
    db, saved, settings = course_db()
    saved["services"][0]["sessions"][0]["amount_due_kzt"] = 100
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    body = dict(session_id="session-a", operation_id=str(uuid4()), amount_kzt=101,
                funding_source="cash", payment_method="card")
    service = modules.ledger.AccountingLedgerService(db)
    with pytest.raises(HTTPException) as error:
        asyncio.run(service.record_session("plan", "catalog", "session-a", body, "recorder"))
    assert error.value.status_code == 422
    db.treatment_plans.update_one.assert_not_awaited()
    result = asyncio.run(service.record_session("plan", "catalog", "session-a", dict(body, amount_kzt=100), "recorder"))
    assert result["plan"]["paid_amount"] == 100
    assert result["plan"]["services"][0]["sessions"][0]["amount_due_kzt"] == 0


def test_course_final_completion_projects_status_from_events(modules):
    db, saved, settings = course_db()
    service = modules.ledger.AccountingLedgerService(db)
    first = asyncio.run(service.complete_session("plan", "catalog",
        dict(session_id="session-a", operation_id=str(uuid4())), "recorder"))
    assert first["plan"]["execution_status"] == "in_progress"
    last = asyncio.run(service.complete_session("plan", "catalog",
        dict(session_id="session-b", operation_id=str(uuid4())), "recorder"))
    assert last["plan"]["execution_status"] == "completed"
    assert last["plan"]["completed_at"] == last["event"]["occurred_at"]
    assert last["plan"]["started_at"] == first["event"]["occurred_at"]


def component_db():
    db, saved, settings = memory_db()
    saved["deposit_balance"] = 0
    saved["services"][0].update(is_complex=True, components=[
        dict(service_id="component-catalog", component_id="component-a", price=500, quantity=2,
             occurrence_ids=["component-first", "component-second"]),
        dict(service_id="other-catalog", component_id="component-b", price=1000, quantity=1,
             occurrence_ids=["other-first"])])
    db.service_prices.find_one = AsyncMock(side_effect=lambda query: {"id": query["id"], "is_active": True})
    return db, saved, settings


def test_component_receipt_targets_stable_child_and_snapshots_component_tariff(modules, monkeypatch):
    db, saved, settings = component_db()
    settings.update(payment_mode="individual", services=[
        dict(service_id="component-catalog", commission_type="percentage", commission_value=30)])
    monkeypatch.setattr(modules.routes, "db", db)
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    body = dict(service_row_id="row", component_id="component-a", operation_id=str(uuid4()),
                amount=200, discount_amount=100, funding_source="cash",
                payment_method_id="card-id", payment_method_name="Terminal")
    result = asyncio.run(modules.routes.mark_complex_component_paid("plan", "catalog", "component-catalog",
        body, SimpleNamespace(id="recorder"), modules.plans.TreatmentPlanService(db)))
    assert result["event"]["kind"] == "component_receipt"
    assert result["event"]["component_id"] == "component-a"
    assert result["event"]["service_id"] == "component-catalog"
    assert result["event"]["compensation_snapshot"]["service_id"] == "component-catalog"
    assert result["event"]["compensation_amount_kzt"] == 60
    component = result["plan"]["services"][0]["components"][0]
    assert component["paid_amount"] == 200
    assert component["discount_amount"] == 100
    assert component["paid"] is False
    assert component["amount_due_kzt"] == 200
    assert not result["plan"]["services"][0]["components"][1].get("paid_amount")
    assert "$push" in db.treatment_plans.update_one.call_args.args[1]
    db.appointments.find.assert_not_called()


def test_component_frontend_catalog_target_retries_as_canonical_stable_identity(modules, monkeypatch):
    db, saved, settings = component_db()
    monkeypatch.setattr(modules.routes, "db", db)
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    user = SimpleNamespace(id="recorder")
    body = dict(operation_id=str(uuid4()), amount=200, discount_amount=100,
                funding_source="cash", payment_method_id="card", payment_method_name="Terminal")
    service = modules.plans.TreatmentPlanService(db)
    result = asyncio.run(modules.routes.mark_complex_component_paid("plan", "catalog", "component-catalog", body, user, service))
    settings["hybrid_percentage_value"] = 99
    replay = asyncio.run(modules.routes.mark_complex_component_paid("plan", "catalog", "component-a",
        dict(body, service_row_id="row", component_id="component-a"), user, service))
    assert replay == result
    assert replay["event"]["compensation_amount_kzt"] == 40
    with pytest.raises(HTTPException) as conflict:
        asyncio.run(modules.routes.mark_complex_component_paid("plan", "catalog", "component-catalog",
            dict(body, amount=201), user, service))
    assert conflict.value.status_code == 409
    assert db.treatment_plans.update_one.await_count == 1


def test_complex_create_generates_stable_component_occurrences_prospectively(modules):
    db, saved, settings = component_db()
    db.patients.find_one = AsyncMock(return_value={"id": "patient"})
    db.treatment_plans.insert_one = AsyncMock()
    db.service_prices.find_one = AsyncMock(side_effect=lambda query:
        dict(id=query["id"], price=500, service_name="Component", is_active=True))
    data = modules.plans.TreatmentPlanCreate(title="Complex", assigned_doctor_id="doctor", total_cost=1000,
        services=[dict(service_id="catalog", is_complex=True, total_price=1000, components=[
            dict(service_id="component-catalog", quantity=2)])])
    created = asyncio.run(modules.plans.TreatmentPlanService(db).create_treatment_plan("patient", data, "recorder", "Recorder"))
    component = created.services[0]["components"][0]
    assert component["component_id"]
    assert len(set(component["occurrence_ids"])) == 2
    original = deepcopy(created.services)
    modules.ledger.assign_ledger_identities(created.services)
    assert created.services == original
    assert db.treatment_plans.insert_one.call_args.args[0]["services"] == original


def test_component_occurrence_completion_pays_one_fixed_part(modules, monkeypatch):
    db, saved, settings = component_db()
    monkeypatch.setattr(modules.routes, "db", db)
    user = SimpleNamespace(id="recorder")
    result = asyncio.run(modules.routes.record_component_completion("plan", "row", "component-a",
        "component-first", dict(operation_id=str(uuid4())), user))
    assert result["event"]["kind"] == "component_completion"
    assert result["event"]["component_id"] == "component-a"
    assert result["event"]["occurrence_id"] == "component-first"
    assert result["event"]["amount_kzt"] == 0
    assert result["event"]["compensation_amount_kzt"] == 50
    component = result["plan"]["services"][0]["components"][0]
    assert component["quantity_completed"] == 1
    assert component["status"] == "in_progress"
    assert not component.get("paid")
    assert "$push" in db.treatment_plans.update_one.call_args.args[1]


def test_component_procedure_completion_retries_and_blocks_duplicate_occurrence(modules, monkeypatch):
    db, saved, settings = component_db()
    monkeypatch.setattr(modules.routes, "db", db)
    body = dict(service_row_id="row", component_id="component-a", occurrence_id="component-first",
                operation_id=str(uuid4()))
    user = SimpleNamespace(id="recorder")
    result = asyncio.run(modules.routes.mark_service_procedure_completed("plan", "catalog", user, body))
    settings["payment_value"] = 99
    replay = asyncio.run(modules.routes.record_component_completion("plan", "row", "component-a",
        "component-first", {"operation_id": body["operation_id"]}, user))
    assert replay == result
    assert replay["event"]["compensation_amount_kzt"] == 50
    with pytest.raises(HTTPException) as duplicate:
        asyncio.run(modules.routes.mark_service_procedure_completed("plan", "catalog", user,
            dict(body, operation_id=str(uuid4()))))
    assert duplicate.value.status_code == 409
    with pytest.raises(HTTPException) as conflict:
        asyncio.run(modules.routes.mark_service_procedure_completed("plan", "catalog", user,
            dict(body, occurrence_id="component-second")))
    assert conflict.value.status_code == 409
    assert db.treatment_plans.update_one.await_count == 1


def test_component_hybrid_payroll_splits_actual_receipt_and_fixed_occurrence(modules, monkeypatch):
    db, saved, settings = component_db()
    saved["services"][0]["components"] = saved["services"][0]["components"][:1]
    monkeypatch.setattr(modules.routes, "db", db)
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    user = SimpleNamespace(id="recorder")
    service = modules.ledger.AccountingLedgerService(db)
    receipt_result = asyncio.run(service.record_component_receipt("plan", "catalog", "component-a",
        dict(operation_id=str(uuid4()), amount=200, discount_amount=100, funding_source="cash", payment_method="card"), "recorder"))
    settings.update(payment_value=75, hybrid_percentage_value=99)
    completion = asyncio.run(modules.routes.record_component_completion("plan", "row", "component-a",
        "component-first", dict(operation_id=str(uuid4())), user))
    assert receipt_result["event"]["compensation_amount_kzt"] == 40
    assert completion["event"]["compensation_amount_kzt"] == 75
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    assert modules.ledger.ordinary_ledger_totals(saved, "doctor", start, now) == (200, 115, [])
    saved["accounting_events"][1]["occurrence_id"] = "unknown-occurrence"
    assert modules.ledger.ordinary_ledger_totals(saved, "doctor", start, now)[2][0]["code"] == "invalid_accounting_event"



def test_complex_execution_requires_every_stable_component_occurrence(modules, monkeypatch):
    db, saved, settings = component_db()
    monkeypatch.setattr(modules.routes, "db", db)
    user = SimpleNamespace(id="recorder")
    first = asyncio.run(modules.routes.record_component_completion("plan", "row", "component-a",
        "component-first", dict(operation_id=str(uuid4())), user))
    assert first["plan"]["execution_status"] == "in_progress"
    second = asyncio.run(modules.routes.record_component_completion("plan", "row", "component-a",
        "component-second", dict(operation_id=str(uuid4())), user))
    assert second["plan"]["execution_status"] == "in_progress"
    assert second["plan"]["services"][0]["components"][0]["status"] == "completed"
    last = asyncio.run(modules.routes.record_component_completion("plan", "row", "component-b",
        "other-first", dict(operation_id=str(uuid4())), user))
    assert last["plan"]["execution_status"] == "completed"
    assert last["plan"]["services"][0]["status"] == "completed"
    assert last["plan"]["started_at"] == first["event"]["occurred_at"]
    assert last["plan"]["completed_at"] == last["event"]["occurred_at"]
    assert sum(event["compensation_amount_kzt"] for event in saved["accounting_events"]) == 150


def test_component_explicit_advance_allocation_settles_only_selected_discounted_share(modules, monkeypatch):
    db, saved, settings = component_db()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    service = modules.ledger.AccountingLedgerService(db)
    asyncio.run(service.record_plan_advance("plan", dict(operation_id=str(uuid4()), amount=600,
        payment_purpose="plan_advance", payment_method="card"), "recorder"))
    body = dict(operation_id=str(uuid4()), amount=200, discount_amount=100, funding_source="plan_advance")
    first = asyncio.run(service.record_component_receipt("plan", "catalog", "component-catalog", body, "recorder"))
    assert first["event"]["kind"] == "component_advance_allocation"
    assert first["plan"]["advance_balance_kzt"] == 400
    assert first["event"]["compensation_amount_kzt"] == 40
    assert "payment_method" not in first["event"]
    assert asyncio.run(service.record_component_receipt("plan", "catalog", "component-a", body, "recorder")) == first
    with pytest.raises(HTTPException) as changed_discount:
        asyncio.run(service.record_component_receipt("plan", "catalog", "component-a",
            dict(body, operation_id=str(uuid4()), discount_amount=101), "recorder"))
    assert changed_discount.value.status_code == 409
    with pytest.raises(HTTPException) as overpayment:
        asyncio.run(service.record_component_receipt("plan", "catalog", "component-a",
            dict(body, operation_id=str(uuid4()), amount=201), "recorder"))
    assert overpayment.value.status_code == 422
    settled = asyncio.run(service.record_component_receipt("plan", "catalog", "component-a",
        dict(body, operation_id=str(uuid4())), "recorder"))
    assert settled["plan"]["services"][0]["components"][0]["paid"] is True
    assert settled["plan"]["services"][0]["components"][0]["paid_amount"] == 400
    assert settled["plan"]["advance_balance_kzt"] == 200
    assert settled["plan"]["paid_amount"] == 400
    assert not settled["plan"]["services"][0]["components"][1].get("paid")


def test_prospective_complex_cannot_use_legacy_payment_or_blind_remaining(modules, monkeypatch):
    db, saved, settings = component_db()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    service = modules.plans.TreatmentPlanService(db)
    with pytest.raises(HTTPException) as individual:
        asyncio.run(service.pay_complex_component("plan", "catalog", "component-catalog", {"amount": 200}))
    assert individual.value.status_code == 422
    with pytest.raises(HTTPException) as aggregate:
        asyncio.run(service.pay_complex_remaining("plan", "catalog", {"amount": 200, "operation_id": str(uuid4())}))
    assert aggregate.value.status_code == 422
    db.treatment_plans.update_one.assert_not_awaited()


def test_component_occurrence_identity_cannot_be_rewritten_before_first_event(modules):
    db, saved, settings = component_db()
    incoming = deepcopy(saved["services"])
    incoming[0]["components"][0]["occurrence_ids"][0] = "forged"
    with pytest.raises(HTTPException) as error:
        modules.ledger.preserve_ledger_identities(saved["services"], incoming)
    assert error.value.status_code == 409


def test_course_legacy_counter_is_not_evidence_for_new_session_receipt(modules):
    db, saved, settings = course_db()
    saved["services"][0]["quantity_completed"] = 1
    with pytest.raises(HTTPException) as error:
        asyncio.run(modules.ledger.AccountingLedgerService(db).record_session("plan", "catalog", "session-a",
            dict(session_id="session-a", operation_id=str(uuid4()), amount_kzt=100,
                 funding_source="cash", payment_method="card"), "recorder"))
    assert error.value.status_code == 409
    db.treatment_plans.update_one.assert_not_awaited()


def test_mixed_course_and_component_receipts_preserve_event_only_plan_total(modules, monkeypatch):
    db, saved, settings = component_db()
    course = course_db()[1]["services"][0]
    course.update(service_id="course-catalog", service_row_id="course-row")
    saved["services"].append(course)
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    service = modules.ledger.AccountingLedgerService(db)
    asyncio.run(service.record_component_receipt("plan", "catalog", "component-a",
        dict(operation_id=str(uuid4()), amount=200, discount_amount=0, funding_source="cash", payment_method="card"), "recorder"))
    result = asyncio.run(service.record_session("plan", "course-catalog", "session-a",
        dict(session_id="session-a", operation_id=str(uuid4()), amount_kzt=100,
             funding_source="cash", payment_method="card"), "recorder"))
    assert result["plan"]["paid_amount"] == 300
    assert [row["paid_amount"] for row in result["plan"]["services"]] == [200, 100]
    assert sum(event["amount_kzt"] for event in saved["accounting_events"]) == 300


def test_component_completion_does_not_require_a_receipt_price(modules, monkeypatch):
    db, saved, settings = component_db()
    for component in saved["services"][0]["components"]:
        component.pop("price")
    saved["services"][0].pop("total_price")
    monkeypatch.setattr(modules.routes, "db", db)
    result = asyncio.run(modules.routes.record_component_completion("plan", "row", "component-a",
        "component-first", dict(operation_id=str(uuid4())), SimpleNamespace(id="recorder")))
    assert result["event"]["amount_kzt"] == 0
    assert result["event"]["compensation_amount_kzt"] == 50


def test_payroll_does_not_hide_an_uncovered_complex_component(modules, monkeypatch):
    db, saved, settings = component_db()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    asyncio.run(modules.ledger.AccountingLedgerService(db).record_component_receipt("plan", "catalog", "component-a",
        dict(operation_id=str(uuid4()), amount=200, discount_amount=0, funding_source="cash", payment_method="card"), "recorder"))
    now = datetime.now(timezone.utc)
    revenue, salary, blockers = modules.ledger.ordinary_ledger_totals(saved, "doctor", now.replace(hour=0, minute=0, second=0, microsecond=0), now)
    assert (revenue, salary) == (200, 40)
    assert blockers == [dict(code="accounting_ledger_gap", plan_id="plan", service_row_id="row", component_id="component-b")]


def test_frontend_cash_receipt_preserves_method_and_returns_plan(modules, monkeypatch):
    db, saved, settings = memory_db()
    monkeypatch.setattr(modules.routes, "db", db)
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    body = dict(operation_id=str(uuid4()), service_row_id="row", amount=300,
                discount_amount=200, funding_source="cash", payment_method_id="card-id",
                payment_method_name="Card terminal")
    user = SimpleNamespace(id="recorder")
    result = asyncio.run(modules.routes.mark_service_paid("plan", "catalog", body, user))
    assert result["plan"]["services"][0]["paid_amount"] == 300
    assert result["plan"]["advance_balance_kzt"] == 0
    event = result["event"]
    assert event["payment_method_id"] == "card-id"
    assert event["payment_method_name"] == "Card terminal"
    assert event["payment_method"] == "card-id"
    assert event["compensation_amount_kzt"] == 60
    assert asyncio.run(modules.routes.mark_service_paid("plan", "catalog", body, user))["event"] == event
    assert len(saved["accounting_events"]) == 1


def test_frontend_completion_uses_atomic_occurrence_and_blocks_counter(modules, monkeypatch):
    db, saved, settings = memory_db()
    saved.update(title="Plan", created_by="recorder", created_by_name="Recorder")
    monkeypatch.setattr(modules.routes, "db", db)
    user = SimpleNamespace(id="recorder")
    with pytest.raises(HTTPException) as error:
        asyncio.run(modules.routes.mark_service_procedure_completed("plan", "catalog", user))
    assert error.value.status_code == 422
    db.treatment_plans.update_one.assert_not_awaited()
    body = dict(operation_id=str(uuid4()), occurrence_id="occurrence:plan%3Acatalog%3A0")
    result = asyncio.run(modules.routes.mark_service_procedure_completed(
        "plan", "catalog", user, body))
    assert result["plan"]["services"][0]["quantity_completed"] == 1
    assert result["event"]["occurrence_id"] == "first"
    assert result["event"]["compensation_amount_kzt"] == 50
    canonical = dict(operation_id=body["operation_id"], service_row_id="row", occurrence_id="first")
    replay = asyncio.run(modules.routes.record_service_completion("plan", "row", "first", canonical, user))
    assert replay["event"] == result["event"]
    assert len(saved["accounting_events"]) == 1


def test_frontend_deposit_is_atomic_unallocated_event_not_salary(modules, monkeypatch):
    db, saved, settings = memory_db()
    monkeypatch.setattr(modules.routes, "db", db)
    body = dict(operation_id=str(uuid4()), amount=500, payment_purpose="plan_advance",
                payment_method="card-id", payment_method_id="card-id",
                payment_method_name="Card terminal", note="Advance")
    user = SimpleNamespace(id="recorder")
    result = asyncio.run(modules.routes.add_deposit_to_plan("plan", body, user))
    assert result["plan"]["advance_balance_kzt"] == 500
    assert result["plan"]["paid_amount"] == 0
    assert result["plan"]["services"] == saved["services"]
    assert result["event"]["kind"] == "plan_advance"
    assert result["event"]["compensation_amount_kzt"] == 0
    assert result["event"]["payment_method_id"] == "card-id"
    assert "doctor_id" not in result["event"]
    assert asyncio.run(modules.routes.add_deposit_to_plan("plan", body, user)) == result
    assert db.treatment_plans.update_one.await_count == 1
    assert "$push" in db.treatment_plans.update_one.call_args.args[1]
    db.appointments.find.assert_not_called()
    db.doctors.find_one.assert_not_awaited()
    db.payment_logs.insert_one.assert_not_called()


def test_frontend_advance_allocation_snapshots_once_and_spends_events_only(modules, monkeypatch):
    db, saved, settings = memory_db()
    monkeypatch.setattr(modules.routes, "db", db)
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    user = SimpleNamespace(id="recorder")
    asyncio.run(modules.routes.add_deposit_to_plan("plan", dict(operation_id=str(uuid4()),
        amount=500, payment_purpose="plan_advance", payment_method="card"), user))
    body = dict(operation_id=str(uuid4()), amount=300, discount_amount=200, funding_source="plan_advance")
    result = asyncio.run(modules.routes.mark_service_paid("plan", "catalog", body, user))
    assert result["plan"]["advance_balance_kzt"] == 200
    assert result["plan"]["paid_amount"] == 300
    assert result["event"]["kind"] == "service_advance_allocation"
    assert result["event"]["service_row_id"] == "row"
    assert result["event"]["compensation_amount_kzt"] == 60
    assert "payment_method" not in result["event"]
    settings["hybrid_percentage_value"] = 99
    assert asyncio.run(modules.routes.mark_service_paid("plan", "catalog", body, user)) == result
    assert len(saved["accounting_events"]) == 2
    now = datetime.now(timezone.utc)
    assert modules.ledger.ordinary_ledger_totals(saved, "doctor", now.replace(hour=0, minute=0, second=0, microsecond=0), now) == (300, 60, [])
    with pytest.raises(HTTPException) as error:
        asyncio.run(modules.routes.mark_service_paid("plan", "catalog", dict(body, operation_id=str(uuid4()), amount=201), user))
    assert error.value.status_code == 409
    assert len(saved["accounting_events"]) == 2


def test_plan_reads_expose_event_balance_not_legacy_deposits(modules, monkeypatch):
    db, saved, settings = memory_db()
    saved.update(title="Plan", created_by="recorder", created_by_name="Recorder")
    service = modules.plans.TreatmentPlanService(db)
    service._get_patient_deposit_amount = AsyncMock(return_value=9999)
    db.patients.find_one = AsyncMock(return_value={"id": "patient"})
    assert asyncio.run(service.get_treatment_plan("plan"))["advance_balance_kzt"] == 0
    asyncio.run(modules.ledger.AccountingLedgerService(db).record_plan_advance("plan",
        dict(operation_id=str(uuid4()), amount=500, payment_purpose="plan_advance", payment_method="card"), "recorder"))
    saved["advance_balance_kzt"] = 9999
    assert asyncio.run(service.get_treatment_plan("plan"))["advance_balance_kzt"] == 500
    db.treatment_plans.find.return_value.sort.return_value.to_list = AsyncMock(return_value=[deepcopy(saved)])
    assert asyncio.run(service.get_patient_treatment_plans("patient"))[0]["advance_balance_kzt"] == 500


def test_canonical_receipt_returns_updated_plan_with_body_identity(modules, monkeypatch):
    db, saved, settings = memory_db()
    monkeypatch.setattr(modules.routes, "db", db)
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    body = dict(receipt(), service_row_id="row")
    result = asyncio.run(modules.routes.record_service_receipt("plan", "row", body, SimpleNamespace(id="recorder")))
    assert result["plan"]["services"][0]["paid_amount"] == 300
    assert result["plan"]["advance_balance_kzt"] == 0
    assert result["event"]["amount_kzt"] == 300


def test_completion_projects_execution_from_events_atomically(modules):
    db, saved, settings = memory_db()
    asyncio.run(command(modules, db, {"operation_id": str(uuid4())}, "service_completion", "first"))
    assert saved["services"][0]["status"] == "in_progress"
    assert saved["execution_status"] == "in_progress"
    assert saved["started_at"] == saved["accounting_events"][0]["occurred_at"]
    assert saved.get("completed_at") is None
    asyncio.run(command(modules, db, {"operation_id": str(uuid4())}, "service_completion", "second"))
    assert saved["services"][0]["status"] == "completed"
    assert saved["execution_status"] == "completed"
    assert saved["completed_at"] == saved["accounting_events"][1]["occurred_at"]
    assert db.treatment_plans.update_one.await_count == 2


@pytest.mark.parametrize("kind,value,percent,expected", [
    ("percentage", 25, 0, 75), ("fixed", 50, 0, 0), ("hybrid", 50, 20, 60),
])
def test_partial_discounted_receipt_snapshot_and_retry(modules, monkeypatch, kind, value, percent, expected):
    db, saved, settings = memory_db(kind, value, percent)
    sync = AsyncMock()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", sync)
    body = receipt()
    first = asyncio.run(command(modules, db, body))
    settings["payment_value"] = 99
    settings["hybrid_percentage_value"] = 99
    second = asyncio.run(command(modules, db, dict(body, amount_kzt=300.0)))
    assert second == first
    assert saved["paid_amount"] == 300
    assert saved["payment_status"] == "partially_paid"
    assert len(saved["accounting_events"]) == 1
    event = first["event"]
    assert event["amount_kzt"] == 300
    assert event["compensation_amount_kzt"] == expected
    assert event["doctor_id"] == "doctor"
    assert event["recorded_by"] == "recorder"
    assert event["currency"] == "KZT"
    assert event["occurred_at"].utcoffset().total_seconds() == 0
    assert event["recorded_at"] == event["occurred_at"]
    assert db.treatment_plans.update_one.await_count == 1
    assert "$push" in db.treatment_plans.update_one.call_args.args[1]
    assert sync.await_count == 1
    with pytest.raises(HTTPException) as error:
        asyncio.run(command(modules, db, dict(body, amount_kzt=301)))
    assert error.value.status_code == 409


@pytest.mark.parametrize("kind,value,percent,expected", [
    ("percentage", 25, 0, 0), ("fixed", 50, 0, 50), ("hybrid", 50, 20, 50),
])
def test_completion_stable_occurrence_not_payment(modules, kind, value, percent, expected):
    db, saved, settings = memory_db(kind, value, percent)
    body = {"operation_id": str(uuid4())}
    first = asyncio.run(command(modules, db, body, "service_completion", "first"))
    assert asyncio.run(command(modules, db, body, "service_completion", "first")) == first
    assert first["event"]["compensation_amount_kzt"] == expected
    assert first["event"]["amount_kzt"] == 0
    assert saved["services"][0]["quantity_completed"] == 1
    with pytest.raises(HTTPException) as error:
        asyncio.run(command(modules, db, {"operation_id": str(uuid4())}, "service_completion", "first"))
    assert error.value.status_code == 409


@pytest.mark.parametrize("changes", [
    {"operation_id": None}, {"operation_id": "bad"}, {"amount_kzt": -1},
    {"amount_kzt": True}, {"amount_kzt": float("nan")}, {"amount_kzt": 1.001},
    {"amount_kzt": 900}, {"payment_source": "plan_credit"}, {"currency": "USD"},
    {"occurred_at": "2020-01-01"}, {"doctor_id": "forged"},
])
def test_invalid_commands_never_write(modules, changes):
    db, saved, settings = memory_db()
    with pytest.raises(HTTPException):
        asyncio.run(command(modules, db, receipt(**changes)))
    db.treatment_plans.update_one.assert_not_awaited()


@pytest.mark.parametrize("changes", [
    {"service_row_id": None}, {"doctor_id": None, "is_complex": True},
    {"paid_amount": 10}, {"quantity_completed": 1}, {"is_course": True},
])
def test_missing_identity_or_legacy_evidence_fails_closed(modules, changes):
    db, saved, settings = memory_db()
    saved["services"][0].update(changes)
    with pytest.raises(HTTPException):
        asyncio.run(command(modules, db, receipt()))
    db.treatment_plans.update_one.assert_not_awaited()


def test_concurrent_receipts_and_completions_do_not_lose_updates(modules, monkeypatch):
    db, saved, settings = memory_db()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    original_read = db.treatment_plans.find_one.side_effect

    async def delayed_read(query):
        result = original_read(query)
        await asyncio.sleep(0)
        return result

    db.treatment_plans.find_one.side_effect = delayed_read

    async def concurrent():
        return await asyncio.gather(
            command(modules, db, receipt(amount_kzt=200)),
            command(modules, db, receipt(amount_kzt=200)),
            command(modules, db, {"operation_id": str(uuid4())}, "service_completion", "first"),
        )

    asyncio.run(concurrent())
    assert saved["paid_amount"] == 400
    assert saved["services"][0]["quantity_completed"] == 1
    assert len(saved["accounting_events"]) == 3
    assert db.treatment_plans.update_one.await_count > 3


def test_payroll_uses_snapshot_and_utc_period_only(modules, monkeypatch):
    db, saved, settings = memory_db()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    asyncio.run(command(modules, db, receipt()))
    asyncio.run(command(modules, db, {"operation_id": str(uuid4())}, "service_completion", "first"))
    saved["services"][0]["paid_amount"] = 999999
    settings["hybrid_percentage_value"] = 99
    today = datetime.now(timezone.utc)
    result = modules.ledger.ordinary_ledger_totals(saved, "doctor", today.replace(hour=0, minute=0, second=0, microsecond=0), today.replace(hour=23, minute=59, second=59, microsecond=999999))
    assert result == (300, 110, [])
    past = datetime(2000, 1, 1, tzinfo=timezone.utc)
    assert modules.ledger.ordinary_ledger_totals(saved, "doctor", past, past) == (0, 0, [])
    saved["accounting_events"][0]["compensation_amount_kzt"] = 999
    assert modules.ledger.ordinary_ledger_totals(saved, "doctor", past, today)[2]


def test_prospective_ids_and_generic_guards(modules):
    rows = [dict(service_id="same", quantity=2), dict(service_id="same", quantity=1)]
    modules.ledger.assign_ledger_identities(rows)
    original = deepcopy(rows)
    modules.ledger.assign_ledger_identities(rows)
    assert rows == original
    assert rows[0]["service_row_id"] != rows[1]["service_row_id"]
    assert len(set(rows[0]["occurrence_ids"])) == 2
    db, saved, settings = memory_db()
    saved["accounting_events"] = [{"event_id": "protected"}]
    update = modules.routes.TreatmentPlanUpdate(services=[])
    with pytest.raises(HTTPException) as error:
        asyncio.run(modules.plans.TreatmentPlanService(db).update_treatment_plan("plan", update))
    assert error.value.status_code == 409
    with pytest.raises(HTTPException):
        asyncio.run(modules.plans.TreatmentPlanService(db).delete_treatment_plan("plan"))
    db.treatment_plans.update_one.assert_not_awaited()
    db.treatment_plans.delete_one.assert_not_called()


def test_generic_models_cannot_forge_events(modules):
    with pytest.raises(ValueError):
        modules.routes.TreatmentPlanUpdate(accounting_events=[{"event_id": "forged"}])


def test_legacy_payment_route_rejects_event_owned_plan(modules, monkeypatch):
    db, saved, settings = memory_db()
    saved["accounting_events"] = [{"event_id": "protected"}]
    monkeypatch.setattr(modules.routes, "db", db)
    with pytest.raises(HTTPException) as error:
        asyncio.run(modules.routes.mark_service_paid("plan", "catalog", None, SimpleNamespace(id="recorder", full_name="Recorder")))
    assert error.value.status_code == 409
    db.treatment_plans.update_one.assert_not_awaited()


def test_new_route_to_payroll_ignores_current_tariff_and_catalog(modules, monkeypatch):
    db, saved, settings = memory_db()
    monkeypatch.setattr(modules.routes, "db", db)
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    user = SimpleNamespace(id="recorder")
    asyncio.run(modules.routes.record_service_receipt("plan", "row", receipt(), user))
    asyncio.run(modules.routes.record_service_completion("plan", "row", "first", {"operation_id": str(uuid4())}, user))
    settings.update(payment_type="fixed", payment_value=999, services=[], currency="USD")
    db.treatment_plans.find.return_value.to_list = AsyncMock(return_value=[deepcopy(saved)])
    salary_module = importlib.import_module("services.salary_service")
    service = salary_module.SalaryService(db)
    now = datetime.now(timezone.utc)
    result = asyncio.run(service._calculate_treatment_plans_salary(settings, "doctor", now.replace(hour=0, minute=0, second=0, microsecond=0), now.replace(hour=23, minute=59, second=59, microsecond=999999)))
    assert result == (300, 110)
    assert service.accounting_blockers == []


@pytest.mark.parametrize("writer", ["deposit", "session", "component", "remaining", "counter", "course", "persist", "sheet_update", "sheet_delete"])
def test_all_legacy_writers_reject_event_owned_plan(modules, monkeypatch, writer):
    db, saved, settings = memory_db()
    saved["accounting_events"] = [{"event_id": "protected"}]
    monkeypatch.setattr(modules.routes, "db", db)
    user = SimpleNamespace(id="recorder", full_name="Recorder")
    service = modules.plans.TreatmentPlanService(db)
    sheet_service = object.__new__(modules.sheets.ConsultationService)
    sheet_service.db = db
    sheet_service.collection = Mock()
    sheet_service.get_consultation_sheet = AsyncMock(return_value=SimpleNamespace(id="sheet"))

    async def write():
        if writer == "deposit":
            return await modules.routes.add_deposit_to_plan("plan", modules.routes.AddDepositPayment(amount=100), user)
        if writer == "session":
            return await modules.routes.mark_session_paid("plan", "catalog", 0, user)
        if writer == "component":
            return await service.pay_complex_component("plan", "catalog", "component")
        if writer == "remaining":
            return await service.pay_complex_remaining("plan", "catalog")
        if writer == "counter":
            return await modules.routes.mark_service_procedure_completed("plan", "catalog", user)
        if writer == "course":
            return await modules.routes.complete_course_session("plan", "catalog", {}, user)
        if writer == "persist":
            return await service.persist_payment_update({"id": "plan"}, {"services": []})
        if writer == "sheet_update":
            model = importlib.import_module("models.consultation").ConsultationSheetUpdate
            return await sheet_service.update_consultation_sheet("sheet", model(recommendations="changed"))
        return await sheet_service.delete_consultation_sheet("sheet")

    with pytest.raises(HTTPException) as error:
        asyncio.run(write())
    assert error.value.status_code == 409
    db.treatment_plans.update_one.assert_not_awaited()
    sheet_service.collection.update_one.assert_not_called()
    sheet_service.collection.delete_one.assert_not_called()


def test_multiple_receipts_only_accrue_actual_net_once(modules, monkeypatch):
    db, saved, settings = memory_db()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    asyncio.run(command(modules, db, receipt()))
    asyncio.run(command(modules, db, receipt(amount_kzt=500)))
    assert saved["paid_amount"] == 800
    assert saved["payment_status"] == "paid"
    assert sum(event["compensation_amount_kzt"] for event in saved["accounting_events"]) == 160
    with pytest.raises(HTTPException):
        asyncio.run(command(modules, db, receipt(amount_kzt=1)))
    assert len(saved["accounting_events"]) == 2


@pytest.mark.parametrize("commission_type,expected", [("percentage", 90), ("fixed", 0)])
def test_individual_receipt_tariff_is_snapshotted(modules, monkeypatch, commission_type, expected):
    db, saved, settings = memory_db()
    settings.update(payment_mode="individual", services=[dict(service_id="catalog", commission_type=commission_type, commission_value=30)])
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    result = asyncio.run(command(modules, db, receipt()))
    assert result["event"]["compensation_amount_kzt"] == expected
    assert result["event"]["compensation_snapshot"]["payment_mode"] == "individual"


def test_simultaneous_same_operation_returns_one_event(modules, monkeypatch):
    db, saved, settings = memory_db()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    original = db.treatment_plans.find_one.side_effect

    async def read(query):
        snapshot = original(query)
        await asyncio.sleep(0)
        return snapshot

    db.treatment_plans.find_one.side_effect = read
    body = receipt()

    async def write():
        return await asyncio.gather(command(modules, db, body), command(modules, db, body))

    results = asyncio.run(write())
    assert results[0] == results[1]
    assert len(saved["accounting_events"]) == 1
    assert saved["paid_amount"] == 300


def test_uncovered_rows_and_no_event_plans_block_payroll(modules, monkeypatch):
    db, saved, settings = memory_db()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    asyncio.run(command(modules, db, receipt()))
    saved["services"].append(dict(service_row_id="uncovered", service_id="other", paid_amount=20))
    now = datetime.now(timezone.utc)
    totals = modules.ledger.ordinary_ledger_totals(saved, "doctor", now.replace(hour=0, minute=0, second=0, microsecond=0), now.replace(hour=23, minute=59, second=59, microsecond=999999))
    assert totals[:2] == (300, 60)
    assert "accounting_ledger_gap" in {blocker["code"] for blocker in totals[2]}
    saved.pop("accounting_events")
    db.treatment_plans.find.return_value.to_list = AsyncMock(return_value=[deepcopy(saved)])
    salary = importlib.import_module("services.salary_service").SalaryService(db)
    asyncio.run(salary._calculate_treatment_plans_salary(settings, "doctor", now, now))
    assert "legacy_ledger_unavailable" in {blocker["code"] for blocker in salary.accounting_blockers}


def test_generic_put_cannot_replace_stable_ids_before_first_event(modules):
    db, saved, settings = memory_db()
    replacement = deepcopy(saved["services"])
    replacement[0]["service_row_id"] = "replacement"
    with pytest.raises(HTTPException) as error:
        asyncio.run(modules.plans.TreatmentPlanService(db).update_treatment_plan(
            "plan", modules.routes.TreatmentPlanUpdate(services=replacement)))
    assert error.value.status_code == 409
    db.treatment_plans.update_one.assert_not_awaited()


def test_first_ledger_command_rejects_unallocated_legacy_plan_balance(modules):
    db, saved, settings = memory_db()
    saved["paid_amount"] = 400
    with pytest.raises(HTTPException) as error:
        asyncio.run(command(modules, db, receipt()))
    assert error.value.status_code == 409
    db.treatment_plans.update_one.assert_not_awaited()


def test_existing_mark_paid_supports_explicit_ledger_command(modules, monkeypatch):
    db, saved, settings = memory_db()
    monkeypatch.setattr(modules.routes, "db", db)
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    body = dict(receipt(), service_row_id="row")
    user = SimpleNamespace(id="recorder", full_name="Recorder")
    first = asyncio.run(modules.routes.mark_service_paid("plan", "catalog", body, user))
    assert first["event"]["kind"] == "service_receipt"
    assert asyncio.run(modules.routes.mark_service_paid("plan", "catalog", body, user)) == first
    assert saved["paid_amount"] == 300


def test_prospective_mark_paid_requires_operation_uuid(modules, monkeypatch):
    db, saved, settings = memory_db()
    monkeypatch.setattr(modules.routes, "db", db)
    with pytest.raises(HTTPException) as error:
        asyncio.run(modules.routes.mark_service_paid("plan", "catalog", None, SimpleNamespace(id="recorder", full_name="Recorder")))
    assert error.value.status_code == 422
    db.treatment_plans.update_one.assert_not_awaited()


def test_bson_utc_retry_and_payroll_are_stable(modules, monkeypatch):
    db, saved, settings = memory_db()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    body = receipt()
    first = asyncio.run(command(modules, db, body))
    from bson import BSON
    saved["accounting_events"][0] = BSON(BSON.encode({"event": first["event"]})).decode()["event"]
    assert asyncio.run(command(modules, db, body)) == first
    now = datetime.now(timezone.utc)
    assert modules.ledger.ordinary_ledger_totals(saved, "doctor", now.replace(hour=0, minute=0, second=0, microsecond=0), now.replace(hour=23, minute=59, second=59, microsecond=999999)) == (300, 60, [])


def test_payroll_rejects_corrupted_request_hash(modules, monkeypatch):
    db, saved, settings = memory_db()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    asyncio.run(command(modules, db, receipt()))
    saved["accounting_events"][0]["request_hash"] = "corrupted"
    now = datetime.now(timezone.utc)
    result = modules.ledger.ordinary_ledger_totals(saved, "doctor", now.replace(hour=0, minute=0, second=0, microsecond=0), now)
    assert result[:2] == (0, 0)
    assert result[2][0]["code"] == "invalid_accounting_event"


def test_generic_nested_events_are_rejected(modules):
    with pytest.raises(ValueError):
        modules.routes.TreatmentPlanUpdate(services=[dict(service_id="catalog", accounting_events=[{}])])


def test_generic_writer_race_cannot_erase_new_events(modules):
    db, saved, settings = memory_db()
    original = db.treatment_plans.update_one.side_effect

    async def race(query, changes):
        saved["accounting_events"] = [{"event_id": "concurrently-appended"}]
        return await original(query, changes)

    db.treatment_plans.update_one.side_effect = race
    result = asyncio.run(modules.plans.TreatmentPlanService(db).persist_payment_update({"id": "plan"}, {"services": []}))
    assert result.matched_count == 0
    assert saved["services"]
    assert saved["accounting_events"] == [{"event_id": "concurrently-appended"}]


def test_completion_snapshots_new_rate_without_rewriting_receipt(modules, monkeypatch):
    db, saved, settings = memory_db()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    asyncio.run(command(modules, db, receipt()))
    settings.update(payment_value=75, hybrid_percentage_value=99)
    asyncio.run(command(modules, db, {"operation_id": str(uuid4())}, "service_completion", "first"))
    assert [event["compensation_amount_kzt"] for event in saved["accounting_events"]] == [60, 75]


@pytest.mark.parametrize("invalid", [None, "invalid", [{"doctor_id": "doctor", "compensation_snapshot": []}]])
def test_malformed_stored_events_block_reports_instead_of_crashing(modules, invalid):
    db, saved, settings = memory_db()
    saved["accounting_events"] = invalid
    now = datetime.now(timezone.utc)
    result = modules.ledger.ordinary_ledger_totals(saved, "doctor", now, now)
    assert result[:2] == (0, 0)
    assert result[2]


def test_create_receipts_completion_to_complete_salary_report(modules, monkeypatch):
    db, saved, settings = memory_db()
    settings.update(full_name="Doctor", consultation_compensation_mode="none")
    db.patients.find_one = AsyncMock(return_value={"id": "patient"})

    async def insert(document):
        saved.clear()
        saved.update(deepcopy(document))

    db.treatment_plans.insert_one = AsyncMock(side_effect=insert)
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    monkeypatch.setattr(modules.routes, "db", db)
    data = modules.plans.TreatmentPlanCreate(
        title="Prospective ledger plan", assigned_doctor_id="doctor", total_cost=1000,
        services=[dict(service_id="catalog", total_price=1000, quantity=2)])
    created = asyncio.run(modules.plans.TreatmentPlanService(db).create_treatment_plan(
        "patient", data, "recorder", "Recorder"))
    row = created.services[0]
    assert len(row["occurrence_ids"]) == 2
    assert saved["accounting_events"] == []
    user = SimpleNamespace(id="recorder", full_name="Recorder")
    asyncio.run(modules.routes.mark_service_paid(
        created.id, "catalog", dict(receipt(), service_row_id=row["service_row_id"]), user))
    asyncio.run(modules.routes.record_service_receipt(
        created.id, row["service_row_id"], receipt(amount_kzt=500), user))
    asyncio.run(modules.routes.record_service_completion(
        created.id, row["service_row_id"], row["occurrence_ids"][0], {"operation_id": str(uuid4())}, user))
    db.doctors.find.return_value.to_list = AsyncMock(return_value=[deepcopy(settings)])
    db.treatment_plans.find.return_value.to_list = AsyncMock(return_value=[deepcopy(saved)])
    db.appointments.find.return_value.to_list = AsyncMock(return_value=[])
    salary = importlib.import_module("services.salary_service").SalaryService(db)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    result = asyncio.run(salary.get_doctor_salary_report(today, today))
    assert result["compensation_complete"] is True
    assert result["salary_data"][0]["treatment_plans_revenue"] == 800
    assert result["salary_data"][0]["calculated_salary"] == 210
    assert len(saved["accounting_events"]) == 3
