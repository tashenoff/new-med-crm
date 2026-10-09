"""Run with --noconftest: no database module or Mongo client is used."""

import asyncio
import importlib
import socket
import sys
from copy import deepcopy
from datetime import datetime, timedelta
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest


@pytest.fixture
def modules(monkeypatch):
    import motor.motor_asyncio
    import pymongo

    def forbidden_client(*args, **kwargs):
        raise AssertionError("Mongo clients are forbidden in mock-only tests")

    monkeypatch.setattr(pymongo, "MongoClient", forbidden_client)
    monkeypatch.setattr(motor.motor_asyncio, "AsyncIOMotorClient", forbidden_client)
    monkeypatch.setattr(socket, "create_connection", forbidden_client)
    database = ModuleType("database")
    database.db = Mock()
    database.get_database = AsyncMock(return_value=database.db)
    monkeypatch.setitem(sys.modules, "database", database)
    crm_dependencies = ModuleType("crm.dependencies")
    crm_dependencies.get_database = database.get_database
    monkeypatch.setitem(sys.modules, "crm.dependencies", crm_dependencies)
    return SimpleNamespace(
        plans=importlib.import_module("services.treatment_plan_service"),
        routes=importlib.import_module("routers.treatment_plans"),
        appointments=importlib.import_module("routers.appointments"),
        leads=importlib.import_module("crm.services.lead_service"),
        integration=importlib.import_module("crm.services.integration_service"),
    )


def plan_document():
    return {
        "id": "plan", "patient_id": "patient", "title": "Analysis and services",
        "created_by": "user", "created_by_name": "User", "total_cost": 200,
        "paid_amount": 0, "payment_status": "unpaid", "deposit_balance": 0,
        "services": [
            {"service_id": "ordinary", "total_price": 100, "price_per_unit": 50,
             "payment_status": "unpaid", "is_course": True,
             "payment_type": "per_session", "quantity_total": 2,
             "sessions": [{"paid": False}, {"paid": False}]},
            {"service_id": "complex", "is_complex": True, "total_price": 100,
             "price_per_unit": 100, "quantity": 1, "payment_status": "unpaid",
             "components": [
                 {"service_id": "analysis", "price": 50, "quantity": 1},
                 {"service_id": "component", "price": 50, "quantity": 1},
             ]},
        ],
    }


def memory_db(document):
    saved = deepcopy(document)
    db = Mock()
    db.appointments.find.return_value.sort.return_value.to_list = AsyncMock(return_value=[])
    db.treatment_plans.find_one = AsyncMock(side_effect=lambda *args: deepcopy(saved))
    db.treatment_plans.find.return_value.to_list = AsyncMock(side_effect=lambda *args, **kwargs: [deepcopy(saved)])
    db.treatment_plans.find.return_value.sort.return_value.to_list = db.treatment_plans.find.return_value.to_list
    db.appointments.find.return_value.to_list = AsyncMock(return_value=[])
    db.appointments.find_one = AsyncMock(return_value=dict(id="appointment", patient_id="patient", deposit=50))
    db.appointments.update_one = AsyncMock(return_value=SimpleNamespace(matched_count=1))

    async def persist(query, update):
        saved.update(deepcopy(update["$set"]))
        return SimpleNamespace(matched_count=1, modified_count=1)

    db.treatment_plans.update_one = AsyncMock(side_effect=persist)
    db.payment_logs.insert_one = AsyncMock()
    return db, saved


@pytest.mark.parametrize("flow", ["service", "session", "component", "remaining", "plan", "deposit", "appointment"])
def test_payment_flows_share_post_persistence_hook(modules, monkeypatch, flow):
    document = plan_document()
    if flow in ("service", "plan", "appointment"):
        document["services"] = [{"service_id": "ordinary", "total_price": 100, "payment_status": "unpaid"}]
    db, saved = memory_db(document)
    monkeypatch.setattr(modules.routes, "db", db)
    observed = []

    async def sync(service, plan):
        assert db.treatment_plans.update_one.await_count == 1
        assert saved["payment_status"] == plan["payment_status"]
        observed.append(deepcopy(plan))

    monkeypatch.setattr(modules.plans.TreatmentPlanService, "_sync_with_crm", sync)
    user = SimpleNamespace(id="user", full_name="User")
    service = modules.plans.TreatmentPlanService(db)

    async def pay():
        if flow == "service":
            await modules.routes.mark_service_paid("plan", "ordinary", None, user)
        elif flow == "session":
            await modules.routes.mark_session_paid("plan", "ordinary", 0, user)
        elif flow == "component":
            await modules.routes.mark_complex_component_paid("plan", "complex", "analysis", None, user, service)
        elif flow == "remaining":
            await modules.routes.pay_complex_remaining("plan", "complex", None, user, service)
        elif flow == "plan":
            await service.update_treatment_plan("plan", modules.routes.TreatmentPlanUpdate(paid_amount=50, payment_status="partially_paid"))
        elif flow == "deposit":
            await modules.routes.add_deposit_to_plan("plan", SimpleNamespace(amount=50, payment_method="cash", note=""), user)
        else:
            await modules.appointments.apply_deposit_to_treatment_plans("patient", 50, "appointment", db)

    asyncio.run(pay())
    assert len(observed) == 1
    assert saved["payment_status"] != "paid"


