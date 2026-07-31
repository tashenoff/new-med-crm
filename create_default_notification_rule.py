"""
Скрипт для создания правила уведомления по умолчанию
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import uuid

# Подключение к MongoDB
MONGODB_URL = "mongodb://localhost:27017"
DATABASE_NAME = "medical_crm"

async def create_default_rule():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    
    try:
        # Проверяем, есть ли уже правила
        existing_rule = await db.notification_rules.find_one({
            "trigger": "appointment_created"
        })
        
        if existing_rule:
            print("✅ Правило уведомления при создании записи уже существует")
            return
        
        # Создаем правило по умолчанию
        rule = {
            "id": str(uuid.uuid4()),
            "status": True,
            "recipient": "patient",
            "trigger": "appointment_created",
            "method": "wazzup",
            "message_template": (
                "Здравствуйте. На связи WhatsApp помощник Медицинский Центр «Ayala»\n\n"
                "%name%, Ваша запись:\n"
                "Дата: %date%\n"
                "Время: %time%\n"
                "Врач: %doctor%\n"
                "Кабинет: %cabinet%\n\n"
                "https://2gis.kz/astana/geo/70000001055140151\n\n"
                "Договор публичной оферты - https://clk.li/google\n"
                "@ayala.clinic\n"
                "https://instagram.com/ayala.clinic?igshid=YmMyMTA2M2Y=\n\n"
                "Рады помогать Вам улучшать здоровье 🙏"
            ),
            "doctors": [],  # Для всех врачей
            "services": [],  # Для всех услуг
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        await db.notification_rules.insert_one(rule)
        print("✅ Правило уведомления по умолчанию успешно создано!")
        print(f"   ID: {rule['id']}")
        print(f"   Триггер: {rule['trigger']}")
        print(f"   Получатель: {rule['recipient']}")
        print(f"   Метод: {rule['method']}")
        
    except Exception as e:
        print(f"❌ Ошибка создания правила: {str(e)}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(create_default_rule())
