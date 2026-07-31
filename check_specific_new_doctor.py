"""
Проверка конкретного нового врача
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from datetime import datetime

load_dotenv('backend/.env')

async def check_new_doctor():
    MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017/clinic")
    DB_NAME = os.environ.get('DB_NAME', 'clinic')
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # ID нового врача из вывода
    new_doctor_id = "e218979f-51f8-45bd-8b0c-eeaf6bef3e8f"
    
    print("="*70)
    print(f"🔍 ПРОВЕРКА НОВОГО ВРАЧА: {new_doctor_id}")
    print("="*70)
    
    # 1. Проверяем врача
    doctor = await db.doctors.find_one({"id": new_doctor_id})
    if not doctor:
        print("❌ Врач не найден!")
        client.close()
        return
    
    print("\n✅ ВРАЧ НАЙДЕН:")
    print(f"   Имя: {doctor.get('first_name')} {doctor.get('last_name')}")
    print(f"   Специальность: {doctor.get('specialty')}")
    print(f"   is_active: {doctor.get('is_active')}")
    print(f"   UUID (id): {doctor.get('id')}")
    print(f"   MongoDB (_id): {doctor.get('_id')}")
    
    # 2. Проверяем его личное расписание
    print("\n📅 ЛИЧНОЕ РАСПИСАНИЕ ВРАЧА (doctor_schedules):")
    doctor_schedules = await db.doctor_schedules.find({"doctor_id": new_doctor_id}).to_list(100)
    if len(doctor_schedules) == 0:
        print("   ⚠️  Нет личного расписания")
    else:
        for schedule in doctor_schedules:
            day_names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
            day = day_names[schedule.get('day_of_week')]
            print(f"   {day}: {schedule.get('start_time')}-{schedule.get('end_time')}")
            print(f"      is_active: {schedule.get('is_active')}")
    
    # 3. Проверяем расписания кабинетов с этим врачом
    print("\n🏥 РАСПИСАНИЕ КАБИНЕТОВ (room_schedules):")
    room_schedules = await db.room_schedules.find({"doctor_id": new_doctor_id}).to_list(100)
    if len(room_schedules) == 0:
        print("   ❌ ПРОБЛЕМА! Врач не назначен ни на один кабинет!")
        print("   Нужно добавить врача в расписание кабинета!")
    else:
        for schedule in room_schedules:
            room = await db.rooms.find_one({"id": schedule.get('room_id')})
            room_name = room.get('name') if room else 'Неизвестно'
            day_names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
            day = day_names[schedule.get('day_of_week')]
            
            print(f"   ✅ {room_name}:")
            print(f"      День: {day} ({schedule.get('day_of_week')})")
            print(f"      Время: {schedule.get('start_time')}-{schedule.get('end_time')}")
            print(f"      is_active: {schedule.get('is_active')}")
            print(f"      schedule_id: {schedule.get('id')}")
    
    # 4. Проверяем текущий день
    print("\n📆 ПРОВЕРКА НА СЕГОДНЯ:")
    today = datetime.now()
    # Python: 0=Пн, 5=Сб, 6=Вс
    # MongoDB: 0=Пн, 5=Сб, 6=Вс
    day_of_week = today.weekday()  # Это даст правильный номер дня
    day_names = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
    print(f"   Сегодня: {day_names[day_of_week]} ({today.strftime('%Y-%m-%d')})")
    print(f"   День недели (индекс): {day_of_week}")
    
    # Ищем расписание на сегодня
    today_schedules = await db.room_schedules.find({
        "doctor_id": new_doctor_id,
        "day_of_week": day_of_week,
        "is_active": True
    }).to_list(100)
    
    if len(today_schedules) == 0:
        print(f"   ❌ НЕТ АКТИВНОГО РАСПИСАНИЯ на сегодня (день {day_of_week})")
        
        # Проверим все расписания врача
        all_schedules = await db.room_schedules.find({"doctor_id": new_doctor_id}).to_list(100)
        print(f"\n   Всего расписаний у врача: {len(all_schedules)}")
        for s in all_schedules:
            print(f"      День {s.get('day_of_week')}, is_active={s.get('is_active')}")
    else:
        print(f"   ✅ ЕСТЬ {len(today_schedules)} расписание(й) на сегодня!")
        for schedule in today_schedules:
            room = await db.rooms.find_one({"id": schedule.get('room_id')})
            room_name = room.get('name') if room else 'Неизвестно'
            print(f"      {room_name}: {schedule.get('start_time')}-{schedule.get('end_time')}")
    
    # 5. Итоговый вердикт
    print("\n" + "="*70)
    print("📊 ВЕРДИКТ:")
    
    if not doctor.get('is_active'):
        print("❌ Врач НЕАКТИВЕН (is_active=False)")
        print("   Решение: Активируйте врача в системе")
    elif len(room_schedules) == 0:
        print("❌ Врач НЕ НАЗНАЧЕН ни на один кабинет")
        print("   Решение: Добавьте врача в расписание кабинета")
    elif len(today_schedules) == 0:
        print(f"❌ У врача нет АКТИВНОГО расписания на сегодня (день {day_of_week})")
        print("   Решение: Добавьте расписание на нужный день или проверьте is_active")
    else:
        print("✅ ВСЕ В ПОРЯДКЕ! Врач должен отображаться в календаре")
        print("   Если не отображается - обновите страницу (F5) или очистите кэш")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_new_doctor())
