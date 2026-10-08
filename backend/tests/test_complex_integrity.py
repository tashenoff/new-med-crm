from datetime import datetime
from types import SimpleNamespace
import asyncio
from copy import deepcopy

import pytest
from fastapi import HTTPException


async def seed_plan(db, components=None, quantity=1, regular=None):
    row = {"service_id": "package", "is_complex": True, "price_per_unit": 100,
           "quantity_total": quantity, "total_price": 100 * quantity,
           "payment_status": "unpaid", "components": components or [
               {"service_id": "a", "price": 40, "quantity": 1},
               {"service_id": "b", "price": 60, "quantity": 1}]}
    services = [row] + ([regular] if regular else [])
    await db.treatment_plans.insert_one({
        "id": "plan", "patient_id": "p", "title": "Plan", "created_by": "u",
        "created_by_name": "User", "services": services,
        "total_cost": sum(service["total_price"] for service in services),
        "paid_amount": 0, "payment_status": "unpaid"})
    return row


async def test_consultation_update_preserves_linked_complex_state(clean_db):
    from services.consultation_service import ConsultationService

    component = {"service_id": "a", "price": 100, "paid": True, "paid_amount": 80,
                 "discount_amount": 20, "status": "completed", "payment_method_id": "cash"}
    row = {"service_id": "package", "is_complex": True, "components": [component],
           "total_price": 100, "paid_amount": 80, "discount_amount": 20,
           "payment_status": "paid", "status": "completed"}
    for plan_id, link, title in [("unrelated", "other", "План лечения от 01.01.2025"),
                                 ("linked", "sheet", "Renamed plan")]:
        await clean_db.treatment_plans.insert_one({
            "id": plan_id, "patient_id": "p", "assigned_doctor_id": "d",
            "consultation_sheet_id": link, "title": title, "services": [row],
            "total_cost": 100, "paid_amount": 80, "payment_status": "paid"})
    consultation = SimpleNamespace(
        id="sheet", patient_id="p", doctor_id="d", doctor_name="Doctor",
        consultation_date=datetime(2025, 1, 1), recommendations="New notes",
        treatment_services=[SimpleNamespace(service_id="package", service_name="Package",
            quantity=1, price_per_unit=100, total_price=100, is_complex=True,
            components=[{"service_id": "a", "price": 100}])])
    service = ConsultationService.__new__(ConsultationService)
    service.db = clean_db
    await service._update_treatment_plan_from_consultation(consultation, "u", "User")
    linked = await clean_db.treatment_plans.find_one({"id": "linked"})
    unrelated = await clean_db.treatment_plans.find_one({"id": "unrelated"})
    assert linked.get("notes") == "New notes"
    assert linked["services"][0]["components"] == [component]
    assert linked["services"][0]["paid_amount"] == 80
    assert linked["services"][0]["discount_amount"] == 20
    assert unrelated["services"] == [row]
    assert unrelated.get("notes") is None


@pytest.mark.parametrize("flow", ["row", "session", "plan"])
async def test_ordinary_payment_rejects_complex_rows(clean_db, monkeypatch, flow):
    from routers import treatment_plans
    from models.treatment_plan import TreatmentPlanUpdate
    from services.treatment_plan_service import TreatmentPlanService

    row = await seed_plan(clean_db)
    row.update(is_course=True, payment_type="per_session", sessions=[{"paid": False}])
    await clean_db.treatment_plans.update_one({"id": "plan"}, {"$set": {"services": [row]}})
    monkeypatch.setattr(treatment_plans, "db", clean_db)
    user = SimpleNamespace(id="u", full_name="User")
    with pytest.raises(HTTPException) as error:
        if flow == "row":
            await treatment_plans.mark_service_paid("plan", "package", None, user)
        elif flow == "session":
            await treatment_plans.mark_session_paid("plan", "package", 0, user)
        else:
            await TreatmentPlanService(clean_db).update_treatment_plan(
                "plan", TreatmentPlanUpdate(payment_status="paid", paid_amount=100))
    assert error.value.status_code == 400
    saved = await clean_db.treatment_plans.find_one({"id": "plan"})
    assert saved["services"] == [row]
    assert saved["paid_amount"] == 0


@pytest.mark.parametrize("components", [[], [{"service_id": "a", "price": 0}],
    [{"service_id": "a"}], [{"service_id": "a", "price": 40}, {"service_id": "a", "price": 60}]])
