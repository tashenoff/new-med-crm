"""Regression: creating a doctor WITHOUT a phone must not collide with other
phone-less doctors (duplicate-phone checks must only run for non-empty phones)."""


async def _seed_doctor(clean_db, full_name, phone=None):
    from models.doctor import Doctor

    doc = Doctor(full_name=full_name, phone=phone, services=[])
    await clean_db.doctors.insert_one(doc.dict())
    return doc


async def test_create_doctor_without_phone_allowed(clean_db):
    from models.doctor import DoctorCreate
    from services.doctor_service import DoctorService

    await _seed_doctor(clean_db, "Врач Без Номера", phone=None)

    svc = DoctorService(clean_db)
    created = await svc.create_doctor(DoctorCreate(full_name="Новая Без Номера", phone=None))
    assert created.full_name == "Новая Без Номера"
    assert created.phone is None


async def test_create_doctor_with_duplicate_phone_still_rejected(clean_db):
    from fastapi import HTTPException
    from models.doctor import DoctorCreate
    from services.doctor_service import DoctorService

    await _seed_doctor(clean_db, "Первый", phone="+77771112233")

    svc = DoctorService(clean_db)
    try:
        await svc.create_doctor(DoctorCreate(full_name="Второй", phone="+77771112233"))
        assert False, "должен был упасть на дубле телефона"
    except HTTPException as e:
        assert e.status_code == 400