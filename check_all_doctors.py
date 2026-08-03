"""
Проверка всех врачей и их ID
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv('backend/.env')
MONGO_URI = os.getenv('MONGO_URL')
DB_NAME = os.getenv('DB_NAME', 'medcrm')

async def check():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    
    print('=' * 70)
    print('ВСЕ врачи (включая неактивных):')
    print('=' * 70)
    all_docs = await db.doctors.find().to_list(100)
    for doc in all_docs:
        print(f"  ID: {doc.get('id')}")
        print(f"  _id: {doc.get('_id')}")
        print(f"  Имя: {doc.get('full_name')}")
        print(f"  active: {doc.get('is_active')}")
        print()
    
    print('=' * 70)
    print('Уникальные doctor_id из appointments:')
    print('=' * 70)
    unique_ids = await db.appointments.distinct('doctor_id')
    for did in unique_ids:
        print(f'  - {did}')
        # Проверим есть ли такой врач
        doc = await db.doctors.find_one({
            "$or": [
                {"id": did},
                {"_id": did}
            ]
        })
        if doc:
            print(f"    -> Найден врач: {doc.get('full_name')}")
        else:
            print(f"    -> ⚠️ ВРАЧ НЕ НАЙДЕН!")
        print()
        
    client.close()

asyncio.run(check())
