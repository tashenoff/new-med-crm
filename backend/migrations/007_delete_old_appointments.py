import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient

# Добавляем родительскую директорию в путь для импорта
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

async def delete_old_appointments():
    # Подключение к MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'medical_crm')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        print("🗑️ Удаление старых записей без room_id...")
        
        # Сначала покажем что будем удалять
        old_appointments = await db.appointments.find({
            "$or": [
                {"room_id": {"$exists": False}},
                {"room_id": None},
                {"room_id": ""}
            ]
        }).to_list(None)
        
        print(f"📊 Найдено старых записей для удаления: {len(old_appointments)}")
        
        if len(old_appointments) > 0:
            print("\n📋 Записи которые будут удалены:")
            for i, apt in enumerate(old_appointments):
                print(f"{i+1}. ID: {apt.get('id', 'N/A')}")
                print(f"   Дата: {apt.get('appointment_date', 'N/A')} {apt.get('appointment_time', 'N/A')}")
                print(f"   Врач: {apt.get('doctor_name', apt.get('doctor_id', 'N/A'))}")
                print(f"   Пациент: {apt.get('patient_name', apt.get('patient_id', 'N/A'))}")
                print(f"   Статус: {apt.get('status', 'N/A')}")
                print("   ---")
        
        # Подтверждение удаления
        if len(old_appointments) > 0:
            print(f"\n⚠️ ВНИМАНИЕ: Будет удалено {len(old_appointments)} записей!")
            confirm = input("Продолжить удаление? (yes/no): ")
            
            if confirm.lower() in ['yes', 'y', 'да']:
                # Удаляем записи
                result = await db.appointments.delete_many({
                    "$or": [
                        {"room_id": {"$exists": False}},
                        {"room_id": None},
                        {"room_id": ""}
                    ]
                })
                
                print(f"✅ Удалено записей: {result.deleted_count}")
                print("🎉 Очистка завершена успешно!")
            else:
                print("❌ Удаление отменено")
        else:
            print("✅ Старых записей не найдено")
        
    except Exception as e:
        print(f"❌ Ошибка при удалении: {e}")
        raise
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(delete_old_appointments())
