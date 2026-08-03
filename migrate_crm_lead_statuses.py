"""
Скрипт миграции для синхронизации статусов лидов CRM с оплатой планов лечения.

Логика:
1. Если ВСЕ планы лечения пациента оплачены -> статус лида = "closed" (ОПЛАЧЕНО)
2. Если статус записи "confirmed" -> статус лида = "in_progress" (ЗАПИСЬ ПОДТВЕРЖДЕНА)
3. Если статус записи "arrived/in_progress/completed" -> статус лида = "converted" (ПАЦИЕНТ ПРИШЁЛ)
"""

import asyncio
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient

# MongoDB connection
MONGO_URL = "mongodb://admin:admin123@localhost:27017/?authSource=admin"
DB_NAME = "medcrm"


async def migrate_lead_statuses():
    """Миграция статусов лидов на основе данных HMS"""
    
    mongo_client = AsyncIOMotorClient(MONGO_URL)
    db = mongo_client[DB_NAME]
    
    print("=" * 60)
    print("Миграция статусов лидов CRM")
    print("=" * 60)
    
    # Получаем все лиды
    leads = await db.crm_leads.find({}).to_list(None)
    print(f"📋 Найдено лидов: {len(leads)}")
    
    # Получаем все пациенты для поиска по телефону
    all_patients = await db.patients.find({}).to_list(None)
    print(f"👥 Найдено пациентов: {len(all_patients)}")
    
    # Создаем словарь для быстрого поиска пациента по телефону
    patients_by_phone = {}
    for p in all_patients:
        if p.get("phone"):
            clean_phone = p["phone"].replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
            patients_by_phone[clean_phone] = p
    
    updated_count = 0
    skipped_count = 0
    
    for lead in leads:
        lead_id = lead.get("id")
        lead_phone = lead.get("phone", "")
        current_status = lead.get("status")
        lead_name = f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip()
        
        print(f"\n--- Обработка лида: {lead_name} (ID: {lead_id})")
        print(f"    Телефон: {lead_phone}")
        print(f"    Текущий статус: {current_status}")
        
        # Пропускаем уже закрытые/отклоненные лиды
        if current_status in ["closed", "rejected", "lost"]:
            print(f"    ⏭️ Пропущен (статус: {current_status})")
            skipped_count += 1
            continue
        
        # Ищем пациента напрямую по телефону
        patient = None
        hms_patient_id = None
        
        if lead_phone:
            clean_phone = lead_phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
            patient = patients_by_phone.get(clean_phone)
            
            # Также пробуем поиск по частичному совпадению
            if not patient:
                for phone_key, p in patients_by_phone.items():
                    if clean_phone in phone_key or phone_key in clean_phone:
                        patient = p
                        break
        
        if not patient:
            print(f"    ⚠️ Пациент не найден по телефону")
            skipped_count += 1
            continue
        
        hms_patient_id = patient.get("id")
        print(f"    ✅ Найден пациент: {patient.get('full_name')}, ID: {hms_patient_id}")
        
        if not hms_patient_id:
            print(f"    ⚠️ ID пациента не найден")
            skipped_count += 1
            continue
        
        # Проверяем планы лечения
        treatment_plans = await db.treatment_plans.find({
            "patient_id": hms_patient_id
        }).to_list(None)
        
        print(f"    📊 Найдено планов лечения: {len(treatment_plans)}")
        
        # Проверяем записи на прием
        appointments = await db.appointments.find({
            "patient_id": hms_patient_id
        }).to_list(None)
        
        print(f"    📅 Найдено записей: {len(appointments)}")
        
        new_status = None
        update_note = ""
        
        # ПРИОРИТЕТ 1: Проверяем оплату планов лечения
        if treatment_plans:
            all_paid = True
            paid_plans_count = 0
            total_paid = 0
            
            for plan in treatment_plans:
                payment_status = plan.get("payment_status", "unpaid")
                paid_amount = plan.get("paid_amount", 0) or 0
                total_paid += paid_amount
                
                if payment_status == "paid":
                    paid_plans_count += 1
                else:
                    all_paid = False
                    
                print(f"      План {plan.get('id')}: payment_status={payment_status}, paid_amount={paid_amount}")
            
            if all_paid and treatment_plans:
                new_status = "closed"
                update_note = f"Все планы лечения ({len(treatment_plans)}) оплачены. Общая сумма: {total_paid}₸"
                print(f"    💰 Все планы оплачены -> closed")
        
        # ПРИОРИТЕТ 2: Проверяем статус записей
        if not new_status and appointments:
            # Ищем самую последнюю запись
            latest_appointment = sorted(appointments, key=lambda a: a.get("appointment_date", ""), reverse=True)[0]
            appointment_status = latest_appointment.get("status", "")
            
            print(f"    📅 Последняя запись: статус={appointment_status}")
            
            if appointment_status in ["arrived", "in_progress", "completed"]:
                # Пациент пришел
                if current_status in ["new", "contacted", "in_progress"]:
                    new_status = "converted"
                    update_note = f"Пациент на приеме (статус записи: {appointment_status})"
                    print(f"    👤 Пациент пришел -> converted")
            
            elif appointment_status == "confirmed":
                # Запись подтверждена
                if current_status in ["new", "contacted"]:
                    new_status = "in_progress"
                    update_note = f"Запись на прием подтверждена"
                    print(f"    ✓ Запись подтверждена -> in_progress")
        
        # Обновляем статус лида
        if new_status and new_status != current_status:
            # Добавляем заметку
            existing_notes = lead.get("notes") or ""
            timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
            new_note = f"[{timestamp}] Миграция: {update_note}"
            
            update_data = {
                "status": new_status,
                "updated_at": datetime.utcnow(),
                "notes": f"{existing_notes}\n{new_note}".strip()
            }
            
            result = await db.crm_leads.update_one(
                {"id": lead_id},
                {"$set": update_data}
            )
            
            if result.modified_count > 0:
                print(f"    ✅ Статус обновлен: {current_status} -> {new_status}")
                updated_count += 1
            else:
                print(f"    ❌ Ошибка обновления")
        else:
            print(f"    ℹ️ Обновление не требуется")
            skipped_count += 1
    
    print("\n" + "=" * 60)
    print(f"📊 РЕЗУЛЬТАТЫ МИГРАЦИИ:")
    print(f"   Обновлено лидов: {updated_count}")
    print(f"   Пропущено лидов: {skipped_count}")
    print("=" * 60)
    
    mongo_client.close()


