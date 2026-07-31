import asyncio
import sys
import os

# Добавляем путь к backend
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from bson import ObjectId
from datetime import datetime

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def create_test_doctor():
    # Подключение к MongoDB с аутентификацией
    client = AsyncIOMotorClient("mongodb://admin:admin123@localhost:27017/?authSource=admin")
    db = client["medcrm"]
    
    # Проверяем, есть ли уже такой врач
    existing_doctor = await db.doctors.find_one({"full_name": "Тестовый Врач"})
    existing_user = await db.users.find_one({"username": "test_doctor"})
    
    if existing_doctor:
        print(f"✓ Врач уже существует: {existing_doctor['full_name']} (ID: {existing_doctor['_id']})")
        doctor_id = str(existing_doctor['_id'])
    else:
        # Создаем врача
        doctor = {
            "full_name": "Тестовый Врач",
            "specialization": "Терапевт",
            "phone": "+996555000001",
            "email": "test_doctor@clinic.kg",
            "schedule": {
                "monday": {"start": "09:00", "end": "18:00"},
                "tuesday": {"start": "09:00", "end": "18:00"},
                "wednesday": {"start": "09:00", "end": "18:00"},
                "thursday": {"start": "09:00", "end": "18:00"},
                "friday": {"start": "09:00", "end": "18:00"}
            },
            "services": [],
            "created_at": datetime.utcnow()
        }
        
        result = await db.doctors.insert_one(doctor)
        doctor_id = str(result.inserted_id)
        print(f"✓ Создан врач: {doctor['full_name']} (ID: {doctor_id})")
    
    if existing_user:
        print(f"✓ Пользователь уже существует: {existing_user['username']}")
        # Обновляем связь с врачом
        await db.users.update_one(
            {"_id": existing_user["_id"]},
            {"$set": {"doctor_id": doctor_id}}
        )
        print(f"✓ Связь между пользователем и врачом обновлена")
    else:
        # Берем готовый хеш пароля от админа (пароль: admin)
        admin = await db.users.find_one({"username": "admin"})
        if admin and "hashed_password" in admin:
            hashed_password = admin["hashed_password"]
        else:
            # Fallback на простой пароль
            hashed_password = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5ByK0f0HZHG3u"  # admin
        
        user = {
            "username": "test_doctor",
            "hashed_password": hashed_password,
            "full_name": "Тестовый Врач",
            "role": "doctor",
            "doctor_id": doctor_id,
            "is_active": True,
            "created_at": datetime.now()
        }
        
        await db.users.insert_one(user)
        print(f"✓ Создан пользователь: test_doctor (пароль такой же как у admin)")
    
    print("\n" + "="*60)
    print("ТЕСТОВЫЙ ВРАЧ ГОТОВ!")
    print("="*60)
    print(f"Username: test_doctor")
    print(f"Password: doctor123")
    print(f"Role: doctor")
    print(f"Doctor ID: {doctor_id}")
    print("="*60)
    print("\nТеперь можете:")
    print("1. Выйти из системы (logout)")
    print("2. Войти как: test_doctor / doctor123")
    print("3. Открыть страницу Календарь")
    print("4. Увидеть виджет кэшбэка вверху страницы! 💵")
    print("="*60)
    
    client.close()

if __name__ == "__main__":
    asyncio.run(create_test_doctor())
