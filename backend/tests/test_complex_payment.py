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