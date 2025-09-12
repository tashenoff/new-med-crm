import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Загружаем .env
load_dotenv()

async def remove_chair_number_migration():
    """
    Миграция для удаления поля chair_number из всех записей на прием
    """
    # Подключение к MongoDB с правильными настройками
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    
    print(f"🔗 MONGO_URL: {mongo_url}")
    print(f"🗄️ DB_NAME: {db_name}")
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        print("🧹 Начинаем миграцию: удаление chair_number из записей...")
        
        # Удаляем поле chair_number из всех записей в коллекции appointments
        appointments_collection = db.appointments
        
        # Проверяем сколько записей имеют поле chair_number
        count_with_chair = await appointments_collection.count_documents({
            "chair_number": {"$exists": True}
        })
        
        print(f"📋 Найдено записей с полем chair_number: {count_with_chair}")
        
        if count_with_chair > 0:
            # Удаляем поле chair_number из всех документов
            result = await appointments_collection.update_many(
                {"chair_number": {"$exists": True}},
                {"$unset": {"chair_number": ""}}
            )
            
            print(f"✅ Обновлено записей: {result.modified_count}")
        else:
            print("ℹ️ Записей с полем chair_number не найдено")
        
        # Проверяем результат
        count_after = await appointments_collection.count_documents({
            "chair_number": {"$exists": True}
        })
        
        print(f"📊 Записей с chair_number после миграции: {count_after}")
        
        if count_after == 0:
            print("🎉 Миграция успешно завершена! Все поля chair_number удалены.")
        else:
            print(f"⚠️ Остались записи с chair_number: {count_after}")
        
        # Выводим общую статистику
        total_appointments = await appointments_collection.count_documents({})
        print(f"📈 Общее количество записей: {total_appointments}")
        
    except Exception as e:
        print(f"❌ Ошибка во время миграции: {e}")
        raise
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(remove_chair_number_migration())