@pytest.mark.parametrize("flow", ["service", "session", "component", "remaining", "plan"])
def test_failed_persistence_never_syncs(modules, monkeypatch, flow):
    document = plan_document()
    if flow == "plan":
        document["services"] = document["services"][:1]
    db, saved = memory_db(document)
    db.treatment_plans.update_one = AsyncMock(return_value=SimpleNamespace(matched_count=0))
    monkeypatch.setattr(modules.routes, "db", db)
    sync = AsyncMock()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "_sync_with_crm", sync)
    service = modules.plans.TreatmentPlanService(db)
    user = SimpleNamespace(id="user", full_name="User")

    async def pay():
        if flow == "service":
            await modules.routes.mark_service_paid("plan", "ordinary", None, user)
        elif flow == "session":
            await modules.routes.mark_session_paid("plan", "ordinary", 0, user)
        elif flow == "component":
            await service.pay_complex_component("plan", "complex", "analysis")
        elif flow == "remaining":
            await service.pay_complex_remaining("plan", "complex")
        else:
            await service.update_treatment_plan("plan", modules.routes.TreatmentPlanUpdate(paid_amount=50, payment_status="partially_paid"))

    with pytest.raises(modules.routes.HTTPException) as error:
        asyncio.run(pay())
    assert error.value.status_code == 409
    sync.assert_not_awaited()


@pytest.mark.parametrize("deal_failure", [False, True])
def test_shared_hook_preserves_deals_and_syncs_card_independently(modules, monkeypatch, deal_failure):
    db, saved = memory_db(plan_document())
    deals = AsyncMock(side_effect=RuntimeError("deal unavailable") if deal_failure else None)
    cards = AsyncMock()
    monkeypatch.setattr(modules.integration.IntegrationService, "sync_treatment_plan_payment", deals)
    monkeypatch.setattr(modules.leads.LeadService, "sync_lead_from_payment_status", cards)
    asyncio.run(modules.plans.TreatmentPlanService(db)._sync_with_crm(saved))
    deals.assert_awaited_once()
    cards.assert_awaited_once_with(patient_id="patient")


def lead_document(identifier, day=0, **fields):
    return {"id": identifier, "created_at": datetime(2026, 1, 1) + timedelta(days=day),
            "status": "converted", "phone": "+7 (701) 123-45-67", **fields}


@pytest.mark.parametrize("statuses", [[], ["unpaid"], ["partially_paid"], ["paid", "partially_paid"], ["paid", "unpaid"]])
def test_every_plan_must_be_paid_before_card_closes(modules, statuses):
    db = Mock()
    db.treatment_plans.find.return_value.to_list = AsyncMock(return_value=[{"payment_status": status} for status in statuses])
    db.crm_leads.update_one = AsyncMock(return_value=SimpleNamespace(modified_count=1))
    service = modules.leads.LeadService(db)
    asyncio.run(service.sync_lead_from_payment_status("patient"))
    db.crm_leads.update_one.assert_not_awaited()


@pytest.mark.parametrize("identity", ["patient_id", "converted_to_client_id", "crm_client"])
def test_paid_patient_targets_first_touch_shown_on_kanban(modules, identity):
    db = Mock()
    db.treatment_plans.find.return_value.to_list = AsyncMock(return_value=[{"payment_status": "paid", "paid_amount": 100}])
    link = "crm-client" if identity == "crm_client" else "patient"
    field = "converted_to_client_id" if identity == "crm_client" else identity
    first = lead_document("first", kanban_column_id="custom_pending")
    later = lead_document("later", 2, **{field: link})
    other = lead_document("other", -1, patient_id="other-patient", phone="77029998877")
    db.crm_clients.find_one = AsyncMock(return_value={"id": "crm-client", "hms_patient_id": "patient"} if identity == "crm_client" else None)
    db.crm_leads.find.return_value.to_list = AsyncMock(return_value=[later, other, first])
    db.crm_leads.find_one = AsyncMock(return_value=None)
    db.patients.find_one = AsyncMock(return_value=None)
    db.crm_leads.update_one = AsyncMock(return_value=SimpleNamespace(modified_count=1))
    service = modules.leads.LeadService(db)
    service.get_lead_by_id = AsyncMock(return_value=first)
    asyncio.run(service.sync_lead_from_payment_status("patient"))
    query, update = db.crm_leads.update_one.call_args.args
    assert query == {"id": "first"}
    assert update["$set"]["status"] == "closed"
    assert update["$unset"] == {"kanban_column_id": ""}
    db.crm_leads.find_one.assert_not_awaited()
    db.patients.find_one.assert_not_awaited()


