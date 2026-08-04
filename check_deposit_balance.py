"""
Скрипт для проверки deposit_balance в планах лечения
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check_deposit_balance():
    client = AsyncIOMotorClient("mongodb://admin:admin123@localhost:27017/?authSource=admin")
    db = client.medcrm
    
    # Найти все планы лечения с deposit_balance
    plans = await db.treatment_plans.find({}).to_list(100)
    
    print(f"\n=== Найдено {len(plans)} планов лечения ===\n")
    
    for plan in plans:
        plan_id = plan.get("id")
        patient_id = plan.get("patient_id")
        title = plan.get("title")
        deposit_balance = plan.get("deposit_balance")
        payment_status = plan.get("payment_status")
        paid_amount = plan.get("paid_amount", 0)
        
        # Получить депозиты пациента
        appointments = await db.appointments.find({
            "patient_id": patient_id,
            "deposit": {"$gt": 0}
        }).to_list(100)
        total_deposit = sum(apt.get("deposit", 0) or 0 for apt in appointments)
        
        print(f"План: {title}")
        print(f"  ID: {plan_id}")
        print(f"  Пациент: {patient_id}")
        print(f"  Статус оплаты: {payment_status}")
        print(f"  Оплачено: {paid_amount}₸")
        print(f"  Общий депозит (из записей): {total_deposit}₸")
        print(f"  deposit_balance в БД: {deposit_balance}")
        
        # Проверить услуги
        services = plan.get("services", [])
        for svc in services:
            svc_name = svc.get("service_name")
            svc_status = svc.get("payment_status")
            paid_from_deposit = svc.get("paid_from_deposit", 0)
            print(f"    Услуга: {svc_name} - {svc_status}, из депозита: {paid_from_deposit}₸")
        
        print()
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_deposit_balance())
