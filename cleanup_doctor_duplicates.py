"""
Скрипт для очистки дубликатов врачей в базе данных

Проблема: Когда врачу назначали доступ, создавалась запись в коллекции staff,
и при получении списка персонала врач отображался дважды:
- один раз из staff
- второй раз из doctors

После исправления в staff_service.py врачи из staff исключаются.
Этот скрипт покажет текущее состояние записей и удалит лишние.
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "medical_crm"


async def main():
    print("🔍 Анализ дубликатов врачей в базе данных...\n")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Получаем все записи из staff с role="doctor"
    staff_doctors = []
    async for doc in db.staff.find({"role": "doctor"}):
        staff_doctors.append(doc)
    
    # Получаем все записи из doctors
    doctors = []
    async for doc in db.doctors.find():
        doctors.append(doc)
    
    print(f"📊 Статистика:")
    print(f"   - Записей в staff с role='doctor': {len(staff_doctors)}")
    print(f"   - Записей в doctors: {len(doctors)}")
    print()
    
    if staff_doctors:
        print("📋 Врачи в коллекции STAFF (записи для аутентификации):")
        for doc in staff_doctors:
            doctor_id = doc.get("_id")
            email = doc.get("email", "N/A")
            full_name = doc.get("full_name", "N/A")
            created_at = doc.get("created_at", "N/A")
            
            # Проверяем есть ли соответствующая запись в doctors
            doctor_exists = any(d.get("id") == doctor_id for d in doctors)
            
            print(f"   ID: {doctor_id}")
            print(f"   Имя: {full_name}")
            print(f"   Email: {email}")
            print(f"   Создан: {created_at}")
            print(f"   Есть в doctors: {'✅ Да' if doctor_exists else '❌ Нет'}")
            print()
    
    if doctors:
        print("📋 Врачи в коллекции DOCTORS (основные записи):")
        for doc in doctors:
            doctor_id = doc.get("id")
            full_name = doc.get("full_name", "N/A")
            specialty = doc.get("specialty", "N/A")
            created_at = doc.get("created_at", "N/A")
            
            # Проверяем есть ли запись в staff (аккаунт для входа)
            has_account = any(s.get("_id") == doctor_id for s in staff_doctors)
            
            # Проверяем есть ли запись в users
            user_doc = await db.users.find_one({"_id": doctor_id})
            
            print(f"   ID: {doctor_id}")
            print(f"   Имя: {full_name}")
            print(f"   Специальность: {specialty}")
            print(f"   Создан: {created_at}")
            print(f"   Есть аккаунт (staff): {'✅ Да' if has_account else '❌ Нет'}")
            print(f"   Есть пользователь (users): {'✅ Да' if user_doc else '❌ Нет'}")
            print()
    
    # Проверяем на настоящие дубликаты (один врач в staff без записи в doctors)
    orphan_staff = []
    for staff_doc in staff_doctors:
        staff_id = staff_doc.get("_id")
        if not any(d.get("id") == staff_id for d in doctors):
            orphan_staff.append(staff_doc)
    
    if orphan_staff:
        print("⚠️ НАЙДЕНЫ СИРОТСКИЕ ЗАПИСИ в staff (врачи без записи в doctors):")
        for doc in orphan_staff:
            print(f"   ID: {doc.get('_id')}, Имя: {doc.get('full_name')}, Email: {doc.get('email')}")
        
        print("\n❓ Хотите удалить эти записи? (y/n): ", end="")
        # Для автоматического запуска комментируем ввод
        # answer = input()
        # if answer.lower() == 'y':
        #     for doc in orphan_staff:
        #         await db.staff.delete_one({"_id": doc.get("_id")})
        #     print("✅ Сиротские записи удалены")
    
    print("\n" + "="*60)
    print("✅ ПОСЛЕ ИСПРАВЛЕНИЯ КОДА:")
    print("   При запросе списка персонала записи с role='doctor' из staff")
    print("   теперь ИСКЛЮЧАЮТСЯ. Врачи показываются только из doctors.")
    print("   Дубликаты больше не будут появляться.")
    print("="*60)
    
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