@pytest.mark.parametrize("entry", ["catalog", "payment"])
async def test_invalid_composition_cannot_create_zero_share_package(clean_db, components, entry):
    from models.services import ServicePriceCreate
    from services.service_price_service import ServicePriceService
    from services.treatment_plan_service import TreatmentPlanService

    with pytest.raises(HTTPException) as error:
        if entry == "catalog":
            await clean_db.service_prices.insert_one({"id": "a", "service_name": "A", "price": 0})
            await ServicePriceService(clean_db).create_service_price(ServicePriceCreate(
                service_name="Package", price=100, service_type="complex", components=components))
        else:
            row = await seed_plan(clean_db)
            row["components"] = components
            await clean_db.treatment_plans.update_one({"id": "plan"}, {"$set": {"services": [row]}})
            await TreatmentPlanService(clean_db).pay_complex_remaining("plan", "package")
    assert error.value.status_code == 400
    if entry == "catalog":
        assert await clean_db.service_prices.count_documents({"service_type": "complex"}) == 0
    else:
        saved = await clean_db.treatment_plans.find_one({"id": "plan"})
        assert saved["services"] == [row]
        assert saved["paid_amount"] == 0


@pytest.mark.parametrize("last_payment", ["component", "regular", "session"])
async def test_mixed_plan_counts_receipts_and_discounts(clean_db, monkeypatch, last_payment):
    from routers import treatment_plans
    from services.treatment_plan_service import TreatmentPlanService

    regular = {"service_id": "regular", "total_price": 100, "payment_status": "paid",
               "paid_amount": 80, "discount_amount": 20}
    if last_payment != "component":
        regular["payment_status"] = "unpaid"
    if last_payment == "session":
        regular.update(is_course=True, payment_type="per_session", quantity_total=1,
                       price_per_unit=100, sessions=[{"paid": False, "paid_amount": 80,
                                                    "discount_amount": 20}])
    await seed_plan(clean_db, regular=regular)
    service = TreatmentPlanService(clean_db)
    await service.pay_complex_component("plan", "package", "a")
    if last_payment == "component":
        saved = await service.pay_complex_component("plan", "package", "b")
    else:
        monkeypatch.setattr(treatment_plans, "db", clean_db)
        user = SimpleNamespace(id="u", full_name="User")
        if last_payment == "regular":
            await treatment_plans.mark_service_paid("plan", "regular", {"amount": 80}, user)
        else:
            await treatment_plans.mark_session_paid("plan", "regular", 0, user)
        partial = await clean_db.treatment_plans.find_one({"id": "plan"})
        assert partial["paid_amount"] == 120
        assert partial["payment_status"] == "partially_paid"
        saved = await service.pay_complex_component("plan", "package", "b")
    assert saved["paid_amount"] == 180
    assert saved["payment_status"] == "partially_paid"
    assert saved["total_cost"] == 200


@pytest.mark.parametrize("amount", [90, 99.99, 0])
async def test_remaining_uneven_shares_record_exact_receipt(clean_db, amount):
    from services.treatment_plan_service import TreatmentPlanService

    await seed_plan(clean_db, components=[
        {"service_id": "a", "price": 1}, {"service_id": "b", "price": 49},
        {"service_id": "c", "price": 50}])
    saved = await TreatmentPlanService(clean_db).pay_complex_remaining(
        "plan", "package", {"amount": amount, "payment_method_id": "cash"})
    components = saved["services"][0]["components"]
    assert round(sum(component["paid_amount"] for component in components), 2) == amount
    assert round(sum(component["discount_amount"] for component in components), 2) == round(100 - amount, 2)
    assert saved["paid_amount"] == amount
    assert saved["payment_status"] == ("partially_paid" if amount else "unpaid")
    assert saved["total_cost"] == 100


@pytest.mark.parametrize("quantity_field", ["quantity", "quantity_total"])
async def test_multi_unit_complex_charges_all_units(clean_db, quantity_field):
    from services.treatment_plan_service import TreatmentPlanService

    row = await seed_plan(clean_db, quantity=3)
    row[quantity_field] = row.pop("quantity_total")
    await clean_db.treatment_plans.update_one({"id": "plan"}, {"$set": {"services": [row]}})
    saved = await TreatmentPlanService(clean_db).pay_complex_remaining("plan", "package")
    components = saved["services"][0]["components"]
    assert [component["paid_amount"] for component in components] == [120, 180]
    assert saved["paid_amount"] == 300
    assert saved["payment_status"] == "paid"


