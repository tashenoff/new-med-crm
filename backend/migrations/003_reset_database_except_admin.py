#!/usr/bin/env python3
"""
Миграция 003: Очистка базы данных кроме администратора и создание новых тестовых данных
"""

import asyncio
import sys
import os
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import uuid

# Получаем настройки из переменных окружения
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'medcenter')

async def check_collections():
    """Проверяет какие коллекции существуют в базе данных"""
    print("🔍 Проверяем существующие коллекции...")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        collections = await db.list_collection_names()
        print(f"📋 Найдено коллекций: {len(collections)}")
        
        for collection in sorted(collections):
            count = await db[collection].count_documents({})
            print(f"   📁 {collection}: {count} записей")
        
        return collections
        
    except Exception as e:
        print(f"❌ Ошибка при проверке коллекций: {str(e)}")
        return []
    finally:
        client.close()

async def clear_collections_except_admin():
    """Очищает все коллекции кроме администратора"""
    print("🗑️ Очищаем коллекции (кроме администратора)...")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        # Сохраняем администратора
        admin_user = await db.users.find_one({"email": "admin@medcenter.com"})
        if not admin_user:
            print("⚠️ Администратор не найден! Создадим нового...")
            admin_user = None
        else:
            print(f"✅ Администратор найден: {admin_user.get('full_name', 'Admin')}")
        
        # Коллекции для очистки (не удаляем users полностью)
        collections_to_clear = [
            'doctors', 'patients', 'appointments', 'treatment_plans',
            'service_prices', 'specialties', 'payment_types',
            'crm_clients', 'crm_leads', 'crm_deals', 'crm_sources', 'crm_managers',
            'documents', 'services', 'doctor_schedules'
        ]
        
        cleared_count = 0
        for collection_name in collections_to_clear:
            if collection_name in await db.list_collection_names():
                result = await db[collection_name].delete_many({})
                if result.deleted_count > 0:
                    print(f"   🗑️ {collection_name}: удалено {result.deleted_count} записей")
                    cleared_count += result.deleted_count
        
        # Очищаем всех пользователей кроме администратора
        non_admin_users = await db.users.delete_many({
            "email": {"$ne": "admin@medcenter.com"}
        })
        if non_admin_users.deleted_count > 0:
            print(f"   🗑️ users (кроме админа): удалено {non_admin_users.deleted_count} записей")
            cleared_count += non_admin_users.deleted_count
        
        # Восстанавливаем администратора если его не было
        if not admin_user:
            from passlib.context import CryptContext
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            
            admin_user = {
                "id": str(uuid.uuid4()),
                "full_name": "Администратор",
                "email": "admin@medcenter.com",
                "password": pwd_context.hash("admin123"),
                "role": "admin",
                "is_active": True,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            await db.users.insert_one(admin_user)
            print("   ✅ Создан новый администратор")
        
        print(f"✅ Очистка завершена. Удалено записей: {cleared_count}")
        return cleared_count
        
    except Exception as e:
        print(f"❌ Ошибка при очистке: {str(e)}")
        return 0
    finally:
        client.close()

async def create_fresh_test_data():
    """Создает новые чистые тестовые данные"""
    print("🆕 Создаем новые тестовые данные...")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        created_count = 0
        
        # 1. Создаем специальности
        print("   🏥 Создаем специальности...")
        specialties = [
            {"id": str(uuid.uuid4()), "name": "Терапевт", "description": "Врач общей практики", "is_active": True, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "name": "Хирург", "description": "Специалист по хирургическим операциям", "is_active": True, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "name": "Стоматолог", "description": "Специалист по лечению зубов", "is_active": True, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "name": "Кардиолог", "description": "Специалист по сердечно-сосудистым заболеваниям", "is_active": True, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()}
        ]
        await db.specialties.insert_many(specialties)
        created_count += len(specialties)
        print(f"      ✅ Создано специальностей: {len(specialties)}")
        
        # 2. Создаем услуги (ценовая политика)
        print("   💰 Создаем услуги...")
        services = [
            {"id": str(uuid.uuid4()), "service_name": "Первичный осмотр", "service_code": "EXAM001", "category": "Терапевт", "price": 3000.0, "unit": "процедура", "description": "Первичный осмотр пациента", "is_active": True, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "service_name": "Повторный осмотр", "service_code": "EXAM002", "category": "Терапевт", "price": 2000.0, "unit": "процедура", "description": "Повторный осмотр пациента", "is_active": True, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "service_name": "Хирургическая операция", "service_code": "SURG001", "category": "Хирург", "price": 50000.0, "unit": "операция", "description": "Хирургическое вмешательство", "is_active": True, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "service_name": "Лечение кариеса", "service_code": "DENT001", "category": "Стоматолог", "price": 15000.0, "unit": "зуб", "description": "Лечение кариеса одного зуба", "is_active": True, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "service_name": "Чистка зубов", "service_code": "DENT002", "category": "Стоматолог", "price": 8000.0, "unit": "процедура", "description": "Профессиональная чистка зубов", "is_active": True, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "service_name": "ЭКГ", "service_code": "CARD001", "category": "Кардиолог", "price": 2500.0, "unit": "процедура", "description": "Электрокардиограмма", "is_active": True, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()}
        ]
        await db.service_prices.insert_many(services)
        created_count += len(services)
        print(f"      ✅ Создано услуг: {len(services)}")
        
        # 3. Создаем врачей с услугами
        print("   👨‍⚕️ Создаем врачей...")
        doctors = [
            {
                "id": str(uuid.uuid4()), 
                "full_name": "Иванов Иван Иванович", 
                "specialty": "Терапевт", 
                "phone": "+7-777-123-4567", 
                "calendar_color": "#3B82F6", 
                "is_active": True, 
                "payment_type": "percentage", 
                "payment_value": 40.0, 
                "currency": "KZT",
                "services": [services[0]["id"], services[1]["id"]], # Терапевтические услуги
                "created_at": datetime.utcnow(), 
                "updated_at": datetime.utcnow()
            },
            {
                "id": str(uuid.uuid4()), 
                "full_name": "Петров Петр Петрович", 
                "specialty": "Хирург", 
                "phone": "+7-777-234-5678", 
                "calendar_color": "#EF4444", 
                "is_active": True, 
                "payment_type": "percentage", 
                "payment_value": 30.0, 
                "currency": "KZT",
                "services": [services[2]["id"]], # Хирургические услуги
                "created_at": datetime.utcnow(), 
                "updated_at": datetime.utcnow()
            },
            {
                "id": str(uuid.uuid4()), 
                "full_name": "Сидорова Анна Владимировна", 
                "specialty": "Стоматолог", 
                "phone": "+7-777-345-6789", 
                "calendar_color": "#10B981", 
                "is_active": True, 
                "payment_type": "fixed", 
                "payment_value": 200000.0, 
                "currency": "KZT",
                "services": [services[3]["id"], services[4]["id"]], # Стоматологические услуги
                "created_at": datetime.utcnow(), 
                "updated_at": datetime.utcnow()
            },
            {
                "id": str(uuid.uuid4()), 
                "full_name": "Козлов Михаил Сергеевич", 
                "specialty": "Кардиолог", 
                "phone": "+7-777-456-7890", 
                "calendar_color": "#8B5CF6", 
                "is_active": True, 
                "payment_type": "percentage", 
                "payment_value": 45.0, 
                "currency": "KZT",
                "services": [services[5]["id"]], # Кардиологические услуги
                "created_at": datetime.utcnow(), 
                "updated_at": datetime.utcnow()
            }
        ]
        await db.doctors.insert_many(doctors)
        created_count += len(doctors)
        print(f"      ✅ Создано врачей: {len(doctors)}")
        
        # 4. Создаем пациентов
        print("   👥 Создаем пациентов...")
        patients = [
            {"id": str(uuid.uuid4()), "full_name": "Алексеев Алексей Алексеевич", "phone": "+7-701-111-2222", "iin": "123456789012", "birth_date": "1985-03-15", "gender": "male", "source": "walk_in", "notes": "Регулярный пациент", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "full_name": "Николаева Ольга Петровна", "phone": "+7-701-222-3333", "iin": "234567890123", "birth_date": "1992-07-22", "gender": "female", "source": "referral", "notes": "Направлена кардиологом", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "full_name": "Смирнов Дмитрий Викторович", "phone": "+7-701-333-4444", "iin": "345678901234", "birth_date": "1978-11-05", "gender": "male", "source": "online", "notes": "Записался через сайт", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "full_name": "Федорова Мария Ивановна", "phone": "+7-701-444-5555", "iin": "456789012345", "birth_date": "1990-01-18", "gender": "female", "source": "walk_in", "notes": "Первичное обращение", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()}
        ]
        await db.patients.insert_many(patients)
        created_count += len(patients)
        print(f"      ✅ Создано пациентов: {len(patients)}")
        
        # 5. Создаем записи на прием
        print("   📅 Создаем записи на прием...")
        appointments = [
            # Завершенные записи для демонстрации зарплат
            {"id": str(uuid.uuid4()), "patient_id": patients[0]["id"], "doctor_id": doctors[0]["id"], "appointment_date": "2025-09-10", "appointment_time": "10:00", "price": 3000.0, "status": "completed", "reason": "Плановый осмотр", "notes": "Осмотр прошел успешно", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "patient_id": patients[1]["id"], "doctor_id": doctors[2]["id"], "appointment_date": "2025-09-09", "appointment_time": "14:30", "price": 15000.0, "status": "completed", "reason": "Лечение кариеса", "notes": "Лечение завершено", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "patient_id": patients[2]["id"], "doctor_id": doctors[1]["id"], "appointment_date": "2025-09-08", "appointment_time": "09:00", "price": 50000.0, "status": "completed", "reason": "Хирургическая операция", "notes": "Операция прошла успешно", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            
            # Будущие записи
            {"id": str(uuid.uuid4()), "patient_id": patients[3]["id"], "doctor_id": doctors[3]["id"], "appointment_date": "2025-09-15", "appointment_time": "11:00", "price": 2500.0, "status": "confirmed", "reason": "ЭКГ", "notes": "Плановое обследование", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "patient_id": patients[0]["id"], "doctor_id": doctors[0]["id"], "appointment_date": "2025-09-20", "appointment_time": "15:30", "price": 2000.0, "status": "confirmed", "reason": "Повторный осмотр", "notes": "Контрольный осмотр", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()}
        ]
        await db.appointments.insert_many(appointments)
        created_count += len(appointments)
        print(f"      ✅ Создано записей: {len(appointments)}")
        
        # 6. Создаем планы лечения
        print("   📋 Создаем планы лечения...")
        treatment_plans = [
            {
                "id": str(uuid.uuid4()),
                "patient_id": patients[0]["id"],
                "title": "Комплексное лечение",
                "description": "План комплексного лечения для пациента",
                "services": [
                    {"service_id": services[0]["id"], "service_name": services[0]["service_name"], "price": 3000.0, "quantity": 1, "discount": 0},
                    {"service_id": services[1]["id"], "service_name": services[1]["service_name"], "price": 2000.0, "quantity": 2, "discount": 10}
                ],
                "total_cost": 6800.0,
                "status": "approved",
                "created_by": "admin",
                "created_by_name": "Администратор",
                "payment_status": "paid",
                "paid_amount": 6800.0,
                "payment_date": datetime.utcnow() - timedelta(days=2),
                "execution_status": "completed",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            },
            {
                "id": str(uuid.uuid4()),
                "patient_id": patients[1]["id"],
                "title": "Стоматологическое лечение",
                "description": "Лечение и профилактика зубов",
                "services": [
                    {"service_id": services[3]["id"], "service_name": services[3]["service_name"], "price": 15000.0, "quantity": 2, "discount": 0},
                    {"service_id": services[4]["id"], "service_name": services[4]["service_name"], "price": 8000.0, "quantity": 1, "discount": 0}
                ],
                "total_cost": 38000.0,
                "status": "approved",
                "created_by": "admin",
                "created_by_name": "Администратор",
                "payment_status": "paid",
                "paid_amount": 38000.0,
                "payment_date": datetime.utcnow() - timedelta(days=1),
                "execution_status": "in_progress",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
        ]
        await db.treatment_plans.insert_many(treatment_plans)
        created_count += len(treatment_plans)
        print(f"      ✅ Создано планов лечения: {len(treatment_plans)}")
        
        # 7. Создаем источники CRM
        print("   📞 Создаем источники CRM...")
        crm_sources = [
            {"id": str(uuid.uuid4()), "name": "Сайт", "description": "Заявки с официального сайта", "is_active": True, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "name": "Телефон", "description": "Звонки клиентов", "is_active": True, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "name": "Реклама", "description": "Рекламные кампании", "is_active": True, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"id": str(uuid.uuid4()), "name": "Рекомендации", "description": "Рекомендации клиентов", "is_active": True, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()}
        ]
        await db.crm_sources.insert_many(crm_sources)
        created_count += len(crm_sources)
        print(f"      ✅ Создано источников: {len(crm_sources)}")
        
        print(f"✅ Создание тестовых данных завершено. Создано записей: {created_count}")
        return created_count
        
    except Exception as e:
        print(f"❌ Ошибка при создании данных: {str(e)}")
        return 0
    finally:
        client.close()

async def create_migration_log():
    """Создает запись о выполненной миграции"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        migration_record = {
            "migration_id": "003_reset_database_except_admin",
            "description": "Полная очистка БД кроме администратора и создание новых тестовых данных",
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
    print("=" * 80)
    print("🚀 МИГРАЦИЯ 003: Полная очистка и создание новых данных")
    print("=" * 80)
    
    try:
        # Проверяем коллекции
        collections = await check_collections()
        
        # Подтверждение пользователя
        print("\n⚠️  ВНИМАНИЕ: Эта операция удалит ВСЕ данные кроме администратора!")
        response = input("   Продолжить? (yes/NO): ").strip().lower()
        if response not in ['yes', 'y']:
            print("❌ Операция отменена")
            return
        
        # Очищаем данные
        cleared_count = await clear_collections_except_admin()
        
        # Создаем новые данные
        created_count = await create_fresh_test_data()
        
        # Создаем запись о миграции
        await create_migration_log()
        
        print("=" * 80)
        print("✅ МИГРАЦИЯ ЗАВЕРШЕНА УСПЕШНО!")
        print(f"   🗑️  Удалено записей: {cleared_count}")
        print(f"   🆕 Создано новых записей: {created_count}")
        print("   👨‍💼 Администратор сохранен: admin@medcenter.com / admin123")
        print("=" * 80)
        
    except Exception as e:
        print(f"❌ Критическая ошибка миграции: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())

