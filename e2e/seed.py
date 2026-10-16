"""Deterministic fixtures; reset ONLY the fixed DB on the isolated compose service."""
import json
from pathlib import Path
from datetime import datetime, timedelta
from safety import guard

guard()
from pymongo import MongoClient
from passlib.context import CryptContext
from models.auth import UserInDB
from models.doctor import Doctor
from models.services import ServicePrice
from models.payment import PaymentType

session = json.loads(Path('/run/secrets/session').read_text())
client = MongoClient('mongodb://mongo:27017', serverSelectionTimeoutMS=5000)
client.admin.command('ping')
client.drop_database('medcrm_browser_e2e')
db = client['medcrm_browser_e2e']
now = datetime.utcnow()
user = UserInDB(id='e2e-user', email='browser-e2e@example.com', full_name='E2E Disposable Admin',
                role='super_admin', hashed_password=CryptContext(schemes=['bcrypt']).hash(session['password']),
                password_expires_at=now + timedelta(minutes=30))
doctor = Doctor(id='e2e-doctor', full_name='E2E Fixed Doctor', specialty='E2E', specialties=['E2E'],
                payment_type='fixed', payment_value=1000, currency='KZT',
                payment_mode='general', consultation_compensation_mode='none', services=['e2e-service'])
service = ServicePrice(id='e2e-service', service_name='E2E Ordinary Service', service_type='regular',
                       price=3000, category='E2E', unit='услуга')
payment = PaymentType(id='e2e-internal', name='E2E Internal Cash', commission_rate=0,
                      description='Synthetic internal record; no payment gateway')
for collection, model in [('users', user), ('doctors', doctor), ('service_prices', service), ('payment_types', payment)]:
    db[collection].insert_one(model.model_dump())
assert db.notification_rules.count_documents({}) == 0
print('Seed OK: one expiring user, one fixed doctor, one ordinary 3000 KZT service; no patients/plans/rules')
client.close()
