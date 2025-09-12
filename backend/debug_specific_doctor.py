import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

async def debug_specific_doctor():
    # Подключение к MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'medical_crm')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        print("🔍 Поиск врача 'тест1' и его записей...")
        
        # Ищем врача "тест1"
        doctors = await db.doctors.find({
            "$or": [
                {"full_name": {"$regex": "тест1", "$options": "i"}},
                {"full_name": {"$regex": "test1", "$options": "i"}}
            ]
        }).to_list(None)
        
        print(f"👨‍⚕️ Найдено врачей с именем 'тест1': {len(doctors)}")
        
        doctor_ids = []
        for doctor in doctors:
            print(f"- ID: {doctor['id']}")
            print(f"  Имя: {doctor['full_name']}")
            print(f"  Специальность: {doctor.get('specialty', 'N/A')}")
            print(f"  Активен: {doctor.get('is_active', 'N/A')}")
            doctor_ids.append(doctor['id'])
            print("  ---")
        
        if doctor_ids:
            # Ищем записи для этих врачей
            today = datetime.now().strftime('%Y-%m-%d')
            print(f"\n📅 Ищем записи на сегодня ({today})...")
            
            appointments = await db.appointments.find({
                "doctor_id": {"$in": doctor_ids}
            }).to_list(None)
            
            print(f"📊 Всего записей для врача 'тест1': {len(appointments)}")
            
            if appointments:
                print("\n📋 Все записи врача:")
                for i, apt in enumerate(appointments):
                    print(f"{i+1}. ID: {apt.get('id', 'N/A')}")
                    print(f"   Дата: {apt.get('appointment_date', 'N/A')}")
                    print(f"   Время: {apt.get('appointment_time', 'N/A')}")
                    print(f"   Пациент ID: {apt.get('patient_id', 'N/A')}")
                    print(f"   Room ID: {apt.get('room_id', 'НЕТ')}")
                    print(f"   Статус: {apt.get('status', 'N/A')}")
                    print(f"   Создана: {apt.get('created_at', 'N/A')}")
                    print(f"   Обновлена: {apt.get('updated_at', 'N/A')}")
                    print("   ---")
                
                # Отдельно записи на сегодня
                today_appointments = [apt for apt in appointments if apt.get('appointment_date') == today]
                print(f"\n🎯 Записи на СЕГОДНЯ ({today}): {len(today_appointments)}")
                
                for apt in today_appointments:
                    print(f"- {apt.get('appointment_time', 'N/A')} - Пациент: {apt.get('patient_id', 'N/A')}")
            
        else:
            print("❌ Врач 'тест1' не найден")
        
        # Также проверим все записи в базе
        print(f"\n📊 Общая статистика:")
        total_appointments = await db.appointments.count_documents({})
        total_doctors = await db.doctors.count_documents({})
        total_patients = await db.patients.count_documents({})
        
        print(f"- Всего записей: {total_appointments}")
        print(f"- Всего врачей: {total_doctors}")
        print(f"- Всего пациентов: {total_patients}")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(debug_specific_doctor())
