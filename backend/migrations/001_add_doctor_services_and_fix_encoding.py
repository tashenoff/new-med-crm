#!/usr/bin/env python3
"""
Миграция 001: Добавление поля services к врачам и исправление кодировки
"""

import asyncio
import sys
import os
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient

# Получаем настройки из переменных окружения
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'medcenter')

async def migrate_doctors_add_services():
    """Добавляет поле services ко всем существующим врачам"""
    print("🔧 Начинаем миграцию врачей...")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        # Получаем всех врачей без поля services
        doctors_without_services = await db.doctors.find({
            "services": {"$exists": False}
        }).to_list(None)
        
        print(f"📋 Найдено врачей без поля services: {len(doctors_without_services)}")
        
        updated_count = 0
        for doctor in doctors_without_services:
            # Добавляем пустой массив services
            await db.doctors.update_one(
                {"id": doctor["id"]},
                {
                    "$set": {
                        "services": [],
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            updated_count += 1
            print(f"   ✅ Обновлен врач: {doctor.get('full_name', 'Неизвестно')} (ID: {doctor['id']})")
        
        print(f"✅ Миграция врачей завершена. Обновлено: {updated_count} записей")
        return updated_count
        
    except Exception as e:
        print(f"❌ Ошибка при миграции врачей: {str(e)}")
        return 0
    finally:
        client.close()

async def fix_encoding_issues():
    """Исправляет проблемы с кодировкой в базе данных"""
    print("🔧 Исправляем проблемы с кодировкой...")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        # Словарь для исправления известных проблем с кодировкой
        encoding_fixes = {
            # Врачи
            "ÐÑÐ°Ñ 1": "Врач 1",
            "ÑÑÑ": "тест",
            "ÑÐµÑÐ°Ð¿ÐµÐ²Ñ": "терапевт", 
            "ÑÐ¸ÑÑÑÐ³": "хирург",
            "??????????": "стоматолог",
            
            # Специальности
            "ÑÐµÑÐ°Ð¿ÐµÐ²Ñ": "терапевт",
            "ÑÐ¸ÑÑÑÐ³": "хирург",
            "Ð¢ÐµÑÐ°Ð¿ÐµÐ²Ñ": "Терапевт",
            
            # Услуги
            "ÐÐµÑÐ²Ð¸ÑÐ½ÑÐ¹ Ð¾ÑÐ¼Ð¾ÑÑ": "Первичный осмотр",
            "Ð¥Ð¸ÑÑÑÐ³Ð¸Ñ": "Хирургия", 
            "Ð»ÐµÑÐµÐ½Ð¸Ðµ Ð¿ÐµÑÐµÐ½Ð¸": "лечение печени",
            "ÑÐµÑÑ": "тест",
            
            # Пациенты
            "ÐÐ»ÐµÐºÑ": "Алекс",
            "ÐÐ°Ð³Ð¸ÐµÐ² ÐÐ¼Ð¸ÑÑÐ¸Ð¹": "Нагиев Дмитрий",
            "ÐÐ¸ÑÐ°Ð»ÐºÐ¾Ð² ÐÐ¸ÐºÐ¸ÑÐ°": "Виталков Никита",
            "ÑÐµÑÑ Ð¸Ð½ÑÑÐ° 2": "тест инста 2",
            "ÑÐµÑÑ insta": "тест insta"
        }
        
        total_fixed = 0
        
        # Исправляем врачей
        print("   📋 Исправляем имена врачей...")
        doctors = await db.doctors.find({}).to_list(None)
        for doctor in doctors:
            updates = {}
            
            if doctor.get("full_name") in encoding_fixes:
                updates["full_name"] = encoding_fixes[doctor["full_name"]]
                
            if doctor.get("specialty") in encoding_fixes:
                updates["specialty"] = encoding_fixes[doctor["specialty"]]
            
            if updates:
                updates["updated_at"] = datetime.utcnow()
                await db.doctors.update_one(
                    {"id": doctor["id"]}, 
                    {"$set": updates}
                )
                print(f"      ✅ Врач: {doctor.get('full_name')} → {updates.get('full_name', doctor.get('full_name'))}")
                total_fixed += 1
        
        # Исправляем пациентов
        print("   👥 Исправляем имена пациентов...")
        patients = await db.patients.find({}).to_list(None)
        for patient in patients:
            updates = {}
            
            if patient.get("full_name") in encoding_fixes:
                updates["full_name"] = encoding_fixes[patient["full_name"]]
            
            if updates:
                updates["updated_at"] = datetime.utcnow()
                await db.patients.update_one(
                    {"id": patient["id"]}, 
                    {"$set": updates}
                )
                print(f"      ✅ Пациент: {patient.get('full_name')} → {updates.get('full_name')}")
                total_fixed += 1
        
        # Исправляем услуги (service_prices)
        print("   💰 Исправляем названия услуг...")
        service_prices = await db.service_prices.find({}).to_list(None)
        for service in service_prices:
            updates = {}
            
            if service.get("service_name") in encoding_fixes:
                updates["service_name"] = encoding_fixes[service["service_name"]]
                
            if service.get("category") in encoding_fixes:
                updates["category"] = encoding_fixes[service["category"]]
            
            if updates:
                updates["updated_at"] = datetime.utcnow()
                await db.service_prices.update_one(
                    {"id": service["id"]}, 
                    {"$set": updates}
                )
                print(f"      ✅ Услуга: {service.get('service_name')} → {updates.get('service_name', service.get('service_name'))}")
                total_fixed += 1
        
        # Исправляем специальности
        print("   🏥 Исправляем специальности...")
        specialties = await db.specialties.find({}).to_list(None)
        for specialty in specialties:
            updates = {}
            
            if specialty.get("name") in encoding_fixes:
                updates["name"] = encoding_fixes[specialty["name"]]
            
            if updates:
                updates["updated_at"] = datetime.utcnow()
                await db.specialties.update_one(
                    {"id": specialty["id"]}, 
                    {"$set": updates}
                )
                print(f"      ✅ Специальность: {specialty.get('name')} → {updates.get('name')}")
                total_fixed += 1
        
        print(f"✅ Исправление кодировки завершено. Обновлено записей: {total_fixed}")
        return total_fixed
        
    except Exception as e:
        print(f"❌ Ошибка при исправлении кодировки: {str(e)}")
        return 0
    finally:
        client.close()

async def create_migration_log():
    """Создает запись о выполненной миграции"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        migration_record = {
            "migration_id": "001_add_doctor_services_and_fix_encoding",
            "description": "Добавление поля services к врачам и исправление кодировки",
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
    print("🚀 МИГРАЦИЯ 001: Добавление услуг врачам и исправление кодировки")
    print("=" * 60)
    
    try:
        # Проверяем, не выполнялась ли уже эта миграция
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        
        existing_migration = await db.migrations.find_one({
            "migration_id": "001_add_doctor_services_and_fix_encoding"
        })
        
        if existing_migration:
            print("⚠️ Миграция уже выполнялась ранее.")
            print(f"   Дата выполнения: {existing_migration.get('executed_at')}")
            
            # Спрашиваем, хотим ли мы выполнить повторно
            response = input("   Выполнить повторно? (y/N): ").strip().lower()
            if response != 'y':
                print("❌ Миграция отменена")
                return
        
        client.close()
        
        # Выполняем миграции
        doctors_updated = await migrate_doctors_add_services()
        encoding_fixed = await fix_encoding_issues()
        
        # Создаем запись о миграции
        await create_migration_log()
        
        print("=" * 60)
        print("✅ МИГРАЦИЯ ЗАВЕРШЕНА УСПЕШНО!")
        print(f"   📋 Врачей обновлено: {doctors_updated}")
        print(f"   🔤 Записей с исправленной кодировкой: {encoding_fixed}")
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ Критическая ошибка миграции: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
