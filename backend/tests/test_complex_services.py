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