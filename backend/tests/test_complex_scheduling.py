"""
Phase C — scheduling a complex to its specialists.

- An appointment can carry the component service + complex it belongs to.
- complex_specialists_availability returns each component specialist with their
  schedule window for the chosen date and already-booked times, so the booking
  UI can show slots (or fall back to manual when no schedule exists).
"""
from datetime import date, timedelta


async def _next_monday() -> str:
    today = date.today()
    monday = today + timedelta(days=(0 - today.weekday()) % 7)
    return monday.isoformat()


async def test_appointment_persists_complex_linking(clean_db):
    from models.appointment import Appointment

    appt = Appointment(
        patient_id="pat-1",
        doctor_id="doc-1",
        appointment_date="2030-01-15",
        appointment_time="09:00",
        service_id="svc-a",
        complex_id="cpx-1",
        complex_name="Базовый чекап",
    )
    await clean_db.appointments.insert_one(appt.dict())

    saved = await clean_db.appointments.find_one({"id": appt.id})
    assert saved["service_id"] == "svc-a"
    assert saved["complex_id"] == "cpx-1"
    assert saved["complex_name"] == "Базовый чекап"


async def test_complex_specialists_availability_lists_schedule_and_booked(clean_db):
    from models.doctor import Doctor, DoctorSchedule
    from services.service_price_service import ServicePriceService

    a = await clean_db.service_prices.insert_one({"id": "svc-a", "service_name": "Консультация терапевта", "service_type": "regular", "price": 2000})
    b = await clean_db.service_prices.insert_one({"id": "svc-b", "service_name": "УЗИ", "service_type": "regular", "price": 3000})

    d1 = Doctor(full_name="Терапевт Один", services=["svc-a"])
    d2 = Doctor(full_name="УЗИст Два", services=["svc-b"])
    await clean_db.doctors.insert_many([d1.dict(), d2.dict()])

    # d1 has a schedule on Mondays, d2 has none
    await clean_db.doctor_schedules.insert_one(
        DoctorSchedule(doctor_id=d1.id, day_of_week=0, start_time="09:00", end_time="13:00").dict()
    )

    date_str = await _next_monday()
    # one booked appointment for d1 that day
    await clean_db.appointments.insert_one({
        "id": "appt-1", "patient_id": "p", "doctor_id": d1.id,
        "appointment_date": date_str, "appointment_time": "09:30", "status": "confirmed",
    })

    # build the complex with component doctor links
    from models.services import ServicePriceCreate
    svc = ServicePriceService(clean_db)
    comp = await svc.create_service_price(ServicePriceCreate(
        service_name="Чекап", category="Чекапы", price=5000, service_type="complex",
        components=[
            {"service_id": "svc-a", "quantity": 1, "doctor_id": d1.id, "price": 2000},
            {"service_id": "svc-b", "quantity": 1, "doctor_id": d2.id, "price": 3000},
        ],
    ))

    avail = await svc.complex_specialists_availability(comp.id, date_str)

    assert avail["complex_name"] == "Чекап"
    # врачи делают разные услуги -> нет общего врача на весь комплекс
    assert avail["common_doctors"] == []
    # новый контракт: врач выбирается в конс-листе — по каждой услуге список кандидатов
    by_svc = {s["service_id"]: s for s in avail["services"]}
    assert set(by_svc.keys()) == {"svc-a", "svc-b"}

    d1a = by_svc["svc-a"]["doctors"][0]
    assert d1a["doctor_id"] == d1.id
    assert d1a["doctor_name"] == "Терапевт Один"
    assert d1a["has_schedule"] is True
    assert d1a["schedule_start"] == "09:00"
    assert d1a["schedule_end"] == "13:00"
    assert d1a["booked"] == ["09:30"]
    assert d1a["working_days"] == ["Пн"]

    d2a = by_svc["svc-b"]["doctors"][0]
    assert d2a["doctor_id"] == d2.id
    assert d2a["has_schedule"] is False
    assert d2a["booked"] == []
    assert d2a["working_days"] == []

async def test_common_doctor_for_whole_complex(clean_db):
    from models.doctor import Doctor, DoctorSchedule
    from models.services import ServicePrice, ServicePriceCreate, ServiceComponent
    from services.service_price_service import ServicePriceService

    # seed: одна услуга, один общий врач (без хардкода — всё из сид-данных)
    a = ServicePrice(id="svc-1", service_name="Услуга А", price=1000)
    b = ServicePrice(id="svc-2", service_name="Услуга Б", price=2000)
    await clean_db.service_prices.insert_many([a.dict(), b.dict()])
    uni = Doctor(full_name="Универсал Один", services=["svc-1", "svc-2"])
    await clean_db.doctors.insert_one(uni.dict())
    cpx = ServicePriceCreate(service_name="Комплекс Два", price=3000, service_type="complex",
                             components=[
                                 ServiceComponent(service_id="svc-1", quantity=1),
                                 ServiceComponent(service_id="svc-2", quantity=1),
                             ])
    svc = ServicePriceService(clean_db)
    created = await svc.create_service_price(cpx)
    date_str = await _next_monday()
    # у врача есть расписание на этот день недели
    await clean_db.doctor_schedules.insert_one(
        DoctorSchedule(doctor_id=uni.id, day_of_week=date.fromisoformat(date_str).weekday(),
                       start_time="09:00", end_time="12:00").dict())
    avail = await svc.complex_specialists_availability(created.id, date_str)
    assert [d["doctor_id"] for d in avail["common_doctors"]] == [uni.id]
