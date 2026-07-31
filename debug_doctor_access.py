import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

async def debug_doctor_access():
    client = AsyncIOMotorClient("mongodb://admin:admin123@localhost:27017/?authSource=admin")
    db = client.medcrm
    
    email = "b@mail.ru"
    
    print(f"\n{'='*60}")
    print(f"🔍 Диагностика доступа врача: {email}")
    print(f"{'='*60}\n")
    
    # 1. Проверяем пользователя
    user = await db.users.find_one({"email": email})
    if user:
        print("👤 ПОЛЬЗОВАТЕЛЬ:")
        print(f"   Email: {user.get('email')}")
        print(f"   Role: {user.get('role')}")
        print(f"   doctor_id: {user.get('doctor_id')}")
        print(f"   _id: {user.get('_id')}")
        user_doctor_id = user.get('doctor_id')
    else:
        print(f"❌ Пользователь {email} не найден!")
        return
    
    # 2. Проверяем врача
    print(f"\n{'='*60}")
    print("👨‍⚕️ ВРАЧ В БАЗЕ:")
    
    doctor = await db.doctors.find_one({"email": email})
    if doctor:
        print(f"   ФИО: {doctor.get('full_name')}")
        print(f"   Email: {doctor.get('email')}")
        print(f"   id (string): {doctor.get('id')}")
        print(f"   _id (ObjectId): {doctor.get('_id')}")
        doctor_string_id = doctor.get('id')
        doctor_object_id = str(doctor.get('_id'))
    else:
        print(f"❌ Врач с email {email} не найден!")
        return
    
    # 3. Проверяем записи на прием
    print(f"\n{'='*60}")
    print("📅 ПРИЕМЫ ДЛЯ ЭТОГО ВРАЧА:")
    
    # Проверяем с разными форматами doctor_id
    appointments_by_string_id = await db.appointments.find({"doctor_id": doctor_string_id}).to_list(100)
    appointments_by_object_id = await db.appointments.find({"doctor_id": doctor_object_id}).to_list(100)
    appointments_by_user_doctor_id = await db.appointments.find({"doctor_id": user_doctor_id}).to_list(100)
    
    print(f"\n   По doctor.id ({doctor_string_id}): {len(appointments_by_string_id)} записей")
    print(f"   По str(doctor._id) ({doctor_object_id}): {len(appointments_by_object_id)} записей")
    print(f"   По user.doctor_id ({user_doctor_id}): {len(appointments_by_user_doctor_id)} записей")
    
    # 4. Сравнение ID
    print(f"\n{'='*60}")
    print("🔍 СРАВНЕНИЕ ID:")
    print(f"   user.doctor_id == doctor.id? {user_doctor_id == doctor_string_id}")
    print(f"   user.doctor_id == str(doctor._id)? {user_doctor_id == doctor_object_id}")
    
    # 5. Показываем все приемы для этого врача
    all_appointments = await db.appointments.find({
        "$or": [
            {"doctor_id": doctor_string_id},
            {"doctor_id": doctor_object_id},
            {"doctor_id": user_doctor_id}
        ]
    }).to_list(100)
    
    if all_appointments:
        print(f"\n{'='*60}")
        print(f"📋 НАЙДЕНО {len(all_appointments)} ЗАПИСЕЙ:")
        for apt in all_appointments[:5]:  # показываем первые 5
            print(f"\n   Прием ID: {apt.get('id')}")
            print(f"   Дата: {apt.get('appointment_date')} {apt.get('appointment_time')}")
            print(f"   doctor_id в записи: {apt.get('doctor_id')}")
            print(f"   patient_id: {apt.get('patient_id')}")
            print(f"   Статус: {apt.get('status')}")
    else:
        print("\n❌ Приемы не найдены!")
    
    # 6. Решение
    print(f"\n{'='*60}")
    print("💡 РЕШЕНИЕ:")
    if user_doctor_id != doctor_string_id:
        print(f"\n⚠️  ПРОБЛЕМА НАЙДЕНА!")
        print(f"   user.doctor_id ({user_doctor_id}) не совпадает с doctor.id ({doctor_string_id})")
        print(f"\n   Исправление: обновить user.doctor_id на doctor.id")
        
        # Исправляем
        result = await db.users.update_one(
            {"email": email},
            {"$set": {"doctor_id": doctor_string_id}}
        )
        
        if result.modified_count > 0:
            print(f"\n✅ Исправлено! user.doctor_id обновлен на {doctor_string_id}")
        else:
            print(f"\n❌ Не удалось исправить")
    else:
        print(f"✅ ID совпадают корректно")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(debug_doctor_access())
