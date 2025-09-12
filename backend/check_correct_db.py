import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Загружаем .env
load_dotenv()

async def check_correct_db():
    # Подключение к MongoDB с правильными настройками
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    
    print(f"🔗 MONGO_URL: {mongo_url}")
    print(f"🗄️ DB_NAME: {db_name}")
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        print("🔍 Проверка правильной базы данных...")
        
        # Получаем все коллекции
        collections = await db.list_collection_names()
        print(f"📊 Коллекции в базе '{db_name}': {collections}")
        
        # Проверяем каждую коллекцию
        for collection_name in collections:
            collection = db[collection_name]
            count = await collection.count_documents({})
            print(f"📋 {collection_name}: {count} документов")
        
        # Ищем конкретную запись
        if 'appointments' in collections:
            target_appointment = await db.appointments.find_one({
                "id": "bdf10c0f-8d67-40ec-a702-a023abc050bf"
            })
            
            if target_appointment:
                print("✅ НАЙДЕНА проблемная запись!")
                print(f"📋 Детали записи:")
                print(f"   ID: {target_appointment.get('id')}")
                print(f"   Дата: {target_appointment.get('appointment_date')} {target_appointment.get('appointment_time')}")
                print(f"   Врач: {target_appointment.get('doctor_name', target_appointment.get('doctor_id'))}")
                print(f"   Пациент: {target_appointment.get('patient_name', target_appointment.get('patient_id'))}")
                print(f"   Room ID: {target_appointment.get('room_id', 'НЕТ')}")
                print(f"   Статус: {target_appointment.get('status')}")
                
                # Удаляем запись
                result = await db.appointments.delete_one({"id": "bdf10c0f-8d67-40ec-a702-a023abc050bf"})
                if result.deleted_count > 0:
                    print("🗑️ Запись успешно удалена!")
                else:
                    print("❌ Не удалось удалить запись")
            else:
                print("❌ Проблемная запись не найдена")
        
        # Ищем пациента Mike
        if 'patients' in collections:
            mike = await db.patients.find_one({
                "full_name": {"$regex": "Mike", "$options": "i"}
            })
            if mike:
                print(f"👤 Пациент Mike найден: {mike.get('id')}")
        
        # Ищем врача тест1
        if 'doctors' in collections:
            doctor = await db.doctors.find_one({
                "full_name": {"$regex": "тест1", "$options": "i"}
            })
            if doctor:
                print(f"👨‍⚕️ Врач тест1 найден: {doctor.get('id')}")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(check_correct_db())
