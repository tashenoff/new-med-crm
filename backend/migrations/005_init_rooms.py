import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

# Добавляем родительскую директорию в путь для импорта
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

async def init_rooms():
    # Подключение к MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'medical_crm')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        print("🔧 Инициализация коллекций кабинетов...")
        
        # Создаем коллекции если они не существуют
        collections = await db.list_collection_names()
        
        if 'rooms' not in collections:
            await db.create_collection('rooms')
            print("✅ Коллекция 'rooms' создана")
        
        if 'room_schedules' not in collections:
            await db.create_collection('room_schedules')
            print("✅ Коллекция 'room_schedules' создана")
        
        # Создаем индексы для оптимизации
        await db.rooms.create_index("id", unique=True)
        await db.room_schedules.create_index("id", unique=True)
        await db.room_schedules.create_index([("room_id", 1), ("day_of_week", 1), ("start_time", 1)])
        
        print("✅ Индексы созданы")
        
        # Проверяем количество кабинетов
        rooms_count = await db.rooms.count_documents({})
        print(f"📊 Кабинетов в базе: {rooms_count}")
        
        # Если нет кабинетов, создаем пример
        if rooms_count == 0:
            from uuid import uuid4
            
            sample_room = {
                "id": str(uuid4()),
                "name": "Кабинет 1",
                "number": "101",
                "description": "Основной кабинет",
                "equipment": [],
                "is_active": True,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            await db.rooms.insert_one(sample_room)
            print("✅ Создан пример кабинета")
        
        print("🎉 Инициализация завершена успешно!")
        
    except Exception as e:
        print(f"❌ Ошибка при инициализации: {e}")
        raise
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(init_rooms())
