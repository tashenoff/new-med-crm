#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script to create a test doctor with hybrid payment directly in MongoDB
"""

import asyncio
import sys
import os
from datetime import datetime
import uuid

# Добавляем путь к backend модулям
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

# Теперь импортируем из backend
try:
    from motor.motor_asyncio import AsyncIOMotorClient
    from models.doctor import Doctor
except ImportError as e:
    print(f"❌ Ошибка импорта: {e}")
    print("Попробуем использовать прямое подключение к MongoDB...")
    # Fallback к прямому подключению
    import subprocess
    try:
        result = subprocess.run([sys.executable, '-c', 'import pymongo'], capture_output=True)
        if result.returncode == 0:
            from pymongo import MongoClient
            use_sync = True
        else:
            print("❌ Нет доступных драйверов MongoDB")
            sys.exit(1)
    except:
        print("❌ Не удается подключиться к MongoDB")
        sys.exit(1)

async def main():
    print("🏥 СОЗДАНИЕ ВРАЧА С ГИБРИДНОЙ ОПЛАТОЙ")
    print("=" * 50)

    # Подключение к базе данных
    try:
        client = AsyncIOMotorClient('mongodb://localhost:27017/')
        db = client['medical']
        print("✅ Подключение к MongoDB успешно")
    except Exception as e:
        print(f"❌ Не удалось подключиться к базе данных: {e}")
        return

    # Данные врача с гибридной оплатой
    doctor_id = str(uuid.uuid4())
    doctor_data = {
        'id': doctor_id,
        'full_name': 'Доктор Гибрид Тест',
        'specialty': 'Стоматолог-терапевт',
        'phone': '+7-701-555-9999',
        'calendar_color': '#9C27B0',
        'payment_type': 'hybrid',
        'payment_value': 50000.0,  # Фиксированная часть
        'hybrid_percentage_value': 12.5,  # Процентная часть
        'currency': 'KZT',
        'services': [],
        'payment_mode': 'general',
        'is_active': True,
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow()
    }

    try:
        # Создаем врача
        result = await db.doctors.insert_one(doctor_data)
        print(f"✅ Врач создан с ID: {doctor_id}")
        print(f"   👨‍⚕️ Имя: {doctor_data['full_name']}")
        print(f"   💰 Фиксированная часть: {doctor_data['payment_value']} ₸")
        print(f"   📊 Процентная часть: {doctor_data['hybrid_percentage_value']}%")

        # Проверяем созданного врача
        created_doctor = await db.doctors.find_one({'id': doctor_id})
        if created_doctor:
            print("\n🔍 ПРОВЕРКА ДАННЫХ:")
            print(f"   Тип оплаты: {created_doctor.get('payment_type')}")
            print(f"   Фиксированная сумма: {created_doctor.get('payment_value')}")
            print(f"   Процентная часть: {created_doctor.get('hybrid_percentage_value')}")
            
            # Проверяем, что все поля сохранились корректно
            if (created_doctor.get('payment_type') == 'hybrid' and
                created_doctor.get('payment_value') == 50000.0 and
                created_doctor.get('hybrid_percentage_value') == 12.5):
                print("🎉 ВСЕ ДАННЫЕ СОХРАНЕНЫ КОРРЕКТНО!")
            else:
                print("⚠️ Данные сохранились некорректно")

        print(f"\n📱 Теперь проверьте во фронтенде:")
        print(f"   - Откройте раздел 'Врачи'")
        print(f"   - Найдите врача '{doctor_data['full_name']}'")
        print(f"   - Проверьте отображение: 🔗 50,000₸ + 12.5%")

    except Exception as e:
        print(f"❌ Ошибка: {e}")

    # Показываем всех врачей для контроля
    print(f"\n📋 СПИСОК ВСЕХ ВРАЧЕЙ:")
    doctors_cursor = db.doctors.find({}, {'full_name': 1, 'payment_type': 1, 'payment_value': 1, 'hybrid_percentage_value': 1})
    doctors = await doctors_cursor.to_list(length=None)
    for doc in doctors:
        if doc.get('payment_type') == 'hybrid':
            print(f"  🔗 {doc['full_name']} - {doc.get('payment_value', 0)}₸ + {doc.get('hybrid_percentage_value', 0)}%")
        else:
            print(f"  📋 {doc['full_name']} - {doc.get('payment_type', 'unknown')}")

if __name__ == '__main__':
    asyncio.run(main())
