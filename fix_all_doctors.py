"""
Скрипт для исправления всех врачей в БД
Добавляет недостающие поля и исправляет неправильные данные
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

async def fix_doctors():
    """Исправление всех врачей"""
    client = AsyncIOMotorClient("mongodb://admin:admin123@localhost:27017/?authSource=admin")
    db = client.medcrm
    
    print("🔄 Начинаем исправление врачей...")
    
    # Получаем всех врачей
    doctors = await db.doctors.find({}).to_list(None)
    
    print(f"📊 Найдено врачей: {len(doctors)}")
    
    fixed = 0
    
    for doctor in doctors:
        update_fields = {}
        
        # 1. Добавляем id если его нет
        if "id" not in doctor:
            update_fields["id"] = doctor["_id"]
            print(f"  ✓ Добавлен id для: {doctor.get('full_name', 'Unknown')}")
        
        # 2. Проверяем и исправляем телефон
        phone = doctor.get("phone")
        if not phone or phone.strip() == "" or len(phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")) < 7:
            update_fields["phone"] = "+7 (000) 000-00-00"
            print(f"  ✓ Исправлен телефон для: {doctor.get('full_name', 'Unknown')}")
        
        # 3. Добавляем обязательные поля если их нет
        if "calendar_color" not in doctor:
            update_fields["calendar_color"] = "#3B82F6"
        
        if "is_active" not in doctor:
            update_fields["is_active"] = True
        
        if "payment_type" not in doctor:
            update_fields["payment_type"] = "percentage"
        
        if "payment_value" not in doctor:
            update_fields["payment_value"] = 0.0
        
        if "currency" not in doctor:
            update_fields["currency"] = "KZT"
        
        if "hybrid_fixed_amount" not in doctor:
            update_fields["hybrid_fixed_amount"] = 0.0
        
        if "hybrid_percentage_value" not in doctor:
            update_fields["hybrid_percentage_value"] = 0.0
        
        if "consultation_payment_type" not in doctor:
            update_fields["consultation_payment_type"] = "percentage"
        
        if "consultation_payment_value" not in doctor:
            update_fields["consultation_payment_value"] = 0.0
        
        if "consultation_currency" not in doctor:
            update_fields["consultation_currency"] = "KZT"
        
        if "services" not in doctor:
            update_fields["services"] = []
        
        if "payment_mode" not in doctor:
            update_fields["payment_mode"] = "general"
        
        if "cashback_balance" not in doctor:
            update_fields["cashback_balance"] = 0.0
        
        if "total_cashback_earned" not in doctor:
            update_fields["total_cashback_earned"] = 0.0
        
        if "created_at" not in doctor:
            update_fields["created_at"] = datetime.utcnow()
        
        if "updated_at" not in doctor:
            update_fields["updated_at"] = datetime.utcnow()
        
        # 4. Обновляем, если есть изменения
        if update_fields:
            update_fields["updated_at"] = datetime.utcnow()
            
            await db.doctors.update_one(
                {"_id": doctor["_id"]},
                {"$set": update_fields}
            )
            fixed += 1
            print(f"  ✅ Обновлен: {doctor.get('full_name', 'Unknown')}")
    
    print(f"\n✅ Исправление завершено!")
    print(f"  - Обработано врачей: {fixed}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(fix_doctors())
