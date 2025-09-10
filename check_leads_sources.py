#!/usr/bin/env python3
"""
Проверить заявки и их источники
"""

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()

async def check_leads_and_sources():
    """Проверить заявки и источники"""
    
    # Подключение к MongoDB
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    try:
        sources_collection = db.crm_sources
        leads_collection = db.crm_leads
        
        print("=== ИСТОЧНИКИ ===")
        sources = await sources_collection.find({}).to_list(None)
        for source in sources:
            print(f"ID: {source.get('id')}, Name: {source.get('name')}, Type: {source.get('type')}")
        print(f"Всего источников: {len(sources)}\n")
        
        print("=== ЗАЯВКИ ===")
        leads = await leads_collection.find({}).to_list(None)
        for lead in leads:
            print(f"ID: {lead.get('id')}, Source: {lead.get('source')}, Source_ID: {lead.get('source_id')}")
        print(f"Всего заявок: {len(leads)}\n")
        
        print("=== СТАТИСТИКА ПО ИСТОЧНИКАМ ===")
        for source in sources:
            source_id = source.get("id")
            source_name = source.get("name")
            
            # Считаем заявки по старому полю
            old_count = await leads_collection.count_documents({"source": source_name.lower()})
            
            # Считаем заявки по новому полю 
            new_count = await leads_collection.count_documents({"source_id": source_id})
            
            print(f"{source_name}: старое поле 'source'={old_count}, новое поле 'source_id'={new_count}")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(check_leads_and_sources())
