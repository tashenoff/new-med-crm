"""
Скрипт для проверки почему кабинет не удаляется
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from dotenv import load_dotenv

# Загрузить переменные окружения
load_dotenv('backend/.env')

async def check_room_deletion():
    # Использовать настройки из .env
    MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017/clinic")
    DB_NAME = os.environ.get('DB_NAME', 'clinic')
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print(f"🔌 Подключение к MongoDB: {MONGO_URL}")
    print(f"📊 База данных: {DB_NAME}\n")
    
    print("🏥 Проверка кабинетов и расписаний\n")
    
    # Получить все кабинеты
    rooms = await db.rooms.find({}).to_list(1000)
    print(f"📋 Всего кабинетов: {len(rooms)}")
    
    for room in rooms:
        room_id = room.get('id')
        room_name = room.get('name', 'Без имени')
        is_active = room.get('is_active', False)
        
        # Проверить расписания
        schedules_count = await db.room_schedules.count_documents({
            "room_id": room_id,
            "is_active": True
        })
        
        # Проверить записи
        appointments_count = await db.appointments.count_documents({
            "room_id": room_id
        })
        
        status = "✅ АКТИВЕН" if is_active else "❌ УДАЛЕН"
        print(f"\n{status} Кабинет: {room_name} (ID: {room_id})")
        print(f"   Активных расписаний: {schedules_count}")
        print(f"   Записей на приём: {appointments_count}")
        
        if not is_active:
            print(f"   ⚠️ Кабинет помечен как удаленный, но:")
            if schedules_count > 0:
                print(f"      - У него есть {schedules_count} активных расписаний!")
                # Показать эти расписания
                schedules = await db.room_schedules.find({
                    "room_id": room_id,
                    "is_active": True
                }).to_list(100)
                for sch in schedules:
                    print(f"        Расписание ID: {sch.get('id')}, День: {sch.get('day_of_week')}, "
                          f"Время: {sch.get('start_time')}-{sch.get('end_time')}, "
                          f"Врач: {sch.get('doctor_id')}")
            
            if appointments_count > 0:
                print(f"      - У него есть {appointments_count} записей!")
    
    # Показать кабинеты которые должны отображаться в календаре
    print("\n" + "="*60)
    print("📅 Кабинеты, которые ДОЛЖНЫ отображаться в календаре (is_active=True):")
    active_rooms = await db.rooms.find({"is_active": True}).to_list(1000)
    for room in active_rooms:
        print(f"   - {room.get('name')} (ID: {room.get('id')})")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_room_deletion())
