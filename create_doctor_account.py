#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт для создания учетной записи врача с логином и паролем
"""

import asyncio
import sys
import os
from datetime import datetime
import uuid
from dotenv import load_dotenv
from pathlib import Path

# Загружаем переменные окружения из backend/.env
env_path = os.path.join(os.path.dirname(__file__), 'backend', '.env')
load_dotenv(env_path)

# Добавляем путь к backend модулям
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from motor.motor_asyncio import AsyncIOMotorClient
from routers.auth import get_password_hash

async def main():
    print("🏥 СОЗДАНИЕ УЧЕТНОЙ ЗАПИСИ ДЛЯ ВРАЧА")
    print("=" * 60)

    # Подключение к базе данных
    try:
        mongo_url = os.environ.get("MONGO_URL", "mongodb://admin:admin123@localhost:27017/?authSource=admin")
        db_name = os.environ.get("DB_NAME", "medcrm")
        
        print(f"🔌 Подключаюсь к: {mongo_url.replace('admin123', '***')}")
        
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        print(f"✅ Подключение к MongoDB успешно (БД: {db_name})")
    except Exception as e:
        print(f"❌ Не удалось подключиться к базе данных: {e}")
        return

    # Показываем всех врачей без учетных записей
    print(f"\n📋 ВРАЧИ БЕЗ УЧЕТНЫХ ЗАПИСЕЙ:")
    print("-" * 60)
    doctors_cursor = db.doctors.find({"user_id": None, "is_active": True})
    doctors = await doctors_cursor.to_list(length=None)
    
    if not doctors:
        print("  Все активные врачи уже имеют учетные записи")
        return
    
    for i, doc in enumerate(doctors, 1):
        print(f"  {i}. {doc.get('full_name', 'Без имени')} - {doc.get('specialty', 'Не указано')}")
        print(f"     ID: {doc.get('id')}")
        print(f"     📱 {doc.get('phone', 'Нет телефона')}")
    
    # Берем последнего созданного врача (Иванов Иван Иванович)
    if doctors:
        doctor = doctors[-1]  # Последний врач без учетки
        doctor_id = doctor.get('id')
        doctor_name = doctor.get('full_name')
        
        print(f"\n➕ СОЗДАНИЕ УЧЕТНОЙ ЗАПИСИ ДЛЯ:")
        print("-" * 60)
        print(f"   👨‍⚕️ ФИО: {doctor_name}")
        print(f"   🏥 Специальность: {doctor.get('specialty')}")
        print(f"   📱 Телефон: {doctor.get('phone')}")
        
        # Данные для входа
        email = "doctor@clinic.com"
        password = "doctor123"
        
        print(f"\n🔐 УЧЕТНЫЕ ДАННЫЕ:")
        print(f"   📧 Email: {email}")
        print(f"   🔑 Пароль: {password}")
        
        # Проверяем, есть ли уже пользователь с таким email
        existing_user = await db.users.find_one({"email": email})
        if existing_user:
            print(f"\n⚠️ Пользователь с email {email} уже существует!")
            print(f"   Удаляю старого пользователя и создаю нового...")
            await db.users.delete_one({"email": email})
        
        # Хешируем пароль
        hashed_password = get_password_hash(password)
        
        # Создаем пользователя
        user_id = str(uuid.uuid4())
        user_data = {
            "id": user_id,
            "email": email,
            "full_name": doctor_name,
            "role": "doctor",  # Роль врача
            "is_active": True,
            "hashed_password": hashed_password,
            "doctor_id": doctor_id,  # Связь с врачом
            "patient_id": None,
            "password_expires_at": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        try:
            # Вставляем пользователя
            await db.users.insert_one(user_data)
            print(f"✅ Пользователь создан!")
            
            # Обновляем врача - добавляем user_id
            await db.doctors.update_one(
                {"id": doctor_id},
                {"$set": {"user_id": user_id}}
            )
            print(f"✅ Врач связан с учетной записью!")
            
            # Проверяем
            updated_doctor = await db.doctors.find_one({"id": doctor_id})
            created_user = await db.users.find_one({"id": user_id})
            
            if updated_doctor and created_user:
                print(f"\n🔍 ПРОВЕРКА:")
                print(f"   ✓ Врач {updated_doctor.get('full_name')} имеет user_id: {updated_doctor.get('user_id')}")
                print(f"   ✓ Пользователь {created_user.get('email')} имеет doctor_id: {created_user.get('doctor_id')}")
                print(f"   ✓ Роль: {created_user.get('role')}")
            
            print(f"\n🎉 ГОТОВО! Теперь врач может войти в систему:")
            print("=" * 60)
            print(f"   📧 Email: {email}")
            print(f"   🔑 Пароль: {password}")
            print("=" * 60)
            print(f"\n💡 Откройте страницу входа и используйте эти данные")
            
        except Exception as e:
            print(f"❌ Ошибка при создании учетной записи: {e}")
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(main())
