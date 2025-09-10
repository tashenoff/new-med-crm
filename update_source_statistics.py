#!/usr/bin/env python3
"""
Скрипт для обновления статистики источников CRM
Пересчитывает количество заявок по source_id
"""

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()

async def update_source_statistics():
    """Обновить статистику всех источников"""
    
    # Подключение к MongoDB
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    try:
        sources_collection = db.crm_sources
        leads_collection = db.crm_leads
        
        # Получаем все источники
        sources = await sources_collection.find({}).to_list(None)
        print(f"🔄 Найдено {len(sources)} источников для обновления...")
        
        for source in sources:
            source_id = source.get("id")
            source_name = source.get("name", "Unnamed")
            
            # Подсчитываем заявки по source_id
            total_leads = await leads_collection.count_documents({"source_id": source_id})
            
            # Подсчет конверсий
            conversions = await leads_collection.count_documents({
                "source_id": source_id,
                "status": "converted"
            })
            
            # Расчет процента конверсии
            conversion_rate = (conversions / total_leads * 100) if total_leads > 0 else 0.0
            
            # Обновляем источник
            result = await sources_collection.update_one(
                {"id": source_id},
                {
                    "$set": {
                        "leads_count": total_leads,
                        "conversion_count": conversions,
                        "conversion_rate": round(conversion_rate, 1)
                    }
                }
            )
            
            if result.modified_count > 0:
                print(f"✅ {source_name}: {total_leads} заявок, {conversions} конверсий ({conversion_rate:.1f}%)")
            else:
                print(f"⚠️  {source_name}: не удалось обновить")
        
        print(f"\n🎉 Обновление статистики завершено!")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(update_source_statistics())
