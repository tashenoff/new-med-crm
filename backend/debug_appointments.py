import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient

async def debug_appointments():
    # Подключение к MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'medical_crm')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        print("🔍 Отладка записей...")
        
        # Получаем все записи
        appointments = await db.appointments.find({}).to_list(None)
        print(f"📊 Всего записей в базе: {len(appointments)}")
        
        if len(appointments) > 0:
            print("\n📋 Информация о записях:")
            for i, apt in enumerate(appointments):
                print(f"{i+1}. ID: {apt.get('id', 'N/A')}")
                print(f"   Пациент: {apt.get('patient_id', 'N/A')}")
                print(f"   Врач: {apt.get('doctor_id', 'N/A')}")
                print(f"   Кабинет: {apt.get('room_id', 'НЕТ')}")
                print(f"   Дата: {apt.get('appointment_date', 'N/A')}")
                print(f"   Время: {apt.get('appointment_time', 'N/A')}")
                print(f"   Статус: {apt.get('status', 'N/A')}")
                print("   ---")
        
        # Проверяем кабинеты
        rooms = await db.rooms.find({"is_active": True}).to_list(None)
        print(f"\n🏥 Всего активных кабинетов: {len(rooms)}")
        
        for room in rooms:
            print(f"- {room['name']} (ID: {room['id']})")
        
        # Проверяем расписания
        schedules = await db.room_schedules.find({"is_active": True}).to_list(None)
        print(f"\n📅 Всего активных расписаний: {len(schedules)}")
        
        for schedule in schedules:
            print(f"- Кабинет: {schedule['room_id']}, Врач: {schedule['doctor_id']}, День: {schedule['day_of_week']}, Время: {schedule['start_time']}-{schedule['end_time']}")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(debug_appointments())
