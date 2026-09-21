"""
Phase П — per-component payment of a complex: paying each service of the complex
separately accumulates the complex's paid total (sum of paid shares); the complex
is 'paid' when all shares are paid.
"""
from datetime import datetime


async def test_pay_complex_component_partial_then_full(clean_db):
    from services.service_price_service import ServicePriceService
    from services.treatment_plan_service import TreatmentPlanService

    a = await clean_db.service_prices.insert_one({"id": "svc-a", "service_name": "Консультация", "service_type": "regular", "price": 2000})
    b = await clean_db.service_prices.insert_one({"id": "svc-b", "service_name": "УЗИ", "service_type": "regular", "price": 3000})

    svc = ServicePriceService(clean_db)
    comp = await svc.create_service_price(
        ServicePriceCreatePayload(service_name="Чекап П", price=5000, service_type="complex",
                                  components=[{"service_id": "svc-a", "quantity": 1, "price": 2000},
                                              {"service_id": "svc-b", "quantity": 1, "price": 3000}])
    )
    line = await svc.build_complex_plan_line(comp.id, quantity=1)
    now = datetime.utcnow()
    await clean_db.treatment_plans.insert_one({
        "id": "plan-pay", "patient_id": "p", "title": "П", "services": [line],
        "total_cost": line["total_price"], "paid_amount": 0, "payment_status": "unpaid",
        "created_at": now, "updated_at": now,
    })

    tp = TreatmentPlanService(clean_db)

    # оплатить только консультацию (доля 2000)
    updated = await tp.pay_complex_component("plan-pay", comp.id, "svc-a")
    svc_row = next(s for s in updated["services"] if s.get("service_id") == comp.id)
    assert svc_row["payment_status"] == "partially_paid"
    assert round(svc_row.get("paid_amount", 0), 2) == 2000
    assert updated["payment_status"] == "partially_paid"
    assert updated["paid_amount"] == 2000

    # оплатить УЗИ (доля 3000) -> комплекс полностью оплачен
    updated2 = await tp.pay_complex_component("plan-pay", comp.id, "svc-b")
    svc_row2 = next(s for s in updated2["services"] if s.get("service_id") == comp.id)
    assert svc_row2["payment_status"] == "paid"
    assert round(svc_row2.get("paid_amount", 0), 2) == 5000
    assert updated2["payment_status"] == "paid"
    assert updated2["paid_amount"] == 5000


# helper to build ServicePriceCreate without circular import pain
from models.services import ServicePriceCreate as ServicePriceCreatePayload

async def test_pay_complex_remaining_marks_all_unpaid(clean_db):
    from services.service_price_service import ServicePriceService
    from services.treatment_plan_service import TreatmentPlanService

    a = await clean_db.service_prices.insert_one({"id": "svc-a", "service_name": "Консультация", "service_type": "regular", "price": 2000})
    b = await clean_db.service_prices.insert_one({"id": "svc-b", "service_name": "УЗИ", "service_type": "regular", "price": 3000})
    svc = ServicePriceService(clean_db)
    comp = await svc.create_service_price(
        ServicePriceCreatePayload(service_name="Чекап Р", price=5000, service_type="complex",
                                  components=[{"service_id": "svc-a", "quantity": 1, "price": 2000},
                                              {"service_id": "svc-b", "quantity": 1, "price": 3000}]))
    line = await svc.build_complex_plan_line(comp.id, quantity=1)
    now = datetime.utcnow()
    await clean_db.treatment_plans.insert_one({
        "id": "plan-rem", "patient_id": "p", "title": "Р", "services": [line],
        "total_cost": line["total_price"], "paid_amount": 0, "payment_status": "unpaid",
        "created_at": now, "updated_at": now,
    })
    tp = TreatmentPlanService(clean_db)
    updated = await tp.pay_complex_remaining("plan-rem", comp.id)
    svc_row = next(s for s in updated["services"] if s.get("service_id") == comp.id)
    assert all(c.get("paid") for c in svc_row["components"])
    assert round(svc_row.get("paid_amount", 0), 2) == 5000
    assert updated["payment_status"] == "paid"
    assert updated["paid_amount"] == 5000


async def test_pay_complex_component_with_discount_amount(clean_db):
    from services.service_price_service import ServicePriceService
    from services.treatment_plan_service import TreatmentPlanService

    a = await clean_db.service_prices.insert_one({"id": "svc-a", "service_name": "Консультация", "service_type": "regular", "price": 2000})
    b = await clean_db.service_prices.insert_one({"id": "svc-b", "service_name": "УЗИ", "service_type": "regular", "price": 3000})
    svc = ServicePriceService(clean_db)
    comp = await svc.create_service_price(
        ServicePriceCreatePayload(service_name="Чекап Д", price=5000, service_type="complex",
                                  components=[{"service_id": "svc-a", "quantity": 1, "price": 2000},
                                              {"service_id": "svc-b", "quantity": 1, "price": 3000}]))
    line = await svc.build_complex_plan_line(comp.id, quantity=1)
    now = datetime.utcnow()
    await clean_db.treatment_plans.insert_one({
        "id": "plan-disc", "patient_id": "p", "title": "Д", "services": [line],
        "total_cost": line["total_price"], "paid_amount": 0, "payment_status": "unpaid",
        "created_at": now, "updated_at": now,
    })
    tp = TreatmentPlanService(clean_db)
    # скидка при оплате: платим 1500 за долю в 2000
    updated = await tp.pay_complex_component("plan-disc", comp.id, "svc-a", payment_data={"amount": 1500})
    svc_row = next(s for s in updated["services"] if s.get("service_id") == comp.id)
    paid_comp = next(c for c in svc_row["components"] if c["service_id"] == "svc-a")
    assert paid_comp["paid_amount"] == 1500
    assert round(paid_comp.get("discount_amount", 0), 2) == 500
    assert round(svc_row.get("paid_amount", 0), 2) == 1500
    assert updated["paid_amount"] == 1500


