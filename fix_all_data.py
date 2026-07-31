"""
Комплексный скрипт исправления всех данных
Исправляет врачей и пациентов
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

async def fix_all_data():
    """Исправление всех данных"""
    client = AsyncIOMotorClient("mongodb://admin:admin123@localhost:27017/?authSource=admin")
    db = client.medcrm
    
    print("🔄 Начинаем комплексное исправление данных...\n")
    
    # 1. Исправление врачей
    print("=" * 60)
    print("👨‍⚕️ ИСПРАВЛЕНИЕ ВРАЧЕЙ")
    print("=" * 60)
    
    doctors = await db.doctors.find({}).to_list(None)
    doctors_fixed = 0
    
    for doctor in doctors:
        update_fields = {}
        
        # Добавляем specialty если его нет
        if "specialty" not in doctor or not doctor.get("specialty"):
            update_fields["specialty"] = "Врач общей практики"
            print(f"  ✓ Добавлен specialty для: {doctor.get('full_name', 'Unknown')}")
        
        # Добавляем id если его нет
        if "id" not in doctor:
            update_fields["id"] = doctor["_id"]
        
        # Добавляем все недостающие обязательные поля
        defaults = {
            "calendar_color": "#3B82F6",
            "is_active": True,
            "payment_type": "percentage",
            "payment_value": 0.0,
            "currency": "KZT",
            "hybrid_fixed_amount": 0.0,
            "hybrid_percentage_value": 0.0,
            "consultation_payment_type": "percentage",
            "consultation_payment_value": 0.0,
            "consultation_currency": "KZT",
            "services": [],
            "payment_mode": "general",
            "cashback_balance": 0.0,
            "total_cashback_earned": 0.0,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        for field, default_value in defaults.items():
            if field not in doctor:
                update_fields[field] = default_value
        
        # Обновляем если есть изменения
        if update_fields:
            update_fields["updated_at"] = datetime.utcnow()
            await db.doctors.update_one(
                {"_id": doctor["_id"]},
                {"$set": update_fields}
            )
            doctors_fixed += 1
            print(f"  ✅ Обновлен врач: {doctor.get('full_name', 'Unknown')}")
    
    print(f"\n✅ Исправлено врачей: {doctors_fixed}/{len(doctors)}\n")
    
    # 2. Исправление пациентов
    print("=" * 60)
    print("👤 ИСПРАВЛЕНИЕ ПАЦИЕНТОВ")
    print("=" * 60)
    
    # Ищем пациентов без full_name
    patients = await db.patients.find({"full_name": {"$exists": False}}).to_list(None)
    
    if len(patients) == 0:
        # Проверяем пациентов с пустым full_name
        patients = await db.patients.find({"full_name": ""}).to_list(None)
    
    print(f"Найдено пациентов без full_name: {len(patients)}")
    
    patients_fixed = 0
    for i, patient in enumerate(patients, 1):
        update_fields = {}
        
        # Если нет full_name, создаем из других полей или используем "Неизвестный пациент"
        if "full_name" not in patient or not patient.get("full_name"):
            # Пытаемся собрать из first_name и last_name
            first_name = patient.get("first_name", "")
            last_name = patient.get("last_name", "")
            middle_name = patient.get("middle_name", "")
            
            if first_name or last_name:
                full_name_parts = [last_name, first_name, middle_name]
                full_name = " ".join(filter(None, full_name_parts)).strip()
                update_fields["full_name"] = full_name if full_name else f"Пациент №{i}"
            else:
                update_fields["full_name"] = f"Пациент №{i}"
            
            print(f"  ✓ Добавлен full_name: {update_fields['full_name']}")
        
        # Обновляем если есть изменения
        if update_fields:
            update_fields["updated_at"] = datetime.utcnow()
            await db.patients.update_one(
                {"_id": patient["_id"]},
                {"$set": update_fields}
            )
            patients_fixed += 1
    
    print(f"\n✅ Исправлено пациентов: {patients_fixed}/{len(patients)}\n")
    
    # Итоги
    print("=" * 60)
    print("📊 ИТОГИ")
    print("=" * 60)
    print(f"Врачей исправлено: {doctors_fixed}")
    print(f"Пациентов исправлено: {patients_fixed}")
    print(f"\n✅ Все данные исправлены! Можно перезапускать приложение.")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(fix_all_data())
