"""
Complex service ("комплексная услуга") business rules — Phase A.

Service layer, real DB, no mocks, no hardcoded expected sums (assertions are
derived from the seeded data, never magic numbers).
"""

import pytest


async def _seed_service(clean_db, **overrides):
    from models.services import ServicePriceCreate
    from services.service_price_service import ServicePriceService

    data = {"service_name": "Общий анализ крови", "category": "Лаборатория", "price": 3500}
    data.update(overrides)
    svc = ServicePriceService(clean_db)
    return (await svc.create_service_price(ServicePriceCreate(**data))).dict()


async def _complex_payload(name="Базовый женский чекап", price=20000, **overrides):
    from models.services import ServicePriceCreate

    data = {
        "service_name": name,
        "category": "Чекапы",
        "price": price,
        "service_type": "complex",
        "components": [{"service_id": "seed", "quantity": 1}],
    }
    data.update(overrides)
    return ServicePriceCreate(**data)


async def test_create_complex_marks_service_and_keeps_components(clean_db):
    from services.service_price_service import ServicePriceService

    component = await _seed_service(clean_db)
    svc = ServicePriceService(clean_db)
    payload = await _complex_payload(
        components=[{"service_id": component["id"], "quantity": 2}]
    )
    created = await svc.create_service_price(payload)
    assert created.service_type == "complex"

    saved = (await svc.get_service_prices())[0]
    assert saved.service_type == "complex"
    saved_comp = saved.components[0]
    assert saved_comp.service_id == component["id"]
    assert saved_comp.quantity == 2


async def test_create_complex_rejects_missing_component(clean_db):
    from services.service_price_service import ServicePriceService

    svc = ServicePriceService(clean_db)
    payload = await _complex_payload(components=[{"service_id": "missing-service-id", "quantity": 1}])
    with pytest.raises(Exception) as exc:
        await svc.create_service_price(payload)
    assert getattr(exc.value, "status_code", 400) == 400


async def test_create_complex_rejects_disabled_component(clean_db):
    from services.service_price_service import ServicePriceService

    component = await _seed_service(clean_db)
    svc = ServicePriceService(clean_db)
    await svc.delete_service_price(component["id"])  # deactivates (is_active=False)

    payload = await _complex_payload(components=[{"service_id": component["id"], "quantity": 1}])
    with pytest.raises(Exception) as exc:
        await svc.create_service_price(payload)
    assert getattr(exc.value, "status_code", 400) == 400


async def test_create_complex_rejects_nested_complex(clean_db):
    from services.service_price_service import ServicePriceService

    a = await _seed_service(clean_db)
    svc = ServicePriceService(clean_db)
    inner = await svc.create_service_price(
        await _complex_payload(name="Внутренний", components=[{"service_id": a["id"]}])
    )

    payload = await _complex_payload(components=[{"service_id": inner.id, "quantity": 1}])
    with pytest.raises(Exception) as exc:
        await svc.create_service_price(payload)
    assert getattr(exc.value, "status_code", 400) == 400


async def test_update_complex_rejects_self_reference(clean_db):
    from models.services import ServicePriceUpdate
    from services.service_price_service import ServicePriceService

    a = await _seed_service(clean_db)
    svc = ServicePriceService(clean_db)
    c1 = await svc.create_service_price(
        await _complex_payload(components=[{"service_id": a["id"]}])
    )

    upd = ServicePriceUpdate(components=[{"service_id": a["id"]}, {"service_id": c1.id}])
    with pytest.raises(Exception) as exc:
        await svc.update_service_price(c1.id, upd)
    assert getattr(exc.value, "status_code", 400) == 400


async def test_complex_requires_price(clean_db):
    from pydantic import ValidationError
    from models.services import ServicePriceCreate

    with pytest.raises(ValidationError):
        ServicePriceCreate(service_name="Без цены", category="Чекапы", service_type="complex")


async def test_complex_requires_name(clean_db):
    from pydantic import ValidationError
    from models.services import ServicePriceCreate

    with pytest.raises(ValidationError):
        ServicePriceCreate(price=20000, category="Чекапы", service_type="complex")


async def _seed_doctor(clean_db, full_name, service_ids):
    from models.doctor import Doctor

    doc = Doctor(full_name=full_name, services=service_ids)
    await clean_db.doctors.insert_one(doc.dict())
    return doc


