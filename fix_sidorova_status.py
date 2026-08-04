"""
Исправление статуса Сидоровой Марии - перемещение в ОПЛАЧЕНО
"""

import asyncio
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = "mongodb://admin:admin123@localhost:27017/?authSource=admin"
DB_NAME = "medcrm"


async def fix_sidorova():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("=" * 60)
    print("Исправление статуса Сидоровой Марии")
    print("=" * 60)
    
    # Обновляем статус лида на "closed" (ОПЛАЧЕНО)
    result = await db.crm_leads.update_one(
        {"phone": "996777888999"},
        {"$set": {
            "status": "closed",
            "updated_at": datetime.utcnow(),
            "notes": "[Автоматическое обновление] План лечения полностью оплачен. Сумма: 100₸"
        }}
    )
    
    if result.modified_count > 0:
        print("✅ Статус лида обновлен: converted -> closed (ОПЛАЧЕНО)")
    else:
        print("⚠️ Лид не обновлен")
    
    # Также обновим deal_value
    await db.crm_leads.update_one(
        {"phone": "996777888999"},
        {"$set": {"deal_value": 100.0}}
    )
    print("✅ Сумма сделки обновлена: 100₸")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(fix_sidorova())
