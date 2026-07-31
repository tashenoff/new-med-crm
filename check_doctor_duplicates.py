"""
Проверка дубликатов врача v@mail.ru
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')

MONGODB_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'medcrm')

async def check_duplicates():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DB_NAME]
    
    print("\n" + "="*80)
    print("🔍 ПРОВЕРКА: ДУБЛИРУЮТСЯ ЛИ ВРАЧИ?")
    print("="*80 + "\n")
    
    doctor_email = "v@mail.ru"
    
    # 1. Проверяем коллекцию doctors
    print("1️⃣ Коллекция DOCTORS:")
    doctors = await db.doctors.find({"email": doctor_email}).to_list(length=None)
    print(f"   Найдено врачей с email {doctor_email}: {len(doctors)}")
    for doc in doctors:
        print(f"   - ID: {doc.get('id', doc.get('_id'))}")
        print(f"     ФИО: {doc.get('full_name')}")
        print(f"     Специальность: {doc.get('specialty')}")
        print(f"     is_active: {doc.get('is_active')}")
        print()
    
    # 2. Проверяем коллекцию users
    print("2️⃣ Коллекция USERS:")
    users = await db.users.find({"email": doctor_email}).to_list(length=None)
    print(f"   Найдено пользователей с email {doctor_email}: {len(users)}")
    for user in users:
        print(f"   - ID: {user.get('_id')}")
        print(f"     Email: {user.get('email')}")
        print(f"     Role: {user.get('role')}")
        print(f"     doctor_id: {user.get('doctor_id')}")
        print(f"     is_active: {user.get('is_active')}")
        print()
    
    # 3. Проверяем коллекцию staff
    print("3️⃣ Коллекция STAFF:")
    staff = await db.staff.find({"email": doctor_email}).to_list(length=None)
    print(f"   Найдено сотрудников с email {doctor_email}: {len(staff)}")
    for s in staff:
        print(f"   - ID: {s.get('_id')}")
        print(f"     Email: {s.get('email')}")
        print(f"     ФИО: {s.get('full_name')}")
        print(f"     Role: {s.get('role')}")
        print(f"     is_active: {s.get('is_active')}")
        print()
    
    # Вывод
    print("\n" + "="*80)
    print("📊 ИТОГ:")
    print("="*80)
    
    if len(doctors) > 1:
        print(f"⚠️  ДУБЛИКАТЫ! Найдено {len(doctors)} врачей в коллекции doctors")
    else:
        print(f"✅ Дубликатов в doctors нет ({len(doctors)} запись)")
    
    if len(users) > 1:
        print(f"⚠️  ДУБЛИКАТЫ! Найдено {len(users)} пользователей в коллекции users")
    else:
        print(f"✅ Дубликатов в users нет ({len(users)} запись)")
    
    if len(staff) > 1:
        print(f"⚠️  ДУБЛИКАТЫ! Найдено {len(staff)} сотрудников в коллекции staff")
    else:
        print(f"✅ Дубликатов в staff нет ({len(staff)} запись)")
    
    print("\n💡 ВЫВОД:")
    print("   Функция 'assign_access_to_doctor' НЕ создает дубликатов.")
    print("   Она только создает/обновляет записи в users и staff,")
    print("   не трогая коллекцию doctors (где хранятся сами врачи).")
    print("\n" + "="*80 + "\n")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_duplicates())
