#!/usr/bin/env python3
"""
Скрипт для создания администратора с заданными данными
"""
import asyncio
import sys
import uuid
from datetime import datetime
from pathlib import Path

# Добавляем путь к модулю
sys.path.insert(0, str(Path(__file__).parent / 'backend'))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

# Загружаем переменные окружения
ROOT_DIR = Path(__file__).parent / 'backend'
load_dotenv(ROOT_DIR / '.env')

# Импортируем функцию хэширования из auth.py
from routers.auth import get_password_hash

async def create_admin():
    """Создание администратора с заданными данными"""

    # Подключение к MongoDB
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')

    if not mongo_url or not db_name:
        print("❌ Ошибка: MONGO_URL или DB_NAME не найдены в .env файле")
        return

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print("=" * 60)
    print("Создание администратора для MedCRM")
    print("=" * 60)

    # Данные администратора
    email = "alex@mail.ru"
    password = "admin"
    full_name = "Администратор"

    print(f"📧 Email: {email}")
    print(f"👤 Имя: {full_name}")
    print(f"🔐 Пароль: {password}")

    # Проверка существующего пользователя
    existing_user = await db.users.find_one({"email": email})
    if existing_user:
        print(f"⚠️  Пользователь с email {email} уже существует!")
        print("Обновляем данные существующего пользователя...")

    # Хеширование пароля
    hashed_password = get_password_hash(password)

    # Создание объекта администратора
    admin_data = {
        "id": str(uuid.uuid4()),
        "email": email,
        "full_name": full_name,
        "role": "admin",
        "is_active": True,
        "hashed_password": hashed_password,
        "doctor_id": None,
        "patient_id": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }

    try:
        # Удаляем существующего пользователя если есть
        if existing_user:
            await db.users.delete_one({"email": email})

        # Создание нового пользователя
        await db.users.insert_one(admin_data)
        print("\n✅ Администратор успешно создан!")
        print("\n📋 Данные администратора:")
        print(f"   Email: {email}")
        print(f"   Имя: {full_name}")
        print(f"   Роль: Администратор")
        print(f"   Статус: Активен")
        print("\n🔗 Теперь вы можете войти в систему используя:")
        print(f"   Email: {email}")
        print(f"   Пароль: {password}")

    except Exception as e:
        print(f"\n❌ Ошибка при создании администратора: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(create_admin())
