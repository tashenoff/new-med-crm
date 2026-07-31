"""
Скрипт миграции: Обновление структуры doctors
Преобразует _id в id для совместимости с моделью Doctor
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

async def migrate_doctors():
    """Миграция структуры врачей"""
    client = AsyncIOMotorClient("mongodb://admin:admin123@localhost:27017/?authSource=admin")
    db = client.medcrm
    
    print("🔄 Начинаем миграцию врачей...")
    
    # Получаем всех врачей
    doctors = await db.doctors.find({}).to_list(None)
    
    migrated = 0
    fixed_phones = 0
    
    for doctor in doctors:
        update_fields = {}
        
        # Если есть _id но нет id, копируем
        if "_id" in doctor and "id" not in doctor:
            update_fields["id"] = doctor["_id"]
            print(f"  ✓ Добавлен id для врача: {doctor.get('full_name', 'Unknown')}")
            migrated += 1
        
        # Проверяем телефон
        phone = doctor.get("phone", "")
        if not phone or len(phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")) < 10:
            update_fields["phone"] = "+7 (000) 000-00-00"
            print(f"  ✓ Исправлен телефон для врача: {doctor.get('full_name', 'Unknown')}")
            fixed_phones += 1
        
        # Добавляем calendar_color если его нет
        if "calendar_color" not in doctor:
            update_fields["calendar_color"] = "#3B82F6"
        
        # Обновляем, если есть изменения
        if update_fields:
            update_fields["updated_at"] = datetime.utcnow()
            
            # Обновляем по _id
            await db.doctors.update_one(
                {"_id": doctor["_id"]},
                {"$set": update_fields}
            )
    
    print(f"\n✅ Миграция завершена!")
    print(f"  - Добавлено поле id: {migrated} врачей")
    print(f"  - Исправлено телефонов: {fixed_phones} врачей")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(migrate_doctors())