async def test_concurrent_component_payments_keep_both_receipts(clean_db):
    from services.treatment_plan_service import TreatmentPlanService

    await seed_plan(clean_db)

    class CoordinatedPlans:
        def __init__(self):
            self.reads = 0
            self.ready = asyncio.Event()

        async def find_one(self, query):
            snapshot = await clean_db.treatment_plans.find_one(query)
            self.reads += 1
            if self.reads <= 2:
                if self.reads == 2:
                    self.ready.set()
                await self.ready.wait()
            return snapshot

        async def update_one(self, query, update):
            return await clean_db.treatment_plans.update_one(query, update)

    service = TreatmentPlanService(SimpleNamespace(treatment_plans=CoordinatedPlans(),
                                                  appointments=clean_db.appointments))
    await asyncio.gather(service.pay_complex_component("plan", "package", "a"),
                         service.pay_complex_component("plan", "package", "b"))
    saved = await clean_db.treatment_plans.find_one({"id": "plan"})
    assert all(component.get("paid") for component in saved["services"][0]["components"])
    assert saved["paid_amount"] == 100
    assert saved["payment_status"] == "paid"


@pytest.mark.parametrize("entry", ["create", "update", "build"])
async def test_component_details_hydrated_from_catalog(clean_db, entry):
    from models.services import ServicePriceCreate, ServicePriceUpdate
    from services.service_price_service import ServicePriceService

    await clean_db.service_prices.insert_one({"id": "a", "service_name": "Canonical",
                                              "price": 100, "service_type": "regular"})
    service = ServicePriceService(clean_db)
    components = [{"service_id": "a", "price": 0, "service_name": "Forged", "quantity": 2}]
    if entry == "create":
        package = await service.create_service_price(ServicePriceCreate(
            service_name="Package", price=150, service_type="complex", components=components))
        details = package.components[0].dict()
    else:
        await clean_db.service_prices.insert_one({"id": "package", "service_name": "Package",
            "price": 150, "service_type": "complex", "components": components})
        if entry == "update":
            package = await service.update_service_price("package", ServicePriceUpdate(components=components))
            details = package.components[0].dict()
        else:
            line = await service.build_complex_plan_line("package")
            details = line["components"][0]
    assert details["price"] == 100
    assert details["service_name"] == "Canonical"
    assert details["quantity"] == 2


@pytest.mark.parametrize("balance", [None, 10, 0])
async def test_component_payment_consumes_deposit_by_receipt(clean_db, balance):
    from services.treatment_plan_service import TreatmentPlanService

    await seed_plan(clean_db)
    await clean_db.appointments.insert_one({"id": "deposit", "patient_id": "p", "deposit": 80})
    fields = {"extra_deposit": 20}
    if balance is not None:
        fields["deposit_balance"] = balance
    await clean_db.treatment_plans.update_one({"id": "plan"}, {"$set": fields})
    service = TreatmentPlanService(clean_db)
    await service.pay_complex_component("plan", "package", "a", {"amount": 30})
    saved = await service.pay_complex_component("plan", "package", "b")
    available = 100 if balance is None else balance
    assert saved["deposit_balance"] == max(0, available - 90)
    components = saved["services"][0]["components"]
    assert sum(component.get("paid_from_deposit", 0) for component in components) == min(available, 90)
    assert saved["services"][0]["paid_from_deposit"] == min(available, 90)
    assert saved["paid_amount"] == 90
    assert saved["payment_status"] == "partially_paid"


async def test_component_payment_retry_preserves_receipt_and_deposit(clean_db):
    from services.treatment_plan_service import TreatmentPlanService

    await seed_plan(clean_db)
    await clean_db.treatment_plans.update_one({"id": "plan"}, {"$set": {"deposit_balance": 100}})
    service = TreatmentPlanService(clean_db)
    await service.pay_complex_component("plan", "package", "a", {"amount": 30})
    first = await clean_db.treatment_plans.find_one({"id": "plan"}, {"_id": 0})
    retry = await service.pay_complex_component("plan", "package", "a", {"amount": 1})
    assert retry == first
    assert retry["deposit_balance"] == 70
    assert retry["paid_amount"] == 30


