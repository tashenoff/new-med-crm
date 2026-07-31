"""
Скрипт для полной проверки цепочки: расписание -> врач -> отображение
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import json

load_dotenv('backend/.env')

async def verify_calendar_data():
    MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017/clinic")
    DB_NAME = os.environ.get('DB_NAME', 'clinic')
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("🔍 ПОЛНАЯ ПРОВЕРКА ДАННЫХ ДЛЯ КАЛЕНДАРЯ\n")
    print("="*70)
    
    # 1. Проверяем расписание кабинета 3
    print("\n📋 ШАГ 1: Проверка расписания 'Кабинет 3'")
    room = await db.rooms.find_one({"name": "Кабинет 3", "is_active": True})
    if not room:
        print("❌ Кабинет 3 не найден!")
        client.close()
        return
    
    room_id = room['id']
    print(f"✅ Кабинет найден: {room['name']} (ID: {room_id})")
    
    schedules = await db.room_schedules.find({
        "room_id": room_id,
        "is_active": True
    }).to_list(100)
    
    print(f"   Расписаний: {len(schedules)}")
    
    if len(schedules) == 0:
        print("❌ НЕТ РАСПИСАНИЙ! Слоты не могут отображаться.")
        client.close()
        return
    
    doctor_ids_in_schedule = []
    for schedule in schedules:
        doctor_id = schedule.get('doctor_id')
        doctor_ids_in_schedule.append(doctor_id)
        print(f"   - День: {schedule.get('day_of_week')}, Время: {schedule.get('start_time')}-{schedule.get('end_time')}")
        print(f"     doctor_id: {doctor_id}")
    
    # 2. Проверяем что врачи существуют
    print("\n👨‍⚕️ ШАГ 2: Проверка существования врачей")
    for doctor_id in doctor_ids_in_schedule:
        doctor = await db.doctors.find_one({"id": doctor_id, "is_active": True})
        if doctor:
            print(f"✅ Врач найден: ID={doctor_id}")
            print(f"   Имя: {doctor.get('first_name')} {doctor.get('last_name')}")
            print(f"   Специальность: {doctor.get('specialty')}")
        else:
            print(f"❌ ВРАЧ НЕ НАЙДЕН: ID={doctor_id}")
            print(f"   ⚠️ ЭТО ПРОБЛЕМА! Слот не отобразится без врача!")
    
    # 3. Симулируем что делает API /api/rooms-with-schedule
    print("\n🌐 ШАГ 3: Симуляция API /api/rooms-with-schedule")
   
    # Получаем комнату с расписанием как это делает эндпоинт
    room_with_schedule = {
        "id": room['id'],
        "name": room['name'],
        "is_active": room['is_active'],
        "schedule": []
    }
    
    for schedule in schedules:
        room_with_schedule['schedule'].append({
            "id": schedule.get('id'),
            "day_of_week": schedule.get('day_of_week'),
            "start_time": schedule.get('start_time'),
            "end_time": schedule.get('end_time'),
            "doctor_id": schedule.get('doctor_id'),
            "is_active": schedule.get('is_active')
        })
    
    print(f"✅ API вернет кабинет с {len(room_with_schedule['schedule'])} расписаниями")
    print(json.dumps(room_with_schedule, indent=2, ensure_ascii=False))
    
    # 4. Проверяем что API /api/doctors вернет врачей
    print("\n👥 ШАГ 4: Проверка API /api/doctors")
    all_doctors = await db.doctors.find({"is_active": True}).to_list(100)
    print(f"✅ API /api/doctors вернет {len(all_doctors)} врачей")
    
    for doctor_id in doctor_ids_in_schedule:
        found = any(d.get('id') == doctor_id for d in all_doctors)
        if found:
            print(f"✅ Врач {doctor_id} есть в списке /api/doctors")
        else:
            print(f"❌ Врач {doctor_id} ОТСУТСТВУЕТ в списке /api/doctors!")
    
    # 5. Симулируем поиск врача на фронтенде
    print("\n🎨 ШАГ 5: Симуляция логики фронтенда")
    print("Код фронтенда:")
    print("  const availableDoctor = doctors.find(doctor => doctor.id === activeSchedule.doctor_id);")
    print()
    
    for schedule in schedules:
        doctor_id = schedule.get('doctor_id')
        # Симулируем поиск как на фронтенде
        found_doctor = next((d for d in all_doctors if d.get('id') == doctor_id), None)
        
        if found_doctor:
            print(f"✅ Фронтенд НАЙДЕТ врача для расписания:")
            print(f"   doctor_id в расписании: {doctor_id}")
            print(f"   Найденный врач: {found_doctor.get('first_name')} {found_doctor.get('last_name')}")
            print(f"   → СЛОТ ОТОБРАЗИТСЯ! ✨")
        else:
            print(f"❌ Фронтенд НЕ НАЙДЕТ врача для расписания:")
            print(f"   doctor_id в расписании: {doctor_id}")
            print(f"   → СЛОТ НЕ ОТОБРАЗИТСЯ! ⚠️")
    
    # 6. Итоговый вердикт
    print("\n" + "="*70)
    print("📊 ИТОГОВЫЙ ВЕРДИКТ:")
    
    all_ok = True
    for schedule in schedules:
        doctor_id = schedule.get('doctor_id')
        doctor_exists = any(d.get('id') == doctor_id for d in all_doctors)
        if not doctor_exists:
            all_ok = False
            break
    
    if all_ok:
        print("✅ ВСЕ В ПОРЯДКЕ!")
        print("   Все врачи из расписания существуют в системе.")
        print("   Слоты должны отображаться в календаре.")
        print()
        print("💡 Если слоты все еще не видны:")
        print("   1. Обновите страницу (Ctrl+R или F5)")
        print("   2. Очистите кэш браузера (Ctrl+Shift+Delete)")
        print("   3. Проверьте консоль браузера (F12) на ошибки")
    else:
        print("❌ ПРОБЛЕМА ОБНАРУЖЕНА!")
        print("   Врач из расписания отсутствует в списке врачей.")
        print("   Слоты НЕ БУДУТ отображаться пока проблема не решена.")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(verify_calendar_data())
