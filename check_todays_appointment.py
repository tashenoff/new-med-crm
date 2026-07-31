"""
Проверка записи на 18.07.2026
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')

MONGODB_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'medcrm')

async def check_appointment():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DB_NAME]
    
    print("\n" + "="*80)
    print("🔍 ПРОВЕРКА ЗАПИСИ НА 18.07.2026")
    print("="*80 + "\n")
    
    # ID врача ввврач
    correct_doctor_id = "4694d01a-199b-49a0-bb4d-27753dccb3f6"
    
    # 1. Ищем запись на 18.07.2026
    print("1️⃣ Ищем запись на 2026-07-18...")
    appointment = await db.appointments.find_one({
        "appointment_date": "2026-07-18",
        "appointment_time": "09:00"
    })
    
    if appointment:
        print("✅ Найдена запись:")
        print(f"   ID записи: {appointment.get('id')}")
        print(f"   doctor_id: {appointment.get('doctor_id')}")
        print(f"   Время: {appointment.get('appointment_time')} - {appointment.get('end_time')}")
        print(f"   Пациент: {appointment.get('patient_id')}")
        
        # Проверяем совпадает ли
        if str(appointment.get('doctor_id')) == str(correct_doctor_id):
            print(f"\n   ✅ ПРАВИЛЬНО! doctor_id совпадает с врачом ввврач")
        else:
            print(f"\n   ❌ ОШИБКА! doctor_id НЕ совпадает!")
            print(f"      Ожидали: {correct_doctor_id}")
            print(f"      Получили: {appointment.get('doctor_id')}")
            
            # Находим какой это врач
            wrong_doctor = await db.doctors.find_one({"id": appointment.get('doctor_id')})
            if wrong_doctor:
                print(f"      Это врач: {wrong_doctor.get('full_name')} ({wrong_doctor.get('specialty')})")
            
            print(f"\n   💡 РЕШЕНИЕ: Запись сохранена для неправильного врача!")
            print(f"      При создании/редактировании вы выбрали не того врача в выпадающем списке.")
    else:
        print("❌ Запись на 2026-07-18 09:00 не найдена")
        
        # Ищем все записи на эту дату
        all_today = await db.appointments.find({"appointment_date": "2026-07-18"}).to_list(length=None)
        print(f"\n   Всего записей на 18.07.2026: {len(all_today)}")
        for apt in all_today:
            print(f"   - {apt.get('appointment_time')}: doctor_id={apt.get('doctor_id')}")
    
    print("\n" + "="*80)
    client.close()

if __name__ == "__main__":
    asyncio.run(check_appointment())
