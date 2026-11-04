"""Deterministic fixtures; reset ONLY the fixed DB on the isolated compose service."""
import asyncio
import json
from pathlib import Path
from datetime import datetime, timedelta
from safety import guard

guard()
from pymongo import MongoClient
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from models.auth import UserInDB
from models.doctor import Doctor, DoctorCreate, DoctorSchedule, DoctorScheduleCreate
from models.services import ServicePrice, ServicePriceCreate
from models.payment import PaymentType
from models.laboratory import Laboratory, LaboratoryCreate
from services.service_price_service import ServicePriceService

session = json.loads(Path('/run/secrets/session').read_text())
client = MongoClient('mongodb://mongo:27017', serverSelectionTimeoutMS=5000)
client.admin.command('ping')
client.drop_database('medcrm_browser_e2e')
db = client['medcrm_browser_e2e']
now = datetime.utcnow()
user = UserInDB(id='e2e-user', email='browser-e2e@example.com', full_name='E2E Disposable Admin',
                role='super_admin', hashed_password=CryptContext(schemes=['bcrypt']).hash(session['password']),
                password_expires_at=now + timedelta(minutes=30))
db.users.insert_one(user.model_dump())
for doctor_id, settings in [
    ('e2e-doctor', dict(full_name='E2E Fixed Doctor', payment_type='fixed', payment_value=1000,
                        services=['e2e-service', 'e2e-component-fixed'])),
    ('e2e-hybrid', dict(full_name='E2E Hybrid Doctor', payment_type='hybrid', payment_value=1000,
                        hybrid_percentage_value=10,
                        services=['e2e-service', 'e2e-component-hybrid'])),
]:
    # Run the production write-model validation, including hybrid compensation.
    specialty = 'E2E Fixed' if doctor_id == 'e2e-doctor' else 'E2E Hybrid'
    validated = DoctorCreate(**settings, specialty=specialty, specialties=[specialty], currency='KZT',
                             payment_mode='general', consultation_compensation_mode='none')
    db.doctors.insert_one(Doctor(id=doctor_id, **validated.model_dump()).model_dump())
    for day in range(7):
        schedule = DoctorScheduleCreate(doctor_id=doctor_id, day_of_week=day,
                                         start_time='09:00', end_time='18:00')
        db.doctor_schedules.insert_one(DoctorSchedule(id=f'{doctor_id}-day-{day}', **schedule.model_dump()).model_dump())
for service_id, name, price in [
    ('e2e-service', 'E2E Ordinary Service', 3000),
    ('e2e-component-fixed', 'E2E Fixed Component', 2000),
    ('e2e-component-hybrid', 'E2E Hybrid Component', 3000),
]:
    validated = ServicePriceCreate(service_name=name, service_type='regular', price=price, category='E2E', unit='услуга')
    db.service_prices.insert_one(ServicePrice(id=service_id, **validated.model_dump()).model_dump())

laboratory = LaboratoryCreate(name='E2E Synthetic Laboratory', description='Synthetic catalog only; no contacts or external integration')
db.laboratories.insert_one(Laboratory(id='e2e-laboratory', **laboratory.model_dump()).model_dump())
analysis = ServicePriceCreate(service_name='E2E Standalone Analysis', service_type='regular',
    price=2500, category=laboratory.name, unit='анализ',
    laboratory_id='e2e-laboratory', laboratory_name=laboratory.name)
db.service_prices.insert_one(ServicePrice(id='e2e-analysis', **analysis.model_dump()).model_dump())


async def seed_complex():
    async_client = AsyncIOMotorClient('mongodb://mongo:27017', serverSelectionTimeoutMS=5000)
    try:
        service = ServicePriceService(async_client['medcrm_browser_e2e'])
        validated = ServicePriceCreate(service_name='E2E Two Doctor Complex', service_type='complex',
            price=5000, category='E2E', unit='комплекс', components=[
                dict(service_id='e2e-component-fixed', quantity=1, price=2000),
                dict(service_id='e2e-component-hybrid', quantity=1, price=3000),
            ])
        # Same directory hydration/positive-price/link validation as production writes.
        payload = validated.model_dump()
        payload['components'] = await service._validate_components(validated.components)
        await async_client['medcrm_browser_e2e'].service_prices.insert_one(ServicePrice(id='e2e-complex', **payload).model_dump())
        availability = await service.complex_specialists_availability('e2e-complex', now.date().isoformat())
        assert [[d['doctor_id'] for d in row['doctors']] for row in availability['services']] == [['e2e-doctor'], ['e2e-hybrid']]
        assert all(d['has_schedule'] for row in availability['services'] for d in row['doctors'])
    finally:
        async_client.close()


asyncio.run(seed_complex())
payment = PaymentType(id='e2e-internal', name='E2E Internal Cash', commission_rate=0,
                      description='Synthetic internal record; no payment gateway')
db.payment_types.insert_one(payment.model_dump())
assert db.notification_rules.count_documents({}) == 0
print('Seed OK: expiring user, fixed/hybrid doctors, positive-price regular/complex/lab catalog, schedules; no patients/plans/rules')
client.close()