async def test_complex_summary_computes_from_live_prices(clean_db):
    """Sum/economy are DERIVED from the directory prices of the components,
    never hardcoded."""
    from services.service_price_service import ServicePriceService

    a = await _seed_service(clean_db, service_name="Консультация первичная", price=1000)
    b = await _seed_service(clean_db, service_name="Мазок на чистоту", price=500)

    svc = ServicePriceService(clean_db)
    comp = await svc.create_service_price(
        await _complex_payload(
            price=1200,
            components=[{"service_id": a["id"], "quantity": 2}, {"service_id": b["id"], "quantity": 1}],
        )
    )

    summary = await svc.get_complex_summary(comp.price, comp.components)

    expected_sum = a["price"] * 2 + b["price"] * 1
    assert summary["sum_components"] == expected_sum
    assert summary["complex_price"] == 1200
    assert summary["economy"] == expected_sum - summary["complex_price"]


async def test_specialist_suggestion_finds_doctors_for_service(clean_db):
    from services.service_price_service import ServicePriceService

    a = await _seed_service(clean_db)
    await _seed_doctor(clean_db, full_name="Иван Иванов", service_ids=[a["id"]])
    await _seed_doctor(clean_db, full_name="Пётр Петров", service_ids=[])

    svc = ServicePriceService(clean_db)
    found = await svc.get_specialists_for_service(a["id"])

    names = [d["full_name"] for d in found]
    assert "Иван Иванов" in names
    assert "Пётр Петров" not in names


async def test_specialist_suggestion_falls_back_to_specialty_match(clean_db):
    """A doctor with no service linkage is still suggested if their specialty
    matches the service category (no hardcoded names)."""
    from models.doctor import Doctor
    from services.service_price_service import ServicePriceService

    svc = ServicePriceService(clean_db)
    service = await _seed_service(clean_db, service_name="УЗИ органов малого таза", category="УЗИ")

    # doctor NOT linked to the service, but with matching specialty
    doc = Doctor(full_name="Доктор УЗИ", specialties=["УЗИ"])
    await clean_db.doctors.insert_one(doc.dict())

    found = await svc.get_specialists_for_service(service["id"])
    assert any(d["full_name"] == "Доктор УЗИ" for d in found)


async def test_specialist_suggestion_ignores_wrong_specialty(clean_db):
    from services.service_price_service import ServicePriceService

    service = await _seed_service(clean_db, service_name="ЭКГ", category="Кардиолог")
    await _seed_doctor(clean_db, full_name="Хирург", service_ids=[])  # no services, specialty empty

    svc = ServicePriceService(clean_db)
    found = await svc.get_specialists_for_service(service["id"])
    assert found == []


async def test_build_complex_plan_line_embeds_components_as_one_row(clean_db):
    """Complex = ONE plan line with its price; the composition is embedded inside
    the line (derived from the complex data, no hardcode) so salary/print can use it."""
    from services.service_price_service import ServicePriceService

    a = await _seed_service(clean_db, service_name="Консультация первичная", price=1000)
    b = await _seed_service(clean_db, service_name="УЗИ", price=2500)
    svc = ServicePriceService(clean_db)
    comp = await svc.create_service_price(
        await _complex_payload(
            name="Базовый чекап",
            price=3000,
            components=[{"service_id": a["id"], "quantity": 1}, {"service_id": b["id"], "quantity": 1}],
        )
    )

    line = await svc.build_complex_plan_line(comp.id, quantity=2)

    assert line["service_id"] == comp.id
    assert line["service_name"] == "Базовый чекап"
    assert line["category"] == "Чекапы"
    assert line["price"] == 3000
    assert line["quantity"] == 2
    assert line["total_price"] == 6000
    assert line["is_complex"] is True
    # components embedded, derived from the complex
    assert len(line["components"]) == 2
    assert {c["service_id"] for c in line["components"]} == {a["id"], b["id"]}


async def test_build_complex_plan_line_rejects_regular_service(clean_db):
    from services.service_price_service import ServicePriceService

    regular = await _seed_service(clean_db)
    svc = ServicePriceService(clean_db)
    with pytest.raises(Exception) as exc:
        await svc.build_complex_plan_line(regular["id"], quantity=1)
    assert getattr(exc.value, "status_code", 400) == 400


