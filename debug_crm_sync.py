"""
Диагностика синхронизации CRM с HMS
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = "mongodb://admin:admin123@localhost:27017/?authSource=admin"
DB_NAME = "medcrm"


async def diagnose_lead_sync():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("=" * 60)
    print("Диагностика синхронизации CRM")
    print("=" * 60)
    
    # 1. Получаем все лиды
    leads = await db.crm_leads.find({}).to_list(None)
    print(f"\n📋 Всего лидов: {len(leads)}")
    
    for lead in leads:
        lead_name = f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip()
        lead_phone = lead.get('phone', '')
        lead_status = lead.get('status')
        
        print(f"\n--- Лид: {lead_name}")
        print(f"    Телефон: {lead_phone}")
        print(f"    Статус: {lead_status}")
        
        # Ищем пациента по телефону
        clean_phone = lead_phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        
        patient = None
        if clean_phone:
            # Ищем по точному совпадению или частичному
            patients = await db.patients.find({}).to_list(None)
            for p in patients:
                p_phone = (p.get('phone') or '').replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
                if clean_phone == p_phone or clean_phone in p_phone or p_phone in clean_phone:
                    patient = p
                    break
        
        if patient:
            print(f"    ✅ Пациент найден: {patient.get('full_name')} (ID: {patient.get('id')})")
            
            # Ищем записи этого пациента
            appointments = await db.appointments.find({
                "patient_id": patient.get("id")
            }).to_list(None)
            
            print(f"    📅 Записей на прием: {len(appointments)}")
            for apt in appointments:
                print(f"       - {apt.get('appointment_date')} {apt.get('appointment_time')}: status={apt.get('status')}")
        else:
            print(f"    ⚠️ Пациент НЕ найден")
            
            # Ищем записи по заметкам
            appointments = await db.appointments.find({
                "notes": {"$regex": clean_phone}
            }).to_list(None)
            
            if appointments:
                print(f"    📝 Найдены записи с упоминанием телефона в заметках: {len(appointments)}")
                for apt in appointments:
                    print(f"       - patient_id: {apt.get('patient_id')}")
                    print(f"         status: {apt.get('status')}")
                    print(f"         notes: {apt.get('notes')[:100]}...")
                    
                    # Получаем информацию о пациенте из записи
                    apt_patient = await db.patients.find_one({"id": apt.get("patient_id")})
                    if apt_patient:
                        print(f"         Пациент записи: {apt_patient.get('full_name')}, тел: {apt_patient.get('phone')}")
    
    # 2. Проверяем все записи на прием со статусом "arrived"
    print("\n" + "=" * 60)
    print("Записи со статусом 'arrived':")
    arrived_appointments = await db.appointments.find({"status": "arrived"}).to_list(None)
    
    for apt in arrived_appointments:
        print(f"\n📅 Запись: {apt.get('id')}")
        print(f"   patient_id: {apt.get('patient_id')}")
        print(f"   status: {apt.get('status')}")
        
        # Ищем пациента
        patient = await db.patients.find_one({"id": apt.get("patient_id")})
        if patient:
            print(f"   Пациент: {patient.get('full_name')}, тел: {patient.get('phone')}")
            
            # Ищем соответствующего лида
            patient_phone = (patient.get('phone') or '').replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
            if patient_phone:
                lead = await db.crm_leads.find_one({
                    "phone": {"$regex": patient_phone}
                })
                if lead:
                    print(f"   ✅ Связанный лид: {lead.get('first_name')} {lead.get('last_name')}, статус: {lead.get('status')}")
                else:
                    print(f"   ⚠️ Лид с таким телефоном НЕ найден")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(diagnose_lead_sync())
