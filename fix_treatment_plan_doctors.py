"""
Скрипт для исправления планов лечения с "Неизвестный врач"
Обновляет поле doctor_name и description на основе assigned_doctor_id
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

MONGO_URL = "mongodb://admin:admin123@localhost:27017/?authSource=admin"
DATABASE_NAME = "medcrm"


async def find_doctor_by_id(db, doctor_id):
    """Найти врача по ID (поддержка разных форматов идентификаторов)"""
    if not doctor_id:
        return None
    
    # Сначала ищем по полю id
    doctor = await db.doctors.find_one({"id": doctor_id})
    if doctor:
        return doctor
    
    # Затем ищем по _id как строке
    doctor = await db.doctors.find_one({"_id": doctor_id})
    if doctor:
        return doctor
    
    # Пробуем искать по _id как ObjectId
    try:
        doctor = await db.doctors.find_one({"_id": ObjectId(doctor_id)})
        if doctor:
            return doctor
    except:
        pass
    
    return None


async def fix_treatment_plans():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DATABASE_NAME]
    
    # Найти все планы с "Неизвестный врач" в описании или без doctor_name
    plans = await db.treatment_plans.find({
        "$or": [
            {"description": {"$regex": "Неизвестный врач"}},
            {"doctor_name": None},
            {"doctor_name": {"$exists": False}}
        ]
    }).to_list(None)
    
    print(f"Найдено планов для обновления: {len(plans)}")
    
    fixed_count = 0
    not_found_count = 0
    
    for plan in plans:
        plan_id = plan.get("id")
        assigned_doctor_id = plan.get("assigned_doctor_id")
        current_description = plan.get("description", "")
        
        if not assigned_doctor_id:
            print(f"  План {plan_id}: нет assigned_doctor_id, пропускаем")
            not_found_count += 1
            continue
        
        # Найти врача
        doctor = await find_doctor_by_id(db, assigned_doctor_id)
        
        if doctor:
            doctor_name = doctor.get("full_name", "Неизвестный врач")
            
            # Обновить description если там "Неизвестный врач"
            new_description = current_description
            if "Неизвестный врач" in current_description:
                new_description = current_description.replace("Неизвестный врач", doctor_name)
            
            # Обновить план
            await db.treatment_plans.update_one(
                {"id": plan_id},
                {"$set": {
                    "doctor_name": doctor_name,
                    "description": new_description
                }}
            )
            
            print(f"  ✅ План {plan_id}: обновлен врач на '{doctor_name}'")
            fixed_count += 1
        else:
            print(f"  ❌ План {plan_id}: врач с ID '{assigned_doctor_id}' не найден")
            not_found_count += 1
    
    print(f"\n=== Итого ===")
    print(f"Исправлено планов: {fixed_count}")
    print(f"Не удалось найти врача: {not_found_count}")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(fix_treatment_plans())