async def test_pay_complex_remaining_with_even_discount(clean_db):
    from models.services import ServicePriceCreate
    from services.service_price_service import ServicePriceService
    from services.treatment_plan_service import TreatmentPlanService
    from datetime import datetime

    # seed: две услуги с ценами; комплекс = сумма этих цен (k=1), без хардкода
    a = await clean_db.service_prices.insert_one({"id": "sd-a", "service_name": "СУ А", "service_type": "regular", "price": 2000})
    b = await clean_db.service_prices.insert_one({"id": "sd-b", "service_name": "СУ Б", "service_type": "regular", "price": 3000})
    svc = ServicePriceService(clean_db)
    comp = await svc.create_service_price(
        ServicePriceCreate(service_name="Чекап СД", price=5000, service_type="complex",
                           components=[{"service_id": "sd-a", "quantity": 1, "price": 2000},
                                       {"service_id": "sd-b", "quantity": 1, "price": 3000}]))
    line = await svc.build_complex_plan_line(comp.id, quantity=1)
    now = datetime.utcnow()
    await clean_db.treatment_plans.insert_one({
        "id": "plan-sd", "patient_id": "p", "title": "СД", "services": [line],
        "total_cost": line["total_price"], "paid_amount": 0, "payment_status": "unpaid",
        "created_at": now, "updated_at": now,
    })
    tp = TreatmentPlanService(clean_db)
    # скидка в 1000 на остаток (сумма долей 5000 -> платим 4000), равномерно по 500
    updated = await tp.pay_complex_remaining("plan-sd", comp.id, payment_data={"amount": 4000})
    row = next(s for s in updated["services"] if s.get("service_id") == comp.id)
    by_id = {c["service_id"]: c for c in row["components"]}
    # доли 2000 и 3000, каждая минус 500 -> 1500 и 2500 (выведены из сид-цен, не хардкод)
    assert by_id["sd-a"]["paid_amount"] == 1500
    assert by_id["sd-b"]["paid_amount"] == 2500
    assert round(by_id["sd-a"]["discount_amount"], 2) == 500
    assert round(by_id["sd-b"]["discount_amount"], 2) == 500
    assert updated["paid_amount"] == 4000


async def test_complex_shares_rounded_whole_number(clean_db):
    from models.services import ServicePriceCreate
    from services.service_price_service import ServicePriceService
    from services.treatment_plan_service import TreatmentPlanService, _round_shares
    from datetime import datetime

    a = await clean_db.service_prices.insert_one({"id": "sa", "service_name": "УА", "service_type": "regular", "price": 5280})
    b = await clean_db.service_prices.insert_one({"id": "sb", "service_name": "УБ", "service_type": "regular", "price": 8000})
    svc = ServicePriceService(clean_db)
    comp = await svc.create_service_price(
        ServicePriceCreate(service_name="Пакет К", price=20000, service_type="complex",
                           components=[{"service_id": "sa", "quantity": 1, "price": 5280},
                                       {"service_id": "sb", "quantity": 1, "price": 8000}]))
    line = await svc.build_complex_plan_line(comp.id, quantity=1)
    now = datetime.utcnow()
    await clean_db.treatment_plans.insert_one({
        "id": "plan-round", "patient_id": "p", "title": "R", "services": [line],
        "total_cost": line["total_price"], "paid_amount": 0, "payment_status": "unpaid",
        "created_at": now, "updated_at": now,
    })
    tp = TreatmentPlanService(clean_db)
    # доли по формуле без хардкода
    k = 20000 / (5280 + 8000)
    rounded = _round_shares([5280 * k, 8000 * k])
    assert all(x == int(x) and x > 0 for x in rounded), rounded
    assert sum(rounded) == 20000
    # оплатить обе доли -> суммы целые и сходятся на цену пакета
    await tp.pay_complex_component("plan-round", comp.id, "sa")
    await tp.pay_complex_component("plan-round", comp.id, "sb")
    saved = await clean_db.treatment_plans.find_one({"id": "plan-round"})
    row = next(s for s in saved["services"] if s["service_id"] == comp.id)
    paid = [c["paid_amount"] for c in row["components"] if c["paid"]]
    assert all(x == int(x) and x > 0 for x in paid), paid
    assert sum(paid) == 20000
