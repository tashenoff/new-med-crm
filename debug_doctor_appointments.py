import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import os
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv('backend/.env')

MONGODB_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'medcrm')

async def debug_doctor_appointments():
    """Отладка: проверяем связь между пользователем-врачом и записями"""
    
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DB_NAME]
    
    print("\n" + "="*80)
    print("🔍 ОТЛАДКА: ЗАПИСИ ВРАЧА")
    print("="*80 + "\n")
    
    # 1. Находим пользователя врача v@mail.ru
    doctor_email = "v@mail.ru"
    print(f"1️⃣ Ищем пользователя с email: {doctor_email}")
    user = await db.users.find_one({"email": doctor_email})
    
    if not user:
        print(f"❌ Пользователь {doctor_email} не найден")
        await client.close()
        return
    
    print(f"✅ Найден пользователь:")
    print(f"   - ID: {user.get('id', user.get('_id'))}")
    print(f"   - Email: {user.get('email')}")
    print(f"   - Role: {user.get('role')}")
    print(f"   - doctor_id: {user.get('doctor_id')}")
    print(f"   - patient_id: {user.get('patient_id')}")
    
    if not user.get('doctor_id'):
        print(f"\n❌ У пользователя {doctor_email} не установлен doctor_id!")
        print("   Это означает, что учетная запись не связана с записью врача в коллекции doctors")
        
        # Ищем врача по email
        print(f"\n2️⃣ Ищем врача в коллекции doctors с email: {doctor_email}")
        doctor = await db.doctors.find_one({"email": doctor_email})
        
        if doctor:
            print(f"✅ Найден врач в коллекции doctors:")
            print(f"   - ID: {doctor.get('id', doctor.get('_id'))}")
            print(f"   - ФИО: {doctor.get('full_name')}")
            print(f"   - Email: {doctor.get('email')}")
            print(f"   - Специальность: {doctor.get('specialty')}")
            
            print(f"\n💡 РЕШЕНИЕ: Нужно обновить user.doctor_id = {doctor.get('id', doctor.get('_id'))}")
        else:
            print(f"❌ Врач с email {doctor_email} не найден в коллекции doctors")
        
        await client.close()
        return
    
    doctor_id = user.get('doctor_id')
    print(f"\n2️⃣ Ищем записи для doctor_id: {doctor_id}")
    
    # Подсчитываем записи для этого врача
    appointments = await db.appointments.find({"doctor_id": doctor_id}).to_list(length=None)
    print(f"   Найдено записей: {len(appointments)}")
    
    if appointments:
        print("\n📋 Список записей:")
        for apt in appointments:
            print(f"   - ID: {apt.get('id')}")
            print(f"     Дата: {apt.get('appointment_date')} {apt.get('appointment_time')}")
            print(f"     Пациент ID: {apt.get('patient_id')}")
            print(f"     Статус: {apt.get('status')}")
            
            # Получаем имя пациента
            patient = await db.patients.find_one({
                "$or": [
                    {"id": apt.get('patient_id')},
                    {"_id": apt.get('patient_id')}
                ]
            })
            if patient:
                print(f"     Пациент: {patient.get('full_name', patient.get('name'))}")
            print()
    else:
        print("\n❌ Нет записей для этого врача")
        
        # Проверяем, есть ли записи вообще
        print(f"\n3️⃣ Ищем ВСЕ записи в системе с email врача {doctor_email}")
        doctor = await db.doctors.find_one({"email": doctor_email})
        if doctor:
            all_doctor_ids = [doctor.get('id'), doctor.get('_id'), str(doctor.get('_id'))]
            print(f"   Возможные ID врача: {all_doctor_ids}")
            
            for did in all_doctor_ids:
                if did:
                    apts = await db.appointments.find({"doctor_id": did}).to_list(length=None)
                    if apts:
                        print(f"\n   ✅ Найдено {len(apts)} записей с doctor_id={did}")
                        for apt in apts[:3]:  # Показываем первые 3
                            print(f"      - {apt.get('appointment_date')} {apt.get('appointment_time')}")
    
    print("\n" + "="*80)
    await client.close()

if __name__ == "__main__":
    asyncio.run(debug_doctor_appointments())
