"""
Скрипт для исправления ID врача в расписании кабинета
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('backend/.env')

async def fix_doctor_id():
    MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017/clinic")
    DB_NAME = os.environ.get('DB_NAME', 'clinic')
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("🔎 Проверка врачей в базе:\n")
    
    # Показать всех активных врачей
    doctors = await db.doctors.find({"is_active": True}).to_list(100)
    print(f"Найдено врачей: {len(doctors)}\n")
    
    for doc in doctors:
        print(f"👨‍⚕️ {doc.get('last_name', '?')} {doc.get('first_name', '?')}")
        print(f"   Specialty: {doc.get('specialty', '?')}")
        print(f"   UUID (id): {doc.get('id')}")
        print(f"   MongoDB (_id): {doc.get('_id')}")
        print()
    
    # Найти проблемное расписание
    print("="*60)
    print("🔧 Поиск проблемного расписания...\n")
    
    schedule_id = "96ec563c-f0e5-4fb5-96a0-679ff0efb9e2"
    wrong_doctor_id = "6a5bad62b70f9663aed17062"
    
    schedule = await db.room_schedules.find_one({"id": schedule_id})
    
    if not schedule:
        print(f"❌ Расписание {schedule_id} не найдено!")
        client.close()
        return
    
    print(f"✅ Найдено расписание:")
    print(f"   ID: {schedule.get('id')}")
    print(f"   Кабинет: {schedule.get('room_id')}")
    print(f"   НЕПРАВИЛЬНЫЙ doctor_id: {schedule.get('doctor_id')}")
    print()
    
    # Найти правильного врача - сначала по _id как строка, потом проверяем все
    correct_doctor = None
    
    # Ищем врача, у которого _id совпадает с wrong_doctor_id
    all_doctors = await db.doctors.find({"is_active": True}).to_list(100)
    for doc in all_doctors:
        if str(doc.get('_id')) == wrong_doctor_id:
            correct_doctor = doc
            break
    
    if not correct_doctor:
        print(f"❌ Врач с _id={wrong_doctor_id} не найден!")
        print("   Доступные врачи (показаны выше)")
        client.close()
        return
    
    correct_id = correct_doctor.get('id')
    print(f"✅ Найден врач с MongoDB _id={wrong_doctor_id}:")
    print(f"   Имя: {correct_doctor.get('last_name')} {correct_doctor.get('first_name')}")
    print(f"   ПРАВИЛЬНЫЙ UUID (id): {correct_id}")
    print()
    
    # Исправить ID
    print("🔧 Исправляю doctor_id в расписании...")
    result = await db.room_schedules.update_one(
        {"id": schedule_id},
        {"$set": {"doctor_id": correct_id}}
    )
    
    if result.modified_count > 0:
        print(f"✅ УСПЕШНО! doctor_id обновлен с {wrong_doctor_id} на {correct_id}")
        print()
        print("🎉 Теперь слоты должны появиться в календаре!")
    else:
        print("❌ Не удалось обновить")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(fix_doctor_id())
