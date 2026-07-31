import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check_patient():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client['medical_crm']
    
    # Получаем первого пациента
    patient = await db.patients.find_one()
    
    print("=== ПЕРВЫЙ ПАЦИЕНТ В БАЗЕ ===")
    print(f"Поля: {list(patient.keys())}")
    print(f"_id: {patient.get('_id')}")
    print(f"id: {patient.get('id')}")
    print(f"full_name: {patient.get('full_name')}")
    
    # Пробуем найти по id
    patient_by_id = await db.patients.find_one({"id": "95f66a3b-3845-4f3b-a119-d3db04c779cd"})
    print(f"\nПоиск по id='95f66a3b...': {patient_by_id is not None}")
    
    # Пробуем найти по _id  
    patient_by_underscore_id = await db.patients.find_one({"_id": "95f66a3b-3845-4f3b-a119-d3db04c779cd"})
    print(f"Поиск по _id='95f66a3b...': {patient_by_underscore_id is not None}")
    
    client.close()

asyncio.run(check_patient())