@pytest.mark.parametrize("case", ["unlinked", "ambiguous_phone", "rejected", "qualified", "lost", "closed", "multiple_groups"])
def test_unsafe_or_terminal_card_is_not_closed(modules, case):
    db = Mock()
    db.treatment_plans.find.return_value.to_list = AsyncMock(return_value=[{"payment_status": "paid"}])
    first = lead_document("first")
    later = lead_document("later", 1, patient_id="patient")
    documents = [first, later]
    if case == "unlinked":
        documents = [first]
    elif case == "ambiguous_phone":
        documents.append(lead_document("other", -1, patient_id="other-patient"))
    elif case in ("rejected", "qualified", "lost", "closed"):
        first["status"] = case
    else:
        documents.append(lead_document("legacy", 2, converted_to_client_id="crm-client", phone="77029998877"))
    db.crm_clients.find_one = AsyncMock(return_value={"id": "crm-client"} if case == "multiple_groups" else None)
    db.crm_leads.find.return_value.to_list = AsyncMock(return_value=documents)
    db.crm_leads.find_one = AsyncMock(return_value=None)
    db.patients.find_one = AsyncMock(return_value={"phone": "7011234567"})
    db.crm_leads.update_one = AsyncMock(return_value=SimpleNamespace(modified_count=1))
    service = modules.leads.LeadService(db)
    service.get_lead_by_id = AsyncMock(return_value=first)
    asyncio.run(service.sync_lead_from_payment_status("patient"))
    if case == "ambiguous_phone":
        assert db.crm_leads.update_one.call_args.args[0] == {"id": "later"}
    else:
        db.crm_leads.update_one.assert_not_awaited()


@pytest.mark.parametrize("flow", ["service", "session", "component", "remaining", "plan"])
@pytest.mark.parametrize("partial", [False, True])
@pytest.mark.parametrize("other_status", [None, "paid", "unpaid"])
def test_payment_to_card_end_to_end(modules, monkeypatch, flow, partial, other_status):
    document = plan_document()
    if flow in ("service", "plan"):
        document["services"] = [{"service_id": "ordinary", "total_price": 100, "payment_status": "unpaid"}]
    elif flow == "session":
        document["services"] = document["services"][:1]
        document["services"][0]["sessions"][1]["paid"] = True
    else:
        document["services"] = document["services"][1:]
        if flow == "component":
            document["services"][0]["components"][1].update(paid=True, paid_amount=50)
    document["total_cost"] = 100
    if partial:
        document["services"].append({"service_id": "unpaid", "total_price": 100, "payment_status": "unpaid"})
        document["total_cost"] = 200
    db, saved = memory_db(document)
    other_plans = [] if other_status is None else [{"id": "other", "payment_status": other_status, "paid_amount": 100}]
    db.treatment_plans.find.return_value.to_list = AsyncMock(side_effect=lambda *args: [deepcopy(saved), *other_plans])
    first = lead_document("first", kanban_column_id="custom_pending")
    later = lead_document("later", 1, patient_id="patient")
    db.crm_leads.find.return_value.to_list = AsyncMock(return_value=[later, first])
    db.crm_leads.update_one = AsyncMock(return_value=SimpleNamespace(modified_count=1))
    db.crm_clients.find_one = AsyncMock(return_value=None)
    monkeypatch.setattr(modules.routes, "db", db)
    deals = AsyncMock()
    monkeypatch.setattr(modules.integration.IntegrationService, "sync_treatment_plan_payment", deals)
    monkeypatch.setattr(modules.leads.LeadService, "get_lead_by_id", AsyncMock(return_value=first))
    loyalty = importlib.import_module("services.loyalty_service")
    monkeypatch.setattr(loyalty.LoyaltyService, "process_payment", AsyncMock())
    user = SimpleNamespace(id="user", full_name="User")
    service = modules.plans.TreatmentPlanService(db)
    service.get_treatment_plan = AsyncMock(side_effect=lambda *args: deepcopy(saved))

    async def pay():
        if flow == "service":
            await modules.routes.mark_service_paid("plan", "ordinary", None, user)
        elif flow == "session":
            await modules.routes.mark_session_paid("plan", "ordinary", 0, user)
        elif flow == "component":
            await modules.routes.mark_complex_component_paid("plan", "complex", "analysis", None, user, service)
        elif flow == "remaining":
            await modules.routes.pay_complex_remaining("plan", "complex", None, user, service)
        else:
            update = modules.routes.TreatmentPlanUpdate(paid_amount=100, payment_status="partially_paid" if partial else "paid")
            await modules.routes.update_treatment_plan("plan", update, user, service)

    asyncio.run(pay())
    deals.assert_awaited_once()
    assert db.crm_leads.update_one.await_count == int(not partial and other_status != "unpaid")
    if db.crm_leads.update_one.await_count:
        query, update = db.crm_leads.update_one.call_args.args
        assert query == {"id": "first"}
        assert update["$set"]["status"] == "closed"
        assert update["$unset"] == {"kanban_column_id": ""}


