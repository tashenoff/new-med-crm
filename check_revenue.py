import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check_plans():
    client = AsyncIOMotorClient('mongodb://admin:admin123@localhost:27017/?authSource=admin')
    db = client.medcrm
    
    # Проверяем планы лечения
    plans = await db.treatment_plans.find({}).to_list(None)
    print(f'Всего планов: {len(plans)}')
    
    for plan in plans[:10]:
        print(f'\nПлан: {plan.get("title", "Без названия")}')
        print(f'  total_cost: {plan.get("total_cost", 0)}')
        print(f'  paid_amount: {plan.get("paid_amount", 0)}')
        print(f'  payment_status: {plan.get("payment_status", "unknown")}')
        print(f'  status: {plan.get("status", "unknown")}')
    
    # Общая сумма
    total = sum(plan.get('paid_amount', 0) or 0 for plan in plans)
    print(f'\nОбщая оплаченная сумма: {total}')
    
    client.close()

asyncio.run(check_plans())
