#!/usr/bin/env python3
"""
Скрипт для проверки связи между лидом и планом лечения
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = "mongodb://admin:admin123@localhost:27017/?authSource=admin"
DATABASE_NAME = "medcrm"

async def main():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DATABASE_NAME]
    
    # Находим лида "Петров Иван"
    print("=" * 60)
    print("Поиск лида 'Петров Иван'...")
    print("=" * 60)
    
    lead = await db.crm_leads.find_one({
        "$or": [
            {"first_name": {"$regex": "Иван", "$options": "i"}},
            {"last_name": {"$regex": "Петров", "$options": "i"}}
        ]
    })
    
    if lead:
        print(f"\n✅ Лид найден:")
        print(f"  ID: {lead.get('id')}")
        print(f"  Имя: {lead.get('first_name')} {lead.get('last_name')}")
        print(f"  Телефон: {lead.get('phone')}")
        print(f"  Статус: {lead.get('status')}")
        print(f"  converted_to_client_id: {lead.get('converted_to_client_id')}")
        print(f"  budget: {lead.get('budget')}")
        
        # Если есть converted_to_client_id, проверяем пациента
        if lead.get('converted_to_client_id'):
            print(f"\n📌 Проверяем пациента по ID: {lead.get('converted_to_client_id')}")
            patient = await db.patients.find_one({"id": lead.get('converted_to_client_id')})
            if patient:
                print(f"  ✅ Пациент найден: {patient.get('full_name')}")
            else:
                print(f"  ❌ Пациент НЕ найден!")
    else:
        print("❌ Лид не найден")
    
    # Находим пациента "Иван Петров"
    print("\n" + "=" * 60)
    print("Поиск пациента 'Иван Петров'...")
    print("=" * 60)
    
    patient = await db.patients.find_one({
        "$or": [
            {"full_name": {"$regex": "Иван.*Петров", "$options": "i"}},
            {"full_name": {"$regex": "Петров.*Иван", "$options": "i"}}
        ]
    })
    
    if patient:
        print(f"\n✅ Пациент найден:")
        print(f"  ID: {patient.get('id')}")
        print(f"  _id: {patient.get('_id')}")
        print(f"  full_name: {patient.get('full_name')}")
        print(f"  phone: {patient.get('phone')}")
        
        patient_id = patient.get('id') or str(patient.get('_id'))
        
        # Находим планы лечения для этого пациента
        print(f"\n📋 Поиск планов лечения для пациента ID: {patient_id}")
        
        # Ищем по разным вариантам ID
        treatment_plans = await db.treatment_plans.find({
            "$or": [
                {"patient_id": patient_id},
                {"patient_id": str(patient.get('_id'))},
            ]
        }).to_list(None)
        
        if treatment_plans:
            print(f"  ✅ Найдено планов: {len(treatment_plans)}")
            total = 0
            for plan in treatment_plans:
                cost = plan.get('total_cost', 0) or 0
                total += cost
                print(f"    - {plan.get('title', 'Без названия')}: {cost} ₸")
            print(f"  💰 Общая сумма: {total} ₸")
        else:
            print("  ❌ Планы лечения не найдены")
    else:
        print("❌ Пациент не найден")
    
    # Показываем все планы лечения
    print("\n" + "=" * 60)
    print("Все планы лечения в базе:")
    print("=" * 60)
    all_plans = await db.treatment_plans.find().limit(10).to_list(None)
    for plan in all_plans:
        print(f"  - patient_id: {plan.get('patient_id')}, total_cost: {plan.get('total_cost')}, title: {plan.get('title', 'N/A')}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(main())
