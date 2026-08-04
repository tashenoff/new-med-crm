"""
Миграция: Установка deposit_balance для существующих планов лечения

Для каждого плана лечения:
1. Получаем сумму депозитов пациента из записей
2. Вычисляем deposit_balance = deposit_amount - paid_amount (но не меньше 0)
3. Сохраняем deposit_balance в план
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def migrate_deposit_balance():
    client = AsyncIOMotorClient("mongodb://admin:admin123@localhost:27017/?authSource=admin")
    db = client.medcrm
    
    print("\n=== Миграция deposit_balance для планов лечения ===\n")
    
    # Найти все планы лечения
    plans = await db.treatment_plans.find({}).to_list(1000)
    
    print(f"Найдено {len(plans)} планов лечения\n")
    
    updated_count = 0
    
    for plan in plans:
        plan_id = plan.get("id")
        patient_id = plan.get("patient_id")
        title = plan.get("title")
        paid_amount = plan.get("paid_amount", 0) or 0
        current_deposit_balance = plan.get("deposit_balance")
        
        # Получить депозиты пациента
        appointments = await db.appointments.find({
            "patient_id": patient_id,
            "deposit": {"$gt": 0}
        }).to_list(100)
        deposit_amount = sum(apt.get("deposit", 0) or 0 for apt in appointments)
        
        # Вычислить deposit_balance
        # Из депозита списывается сумма оплаченных услуг (но не больше депозита)
        used_from_deposit = min(deposit_amount, paid_amount)
        new_deposit_balance = max(0, deposit_amount - used_from_deposit)
        
        # Обновить только если deposit_balance не установлен или отличается
        if current_deposit_balance is None or current_deposit_balance != new_deposit_balance:
            await db.treatment_plans.update_one(
                {"id": plan_id},
                {"$set": {"deposit_balance": new_deposit_balance}}
            )
            
            print(f"✅ План: {title}")
            print(f"   Пациент: {patient_id}")
            print(f"   Депозит: {deposit_amount}₸")
            print(f"   Оплачено: {paid_amount}₸")
            print(f"   Было deposit_balance: {current_deposit_balance}")
            print(f"   Новый deposit_balance: {new_deposit_balance}₸")
            print()
            
            updated_count += 1
        else:
            print(f"⏭️ План: {title} - deposit_balance уже установлен ({current_deposit_balance}₸)")
    
    print(f"\n=== Миграция завершена ===")
    print(f"Обновлено планов: {updated_count}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(migrate_deposit_balance())