@pytest.mark.parametrize("failure", ["read", "hook"])
def test_sync_failure_does_not_fail_persisted_payment(modules, monkeypatch, failure):
    db, saved = memory_db(plan_document())
    if failure == "read":
        db.treatment_plans.find_one.side_effect = RuntimeError("read unavailable")
    else:
        monkeypatch.setattr(modules.plans.TreatmentPlanService, "_sync_with_crm", AsyncMock(side_effect=RuntimeError("CRM unavailable")))
    result = asyncio.run(modules.plans.TreatmentPlanService(db).persist_payment_update({"id": "plan"}, {"paid_amount": 50}))
    assert result.matched_count == 1
    assert saved["paid_amount"] == 50


def test_complex_conflict_retries_and_syncs_only_successful_write(modules, monkeypatch):
    db, saved = memory_db(plan_document())
    persist = db.treatment_plans.update_one.side_effect

    async def conflict_then_persist(query, update):
        if db.treatment_plans.update_one.await_count == 1:
            return SimpleNamespace(matched_count=0)
        return await persist(query, update)

    db.treatment_plans.update_one.side_effect = conflict_then_persist
    sync = AsyncMock()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "_sync_with_crm", sync)
    asyncio.run(modules.plans.TreatmentPlanService(db).pay_complex_component("plan", "complex", "analysis"))
    assert db.treatment_plans.update_one.await_count == 2
    sync.assert_awaited_once()
    assert saved["paid_amount"] == 50


@pytest.mark.parametrize("flow", ["component", "remaining"])
def test_zero_receipt_discount_does_not_close_mixed_plan(modules, monkeypatch, flow):
    db, saved = memory_db(plan_document())
    db.crm_leads.update_one = AsyncMock()
    monkeypatch.setattr(modules.integration.IntegrationService, "sync_treatment_plan_payment", AsyncMock())
    service = modules.plans.TreatmentPlanService(db)
    if flow == "component":
        asyncio.run(service.pay_complex_component("plan", "complex", "analysis", {"amount": 0}))
    else:
        asyncio.run(service.pay_complex_remaining("plan", "complex", {"amount": 0}))
    assert saved["paid_amount"] == 0
    assert saved["payment_status"] == "unpaid"
    db.crm_leads.update_one.assert_not_awaited()


@pytest.mark.parametrize("payment_status,paid_amount", [("unpaid", 0), ("partially_paid", 50), ("paid", 100)])
def test_plan_creation_with_initial_payment_uses_shared_hook(modules, monkeypatch, payment_status, paid_amount):
    db, saved = memory_db(plan_document())
    db.patients.find_one = AsyncMock(return_value={"id": "patient"})

    async def insert(document):
        saved.clear()
        saved.update(deepcopy(document))

    db.treatment_plans.insert_one = AsyncMock(side_effect=insert)
    sync = AsyncMock()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "_sync_with_crm", sync)
    data = modules.plans.TreatmentPlanCreate(
        title="Initial payment", total_cost=100, payment_status=payment_status,
        paid_amount=paid_amount, services=[{"service_id": "analysis", "total_price": 100}])
    asyncio.run(modules.plans.TreatmentPlanService(db).create_treatment_plan("patient", data, "user", "User"))
    db.treatment_plans.insert_one.assert_awaited_once()
    assert sync.await_count == int(payment_status != "unpaid")
    if sync.await_count:
        assert sync.call_args.args[0]["paid_amount"] == paid_amount
