"""
Скрипт для проверки депозита в записях и лидах
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URL = "mongodb://admin:admin123@localhost:27017/?authSource=admin"
DATABASE_NAME = "medcrm"

async def check_deposits():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    
    print("=" * 60)
    print("ПРОВЕРКА ДЕПОЗИТОВ В СИСТЕМЕ")
    print("=" * 60)
    
    # 1. Проверяем записи с депозитами
    print("\n📅 ЗАПИСИ С ДЕПОЗИТАМИ:")
    print("-" * 40)
    
    appointments_with_deposit = await db.appointments.find({
        "$or": [
            {"deposit": {"$exists": True, "$ne": None, "$gt": 0}},
            {"deposit_type": {"$exists": True, "$ne": None}}
        ]
    }).to_list(100)
    
    if appointments_with_deposit:
        for apt in appointments_with_deposit:
            print(f"  ID: {apt.get('id', apt.get('_id'))}")
            print(f"  Пациент: {apt.get('patient_id')}")
            print(f"  Дата: {apt.get('appointment_date')} {apt.get('appointment_time')}")
            print(f"  Цена: {apt.get('price', 0)} ₸")
            print(f"  Тип депозита: {apt.get('deposit_type')}")
            print(f"  Депозит: {apt.get('deposit', 0)}")
            print("-" * 20)
    else:
        print("  Нет записей с депозитами")
    
    # 2. Проверяем все записи (последние 10)
    print("\n📅 ПОСЛЕДНИЕ 10 ЗАПИСЕЙ:")
    print("-" * 40)
    
    all_appointments = await db.appointments.find().sort("created_at", -1).limit(10).to_list(10)
    
    for apt in all_appointments:
        print(f"  ID: {apt.get('id', apt.get('_id'))}")
        print(f"  Пациент: {apt.get('patient_id')}")
        print(f"  Цена: {apt.get('price', 0)} ₸")
        print(f"  deposit_type: {apt.get('deposit_type')}")
        print(f"  deposit: {apt.get('deposit')}")
        print("-" * 20)
    
    # 3. Проверяем лиды с депозитами
    print("\n👤 ЛИДЫ С ДЕПОЗИТАМИ:")
    print("-" * 40)
    
    leads_with_deposit = await db.crm_leads.find({
        "$or": [
            {"deposit_amount": {"$exists": True, "$ne": None, "$gt": 0}},
            {"deposit_type": {"$exists": True, "$ne": None}}
        ]
    }).to_list(100)
    
    if leads_with_deposit:
        for lead in leads_with_deposit:
            print(f"  ID: {lead.get('id', lead.get('_id'))}")
            print(f"  ФИО: {lead.get('first_name')} {lead.get('last_name')}")
            print(f"  Телефон: {lead.get('phone')}")
            print(f"  Сумма депозита: {lead.get('deposit_amount', 0)} ₸")
            print(f"  Тип депозита: {lead.get('deposit_type')}")
            print(f"  Цена записи: {lead.get('appointment_price', 0)} ₸")
            print(f"  ID записи: {lead.get('converted_to_appointment_id')}")
            print("-" * 20)
    else:
        print("  Нет лидов с депозитами")
    
    # 4. Проверяем все лиды (последние 10)
    print("\n👤 ПОСЛЕДНИЕ 10 ЛИДОВ:")
    print("-" * 40)
    
    all_leads = await db.crm_leads.find().sort("created_at", -1).limit(10).to_list(10)
    
    for lead in all_leads:
        print(f"  ID: {lead.get('id', lead.get('_id'))}")
        print(f"  ФИО: {lead.get('first_name')} {lead.get('last_name')}")
        print(f"  Телефон: {lead.get('phone')}")
        print(f"  Статус: {lead.get('status')}")
        print(f"  deposit_amount: {lead.get('deposit_amount')}")
        print(f"  deposit_type: {lead.get('deposit_type')}")
        print(f"  appointment_price: {lead.get('appointment_price')}")
        print(f"  converted_to_appointment_id: {lead.get('converted_to_appointment_id')}")
        print("-" * 20)
    
    # 5. Проверяем планы лечения с депозитами
    print("\n💊 ПЛАНЫ ЛЕЧЕНИЯ С ДЕПОЗИТАМИ:")
    print("-" * 40)
    
    treatment_plans_with_deposit = await db.treatment_plans.find({
        "deposit_amount": {"$exists": True, "$ne": None, "$gt": 0}
    }).to_list(100)
    
    if treatment_plans_with_deposit:
        for plan in treatment_plans_with_deposit:
            print(f"  ID: {plan.get('id', plan.get('_id'))}")
            print(f"  Пациент: {plan.get('patient_id')}")
            print(f"  Сумма депозита: {plan.get('deposit_amount', 0)} ₸")
            print(f"  Общая стоимость: {plan.get('total_cost', 0)} ₸")
            print(f"  Оплачено: {plan.get('paid_amount', 0)} ₸")
            print(f"  Статус оплаты: {plan.get('payment_status')}")
            print("-" * 20)
    else:
        print("  Нет планов лечения с депозитами")
    
    client.close()
    print("\n" + "=" * 60)
    print("ПРОВЕРКА ЗАВЕРШЕНА")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(check_deposits())
