"""
Проверка проблемы с 100 тенге у новых лидов
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient("mongodb://admin:admin123@localhost:27017/?authSource=admin")
    db = client["medcrm"]
    
    print("=" * 50)
    print("1. Проверяем планы лечения со стоимостью 100₸")
    print("=" * 50)
    
    plans_100 = await db.treatment_plans.find({"total_cost": 100}).to_list(None)
    print(f"Найдено планов с total_cost=100: {len(plans_100)}")
    for p in plans_100:
        print(f"  - ID: {p.get('id')}")
        print(f"    Patient ID: {p.get('patient_id')}")
        print(f"    Title: {p.get('title')}")
    
    print()
    print("=" * 50)
    print("2. Проверяем планы лечения со стоимостью <= 200₸")
    print("=" * 50)
    
    plans_small = await db.treatment_plans.find({"total_cost": {"$gt": 0, "$lte": 200}}).to_list(None)
    print(f"Найдено планов: {len(plans_small)}")
    for p in plans_small:
        print(f"  - {p.get('title', 'Без названия')}: {p.get('total_cost')}₸ (patient: {p.get('patient_id')})")
    
    print()
    print("=" * 50)
    print("3. Проверяем лидов с treatment_plan_total = 100")
    print("=" * 50)
    
    # Лиды не хранят treatment_plan_total - оно вычисляется на лету
    # Но проверим, что нет поля deal_value
    leads = await db.crm_leads.find({}).to_list(None)
    print(f"Всего лидов: {len(leads)}")
    for lead in leads[:10]:  # Первые 10
        print(f"  - {lead.get('first_name')} {lead.get('last_name')} ({lead.get('phone')})")
        print(f"    budget: {lead.get('budget')}")
        print(f"    appointment_price: {lead.get('appointment_price')}")
        print(f"    deal_value: {lead.get('deal_value')}")  # Это поле не должно существовать
    
    print()
    print("=" * 50)
    print("4. Проверяем все уникальные поля в лидах")
    print("=" * 50)
    
    if leads:
        all_keys = set()
        for lead in leads:
            all_keys.update(lead.keys())
        print(f"Все поля: {sorted(all_keys)}")
    
    print()
    print("=" * 50)
    print("5. Проверяем откуда берётся план на 100₸")
    print("=" * 50)
    
    # Смотрим детали одного плана на 100₸
    plan = await db.treatment_plans.find_one({"total_cost": 100})
    if plan:
        print(f"Пример плана на 100₸:")
        print(f"  ID: {plan.get('id')}")
        print(f"  Title: {plan.get('title')}")
        print(f"  Patient ID: {plan.get('patient_id')}")
        print(f"  Created at: {plan.get('created_at')}")
        print(f"  Services: {plan.get('services')}")
        print(f"  Appointment ID: {plan.get('appointment_id')}")
        print(f"  Doctor ID: {plan.get('doctor_id')}")
        
        # Проверяем записанные appointments с ценой 100
        appointments = await db.appointments.find({"price": 100}).to_list(None)
        print(f"\n  Записей с ценой 100₸: {len(appointments)}")
    
    print()
    print("=" * 50)
    print("6. Проверяем телефоны из скриншота")
    print("=" * 50)
    
    # Телефоны из скриншота: 345345345345, 345345345345345, 24345345345
    test_phones = ["345345345345", "345345345345345", "24345345345", "1234567890", "2342342233434534"]
    
    for phone in test_phones:
        lead = await db.crm_leads.find_one({"phone": {"$regex": phone[-10:]}})
        if lead:
            lead_name = f"{lead.get('first_name')} {lead.get('last_name')}"
            patient = await db.patients.find_one({"phone": {"$regex": phone[-10:]}})
            if patient:
                patient_id = patient.get("id")
                plans = await db.treatment_plans.find({"patient_id": patient_id}).to_list(None)
                total = sum(p.get("total_cost", 0) or 0 for p in plans)
                print(f"Лид {lead_name} ({phone}): найден пациент {patient_id}, планы лечения: {len(plans)}, сумма: {total}₸")
            else:
                print(f"Лид {lead_name} ({phone}): пациент НЕ найден")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check())
