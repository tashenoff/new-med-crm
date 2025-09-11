#!/usr/bin/env python3
"""
Миграция 002: Принудительное исправление кодировки в базе данных
"""

import asyncio
import sys
import os
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient

# Получаем настройки из переменных окружения
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'medcenter')

async def force_fix_encoding():
    """Принудительно исправляет кодировку во всех коллекциях"""
    print("🔧 Принудительное исправление кодировки...")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        total_fixed = 0
        
        # Исправления для врачей
        print("   👨‍⚕️ Исправляем врачей...")
        doctors_fixes = [
            {"old": "ÐÑÐ°Ñ 1", "new": "Врач 1"},
            {"old": "ÑÑÑ", "new": "тест"}, 
            {"old": "Ð¡ÑÐ¾Ð¼Ð°ÑÐ¾Ð»Ð¾Ð³", "new": "Стоматолог"},
            {"old": "??????????", "new": "стоматолог"},
            {"old": "ÑÐµÑÐ°Ð¿ÐµÐ²Ñ", "new": "терапевт"},
            {"old": "ÑÐ¸ÑÑÑÐ³", "new": "хирург"}
        ]
        
        for fix in doctors_fixes:
            # Исправляем имена врачей
            result = await db.doctors.update_many(
                {"full_name": fix["old"]},
                {"$set": {"full_name": fix["new"], "updated_at": datetime.utcnow()}}
            )
            if result.modified_count > 0:
                print(f"      ✅ Имя врача: '{fix['old']}' → '{fix['new']}' ({result.modified_count} записей)")
                total_fixed += result.modified_count
            
            # Исправляем специальности врачей
            result = await db.doctors.update_many(
                {"specialty": fix["old"]},
                {"$set": {"specialty": fix["new"], "updated_at": datetime.utcnow()}}
            )
            if result.modified_count > 0:
                print(f"      ✅ Специальность врача: '{fix['old']}' → '{fix['new']}' ({result.modified_count} записей)")
                total_fixed += result.modified_count
        
        # Исправления для пациентов
        print("   👥 Исправляем пациентов...")
        patients_fixes = [
            {"old": "ÐÐ»ÐµÐºÑ", "new": "Алекс"},
            {"old": "ÐÐ°Ð³Ð¸ÐµÐ² ÐÐ¼Ð¸ÑÑÐ¸Ð¹", "new": "Нагиев Дмитрий"},
            {"old": "ÐÐ¸ÑÐ°Ð»ÐºÐ¾Ð² ÐÐ¸ÐºÐ¸ÑÐ°", "new": "Виталков Никита"},
            {"old": "ÑÐµÑÑ Ð¸Ð½ÑÑÐ° 2", "new": "тест инста 2"},
            {"old": "ÑÐµÑÑ insta", "new": "тест insta"}
        ]
        
        for fix in patients_fixes:
            result = await db.patients.update_many(
                {"full_name": fix["old"]},
                {"$set": {"full_name": fix["new"], "updated_at": datetime.utcnow()}}
            )
            if result.modified_count > 0:
                print(f"      ✅ Пациент: '{fix['old']}' → '{fix['new']}' ({result.modified_count} записей)")
                total_fixed += result.modified_count
        
        # Исправления для услуг (service_prices)
        print("   💰 Исправляем услуги...")
        services_fixes = [
            {"old": "ÐÐµÑÐ²Ð¸ÑÐ½ÑÐ¹ Ð¾ÑÐ¼Ð¾ÑÑ", "new": "Первичный осмотр"},
            {"old": "Ð¥Ð¸ÑÑÑÐ³Ð¸Ñ", "new": "Хирургия"},
            {"old": "Ð»ÐµÑÐµÐ½Ð¸Ðµ Ð¿ÐµÑÐµÐ½Ð¸", "new": "лечение печени"},
            {"old": "ÑÐµÑÑ", "new": "тест"},
            {"old": "Ð¢ÐµÑÐ°Ð¿ÐµÐ²Ñ", "new": "Терапевт"}
        ]
        
        for fix in services_fixes:
            # Исправляем названия услуг
            result = await db.service_prices.update_many(
                {"service_name": fix["old"]},
                {"$set": {"service_name": fix["new"], "updated_at": datetime.utcnow()}}
            )
            if result.modified_count > 0:
                print(f"      ✅ Услуга: '{fix['old']}' → '{fix['new']}' ({result.modified_count} записей)")
                total_fixed += result.modified_count
            
            # Исправляем категории услуг
            result = await db.service_prices.update_many(
                {"category": fix["old"]},
                {"$set": {"category": fix["new"], "updated_at": datetime.utcnow()}}
            )
            if result.modified_count > 0:
                print(f"      ✅ Категория услуги: '{fix['old']}' → '{fix['new']}' ({result.modified_count} записей)")
                total_fixed += result.modified_count
        
        # Исправления для специальностей
        print("   🏥 Исправляем специальности...")
        specialties_fixes = [
            {"old": "ÑÐµÑÐ°Ð¿ÐµÐ²Ñ", "new": "терапевт"},
            {"old": "ÑÐ¸ÑÑÑÐ³", "new": "хирург"},
            {"old": "Ð¢ÐµÑÐ°Ð¿ÐµÐ²Ñ", "new": "Терапевт"},
            {"old": "??????????", "new": "стоматолог"}
        ]
        
        for fix in specialties_fixes:
            result = await db.specialties.update_many(
                {"name": fix["old"]},
                {"$set": {"name": fix["new"], "updated_at": datetime.utcnow()}}
            )
            if result.modified_count > 0:
                print(f"      ✅ Специальность: '{fix['old']}' → '{fix['new']}' ({result.modified_count} записей)")
                total_fixed += result.modified_count
        
        print(f"✅ Принудительное исправление кодировки завершено. Исправлено записей: {total_fixed}")
        return total_fixed
        
    except Exception as e:
        print(f"❌ Ошибка при исправлении кодировки: {str(e)}")
        return 0
    finally:
        client.close()

