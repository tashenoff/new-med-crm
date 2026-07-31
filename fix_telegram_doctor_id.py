"""
Скрипт для исправления doctor_id в telegram_users
Заменяет ObjectId на правильный UUID из поля doctor.id
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv('backend/.env')

MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'medical_crm')


async def fix_doctor_ids():
    """Исправление doctor_id в telegram_users"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("\n" + "="*80)
    print("ИСПРАВЛЕНИЕ DOCTOR_ID В TELEGRAM_USERS")
    print("="*80)
    
    # Получаем всех telegram врачей
    telegram_doctors = await db.telegram_users.find({"role": "doctor"}).to_list(None)
    
    if not telegram_doctors:
        print("\n❌ Не найдено telegram пользователей с ролью 'doctor'")
        client.close()
        return
    
    for tg_user in telegram_doctors:
        current_doctor_id = tg_user.get('doctor_id')
        print(f"\n--- Обработка врача: {tg_user.get('first_name')} {tg_user.get('last_name')} ---")
        print(f"Текущий doctor_id: {current_doctor_id}")
        
        # Пытаемся найти врача по ObjectId или UUID
        doctor = None
        
        # Сначала пробуем как UUID (по полю id)
        doctor = await db.doctors.find_one({"id": current_doctor_id})
        
        if not doctor:
            # Пробуем как ObjectId (по полю _id)
            try:
                doctor = await db.doctors.find_one({"_id": ObjectId(current_doctor_id)})
            except:
                pass
        
        if not doctor:
            print(f"❌ Врач не найден в коллекции doctors!")
            continue
        
        # Получаем правильный UUID из поля id
        correct_doctor_id = doctor.get('id')
        
        if not correct_doctor_id:
            print(f"❌ У врача нет поля 'id' (UUID)!")
            continue
        
        if current_doctor_id == correct_doctor_id:
            print(f"✅ doctor_id уже корректный: {correct_doctor_id}")
            continue
        
        # Обновляем doctor_id
        print(f"🔄 Обновление doctor_id:")
        print(f"   Было: {current_doctor_id}")
        print(f"   Стало: {correct_doctor_id}")
        
        result = await db.telegram_users.update_one(
            {"_id": tg_user["_id"]},
            {"$set": {"doctor_id": correct_doctor_id}}
        )
        
        if result.modified_count > 0:
            print(f"✅ doctor_id успешно обновлен!")
            
            # Проверяем записи и расписание
            appointments_count = await db.appointments.count_documents({"doctor_id": correct_doctor_id})
            schedules_count = await db.doctor_schedules.count_documents({"doctor_id": correct_doctor_id})
            
            print(f"📊 Теперь доступно:")
            print(f"   Записей (appointments): {appointments_count}")
            print(f"   Расписаний (schedules): {schedules_count}")
        else:
            print(f"⚠️ Не удалось обновить doctor_id")
    
    print("\n" + "="*80)
    print("ИСПРАВЛЕНИЕ ЗАВЕРШЕНО")
    print("="*80 + "\n")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(fix_doctor_ids())
