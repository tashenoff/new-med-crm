#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Диагностика проблемы со слотами для врачей
"""

import pymongo
from bson import ObjectId
import json
from datetime import datetime

# Подключение к MongoDB
client = pymongo.MongoClient("mongodb://admin:admin123@localhost:27017/?authSource=admin")
db = client["medcrm"]

print("=" * 80)
print("🔍 ДИАГНОСТИКА СЛОТОВ ДЛЯ ВРАЧЕЙ")
print("=" * 80)

# Получаем всех врачей
print("\n📋 ВРАЧИ В СИСТЕМЕ:")
print("-" * 80)
doctors = list(db.doctors.find())
for doc in doctors:
    print(f"\n✓ Врач: {doc.get('first_name')} {doc.get('last_name')}")
    print(f"  ID: {doc.get('_id')}")
    print(f"  Специальность: {doc.get('specialty')}")
    print(f"  Активен: {doc.get('is_active', False)}")

# Получаем все кабинеты
print("\n\n🏥 КАБИНЕТЫ:")
print("-" * 80)
rooms = list(db.rooms.find())
for room in rooms:
    print(f"\n📍 Кабинет: {room.get('name')}")
    print(f"  ID: {room.get('id')}")
    print(f"  _ID (MongoDB): {room.get('_id')}")

# Проверяем отдельную коллекцию room_schedules
print("\n\n📅 КОЛЛЕКЦИЯ ROOM_SCHEDULES:")
print("-" * 80)
room_schedules_count = db.room_schedules.count_documents({})
print(f"Всего записей в room_schedules: {room_schedules_count}")

if room_schedules_count > 0:
    print("\n📋 Расписания из room_schedules:")
    schedules = list(db.room_schedules.find())
    for schedule in schedules:
        day_names = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
        day_name = day_names[schedule.get('day_of_week', 0)]
        
        room_id = schedule.get('room_id')
        room_name = "НЕ НАЙДЕНА"
        for room in rooms:
            if str(room.get('id')) == str(room_id) or str(room.get('_id')) == str(room_id):
                room_name = room.get('name')
                break
        
        doctor_id = schedule.get('doctor_id')
        doctor_name = "НЕ НАЙДЕН"
        for doc in doctors:
            if str(doc['_id']) == str(doctor_id) or str(doc.get('id')) == str(doctor_id):
                doctor_name = f"{doc.get('first_name', 'Н/Д')} {doc.get('last_name', 'Н/Д')}"
                break
        
        is_active = schedule.get('is_active', False)
        active_mark = "✓" if is_active else "✗"
        
        print(f"\n  {active_mark} Кабинет: {room_name} (room_id: {room_id})")
        print(f"    {day_name}: {schedule.get('start_time')}-{schedule.get('end_time')}")
        print(f"    Врач: {doctor_name} (doctor_id: {doctor_id})")
        print(f"    Schedule ID: {schedule.get('id', schedule.get('_id'))}")
else:
    print("\n⚠️  Коллекция room_schedules ПУСТА!")
    print("   Это причина почему слоты не показываются!")

# Проверяем соответствие типов ID
print("\n\n🔍 ПРОВЕРКА ТИПОВ ID:")
print("-" * 80)
for room in rooms:
    if 'schedule' in room and room['schedule']:
        for schedule in room['schedule']:
            doctor_id = schedule.get('doctor_id')
            print(f"\n🏥 Кабинет: {room.get('name')}")
            print(f"  doctor_id в расписании: {doctor_id} (тип: {type(doctor_id).__name__})")
            
            # Ищем врача
            found = False
            for doc in doctors:
                doc_id = doc['_id']
                print(f"  Проверяем врача: {doc.get('first_name')} {doc.get('last_name')}")
                print(f"    _id врача: {doc_id} (тип: {type(doc_id).__name__})")
                print(f"    Совпадение str(): {str(doctor_id) == str(doc_id)}")
                print(f"    Совпадение прямое: {doctor_id == doc_id}")
                
                if str(doctor_id) == str(doc_id):
                    found = True
                    print(f"    ✓ НАЙДЕНО СООТВЕТСТВИЕ!")
            
            if not found:
                print(f"  ❌ ВРАЧ НЕ НАЙДЕН ДЛЯ ID: {doctor_id}")

# Проверяем сегодняшние расписания
print("\n\n📅 РАСПИСАНИЕ НА СЕГОДНЯ:")
print("-" * 80)
today = datetime.now()
day_of_week = today.weekday()  # 0 = понедельник
day_names = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
print(f"Сегодня: {today.strftime('%Y-%m-%d')} ({day_names[day_of_week]})")

for room in rooms:
    print(f"\n🏥 {room.get('name')}:")
    
    if 'schedule' not in room or not room['schedule']:
        print("  ⚠️  Расписание не настроено")
        continue
    
    today_schedule = [s for s in room['schedule'] if s.get('day_of_week') == day_of_week and s.get('is_active')]
    
    if not today_schedule:
        print(f"  ⚠️  Нет активного расписания на {day_names[day_of_week]}")
    else:
        for schedule in today_schedule:
            doctor_id = schedule.get('doctor_id')
            doctor = next((d for d in doctors if str(d['_id']) == str(doctor_id)), None)
            
            if doctor:
                print(f"  ✓ {schedule.get('start_time')}-{schedule.get('end_time')}: "
                      f"{doctor.get('first_name')} {doctor.get('last_name')}")
            else:
                print(f"  ❌ {schedule.get('start_time')}-{schedule.get('end_time')}: "
                      f"ВРАЧ НЕ НАЙДЕН (ID: {doctor_id})")

print("\n" + "=" * 80)
print("✅ ДИАГНОСТИКА ЗАВЕРШЕНА")
print("=" * 80)
