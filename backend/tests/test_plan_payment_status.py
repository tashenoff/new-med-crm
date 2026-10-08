from datetime import datetime

import pytest


@pytest.mark.parametrize("flow", ["component", "remaining"])
@pytest.mark.parametrize("total_cost", [80, 100, 120])
async def test_zero_component_receipt_keeps_mixed_plan_unpaid(clean_db, flow, total_cost):
    from services.treatment_plan_service import TreatmentPlanService

    await clean_db.treatment_plans.insert_one({
        "id": "plan-status", "patient_id": "patient", "total_cost": total_cost,
        "paid_amount": 0, "payment_status": "unpaid", "payment_date": None,
        "deposit_balance": 0,
        "services": [
            {"service_id": "package", "is_complex": True, "price_per_unit": 100,
             "quantity": 1, "total_price": 100, "payment_status": "unpaid",
             "components": [{"service_id": "component", "price": 100, "quantity": 1}]},
            {"service_id": "regular", "total_price": 20, "payment_status": "unpaid"},
        ],
    })
    service = TreatmentPlanService(clean_db)
    if flow == "component":
        updated = await service.pay_complex_component(
            "plan-status", "package", "component", {"amount": 0})
    else:
        updated = await service.pay_complex_remaining(
            "plan-status", "package", {"amount": 0})

    package = updated["services"][0]
    assert package["components"][0]["paid"] is True
    assert package["components"][0]["paid_amount"] == 0
    assert package["components"][0]["discount_amount"] == 100
    assert package["discount_total"] == 100
    assert package["payment_status"] == "paid"
    assert updated["paid_amount"] == 0
    assert updated["payment_status"] == "unpaid"
    assert updated["payment_date"] is None
    saved = await clean_db.treatment_plans.find_one({"id": "plan-status"})
    assert saved["payment_status"] == "unpaid"
    assert saved["paid_amount"] == 0
    assert saved["payment_date"] is None


@pytest.mark.parametrize("flow", ["component", "remaining"])
@pytest.mark.parametrize("amount,regular_amount,total_cost,expected_status", [
    (70, 0, 80, "partially_paid"),
    (70, 0, 120, "partially_paid"),
    (100, 20, 120, "paid"),
    (80, 0, 80, "paid"),
])
async def test_mixed_plan_status_uses_received_amount(
        clean_db, flow, amount, regular_amount, total_cost, expected_status):
    from services.treatment_plan_service import TreatmentPlanService

    payment_date = datetime(2025, 1, 1)
    await clean_db.treatment_plans.insert_one({
        "id": "plan-status", "patient_id": "patient", "total_cost": total_cost,
        "paid_amount": 0, "payment_status": "paid", "payment_date": payment_date,
        "deposit_balance": 0,
        "services": [
            {"service_id": "package", "is_complex": True, "price_per_unit": 100,
             "quantity": 1, "total_price": 100, "payment_status": "unpaid",
             "components": [{"service_id": "component", "price": 100, "quantity": 1}]},
            {"service_id": "regular", "total_price": 20, "paid_amount": regular_amount,
             "payment_status": "paid" if regular_amount else "unpaid"},
        ],
    })
    service = TreatmentPlanService(clean_db)
    if flow == "component":
        updated = await service.pay_complex_component(
            "plan-status", "package", "component", {"amount": amount})
    else:
        updated = await service.pay_complex_remaining(
            "plan-status", "package", {"amount": amount})

    package = updated["services"][0]
    assert package["components"][0]["paid"] is True
    assert package["components"][0]["paid_amount"] == amount
    assert package["components"][0]["discount_amount"] == 100 - amount
    assert package["discount_total"] == 100 - amount
    assert package["payment_status"] == "paid"
    assert updated["paid_amount"] == amount + regular_amount
    assert updated["payment_status"] == expected_status
    assert updated["payment_date"] == (payment_date if expected_status == "paid" else None)
    saved = await clean_db.treatment_plans.find_one({"id": "plan-status"})
    assert saved["paid_amount"] == updated["paid_amount"]
    assert saved["payment_status"] == expected_status
    assert saved["payment_date"] == updated["payment_date"]
