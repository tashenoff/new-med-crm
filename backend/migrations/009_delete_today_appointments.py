import asyncio
import os
import sys
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Загружаем .env
load_dotenv()

async def delete_today_appointments():
    """
    Миграция для удаления всех записей за сегодняшний день
    """
    # Подключение к MongoDB с правильными настройками
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    
    print(f"🔗 MONGO_URL: {mongo_url}")
    print(f"🗄️ DB_NAME: {db_name}")
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        # Получаем сегодняшнюю дату в формате YYYY-MM-DD
        today = datetime.now().strftime('%Y-%m-%d')
        print(f"📅 Удаляем записи за дату: {today}")
        
        appointments_collection = db.appointments
        
        # Проверяем сколько записей за сегодня
        count_today = await appointments_collection.count_documents({
            "appointment_date": today
        })
        
        print(f"📋 Найдено записей за сегодня: {count_today}")
        
        if count_today > 0:
            # Сначала выводим записи, которые будем удалять
            appointments_to_delete = await appointments_collection.find({
                "appointment_date": today
            }).to_list(None)
            
            print("📋 Записи для удаления:")
            for apt in appointments_to_delete:
                print(f"  - ID: {apt.get('id')}")
                print(f"    Время: {apt.get('appointment_time')} - {apt.get('end_time', 'N/A')}")
                print(f"    Пациент: {apt.get('patient_id')}")
                print(f"    Врач: {apt.get('doctor_id')}")
                print(f"    Кабинет: {apt.get('room_id', 'N/A')}")
                print("    ---")
            
            # Подтверждаем удаление
            confirm = input(f"\n❗ Вы уверены, что хотите удалить {count_today} записей за {today}? (y/N): ")
            
            if confirm.lower() == 'y':
                # Удаляем записи за сегодня
                result = await appointments_collection.delete_many({
                    "appointment_date": today
                })
                
                print(f"✅ Удалено записей: {result.deleted_count}")
            else:
                print("❌ Удаление отменено")
        else:
            print("ℹ️ Записей за сегодня не найдено")
        
        # Проверяем результат
        count_after = await appointments_collection.count_documents({
            "appointment_date": today
        })
        
        print(f"📊 Записей за сегодня после удаления: {count_after}")
        
        # Выводим общую статистику
        total_appointments = await appointments_collection.count_documents({})
        print(f"📈 Общее количество записей в базе: {total_appointments}")
        
        if count_after == 0:
            print("🎉 Все записи за сегодня успешно удалены!")
        else:
            print(f"⚠️ Остались записи за сегодня: {count_after}")
        
    except Exception as e:
        print(f"❌ Ошибка во время миграции: {e}")
        raise
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(delete_today_appointments())
