"""
Скрипт для проверки и исправления doctor_id в room_schedules и doctor_schedules.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv('backend/.env')
MONGO_URI = os.getenv('MONGO_URL')
DB_NAME = os.getenv('DB_NAME', 'medcrm')

async def fix_schedules():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    
    print("=" * 70)
    print("ПРОВЕРКА И ИСПРАВЛЕНИЕ doctor_id В РАСПИСАНИЯХ")
    print("=" * 70)
    
    # 1. Создаём маппинг _id -> id для всех врачей
    print("\n📋 Создание маппинга ID врачей...")
    doctors = await db.doctors.find().to_list(100)
    
    id_mapping = {}
    for doc in doctors:
        mongo_id = str(doc.get('_id', ''))
        uuid_id = doc.get('id', '')
        
        if mongo_id and uuid_id and mongo_id != uuid_id:
            id_mapping[mongo_id] = uuid_id
            print(f"  {mongo_id} -> {uuid_id} ({doc.get('full_name')})")
    
    if not id_mapping:
        print("\n✅ Все ID совпадают, миграция не требуется")
    
    # 2. Проверяем room_schedules
    print("\n📅 ROOM_SCHEDULES:")
    room_schedules = await db.room_schedules.find().to_list(100)
    print(f"  Всего записей: {len(room_schedules)}")
    
    for rs in room_schedules:
        doctor_id = rs.get('doctor_id', '')
        print(f"  - doctor_id: {doctor_id}")
        if doctor_id in id_mapping:
            print(f"    ⚠️ Нужно обновить на: {id_mapping[doctor_id]}")
    
    # Обновляем room_schedules
    total_rs_updated = 0
    for old_id, new_id in id_mapping.items():
        result = await db.room_schedules.update_many(
            {"doctor_id": old_id},
            {"$set": {"doctor_id": new_id}}
        )
        if result.modified_count > 0:
            print(f"  ✅ Обновлено {result.modified_count} записей в room_schedules")
            total_rs_updated += result.modified_count
    
    # 3. Проверяем doctor_schedules
    print("\n📅 DOCTOR_SCHEDULES:")
    doctor_schedules = await db.doctor_schedules.find().to_list(100)
    print(f"  Всего записей: {len(doctor_schedules)}")
    
    for ds in doctor_schedules:
        doctor_id = ds.get('doctor_id', '')
        print(f"  - doctor_id: {doctor_id}")
        if doctor_id in id_mapping:
            print(f"    ⚠️ Нужно обновить на: {id_mapping[doctor_id]}")
    
    # Обновляем doctor_schedules
    total_ds_updated = 0
    for old_id, new_id in id_mapping.items():
        result = await db.doctor_schedules.update_many(
            {"doctor_id": old_id},
            {"$set": {"doctor_id": new_id}}
        )
        if result.modified_count > 0:
            print(f"  ✅ Обновлено {result.modified_count} записей в doctor_schedules")
            total_ds_updated += result.modified_count
    
    # 4. Итог
    print("\n" + "=" * 70)
    print(f"ИТОГО ОБНОВЛЕНО:")
    print(f"  - room_schedules: {total_rs_updated}")
    print(f"  - doctor_schedules: {total_ds_updated}")
    print("=" * 70)
    
    # 5. Проверяем результат
    print("\n📊 ПРОВЕРКА ПОСЛЕ ИСПРАВЛЕНИЯ:")
    
    print("\nroom_schedules (doctor_id):")
    rs_ids = await db.room_schedules.distinct('doctor_id')
    for did in rs_ids:
        doc = await db.doctors.find_one({"id": did})
        count = await db.room_schedules.count_documents({"doctor_id": did})
        if doc:
            print(f"  ✅ {did}: {count} записей - {doc.get('full_name')}")
        else:
            print(f"  ❌ {did}: {count} записей - ВРАЧ НЕ НАЙДЕН")
    
    print("\ndoctor_schedules (doctor_id):")
    ds_ids = await db.doctor_schedules.distinct('doctor_id')
    for did in ds_ids:
        doc = await db.doctors.find_one({"id": did})
        count = await db.doctor_schedules.count_documents({"doctor_id": did})
        if doc:
            print(f"  ✅ {did}: {count} записей - {doc.get('full_name')}")
        else:
            print(f"  ❌ {did}: {count} записей - ВРАЧ НЕ НАЙДЕН")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(fix_schedules())
