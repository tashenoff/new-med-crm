import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient

async def find_all_appointments():
    # Подключение к MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'medical_crm')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        print("🔍 Поиск ВСЕХ записей во ВСЕХ коллекциях...")
        
        # Получаем все коллекции
        collections = await db.list_collection_names()
        print(f"📊 Найдено коллекций: {collections}")
        
        # Ищем во всех коллекциях
        for collection_name in collections:
            collection = db[collection_name]
            count = await collection.count_documents({})
            print(f"📋 {collection_name}: {count} документов")
            
            if count > 0 and count < 20:  # Показываем содержимое если немного документов
                docs = await collection.find({}).to_list(None)
                for i, doc in enumerate(docs[:5]):  # Показываем первые 5
                    print(f"  {i+1}. {doc}")
        
        # Специальный поиск записи по ID во всех коллекциях
        target_id = "bdf10c0f-8d67-40ec-a702-a023abc050bf"
        print(f"\n🎯 Поиск записи с ID {target_id} во всех коллекциях...")
        
        for collection_name in collections:
            collection = db[collection_name]
            doc = await collection.find_one({"id": target_id})
            if doc:
                print(f"✅ НАЙДЕНО в коллекции '{collection_name}':")
                print(doc)
                
                # Удаляем найденную запись
                result = await collection.delete_one({"id": target_id})
                if result.deleted_count > 0:
                    print(f"🗑️ Запись успешно удалена из '{collection_name}'!")
                break
        else:
            print("❌ Запись не найдена ни в одной коллекции")
        
        # Также поищем по другим полям
        print(f"\n🔍 Поиск записей с doctor_id 'a313cf6e-6a9e-4965-931d-9ed72a9b008b'...")
        for collection_name in collections:
            collection = db[collection_name]
            docs = await collection.find({"doctor_id": "a313cf6e-6a9e-4965-931d-9ed72a9b008b"}).to_list(None)
            if docs:
                print(f"✅ Найдено {len(docs)} документов в '{collection_name}' с этим doctor_id")
                for doc in docs:
                    print(f"  - ID: {doc.get('id')}, Дата: {doc.get('appointment_date')}")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(find_all_appointments())
