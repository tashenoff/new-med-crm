import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient

async def find_patient_mike():
    # Подключение к MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'medical_crm')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        print("🔍 Поиск пациента Mike...")
        
        # Получаем все коллекции
        collections = await db.list_collection_names()
        print(f"📊 Доступные коллекции: {collections}")
        
        # Ищем коллекцию patients
        if 'patients' in collections:
            print("✅ Коллекция 'patients' найдена")
            
            # Ищем пациента Mike
            patients = await db.patients.find({
                "full_name": {"$regex": "Mike", "$options": "i"}
            }).to_list(None)
            
            print(f"👤 Найдено пациентов с именем 'Mike': {len(patients)}")
            
            for patient in patients:
                print(f"- ID: {patient.get('id')}")
                print(f"  Имя: {patient.get('full_name')}")
                print(f"  Телефон: {patient.get('phone', 'N/A')}")
                print(f"  Создан: {patient.get('created_at', 'N/A')}")
                
                # Ищем записи этого пациента
                patient_id = patient.get('id')
                if patient_id and 'appointments' in collections:
                    appointments = await db.appointments.find({
                        "patient_id": patient_id
                    }).to_list(None)
                    
                    print(f"  📅 Записей: {len(appointments)}")
                    for apt in appointments:
                        print(f"    - {apt.get('appointment_date')} {apt.get('appointment_time')} (ID: {apt.get('id')})")
                        print(f"      Room ID: {apt.get('room_id', 'НЕТ')}")
                print("  ---")
        else:
            print("❌ Коллекция 'patients' не найдена")
        
        # Ищем по всем коллекциям документы с patient_name = Mike
        print(f"\n🔍 Поиск документов с patient_name='Mike' во всех коллекциях...")
        
        for collection_name in collections:
            collection = db[collection_name]
            docs = await collection.find({
                "$or": [
                    {"patient_name": "Mike"},
                    {"patient_name": {"$regex": "Mike", "$options": "i"}}
                ]
            }).to_list(None)
            
            if docs:
                print(f"✅ Найдено {len(docs)} документов в '{collection_name}' с patient_name='Mike'")
                for doc in docs:
                    print(f"  - ID: {doc.get('id')}")
                    print(f"    Дата: {doc.get('appointment_date', 'N/A')} {doc.get('appointment_time', 'N/A')}")
                    print(f"    Room ID: {doc.get('room_id', 'НЕТ')}")
        
        # Ищем по patient_id из логов
        target_patient_id = "5ed853df-b619-42c0-8020-55ffca104a28"
        print(f"\n🎯 Поиск по patient_id '{target_patient_id}'...")
        
        for collection_name in collections:
            collection = db[collection_name]
            docs = await collection.find({"patient_id": target_patient_id}).to_list(None)
            
            if docs:
                print(f"✅ Найдено {len(docs)} документов в '{collection_name}' с этим patient_id")
                for doc in docs:
                    print(f"  - {doc}")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(find_patient_mike())
