"""
Скрипт для исправления doctor_id в существующих записях appointments.
Меняет _id (MongoDB ObjectId) на id (UUID) врача.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv('backend/.env')
MONGO_URI = os.getenv('MONGO_URL')
DB_NAME = os.getenv('DB_NAME', 'medcrm')

async def fix_appointments():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    
    print("=" * 70)
    print("ИСПРАВЛЕНИЕ doctor_id В ЗАПИСЯХ APPOINTMENTS")
    print("=" * 70)
    
    # 1. Создаём маппинг _id -> id для всех врачей
    print("\n📋 Создание маппинга ID врачей...")
    doctors = await db.doctors.find().to_list(100)
    
    # Маппинг: MongoDB _id -> UUID id
    id_mapping = {}
    for doc in doctors:
        mongo_id = str(doc.get('_id', ''))
        uuid_id = doc.get('id', '')
        
        if mongo_id and uuid_id and mongo_id != uuid_id:
            id_mapping[mongo_id] = uuid_id
            print(f"  {mongo_id} -> {uuid_id} ({doc.get('full_name')})")
    
    if not id_mapping:
        print("\n✅ Все ID совпадают, миграция не требуется")
        client.close()
        return
    
    # 2. Обновляем записи в appointments
    print(f"\n🔄 Обновление {len(id_mapping)} типов doctor_id в appointments...")
    
    total_updated = 0
    for old_id, new_id in id_mapping.items():
        result = await db.appointments.update_many(
            {"doctor_id": old_id},
            {"$set": {"doctor_id": new_id}}
        )
        if result.modified_count > 0:
            print(f"  Обновлено {result.modified_count} записей: {old_id} -> {new_id}")
            total_updated += result.modified_count
    
    print(f"\n✅ Всего обновлено: {total_updated} записей")
    
    # 3. Проверяем результат
    print("\n📊 Проверка результата...")
    unique_ids = await db.appointments.distinct('doctor_id')
    print(f"Уникальные doctor_id в appointments: {len(unique_ids)}")
    
    for did in unique_ids:
        count = await db.appointments.count_documents({"doctor_id": did})
        # Проверяем есть ли такой врач
        doc = await db.doctors.find_one({"id": did})
        if doc:
            print(f"  ✅ {did}: {count} записей - {doc.get('full_name')}")
        else:
            # Проверяем по _id (на случай если не исправилось)
            doc = await db.doctors.find_one({"_id": did})
            if doc:
                print(f"  ⚠️ {did}: {count} записей - {doc.get('full_name')} (всё ещё _id!)")
            else:
                print(f"  ❌ {did}: {count} записей - ВРАЧ НЕ НАЙДЕН")
    
    client.close()
    print("\n" + "=" * 70)
    print("МИГРАЦИЯ ЗАВЕРШЕНА")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(fix_appointments())