async def add_services_to_doctors():
    """Убеждаемся что у всех врачей есть поле services"""
    print("🔧 Проверяем поле services у врачей...")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        # Находим врачей без поля services или с null значением
        doctors_to_update = await db.doctors.find({
            "$or": [
                {"services": {"$exists": False}},
                {"services": None}
            ]
        }).to_list(None)
        
        updated_count = 0
        for doctor in doctors_to_update:
            await db.doctors.update_one(
                {"id": doctor["id"]},
                {"$set": {"services": [], "updated_at": datetime.utcnow()}}
            )
            updated_count += 1
            print(f"   ✅ Добавлено поле services врачу: {doctor.get('full_name', 'Неизвестно')}")
        
        print(f"✅ Поле services добавлено {updated_count} врачам")
        return updated_count
        
    except Exception as e:
        print(f"❌ Ошибка при добавлении поля services: {str(e)}")
        return 0
    finally:
        client.close()

async def create_migration_log():
    """Создает запись о выполненной миграции"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        migration_record = {
            "migration_id": "002_force_fix_encoding",
            "description": "Принудительное исправление кодировки и добавление services",
            "executed_at": datetime.utcnow(),
            "status": "completed"
        }
        
        await db.migrations.insert_one(migration_record)
        print("📝 Запись о миграции сохранена")
        
    except Exception as e:
        print(f"⚠️ Не удалось сохранить запись о миграции: {str(e)}")
    finally:
        client.close()

async def main():
    """Основная функция миграции"""
    print("=" * 60)
    print("🚀 МИГРАЦИЯ 002: Принудительное исправление кодировки")
    print("=" * 60)
    
    try:
        # Исправляем кодировку
        encoding_fixed = await force_fix_encoding()
        
        # Добавляем поле services
        services_added = await add_services_to_doctors()
        
        # Создаем запись о миграции
        await create_migration_log()
        
        print("=" * 60)
        print("✅ МИГРАЦИЯ ЗАВЕРШЕНА УСПЕШНО!")
        print(f"   🔤 Записей с исправленной кодировкой: {encoding_fixed}")
        print(f"   📋 Врачей с добавленным полем services: {services_added}")
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ Критическая ошибка миграции: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())

