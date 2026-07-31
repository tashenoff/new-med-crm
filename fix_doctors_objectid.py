"""
Скрипт для исправления врачей с ObjectId в поле id
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")  
DATABASE_NAME = os.getenv("DATABASE_NAME", "medical_crm")

async def fix_doctors_with_objectid():
    """Исправляем врачей с ObjectId в поле id"""
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    
    print("Поиск врачей с ObjectId вместо строки в поле id...")
    
    # Находим всех врачей
    doctors_cursor = db.doctors.find({})
    fixed_count = 0
    
    async for doctor in doctors_cursor:
        # Проверяем, есть ли _id как ObjectId и нет строкового id
        if "_id" in doctor and isinstance(doctor.get("_id"), ObjectId):
            doctor_id_str = str(doctor["_id"])
            
            # Проверяем, нужно ли обновлять
            if "id" not in doctor or isinstance(doctor.get("id"), ObjectId):
                print(f"Исправление врача: {doctor.get('full_name', 'Unknown')} (ObjectId: {doctor['_id']})")
                
                # Обновляем документ - добавляем строковое поле id
                await db.doctors.update_one(
                    {"_id": doctor["_id"]},
                    {"$set": {"id": doctor_id_str}}
                )
                
                fixed_count += 1
                print(f"  ✓ Установлен id = '{doctor_id_str}'")
    
    print(f"\nВсего исправлено врачей: {fixed_count}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(fix_doctors_with_objectid())