@pytest.mark.parametrize("entry", ["consultation_create", "consultation_update", "plan_create"])
async def test_new_plan_complex_components_use_catalog(clean_db, entry):
    from services.consultation_service import ConsultationService
    from services.treatment_plan_service import TreatmentPlanService
    from models.treatment_plan import TreatmentPlanCreate

    await clean_db.service_prices.insert_one({"id": "a", "service_name": "Canonical", "price": 100})
    row = {"service_id": "package", "service_name": "Package", "is_complex": True,
           "components": [{"service_id": "a", "price": 0}], "total_price": 100,
           "quantity": 1, "price_per_unit": 100}
    if entry == "plan_create":
        await clean_db.patients.insert_one({"id": "p"})
        await TreatmentPlanService(clean_db).create_treatment_plan(
            "p", TreatmentPlanCreate(title="Plan", services=[row], total_cost=100), "u", "User")
    else:
        consultation = SimpleNamespace(id="sheet", patient_id="p", doctor_id="d", doctor_name="Doctor",
            consultation_date=datetime(2025, 1, 1), recommendations="", treatment_services=[SimpleNamespace(**row)])
        service = ConsultationService.__new__(ConsultationService)
        service.db = clean_db
        method = service._create_treatment_plan_from_consultation if entry == "consultation_create" else service._update_treatment_plan_from_consultation
        await method(consultation, "u", "User")
    saved = await clean_db.treatment_plans.find_one({"patient_id": "p"})
    component = saved["services"][0]["components"][0]
    assert component["price"] == 100
    assert component["service_name"] == "Canonical"


async def test_component_percentage_discounts_settle_nominal_price(clean_db):
    from services.treatment_plan_service import TreatmentPlanService

    await seed_plan(clean_db, components=[{"service_id": "a", "price": 40, "discount": 25},
                                         {"service_id": "b", "price": 60, "discount": 50}])
    saved = await TreatmentPlanService(clean_db).pay_complex_remaining("plan", "package")
    row = saved["services"][0]
    assert [component["paid_amount"] for component in row["components"]] == [30, 30]
    assert row["discount_total"] == 40
    assert row["payment_status"] == "paid"
    assert saved["paid_amount"] == 60
    assert saved["payment_status"] == "partially_paid"


async def test_remaining_payment_cannot_persist_half_a_receipt(clean_db):
    from services.treatment_plan_service import TreatmentPlanService

    await seed_plan(clean_db)

    class FailingSecondWrite:
        def __init__(self):
            self.writes = 0

        async def find_one(self, query):
            return await clean_db.treatment_plans.find_one(query)

        async def update_one(self, query, update):
            self.writes += 1
            if self.writes == 2:
                raise HTTPException(status_code=409, detail="Injected write failure")
            return await clean_db.treatment_plans.update_one(query, update)

    service = TreatmentPlanService(SimpleNamespace(treatment_plans=FailingSecondWrite(),
                                                  appointments=clean_db.appointments))
    try:
        await service.pay_complex_remaining("plan", "package", {"amount": 90})
    except HTTPException:
        pass
    saved = await clean_db.treatment_plans.find_one({"id": "plan"})
    assert saved["paid_amount"] in (0, 90)
    assert sum(bool(component.get("paid")) for component in saved["services"][0]["components"]) in (0, 2)


@pytest.mark.parametrize("amount", [-1, True, "30", float("nan"), float("inf"), 1000])
@pytest.mark.parametrize("flow", ["component", "remaining"])
async def test_invalid_receipt_is_rejected_without_mutation(clean_db, amount, flow):
    from services.treatment_plan_service import TreatmentPlanService

    row = await seed_plan(clean_db)
    service = TreatmentPlanService(clean_db)
    with pytest.raises(HTTPException) as error:
        if flow == "component":
            await service.pay_complex_component("plan", "package", "a", {"amount": amount})
        else:
            await service.pay_complex_remaining("plan", "package", {"amount": amount})
    assert error.value.status_code == 400
    saved = await clean_db.treatment_plans.find_one({"id": "plan"})
    assert saved["services"] == [row]
    assert saved["paid_amount"] == 0


async def test_appointment_deposit_does_not_settle_complex_components(clean_db):
    from routers.appointments import apply_deposit_to_treatment_plans

    row = await seed_plan(clean_db)
    await apply_deposit_to_treatment_plans("p", 100, "appointment", clean_db)
    saved = await clean_db.treatment_plans.find_one({"id": "plan"})
    assert saved["payment_status"] == "unpaid"
    assert saved["paid_amount"] == 0
    assert saved["services"] == [row]
    assert saved["deposit_balance"] == 100


