"""
Скрипт для исправления doctor_id у существующего врача v@mail.ru
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')

MONGODB_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'medcrm')

async def fix_existing_doctor():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DB_NAME]
    
    print("\n" + "="*80)
    print("🔧 ИСПРАВЛЕНИЕ doctor_id ДЛЯ v@mail.ru")
    print("="*80 + "\n")
    
    doctor_email = "v@mail.ru"
    
    # 1. Находим врача 
    doctor = await db.doctors.find_one({"email": doctor_email})
    if not doctor:
        print(f"❌ Врач {doctor_email} не найден")
        client.close()
        return
    
    doctor_id = doctor.get('id', doctor.get('_id'))
    print(f"✅ Найден врач: {doctor.get('full_name')}")
    print(f"   ID: {doctor_id}")
    
    # 2. Обновляем пользователя
    result = await db.users.update_one(
        {"email": doctor_email},
        {"$set": {"doctor_id": str(doctor_id)}}
    )
    
    if result.modified_count > 0:
        print(f"\n✅ УСПЕШНО! Установлен doctor_id = {doctor_id}")
    else:
        print(f"\n⚠️ Запись не требует обновления (возможно уже исправлено)")
    
    # 3. Проверяем результат
    user = await db.users.find_one({"email": doctor_email})
    print(f"\n📋 Проверка:")
    print(f"   user.doctor_id = {user.get('doctor_id')}")
    
    # 4. Проверяем записи
    appointments = await db.appointments.find({"doctor_id": str(doctor_id)}).to_list(length=None)
    print(f"   Записей для этого врача: {len(appointments)}")
    
    print("\n" + "="*80)
    print("✅ ГОТОВО! Теперь врач увидит свои записи в календаре")
    print("="*80 + "\n")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(fix_existing_doctor())
