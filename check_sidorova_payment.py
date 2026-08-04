"""
Проверка статуса оплаты для Сидоровой Марии
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = "mongodb://admin:admin123@localhost:27017/?authSource=admin"
DB_NAME = "medcrm"


async def check_sidorova():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("=" * 60)
    print("Проверка данных Сидоровой Марии")
    print("=" * 60)
    
    # 1. Ищем лида
    lead = await db.crm_leads.find_one({
        "phone": {"$regex": "996777888999"}
    })
    
    if lead:
        print(f"\n📋 Лид найден:")
        print(f"   ID: {lead.get('id')}")
        print(f"   Имя: {lead.get('first_name')} {lead.get('last_name')}")
        print(f"   Телефон: {lead.get('phone')}")
        print(f"   Статус: {lead.get('status')}")
        print(f"   Сумма: {lead.get('deal_value')}")
    else:
        print("⚠️ Лид не найден")
    
    # 2. Ищем пациента
    patient = await db.patients.find_one({
        "phone": {"$regex": "996777888999"}
    })
    
    if patient:
        print(f"\n👤 Пациент найден:")
        print(f"   ID: {patient.get('id')}")
        print(f"   Имя: {patient.get('full_name')}")
        print(f"   Телефон: {patient.get('phone')}")
        
        # 3. Ищем планы лечения
        treatment_plans = await db.treatment_plans.find({
            "patient_id": patient.get("id")
        }).to_list(None)
        
        print(f"\n📝 Планы лечения: {len(treatment_plans)}")
        for plan in treatment_plans:
            print(f"\n   План ID: {plan.get('id')}")
            print(f"   Статус оплаты: {plan.get('payment_status')}")
            print(f"   Общая сумма: {plan.get('total_cost')}")
            print(f"   Оплачено: {plan.get('paid_amount')}")
            
            # Проверяем услуги
            services = plan.get('services', [])
            print(f"   Услуг: {len(services)}")
            for svc in services:
                print(f"      - {svc.get('name')}: {svc.get('price')}₸, оплачено: {svc.get('is_paid')}")
    else:
        print("⚠️ Пациент не найден")
    
    # 4. Проверяем CRM клиента
    crm_client = await db.crm_clients.find_one({
        "phone": {"$regex": "996777888999"}
    })
    
    if crm_client:
        print(f"\n🏢 CRM клиент найден:")
        print(f"   ID: {crm_client.get('id')}")
        print(f"   hms_patient_id: {crm_client.get('hms_patient_id')}")
    else:
        print("\n⚠️ CRM клиент не найден")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(check_sidorova())