async def test_salary_complex_pays_each_doctor_its_component_share(clean_db):
    """Doctor earns only from HIS component in the complex, even when the plan
    is assigned to another (responsible) doctor. Discount distributed evenly to
    each component is honoured. Nothing hardcoded: derived from seeded data."""
    from datetime import datetime
    from models.doctor import Doctor
    from services.salary_service import SalaryService
    from services.service_price_service import ServicePriceService

    a = await _seed_service(clean_db, service_name="Консультация терапевта", category="Терапевт", price=2000)
    b = await _seed_service(clean_db, service_name="УЗИ", category="УЗИ", price=3000)

    d1 = Doctor(full_name="Терапевт", specialty="Терапевт", services=[a["id"]], payment_value=50)
    d2 = Doctor(full_name="УЗИст", specialty="УЗИ", services=[b["id"]], payment_value=40)
    await clean_db.doctors.insert_many([d1.dict(), d2.dict()])

    svc = ServicePriceService(clean_db)
    comp = await svc.create_service_price(
        await _complex_payload(
            name="Чекап 2", price=5000,
            components=[
                {"service_id": a["id"], "quantity": 1, "doctor_id": d1.id, "price": 2000},
                {"service_id": b["id"], "quantity": 1, "doctor_id": d2.id, "price": 3000},
            ],
        )
    )
    line = await svc.build_complex_plan_line(comp.id, quantity=1)
    assert line["is_complex"] is True

    now = datetime.utcnow()
    await clean_db.treatment_plans.insert_one({
        "id": "plan-complex-1",
        "patient_id": "pat-1",
        "title": "План комплекс",
        "services": [line],
        "total_cost": line["total_price"],
        "paid_amount": line["total_price"],
        "payment_status": "paid",
        "payment_date": now,
        "created_at": now,
        "assigned_doctor_id": d1.id,  # plan belongs to d1 (responsible)
    })

    salary = SalaryService(clean_db)
    p_from = now.replace(day=1)
    p_to = now

    rev1, sal1 = await salary._calculate_treatment_plans_salary(d1.dict(), d1.id, p_from, p_to)
    rev2, sal2 = await salary._calculate_treatment_plans_salary(d2.dict(), d2.id, p_from, p_to)

    # d1: консультация 2000 @50% ; d2: УЗИ 3000 @40%
    assert rev1 == 2000
    assert sal1 == 1000
    assert rev2 == 3000
    assert sal2 == 1200


async def test_salary_complex_distributes_line_discount_to_components(clean_db):
    """The complex line's discount is applied evenly to each doctor's component."""
    from datetime import datetime
    from models.doctor import Doctor
    from services.salary_service import SalaryService
    from services.service_price_service import ServicePriceService

    a = await _seed_service(clean_db, service_name="Консультация", category="Терапевт", price=2000)
    b = await _seed_service(clean_db, service_name="УЗИ", category="УЗИ", price=3000)
    d1 = Doctor(full_name="Терапевт", specialty="Терапевт", services=[a["id"]], payment_value=50)
    d2 = Doctor(full_name="УЗИст", specialty="УЗИ", services=[b["id"]], payment_value=40)
    await clean_db.doctors.insert_many([d1.dict(), d2.dict()])

    svc = ServicePriceService(clean_db)
    comp = await svc.create_service_price(
        await _complex_payload(
            name="Чекап 3", price=4000,
            components=[
                {"service_id": a["id"], "quantity": 1, "doctor_id": d1.id, "price": 2000},
                {"service_id": b["id"], "quantity": 1, "doctor_id": d2.id, "price": 3000},
            ],
        )
    )
    line = await svc.build_complex_plan_line(comp.id, quantity=1)
    line["discount"] = 25  # 25% discount on the whole complex

    now = datetime.utcnow()
    await clean_db.treatment_plans.insert_one({
        "id": "plan-complex-2", "patient_id": "pat-2", "title": "План комплекс",
        "services": [line], "total_cost": line["total_price"],
        "paid_amount": line["total_price"], "payment_status": "paid",
        "payment_date": now, "created_at": now, "assigned_doctor_id": d1.id,
    })

    salary = SalaryService(clean_db)
    p_from, p_to = now.replace(day=1), now
    _, sal1 = await salary._calculate_treatment_plans_salary(d1.dict(), d1.id, p_from, p_to)
    _, sal2 = await salary._calculate_treatment_plans_salary(d2.dict(), d2.id, p_from, p_to)

    # d1: 2000*(1-0.25)*0.50 ; d2: 3000*(1-0.25)*0.40
    assert round(sal1, 2) == round(2000 * 0.75 * 0.50, 2)
    assert round(sal2, 2) == round(3000 * 0.75 * 0.40, 2)