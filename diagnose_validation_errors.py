"""
Скрипт диагностики ошибок валидации
Проверяет все коллекции на проблемные данные
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import sys

async def diagnose():
    """Диагностика проблем"""
    client = AsyncIOMotorClient("mongodb://admin:admin123@localhost:27017/?authSource=admin")
    db = client.medcrm
    
    print("🔍 Диагностика данных в БД...\n")
    
    # Проверка врачей
    print("=" * 60)
    print("📋 ВРАЧИ (doctors)")
    print("=" * 60)
    doctors = await db.doctors.find({}).to_list(None)
    print(f"Всего врачей: {len(doctors)}\n")
    
    problems = 0
    for i, doctor in enumerate(doctors, 1):
        issues = []
        
        # Проверяем обязательные поля
        if "id" not in doctor:
            issues.append("❌ Нет поля 'id'")
        if "full_name" not in doctor:
            issues.append("❌ Нет поля 'full_name'")
        if "specialty" not in doctor:
            issues.append("❌ Нет поля 'specialty'")
        
        # Проверяем phone
        phone = doctor.get("phone")
        if phone:
            if isinstance(phone, str) and phone.strip():
                digits = ''.join(filter(str.isdigit, phone))
                if len(digits) < 7:
                    issues.append(f"❌ Телефон слишком короткий: {phone} (цифр: {len(digits)})")
        
        # Проверяем опциональные поля
        required_fields = [
            "calendar_color", "is_active", "payment_type", "payment_value",
            "currency", "services", "payment_mode", "cashback_balance",
            "total_cashback_earned", "created_at", "updated_at"
        ]
        
        for field in required_fields:
            if field not in doctor:
                issues.append(f"⚠️  Нет поля '{field}'")
        
        if issues:
            problems += 1
            print(f"Врач #{i}: {doctor.get('full_name', 'Unknown')}")
            print(f"  _id: {doctor.get('_id')}")
            print(f"  id: {doctor.get('id', 'НЕТ')}")
            for issue in issues:
                print(f"  {issue}")
            print()
    
    if problems == 0:
        print("✅ Все врачи корректны!\n")
    else:
        print(f"❌ Найдено проблем у врачей: {problems}/{len(doctors)}\n")
    
    # Проверка пациентов
    print("=" * 60)
    print("📋 ПАЦИЕНТЫ (patients)")
    print("=" * 60)
    patients = await db.patients.find({}).limit(5).to_list(None)
    print(f"Проверено пациентов (первые 5): {len(patients)}\n")
    
    patient_problems = 0
    for i, patient in enumerate(patients, 1):
        issues = []
        
        # Проверяем обязательные поля
        if "id" not in patient and "_id" not in patient:
            issues.append("❌ Нет id")
        if "full_name" not in patient:
            issues.append("❌ Нет full_name")
        
        if issues:
            patient_problems += 1
            print(f"Пациент #{i}: {patient.get('full_name', 'Unknown')}")
            for issue in issues:
                print(f"  {issue}")
            print()
    
    if patient_problems == 0:
        print("✅ Пациенты корректны!\n")
    
    # Проверка комнат
    print("=" * 60)
    print("📋 КОМНАТЫ (rooms)")
    print("=" * 60)
    rooms = await db.rooms.find({}).to_list(None)
    print(f"Всего комнат: {len(rooms)}\n")
    
    room_problems = 0
    for i, room in enumerate(rooms, 1):
        issues = []
        
        if "id" not in room and "_id" not in room:
            issues.append("❌ Нет id")
        if "name" not in room:
            issues.append("❌ Нет name")
        
        if issues:
            room_problems += 1
            print(f"Комната #{i}: {room.get('name', 'Unknown')}")
            for issue in issues:
                print(f"  {issue}")
            print()
    
    if room_problems == 0:
        print("✅ Комнаты корректны!\n")
    
    # Итоги
    print("=" * 60)
    print("📊 ИТОГИ")
    print("=" * 60)
    total_problems = problems + patient_problems + room_problems
    print(f"Проблем с врачами: {problems}")
    print(f"Проблем с пациентами: {patient_problems}")
    print(f"Проблем с комнатами: {room_problems}")
    print(f"ВСЕГО проблем: {total_problems}")
    
    if total_problems > 0:
        print("\n❌ Необходимо запустить fix_all_doctors.py снова или создать дополнительные миграции")
    else:
        print("\n✅ Все данные корректны!")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(diagnose())
