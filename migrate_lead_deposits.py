"""
Миграция: Обновление deposit_amount в лидах CRM из записей пациентов

Для каждого лида:
1. Находим связанного пациента
2. Получаем депозиты из записей пациента
3. Обновляем deposit_amount в лиде
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def migrate_lead_deposits():
    client = AsyncIOMotorClient("mongodb://admin:admin123@localhost:27017/?authSource=admin")
    db = client.medcrm
    
    print("\n=== Миграция deposit_amount для лидов CRM ===\n")
    
    # Найти все лиды
    leads = await db.crm_leads.find({}).to_list(1000)
    
    print(f"Найдено {len(leads)} лидов\n")
    
    updated_count = 0
    
    for lead in leads:
        lead_id = lead.get("id")
        patient_id = lead.get("patient_id")
        phone = lead.get("phone", "")
        first_name = lead.get("first_name", "")
        last_name = lead.get("last_name", "")
        current_deposit = lead.get("deposit_amount", 0) or 0
        
        # Ищем депозиты по patient_id или по телефону
        appointments = []
        
        if patient_id:
            # Получить депозиты из записей пациента
            appointments = await db.appointments.find({
                "patient_id": patient_id,
                "deposit": {"$gt": 0}
            }).to_list(100)
        
        # Если не нашли по patient_id, ищем по телефону
        if not appointments and phone:
            # Нормализуем телефон для поиска
            phone_clean = phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
            
            # Ищем пациента по телефону
            patient = await db.patients.find_one({
                "$or": [
                    {"phone": {"$regex": phone_clean[-10:]}},
                    {"phone": phone}
                ]
            })
            
            if patient:
                patient_id = patient.get("id")
                appointments = await db.appointments.find({
                    "patient_id": patient_id,
                    "deposit": {"$gt": 0}
                }).to_list(100)
                
                # Обновляем patient_id в лиде
                if patient_id:
                    await db.crm_leads.update_one(
                        {"id": lead_id},
                        {"$set": {"patient_id": patient_id}}
                    )
                    print(f"   🔗 Связали лид с пациентом: {patient_id}")
        
        total_deposit = sum(apt.get("deposit", 0) or 0 for apt in appointments)
        
        if total_deposit > 0 and total_deposit != current_deposit:
            await db.crm_leads.update_one(
                {"id": lead_id},
                {"$set": {"deposit_amount": total_deposit}}
            )
            
            print(f"✅ Лид: {first_name} {last_name}")
            print(f"   Patient ID: {patient_id}")
            print(f"   Было deposit_amount: {current_deposit}₸")
            print(f"   Новый deposit_amount: {total_deposit}₸")
            print()
            
            updated_count += 1
        elif total_deposit > 0:
            print(f"⏭️ Лид: {first_name} {last_name} - deposit_amount уже установлен ({current_deposit}₸)")
        else:
            print(f"⏭️ Лид: {first_name} {last_name} - нет депозитов в записях")
    
    print(f"\n=== Миграция завершена ===")
    print(f"Обновлено лидов: {updated_count}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(migrate_lead_deposits())
