#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт для создания нового врача в системе
"""

import asyncio
import sys
import os
from datetime import datetime
import uuid
from dotenv import load_dotenv

# Загружаем переменные окружения из backend/.env
env_path = os.path.join(os.path.dirname(__file__), 'backend', '.env')
load_dotenv(env_path)

# Добавляем путь к backend модулям
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    print("🏥 СОЗДАНИЕ НОВОГО ВРАЧА")
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

    # Сначала покажем текущих врачей
    print(f"\n📋 ТЕКУЩИЕ ВРАЧИ В БАЗЕ ДАННЫХ:")
    print("-" * 60)
    doctors_cursor = db.doctors.find({})
    doctors = await doctors_cursor.to_list(length=None)
    
    if not doctors:
        print("  Врачей пока нет в базе данных")
    else:
        for i, doc in enumerate(doctors, 1):
            active_status = "✅" if doc.get('is_active', True) else "❌"
            payment_info = ""
            if doc.get('payment_type') == 'hybrid':
                payment_info = f"🔗 {doc.get('payment_value', 0)}₸ + {doc.get('hybrid_percentage_value', 0)}%"
            elif doc.get('payment_type') == 'percentage':
                payment_info = f"📊 {doc.get('payment_value', 0)}%"
            elif doc.get('payment_type') == 'fixed':
                payment_info = f"💰 {doc.get('payment_value', 0)}₸"
            
            print(f"  {i}. {active_status} {doc.get('full_name', 'Без имени')} - {doc.get('specialty', 'Не указано')}")
            print(f"     📱 {doc.get('phone', 'Нет телефона')} | {payment_info}")

    # Создание нового врача
    print(f"\n➕ СОЗДАНИЕ НОВОГО ВРАЧА:")
    print("-" * 60)
    
    doctor_id = str(uuid.uuid4())
    
    # Данные нового врача (процентная оплата по умолчанию)
    doctor_data = {
        'id': doctor_id,
        'full_name': 'Иванов Иван Иванович',
        'specialty': 'Терапевт',
        'phone': '+996-555-123-456',
        'calendar_color': '#4CAF50',  # Зеленый цвет
        'is_active': True,
        'user_id': None,
        
        # Настройки оплаты для планов лечения
        'payment_type': 'percentage',
        'payment_value': 15.0,  # 15% от стоимости услуг
        'currency': 'KZT',
        'hybrid_fixed_amount': 0.0,
        'hybrid_percentage_value': 0.0,
        
        # Настройки оплаты за консультации
        'consultation_payment_type': 'percentage',
        'consultation_payment_value': 20.0,  # 20% от стоимости консультации
        'consultation_currency': 'KZT',
        
        # Услуги и режим оплаты
        'services': [],
        'payment_mode': 'general',
        
        # Кешбэк система
        'cashback_balance': 0.0,
        'total_cashback_earned': 0.0,
        
        # Временные метки
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow()
    }

    try:
        # Вставляем врача в базу данных
        result = await db.doctors.insert_one(doctor_data)
        print(f"✅ Врач успешно создан!")
        print(f"\n📝 ДАННЫЕ ВРАЧА:")
        print(f"   ID: {doctor_id}")
        print(f"   👨‍⚕️ ФИО: {doctor_data['full_name']}")
        print(f"   🏥 Специальность: {doctor_data['specialty']}")
        print(f"   📱 Телефон: {doctor_data['phone']}")
        print(f"   🎨 Цвет в календаре: {doctor_data['calendar_color']}")
        print(f"\n💰 ОПЛАТА:")
        print(f"   Планы лечения: {doctor_data['payment_value']}% от стоимости")
        print(f"   Консультации: {doctor_data['consultation_payment_value']}% от стоимости")

        # Проверяем созданного врача
        created_doctor = await db.doctors.find_one({'id': doctor_id})
        if created_doctor:
            print(f"\n🔍 ПРОВЕРКА: Врач найден в БД")
            print(f"   Активен: {'Да' if created_doctor.get('is_active') else 'Нет'}")
        else:
            print(f"\n⚠️ ВНИМАНИЕ: Врач не найден в БД после создания!")

    except Exception as e:
        print(f"❌ Ошибка при создании врача: {e}")
        import traceback
        traceback.print_exc()
        return

    # Показываем обновленный список
    print(f"\n📋 ОБНОВЛЕННЫЙ СПИСОК ВРАЧЕЙ:")
    print("-" * 60)
    doctors_cursor = db.doctors.find({})
    doctors = await doctors_cursor.to_list(length=None)
    
    for i, doc in enumerate(doctors, 1):
        active_status = "✅" if doc.get('is_active', True) else "❌"
        print(f"  {i}. {active_status} {doc.get('full_name', 'Без имени')} - {doc.get('specialty', 'Не указано')}")

    print(f"\n✨ Готово! Врач создан и готов к работе.")
    print(f"💡 Вы можете увидеть его в интерфейсе на странице 'Врачи'")

if __name__ == '__main__':
    asyncio.run(main())
