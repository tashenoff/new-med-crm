"""
Миграция: Синхронизация депозитов из записей на прием с лидами CRM

Этот скрипт:
1. Находит все записи на прием с депозитами
2. Находит соответствующих лидов по patient_id
3. Обновляет deposit_amount в лидах
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import os
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv("backend/.env")

MONGODB_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DB_NAME", "medcrm")

async def migrate_deposits():
    """Синхронизирует депозиты из записей с лидами"""
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    
    print("=" * 60)
    print("Миграция депозитов из записей на прием в лиды CRM")
    print("=" * 60)
    
    # 1. Получаем все записи с депозитами
    appointments_with_deposit = await db.appointments.find({
        "deposit": {"$gt": 0}
    }).to_list(None)
    
    print(f"\n📋 Найдено записей с депозитами: {len(appointments_with_deposit)}")
    
    updated_leads = 0
    
    for appointment in appointments_with_deposit:
        patient_id = appointment.get("patient_id")
        deposit = appointment.get("deposit", 0)
        deposit_type = appointment.get("deposit_type")
        price = appointment.get("price", 0)
        
        if not patient_id:
            continue
        
        # Вычисляем сумму депозита
        deposit_amount = deposit
        if deposit_type == "percent" and price:
            deposit_amount = (price * deposit) / 100
        
        # Находим лида по converted_to_client_id
        lead = await db.crm_leads.find_one({
            "converted_to_client_id": patient_id
        })
        
        if lead:
            lead_id = lead.get("id")
            current_deposit = lead.get("deposit_amount", 0)
            
            # Обновляем только если депозит не установлен или меньше
            if current_deposit != deposit_amount:
                await db.crm_leads.update_one(
                    {"id": lead_id},
                    {"$set": {
                        "deposit_amount": deposit_amount,
                        "deposit_type": deposit_type,
                        "appointment_price": price,
                        "updated_at": datetime.utcnow()
                    }}
                )
                print(f"  ✅ Лид {lead_id}: обновлен депозит {current_deposit} → {deposit_amount} ₸")
                updated_leads += 1
            else:
                print(f"  ⏭️ Лид {lead_id}: депозит уже актуален ({deposit_amount} ₸)")
        else:
            # Попробуем найти по телефону пациента
            patient = await db.patients.find_one({"id": patient_id})
            if patient:
                phone = patient.get("phone")
                if phone:
                    # Нормализуем телефон
                    phone_normalized = phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
                    
                    lead = await db.crm_leads.find_one({
                        "$or": [
                            {"phone": phone},
                            {"phone": phone_normalized},
                            {"phone": {"$regex": phone_normalized[-10:], "$options": "i"}}
                        ]
                    })
                    
                    if lead:
                        lead_id = lead.get("id")
                        current_deposit = lead.get("deposit_amount", 0)
                        
                        # Обновляем converted_to_client_id и deposit_amount
                        await db.crm_leads.update_one(
                            {"id": lead_id},
                            {"$set": {
                                "converted_to_client_id": patient_id,
                                "deposit_amount": deposit_amount,
                                "deposit_type": deposit_type,
                                "appointment_price": price,
                                "updated_at": datetime.utcnow()
                            }}
                        )
                        print(f"  ✅ Лид {lead_id} (по телефону): обновлен депозит {current_deposit} → {deposit_amount} ₸, связан с пациентом {patient_id}")
                        updated_leads += 1
    
    print(f"\n📊 Результат миграции:")
    print(f"  - Обновлено лидов: {updated_leads}")
    
    # 2. Дополнительно: обновляем лидов у которых есть converted_to_client_id но нет deposit_amount
    leads_without_deposit = await db.crm_leads.find({
        "converted_to_client_id": {"$exists": True, "$ne": None},
        "$or": [
            {"deposit_amount": {"$exists": False}},
            {"deposit_amount": None},
            {"deposit_amount": 0}
        ]
    }).to_list(None)
    
    print(f"\n📋 Лидов с пациентами но без депозитов: {len(leads_without_deposit)}")
    
    for lead in leads_without_deposit:
        patient_id = lead.get("converted_to_client_id")
        lead_id = lead.get("id")
        
        # Ищем запись на прием с депозитом для этого пациента
        appointment = await db.appointments.find_one({
            "patient_id": patient_id,
            "deposit": {"$gt": 0}
        })
        
        if appointment:
            deposit = appointment.get("deposit", 0)
            deposit_type = appointment.get("deposit_type")
            price = appointment.get("price", 0)
            
            deposit_amount = deposit
            if deposit_type == "percent" and price:
                deposit_amount = (price * deposit) / 100
            
            await db.crm_leads.update_one(
                {"id": lead_id},
                {"$set": {
                    "deposit_amount": deposit_amount,
                    "deposit_type": deposit_type,
                    "appointment_price": price,
                    "updated_at": datetime.utcnow()
                }}
            )
            print(f"  ✅ Лид {lead_id}: добавлен депозит {deposit_amount} ₸")
            updated_leads += 1
    
    print(f"\n✅ Миграция завершена!")
    print(f"  - Всего обновлено лидов: {updated_leads}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(migrate_deposits())
