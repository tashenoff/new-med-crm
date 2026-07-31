"""
Проверка doctor_id в записи
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')

MONGODB_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'medcrm')

async def check_appointment():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DB_NAME]
    
    print("\n" + "="*80)
    print("🔍 ПРОВЕРКА ЗАПИСЕЙ ВРАЧА")
    print("="*80 + "\n")
    
    doctor_email = "v@mail.ru"
    
    # 1. Находим врача и его ID
    doctor = await db.doctors.find_one({"email": doctor_email})
    if not doctor:
        print(f"❌ Врач {doctor_email} не найден")
        client.close()
        return
    
    doctor_id = doctor.get('id', doctor.get('_id'))
    print(f"✅ Врач: {doctor.get('full_name')}")
    print(f"   ID врача: {doctor_id}")
    
    # 2. Проверяем user
    user = await db.users.find_one({"email": doctor_email})
    print(f"\n📋 Пользователь:")
    print(f"   user.doctor_id = {user.get('doctor_id')}")
    
    # 3. Ищем ВСЕ записи
    print(f"\n🔍 Ищем все записи в системе...")
    all_appointments = await db.appointments.find({}).to_list(length=None)
    print(f"   Всего записей: {len(all_appointments)}")
    
    if all_appointments:
        print(f"\n📋 Последние 5 записей:")
        for apt in all_appointments[-5:]:
            print(f"   - ID: {apt.get('id')}")
            print(f"     doctor_id: {apt.get('doctor_id')}")
            print(f"     Дата: {apt.get('appointment_date')} {apt.get('appointment_time')}")
            print(f"     Пациент: {apt.get('patient_id')}")
            
            # Сравниваем ID
            if str(apt.get('doctor_id')) == str(doctor_id):
                print(f"     ✅ СОВПАДАЕТ с ID врача!")
            else:
                print(f"     ❌ НЕ совпадает (ожидали {doctor_id})")
            print()
    
    # 4. Ищем по разным вариантам ID
    print(f"\n🔍 Поиск записей по разным форматам ID:")
    
    variants = [
        doctor_id,
        str(doctor_id),
        doctor.get('_id'),
        str(doctor.get('_id'))
    ]
    
    for variant in variants:
        if variant:
            apts = await db.appointments.find({"doctor_id": variant}).to_list(length=None)
            print(f"   doctor_id={variant}: {len(apts)} записей")
    
    print("\n" + "="*80)
    client.close()

if __name__ == "__main__":
    asyncio.run(check_appointment())
