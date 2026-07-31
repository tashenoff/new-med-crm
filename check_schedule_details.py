"""
Скрипт для детальной проверки расписания кабинета
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from dotenv import load_dotenv

# Загрузить переменные окружения
load_dotenv('backend/.env')

async def check_schedule_details():
    # Использовать настройки из .env
    MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017/clinic")
    DB_NAME = os.environ.get('DB_NAME', 'clinic')
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print(f"🔌 Подключение к MongoDB: {MONGO_URL}")
    print(f"📊 База данных: {DB_NAME}\n")
    
    # Найти "Кабинет 3"
    room = await db.rooms.find_one({"name": "Кабинет 3", "is_active": True})
    
    if not room:
        print("❌ Кабинет 3 не найден!")
        client.close()
        return
    
    room_id = room['id']
    print(f"✅ Найден кабинет: {room['name']} (ID: {room_id})\n")
    
    # Получить все расписания для этого кабинета
    schedules = await db.room_schedules.find({
        "room_id": room_id,
        "is_active": True
    }).to_list(100)
    
    print(f"📅 Найдено расписаний: {len(schedules)}\n")
    
    if len(schedules) == 0:
        print("⚠️ НЕТ АКТИВНЫХ РАСПИСАНИЙ для этого кабинета!")
        print("   Именно поэтому не видно доступных слотов!\n")
    
    # Показать детали каждого расписания
    for i, schedule in enumerate(schedules, 1):
        print(f"📋 Расписание #{i}:")
        print(f"   ID: {schedule.get('id')}")
        print(f"   День недели: {schedule.get('day_of_week')} (0=Пн, 1=Вт, 2=Ср, 3=Чт, 4=Пт, 5=Сб, 6=Вс)")
        print(f"   Время: {schedule.get('start_time')} - {schedule.get('end_time')}")
        print(f"   ID врача: {schedule.get('doctor_id')}")
        print(f"   Активно: {schedule.get('is_active')}")
        
        # Найти врача
        doctor = await db.doctors.find_one({"id": schedule.get('doctor_id')})
        if doctor:
            print(f"   👨‍⚕️ Врач: {doctor.get('last_name')} {doctor.get('first_name')} - {doctor.get('specialty')}")
        else:
            print(f"   ❌ Врач не найден!")
        print()
    
    # Проверить сегодняшний день
    today = datetime.now()
    day_of_week_js = today.weekday()  # Python: 0=Пн, 6=Вс
    adjusted_day = (day_of_week_js + 1) % 7  # Конвертировать в нумерацию как в calendare: 0=Пн, 6=Вс
    
    # Но в системе используется другая конвертация!
    js_day = today.weekday()  # 0=Пн ... 6=Вс в Python
    # В JS это будет: 1=Пн ... 0=Вс, поэтому:
    js_to_system = (js_day + 1) % 7 if js_day == 6 else js_day
    # НЕТ! Смотрим код из CalendarView.js:
    # const dayOfWeek = new Date(date).getDay(); // 0=Вс, 1=Пн ... 6=Сб
    # const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0=Пн ... 6=Вс
    
    # Сегодня в Python:
    python_weekday = today.weekday()  # 0=Пн, 1=Вт, ..., 6=Вс
    
    # В JS Date.getDay():
    js_getday = (python_weekday + 1) % 7  # 0=Вс, 1=Пн, ..., 6=Сб
    
    # После конвертации в системе:
    system_day = 6 if js_getday == 0 else js_getday - 1  # 0=Пн, ..., 6=Вс
    
    days_ru = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"]
    print(f"📆 Сегодня: {today.strftime('%Y-%m-%d %H:%M')}")
    print(f"   Python weekday: {python_weekday} ({days_ru[python_weekday]})")
    print(f"   JS getDay(): {js_getday}")
    print(f"   System day_of_week: {system_day} ({days_ru[system_day]})")
    print()
    
    # Проверить совпадает ли расписание с сегодняшним днем
    matching_schedules = [s for s in schedules if s.get('day_of_week') == system_day]
    
    if matching_schedules:
        print(f"✅ Найдено {len(matching_schedules)} расписаний на сегодня!")
        for schedule in matching_schedules:
            print(f"   ⏰ {schedule.get('start_time')} - {schedule.get('end_time')}")
    else:
        print(f"❌ НЕТ расписаний на day_of_week={system_day} ({days_ru[system_day]})")
        print(f"   Доступные дни в расписании:")
        for schedule in schedules:
            day_num = schedule.get('day_of_week', -1)
            if 0 <= day_num < 7:
                print(f"   - day_of_week={day_num} ({days_ru[day_num]})")
            else:
                print(f"   - day_of_week={day_num} (некорректный)")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_schedule_details())