@pytest.mark.parametrize("change", ["parent", "component", "remove"])
async def test_generic_plan_edit_cannot_overwrite_complex_receipts(clean_db, change):
    from models.treatment_plan import TreatmentPlanUpdate
    from services.treatment_plan_service import TreatmentPlanService

    await seed_plan(clean_db)
    service = TreatmentPlanService(clean_db)
    await service.pay_complex_component("plan", "package", "a", {"amount": 30})
    before = await clean_db.treatment_plans.find_one({"id": "plan"})
    rows = deepcopy(before["services"])
    if change == "parent":
        rows[0]["payment_status"] = "paid"
        rows[0]["paid_amount"] = 100
    elif change == "component":
        rows[0]["components"][0]["paid_amount"] = 1
    else:
        rows = []
    with pytest.raises(HTTPException) as error:
        await service.update_treatment_plan("plan", TreatmentPlanUpdate(services=rows))
    assert error.value.status_code == 400
    assert await clean_db.treatment_plans.find_one({"id": "plan"}) == before


async def test_fractional_package_price_is_not_rounded_into_extra_receipts(clean_db):
    from services.treatment_plan_service import TreatmentPlanService

    row = await seed_plan(clean_db)
    row.update(price_per_unit=100.60, total_price=100.60)
    await clean_db.treatment_plans.update_one({"id": "plan"}, {"$set": {
        "services": [row], "total_cost": 100.60}})
    saved = await TreatmentPlanService(clean_db).pay_complex_remaining("plan", "package")
    assert saved["paid_amount"] == 100.60
    assert saved["services"][0]["discount_total"] == 0
    assert saved["payment_status"] == "paid"


@pytest.mark.parametrize("flow", ["consultation", "regular", "session"])
async def test_stale_plan_writer_cannot_erase_component_payment(clean_db, monkeypatch, flow):
    from routers import treatment_plans
    from services.consultation_service import ConsultationService
    from services.treatment_plan_service import TreatmentPlanService

    regular = {"service_id": "regular", "total_price": 20, "price_per_unit": 20,
               "quantity_total": 1, "is_course": True, "payment_type": "per_session",
               "sessions": [{"paid": False}], "payment_status": "unpaid"}
    row = await seed_plan(clean_db, regular=regular)
    await clean_db.treatment_plans.update_one({"id": "plan"}, {"$set": {"consultation_sheet_id": "sheet"}})

    class PaymentDuringWrite:
        async def find_one(self, query):
            return await clean_db.treatment_plans.find_one(query)

        async def update_one(self, query, update):
            await TreatmentPlanService(clean_db).pay_complex_component("plan", "package", "a", {"amount": 30})
            return await clean_db.treatment_plans.update_one(query, update)

    racing_db = SimpleNamespace(treatment_plans=PaymentDuringWrite(), appointments=clean_db.appointments,
                               service_prices=clean_db.service_prices)
    with pytest.raises(HTTPException) as error:
        if flow == "consultation":
            service = ConsultationService.__new__(ConsultationService)
            service.db = racing_db
            consultation = SimpleNamespace(id="sheet", patient_id="p", doctor_id="d", doctor_name="Doctor",
                consultation_date=datetime(2025, 1, 1), recommendations="", treatment_services=[SimpleNamespace(
                    service_id="package", service_name="Package", quantity=1, price_per_unit=100,
                    total_price=100, is_complex=True, components=row["components"])])
            await service._update_treatment_plan_from_consultation(consultation, "u", "User")
        else:
            monkeypatch.setattr(treatment_plans, "db", racing_db)
            user = SimpleNamespace(id="u", full_name="User")
            if flow == "regular":
                await treatment_plans.mark_service_paid("plan", "regular", None, user)
            else:
                await treatment_plans.mark_session_paid("plan", "regular", 0, user)
    assert error.value.status_code == 409
    saved = await clean_db.treatment_plans.find_one({"id": "plan"})
    assert saved["services"][0]["components"][0]["paid_amount"] == 30
    assert saved["paid_amount"] == 30


async def test_percentage_discount_cannot_overpay_tiny_rounded_share(clean_db):
    from services.treatment_plan_service import TreatmentPlanService

    row = await seed_plan(clean_db, components=[{"service_id": "a", "price": 149, "discount": 100},
        {"service_id": "b", "price": 149}, {"service_id": "c", "price": 2}])
    row.update(price_per_unit=3, total_price=3)
    await clean_db.treatment_plans.update_one({"id": "plan"}, {"$set": {"services": [row], "total_cost": 3}})
    saved = await TreatmentPlanService(clean_db).pay_complex_remaining("plan", "package")
    components = saved["services"][0]["components"]
    assert all(component["discount_amount"] >= 0 for component in components)
    assert saved["paid_amount"] == 1
    assert saved["services"][0]["discount_total"] == 2
    assert saved["payment_status"] == "partially_paid"


