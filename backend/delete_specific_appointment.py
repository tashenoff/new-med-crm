import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient

async def delete_specific_appointment():
    # Подключение к MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'medical_crm')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        print("🔍 Поиск и удаление конкретной записи...")
        
        # Ищем запись по точному ID
        appointment = await db.appointments.find_one({
            "id": "bdf10c0f-8d67-40ec-a702-a023abc050bf"
        })
        
        if appointment:
            print("📋 Найдена запись:")
            print(f"ID: {appointment.get('id')}")
            print(f"Дата: {appointment.get('appointment_date')} {appointment.get('appointment_time')}")
            print(f"Врач ID: {appointment.get('doctor_id')}")
            print(f"Room ID: {appointment.get('room_id', 'НЕТ')}")
            print(f"Статус: {appointment.get('status')}")
            
            # Удаляем
            result = await db.appointments.delete_one({"id": appointment["id"]})
            
            if result.deleted_count > 0:
                print("✅ Запись успешно удалена!")
            else:
                print("❌ Не удалось удалить запись")
        else:
            print("❌ Запись не найдена в базе данных")
            
            # Попробуем найти любые записи на эту дату
            all_appointments = await db.appointments.find({
                "appointment_date": "2025-09-11"
            }).to_list(None)
            
            print(f"📊 Всего записей на 2025-09-11: {len(all_appointments)}")
            
            for apt in all_appointments:
                print(f"- {apt.get('appointment_time')} - Врач: {apt.get('doctor_id')} - Room: {apt.get('room_id', 'НЕТ')}")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(delete_specific_appointment())
