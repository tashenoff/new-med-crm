#!/usr/bin/env python3
"""
Скрипт для создания администратора в системе MedCRM
"""
import asyncio
import sys
import uuid
from datetime import datetime
from pathlib import Path

# Добавляем путь к модулю
sys.path.insert(0, str(Path(__file__).parent))

from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv
import os

# Загружаем переменные окружения
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Настройка хеширования паролей
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    """Хеширование пароля"""
    return pwd_context.hash(password)

async def create_admin_user():
    """Создание пользователя-администратора"""
    
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
    
    # Ввод данных администратора
    email = input("\n📧 Введите email администратора: ").strip()
    
    if not email:
        print("❌ Email не может быть пустым")
        client.close()
        return
    
    # Проверка существующего пользователя
    existing_user = await db.users.find_one({"email": email})
    if existing_user:
        print(f"⚠️  Пользователь с email {email} уже существует!")
        
        choice = input("Обновить данные существующего пользователя? (да/нет): ").strip().lower()
        if choice not in ['да', 'yes', 'y', 'д']:
            print("❌ Операция отменена")
            client.close()
            return
        
        update_existing = True
        user_id = existing_user["id"]
    else:
        update_existing = False
        user_id = str(uuid.uuid4())
    
    full_name = input("👤 Введите полное имя администратора: ").strip()
    if not full_name:
        print("❌ Имя не может быть пустым")
        client.close()
        return
    
    password = input("🔐 Введите пароль (минимум 6 символов): ").strip()
    if len(password) < 6:
        print("❌ Пароль должен содержать минимум 6 символов")
        client.close()
        return
    
    password_confirm = input("🔐 Подтвердите пароль: ").strip()
    if password != password_confirm:
        print("❌ Пароли не совпадают")
        client.close()
        return
    
    # Хеширование пароля
    hashed_password = get_password_hash(password)
    
    # Создание объекта администратора
    admin_data = {
        "id": user_id,
        "email": email,
        "full_name": full_name,
        "role": "admin",
        "is_active": True,
        "hashed_password": hashed_password,
        "doctor_id": None,
        "patient_id": None,
        "updated_at": datetime.utcnow()
    }
    
    if not update_existing:
        admin_data["created_at"] = datetime.utcnow()
    
    try:
        if update_existing:
            # Обновление существующего пользователя
            await db.users.update_one(
                {"email": email},
                {"$set": admin_data}
            )
            print(f"\n✅ Администратор успешно обновлен!")
        else:
            # Создание нового пользователя
            await db.users.insert_one(admin_data)
            print(f"\n✅ Администратор успешно создан!")
        
        print(f"\n📋 Данные администратора:")
        print(f"   ID: {user_id}")
        print(f"   Email: {email}")
        print(f"   Имя: {full_name}")
        print(f"   Роль: Администратор")
        print(f"   Статус: Активен")
        
        print(f"\n🔗 Теперь вы можете войти в систему используя:")
        print(f"   Email: {email}")
        print(f"   Пароль: [указанный вами]")
        
    except Exception as e:
        print(f"\n❌ Ошибка при создании администратора: {e}")
    finally:
        client.close()

def main():
    """Главная функция"""
    try:
        asyncio.run(create_admin_user())
    except KeyboardInterrupt:
        print("\n\n⚠️  Операция отменена пользователем")
    except Exception as e:
        print(f"\n❌ Произошла ошибка: {e}")

if __name__ == "__main__":
    main()
