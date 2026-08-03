"""
Исправление статусов лидов - точное совпадение по телефону
"""

import asyncio
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = "mongodb://admin:admin123@localhost:27017/?authSource=admin"
DB_NAME = "medcrm"


async def fix_leads_from_appointments():
    """Обновить статусы лидов на основе записей на прием"""
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("=" * 60)
    print("Синхронизация статусов лидов из записей")
    print("=" * 60)
    
    # Получаем все записи со статусами которые влияют на лиды
    sync_statuses = ["arrived", "in_progress", "completed", "confirmed"]
    appointments = await db.appointments.find({
        "status": {"$in": sync_statuses}
    }).to_list(None)
    
    print(f"📅 Найдено записей для синхронизации: {len(appointments)}")
    
    updated_count = 0
    
    for apt in appointments:
        patient_id = apt.get("patient_id")
        apt_status = apt.get("status")
        
        # Получаем пациента
        patient = await db.patients.find_one({"id": patient_id})
        if not patient:
            continue
        
        patient_phone = patient.get("phone", "")
        patient_name = patient.get("full_name", "")
        clean_phone = patient_phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        
        if not clean_phone:
            continue
        
        print(f"\n📋 Пациент: {patient_name}, тел: {patient_phone}")
        print(f"   Статус записи: {apt_status}")
        
        # Ищем лида с ТОЧНЫМ совпадением телефона
        lead = await db.crm_leads.find_one({
            "phone": clean_phone,
            "status": {"$nin": ["closed", "rejected", "lost"]}
        })
        
        if not lead:
            print(f"   ⚠️ Лид с точным телефоном не найден, пробуем regex...")
            # Если не нашли точное, ищем по regex но проверяем длину
            leads = await db.crm_leads.find({
                "phone": {"$regex": clean_phone},
                "status": {"$nin": ["closed", "rejected", "lost"]}
            }).to_list(None)
            
            # Выбираем лида с наиболее близким телефоном (наименьшая разница в длине)
            if leads:
                best_lead = None
                min_diff = float('inf')
                for l in leads:
                    l_phone = l.get("phone", "").replace("+", "").replace(" ", "").replace("-", "")
                    diff = abs(len(l_phone) - len(clean_phone))
                    if diff < min_diff:
                        min_diff = diff
                        best_lead = l
                lead = best_lead
        
        if not lead:
            print(f"   ⚠️ Лид не найден")
            continue
        
        lead_name = f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip()
        current_status = lead.get("status")
        
        print(f"   ✅ Найден лид: {lead_name}, текущий статус: {current_status}")
        
        # Определяем новый статус
        new_status = None
        status_note = ""
        
        if apt_status == "confirmed":
            if current_status in ["new", "contacted"]:
                new_status = "in_progress"
                status_note = "Запись подтверждена"
        elif apt_status in ["arrived", "in_progress", "completed"]:
            if current_status in ["new", "contacted", "in_progress"]:
                new_status = "converted"
                status_note = f"Пациент на приеме ({apt_status})"
        
        if new_status and new_status != current_status:
            # Обновляем статус
            existing_notes = lead.get("notes") or ""
            timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
            new_note = f"[{timestamp}] Синхронизация: {status_note}"
            
            result = await db.crm_leads.update_one(
                {"id": lead["id"]},
                {"$set": {
                    "status": new_status,
                    "updated_at": datetime.utcnow(),
                    "notes": f"{existing_notes}\n{new_note}".strip()
                }}
            )
            
            if result.modified_count > 0:
                print(f"   ✅ Статус обновлен: {current_status} -> {new_status}")
                updated_count += 1
        else:
            print(f"   ℹ️ Обновление не требуется")
    
    print(f"\n{'=' * 60}")
    print(f"📊 Обновлено лидов: {updated_count}")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(fix_leads_from_appointments())
