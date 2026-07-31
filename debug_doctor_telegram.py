"""
Скрипт для диагностики проблемы с командами /appointments и /schedule в телеграм боте
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


async def diagnose_doctor_data():
    """Диагностика данных врача в БД"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("\n" + "="*80)
    print("ДИАГНОСТИКА ДАННЫХ ВРАЧА В ТЕЛЕГРАМ БОТЕ")
    print("="*80)
    
    # 1. Получаем всех telegram пользователей с ролью врача
    print("\n1. TELEGRAM ПОЛЬЗОВАТЕЛИ С РОЛЬЮ 'doctor':")
    print("-" * 80)
    
    telegram_doctors = []
    async for user in db.telegram_users.find({"role": "doctor"}):
        telegram_doctors.append(user)
        print(f"\nTelegram ID: {user.get('telegram_id')}")
        print(f"Имя: {user.get('first_name')} {user.get('last_name')}")
        print(f"Телефон: {user.get('phone_number')}")
        print(f"Doctor ID: {user.get('doctor_id')}")
        print(f"Type(doctor_id): {type(user.get('doctor_id'))}")
    
    if not telegram_doctors:
        print("❌ НЕ НАЙДЕНО telegram пользователей с ролью 'doctor'")
        return
    
    # 2. Проверяем врачей в коллекции doctors
    print("\n\n2. ВРАЧИ В КОЛЛЕКЦИИ 'doctors':")
    print("-" * 80)
    
    async for doctor in db.doctors.find({}):
        print(f"\nDoctor _id (ObjectId): {doctor.get('_id')}")
        print(f"Doctor id (UUID): {doctor.get('id')}")
        print(f"Имя: {doctor.get('full_name')}")
        print(f"Телефон: {doctor.get('phone')}")
        print(f"Type(id): {type(doctor.get('id'))}")
    
    # 3. Проверяем записи в appointments
    print("\n\n3. ЗАПИСИ В КОЛЛЕКЦИИ 'appointments':")
    print("-" * 80)
    
    # Получаем все уникальные doctor_id из appointments
    all_doctor_ids = await db.appointments.distinct("doctor_id")
    print(f"\nВсего уникальных doctor_id в appointments: {len(all_doctor_ids)}")
    
    for doctor_id in all_doctor_ids[:5]:  # Показываем первые 5
        print(f"  - {doctor_id} (type: {type(doctor_id).__name__})")
        
        # Считаем записи для этого врача
        count = await db.appointments.count_documents({"doctor_id": doctor_id})
        print(f"    Записей: {count}")
    
    # 4. Для каждого telegram врача проверяем его записи
    print("\n\n4. ПОИСК ЗАПИСЕЙ ДЛЯ КАЖДОГО TELEGRAM ВРАЧА:")
    print("-" * 80)
    
    for tg_user in telegram_doctors:
        doctor_id = tg_user.get('doctor_id')
        print(f"\n--- Telegram врач: {tg_user.get('first_name')} {tg_user.get('last_name')} ---")
        print(f"doctor_id из telegram_users: '{doctor_id}' (type: {type(doctor_id).__name__})")
        
        # Поиск точным совпадением
        count_exact = await db.appointments.count_documents({"doctor_id": doctor_id})
        print(f"  Записей с точным совпадением doctor_id: {count_exact}")
        
        # Поиск с ObjectId (если doctor_id валидный для ObjectId)
        try:
            count_objectid = await db.appointments.count_documents({"doctor_id": ObjectId(doctor_id)})
            print(f"  Записей с ObjectId(doctor_id): {count_objectid}")
        except:
            print(f"  ObjectId(doctor_id) - невалидный")
        
        # Показываем несколько записей если есть
        appointments = await db.appointments.find({"doctor_id": doctor_id}).limit(3).to_list(3)
        if appointments:
            print(f"\n  Примеры записей (первые 3):")
            for apt in appointments:
                print(f"    - Дата: {apt.get('appointment_date')} {apt.get('appointment_time')}")
                print(f"      Patient ID: {apt.get('patient_id')}")
                print(f"      Doctor ID: {apt.get('doctor_id')} (type: {type(apt.get('doctor_id')).__name__})")
        
    # 5. Проверяем расписание
    print("\n\n5. РАСПИСАНИЕ В КОЛЛЕКЦИИ 'doctor_schedules':")
    print("-" * 80)
    
    # Получаем все уникальные doctor_id из doctor_schedules
    all_schedule_doctor_ids = await db.doctor_schedules.distinct("doctor_id")
    print(f"\nВсего уникальных doctor_id в doctor_schedules: {len(all_schedule_doctor_ids)}")
    
    for doctor_id in all_schedule_doctor_ids[:5]:  # Показываем первые 5
        print(f"  - {doctor_id} (type: {type(doctor_id).__name__})")
        
        # Считаем расписание для этого врача
        count = await db.doctor_schedules.count_documents({"doctor_id": doctor_id})
        print(f"    Расписаний: {count}")
    
    # Для каждого telegram врача проверяем расписание
    print("\n\n6. ПОИСК РАСПИСАНИЯ ДЛЯ КАЖДОГО TELEGRAM ВРАЧА:")
    print("-" * 80)
    
    for tg_user in telegram_doctors:
        doctor_id = tg_user.get('doctor_id')
        print(f"\n--- Telegram врач: {tg_user.get('first_name')} {tg_user.get('last_name')} ---")
        print(f"doctor_id из telegram_users: '{doctor_id}' (type: {type(doctor_id).__name__})")
        
        # Поиск точным совпадением
        count_exact = await db.doctor_schedules.count_documents({"doctor_id": doctor_id})
        print(f"  Расписаний с точным совпадением doctor_id: {count_exact}")
        
        # Поиск с ObjectId
        try:
            count_objectid = await db.doctor_schedules.count_documents({"doctor_id": ObjectId(doctor_id)})
            print(f"  Расписаний с ObjectId(doctor_id): {count_objectid}")
        except:
            print(f"  ObjectId(doctor_id) - невалидный")
        
        # Показываем расписание если есть
        schedules = await db.doctor_schedules.find({"doctor_id": doctor_id}).to_list(None)
        if schedules:
            print(f"\n  Расписание:")
            for schedule in schedules:
                print(f"    - День: {schedule.get('day_of_week')}, Время: {schedule.get('start_time')}-{schedule.get('end_time')}")
    
    print("\n" + "="*80)
    print("КОНЕЦ ДИАГНОСТИКИ")
    print("="*80 + "\n")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(diagnose_doctor_data())
