"""
Скрипт для очистки extra_deposit в планах лечения
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def fix_extra_deposits():
    # Подключение к MongoDB
    client = AsyncIOMotorClient("mongodb://admin:admin123@localhost:27017/?authSource=admin")
    db = client["medcrm"]
    
    # Получить все планы с extra_deposit
    plans = await db.treatment_plans.find({"extra_deposit": {"$gt": 0}}).to_list(100)
    
    print(f"Найдено планов с extra_deposit: {len(plans)}")
    
    for plan in plans:
        print(f"\nПлан: {plan['id']}")
        print(f"  Название: {plan.get('title', 'N/A')}")
        print(f"  Стоимость: {plan.get('total_cost', 0)}₸")
        print(f"  extra_deposit: {plan.get('extra_deposit', 0)}₸")
        print(f"  deposit_balance: {plan.get('deposit_balance', 'N/A')}")
        
        # Сбросить extra_deposit
        result = await db.treatment_plans.update_one(
            {"id": plan["id"]},
            {"$set": {"extra_deposit": 0}}
        )
        
        if result.modified_count > 0:
            print(f"  ✅ extra_deposit сброшен на 0")
        else:
            print(f"  ❌ Ошибка сброса")
    
    # Также удалить записи из payment_logs типа deposit_topup
    payment_logs = await db.payment_logs.find({"type": "deposit_topup"}).to_list(100)
    print(f"\nНайдено записей доплат: {len(payment_logs)}")
    
    for log in payment_logs:
        print(f"  - {log.get('amount')}₸ для плана {log.get('plan_id')}")
    
    # Удалить все доплаты
    result = await db.payment_logs.delete_many({"type": "deposit_topup"})
    print(f"\nУдалено записей доплат: {result.deleted_count}")
    
    print("\n✅ Готово! Перезагрузите страницу.")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(fix_extra_deposits())
