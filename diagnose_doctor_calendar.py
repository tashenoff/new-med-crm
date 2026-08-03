"""
Диагностика проблемы с календарём врача
Проверяет связь между User, Doctor и Appointments
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('backend/.env')

MONGO_URI = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "medcrm")

async def diagnose():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    
    print("=" * 70)
    print("ДИАГНОСТИКА ПРОБЛЕМЫ КАЛЕНДАРЯ ВРАЧА")
    print("=" * 70)
    
    # 1. Получить всех врачей из коллекции doctors
    print("\n📋 ВРАЧИ В КОЛЛЕКЦИИ doctors:")
    doctors = await db.doctors.find({"is_active": True}).to_list(100)
    for doc in doctors:
        print(f"  - ID: {doc.get('id')}")
        print(f"    Имя: {doc.get('full_name')}")
        print(f"    user_id: {doc.get('user_id')}")
        print()
    
    # 2. Получить всех пользователей с ролью doctor
    print("\n👤 ПОЛЬЗОВАТЕЛИ С РОЛЬЮ DOCTOR в коллекции users:")
    users = await db.users.find({"role": "doctor"}).to_list(100)
    for user in users:
        print(f"  - _id: {user.get('_id')}")
        print(f"    Email: {user.get('email')}")
        print(f"    Имя: {user.get('full_name')}")
        print(f"    doctor_id: {user.get('doctor_id')} {'⚠️ ОТСУТСТВУЕТ!' if not user.get('doctor_id') else '✅'}")
        print()
    
    # 3. Проверить записи в appointments
    print("\n📅 ПОСЛЕДНИЕ 10 ЗАПИСЕЙ В КАЛЕНДАРЕ:")
    appointments = await db.appointments.find().sort("created_at", -1).limit(10).to_list(10)
    for app in appointments:
        print(f"  - ID: {app.get('id')}")
        print(f"    Дата: {app.get('appointment_date')} {app.get('appointment_time')}")
        print(f"    doctor_id: {app.get('doctor_id')}")
        print(f"    patient_id: {app.get('patient_id')}")
        print()
    
    # 4. Проверяем соответствие doctor_id в users и appointments
    print("\n🔍 ПРОВЕРКА СООТВЕТСТВИЙ:")
    for user in users:
        user_doctor_id = user.get('doctor_id')
        user_id = user.get('_id')
        
        print(f"\n  Пользователь: {user.get('email')} (id={user_id})")
        print(f"  doctor_id в профиле: {user_doctor_id}")
        
        # Ищем записи по doctor_id пользователя
        if user_doctor_id:
            count_by_doctor_id = await db.appointments.count_documents({"doctor_id": user_doctor_id})
            print(f"  Записей с doctor_id={user_doctor_id}: {count_by_doctor_id}")
        else:
            print(f"  ⚠️ doctor_id не установлен в профиле пользователя!")
        
        # Ищем записи по _id пользователя (на случай если ID совпадает)
        count_by_user_id = await db.appointments.count_documents({"doctor_id": str(user_id)})
        print(f"  Записей с doctor_id={user_id}: {count_by_user_id}")
        
        # Если doctor_id не совпадает с user_id, это может быть проблемой
        if user_doctor_id and user_doctor_id != str(user_id):
            print(f"  ⚠️ doctor_id != user._id - возможно несоответствие")
    
    # 5. Проверяем staff записи для врачей
    print("\n👥 ЗАПИСИ ВРАЧЕЙ В STAFF:")
    staff_doctors = await db.staff.find({"role": "doctor"}).to_list(100)
    for staff in staff_doctors:
        print(f"  - _id: {staff.get('_id')}")
        print(f"    Email: {staff.get('email')}")
        print(f"    full_name: {staff.get('full_name')}")
        print()
    
    client.close()
    print("\n" + "=" * 70)
    print("ДИАГНОСТИКА ЗАВЕРШЕНА")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(diagnose())
