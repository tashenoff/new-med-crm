#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import asyncio
import motor.motor_asyncio

# Подключение к MongoDB
DATABASE_URL = "mongodb://localhost:27017"

async def check_all_databases():
    """Проверить все базы данных в MongoDB"""
    client = motor.motor_asyncio.AsyncIOMotorClient(DATABASE_URL)
    
    print("🔍 Проверка всех баз данных в MongoDB")
    print("=" * 60)
    
    try:
        # Получаем список всех баз данных
        databases = await client.list_database_names()
        print(f"📂 Найдено баз данных: {len(databases)}")
        
        for db_name in databases:
            db = client[db_name]
            collections = await db.list_collection_names()
            
            print(f"\n🗄️  База данных: {db_name}")
            print(f"   Коллекций: {len(collections)}")
            
            # Показываем коллекции с количеством документов
            for collection_name in collections:
                collection = db[collection_name]
                count = await collection.count_documents({})
                print(f"   📋 {collection_name}: {count} документов")
                
                # Для коллекций с врачами, пациентами, планами показываем детали
                if any(keyword in collection_name.lower() for keyword in 
                       ['doctor', 'patient', 'appointment', 'plan', 'treatment', 'user']):
                    
                    if count > 0:
                        print(f"      🔍 Анализируем {collection_name}...")
                        
                        # Показываем первый документ
                        first_doc = await collection.find_one({})
                        if first_doc:
                            print(f"      Поля документа:")
                            for key, value in first_doc.items():
                                if key == "_id":
                                    continue
                                
                                if isinstance(value, list):
                                    print(f"        {key}: [список из {len(value)} элементов]")
                                elif isinstance(value, dict):
                                    print(f"        {key}: {{объект}}")
                                else:
                                    # Ограничиваем длину значения
                                    str_value = str(value)
                                    if len(str_value) > 50:
                                        str_value = str_value[:50] + "..."
                                    print(f"        {key}: {str_value}")
        
        # Проверяем стандартные имена для медицинской CRM
        standard_names = ["clinic", "medical_crm", "medical", "crm", "hospital", "medcenter"]
        
        print(f"\n🏥 ПРОВЕРКА СТАНДАРТНЫХ ИМЕН ДЛЯ МЕДИЦИНСКОЙ CRM:")
        for db_name in standard_names:
            if db_name in databases:
                print(f"   ✅ {db_name} - существует")
            else:
                print(f"   ❌ {db_name} - не найдена")
    
    except Exception as e:
        print(f"❌ Ошибка подключения к MongoDB: {e}")
        print("   Возможно, MongoDB не запущен или недоступен")
    
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(check_all_databases())