@pytest.mark.parametrize("entry", ["create", "edit"])
@pytest.mark.parametrize("paid", [False, True])
async def test_new_complex_row_cannot_bypass_catalog_or_payment_flow(clean_db, entry, paid):
    from models.treatment_plan import TreatmentPlanCreate, TreatmentPlanUpdate
    from services.treatment_plan_service import TreatmentPlanService

    existing = await seed_plan(clean_db)
    await clean_db.service_prices.insert_one({"id": "a", "service_name": "Canonical", "price": 100})
    await clean_db.patients.insert_one({"id": "p"})
    row = {"service_id": "new-package", "is_complex": True, "total_price": 100,
           "components": [{"service_id": "a", "price": 0, "paid": paid,
                           "paid_amount": 100 if paid else 0}]}
    service = TreatmentPlanService(clean_db)

    async def write():
        if entry == "create":
            return await service.create_treatment_plan("p", TreatmentPlanCreate(
                title="New", services=[row], total_cost=100), "u", "User")
        return await service.update_treatment_plan("plan", TreatmentPlanUpdate(services=[existing, row]))

    if paid:
        with pytest.raises(HTTPException) as error:
            await write()
        assert error.value.status_code == 400
    else:
        plan = await write()
        component = plan.services[-1]["components"][0]
        assert component["price"] == 100
        assert component["service_name"] == "Canonical"


@pytest.mark.parametrize("change", ["clear", "convert"])
async def test_catalog_edit_cannot_create_empty_complex(clean_db, change):
    from models.services import ServicePriceUpdate
    from services.service_price_service import ServicePriceService

    await clean_db.service_prices.insert_one({"id": "a", "service_name": "A", "price": 100})
    await clean_db.service_prices.insert_one({"id": "package", "service_name": "Package", "price": 100,
        "service_type": "complex" if change == "clear" else "regular",
        "components": [{"service_id": "a", "price": 100}] if change == "clear" else []})
    before = await clean_db.service_prices.find_one({"id": "package"})
    update = ServicePriceUpdate(components=[]) if change == "clear" else ServicePriceUpdate(service_type="complex")
    with pytest.raises(HTTPException) as error:
        await ServicePriceService(clean_db).update_service_price("package", update)
    assert error.value.status_code == 400
    assert await clean_db.service_prices.find_one({"id": "package"}) == before


@pytest.mark.parametrize("change", ["remove", "reprice"])
async def test_consultation_edit_keeps_paid_complex_financial_snapshot(clean_db, change):
    from services.consultation_service import ConsultationService
    from services.treatment_plan_service import TreatmentPlanService

    row = await seed_plan(clean_db)
    await clean_db.treatment_plans.update_one({"id": "plan"}, {"$set": {"consultation_sheet_id": "sheet"}})
    await TreatmentPlanService(clean_db).pay_complex_component("plan", "package", "a", {"amount": 30})
    before = await clean_db.treatment_plans.find_one({"id": "plan"})
    consultation = SimpleNamespace(id="sheet", patient_id="p", doctor_id="d", doctor_name="Doctor",
        consultation_date=datetime(2025, 1, 1), recommendations="", treatment_services=[] if change == "remove" else [
            SimpleNamespace(service_id="package", service_name="Package", quantity=2, price_per_unit=100,
                            total_price=200, is_complex=True, components=row["components"])])
    service = ConsultationService.__new__(ConsultationService)
    service.db = clean_db
    if change == "remove":
        with pytest.raises(HTTPException) as error:
            await service._update_treatment_plan_from_consultation(consultation, "u", "User")
        assert error.value.status_code == 400
    else:
        await service._update_treatment_plan_from_consultation(consultation, "u", "User")
    saved = await clean_db.treatment_plans.find_one({"id": "plan"})
    assert saved["services"][0]["components"] == before["services"][0]["components"]
    assert saved["services"][0]["total_price"] == before["services"][0]["total_price"]
    assert saved["total_cost"] == before["total_cost"]
    assert saved["paid_amount"] == 30