async def check_lead_patient_connections():
    """Диагностика связей между лидами и пациентами"""
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("\n" + "=" * 60)
    print("Диагностика связей лидов и пациентов")
    print("=" * 60)
    
    # Получаем все лиды
    leads = await db.crm_leads.find({}).to_list(None)
    
    for lead in leads:
        lead_name = f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip()
        lead_phone = lead.get("phone", "")
        
        print(f"\n📌 Лид: {lead_name}")
        print(f"   Телефон: {lead_phone}")
        print(f"   Статус: {lead.get('status')}")
        print(f"   converted_to_client_id: {lead.get('converted_to_client_id')}")
        print(f"   converted_to_appointment_id: {lead.get('converted_to_appointment_id')}")
        
        # Ищем пациента по телефону
        if lead_phone:
            clean_phone = lead_phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
            
            # Ищем в patients
            patient = await db.patients.find_one({
                "phone": {"$regex": clean_phone}
            })
            
            if patient:
                print(f"   ✅ Найден пациент: {patient.get('full_name')} (ID: {patient.get('id')})")
                
                # Ищем планы лечения
                plans = await db.treatment_plans.find({
                    "patient_id": patient.get("id")
                }).to_list(None)
                
                print(f"   📊 Планов лечения: {len(plans)}")
                
                for plan in plans:
                    print(f"      - План {plan.get('id')}: payment_status={plan.get('payment_status')}, paid={plan.get('paid_amount')}")
            else:
                print(f"   ⚠️ Пациент не найден в базе patients")
        
        # Ищем CRM клиента
        crm_client = await db.crm_clients.find_one({
            "$or": [
                {"phone": {"$regex": clean_phone if lead_phone else "NOMATCH"}},
                {"id": lead.get("converted_to_client_id")}
            ]
        })
        
        if crm_client:
            print(f"   ✅ Найден CRM клиент: {crm_client.get('full_name')}")
            print(f"      hms_patient_id: {crm_client.get('hms_patient_id')}")
    
    client.close()


if __name__ == "__main__":
    print("\n🚀 Запуск миграции статусов лидов CRM...\n")
    
    # Сначала запускаем диагностику
    asyncio.run(check_lead_patient_connections())
    
    # Затем миграцию
    print("\n\n")
    asyncio.run(migrate_lead_statuses())
