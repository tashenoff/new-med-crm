"""
Тест API кабинетов с расписанием
"""
import requests
import json

# URL вашего API
API_URL = "http://localhost:8000"

# Получаем кабинеты с расписанием
response = requests.get(f"{API_URL}/api/rooms-with-schedule")

print("\n" + "="*80)
print("📡 ОТВЕТ API /api/rooms-with-schedule")
print("="*80 + "\n")

if response.status_code == 200:
    rooms = response.json()
    print(f"✅ Получено кабинетов: {len(rooms)}\n")
    
    for room in rooms:
        print(f"🏥 Кабинет: {room.get('name')} (ID: {room.get('id')})")
        schedules = room.get('schedule', [])
        print(f"   Расписаний: {len(schedules)}")
        
        if schedules:
            days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
            for s in schedules:
                print(f"   - {days[s.get('day_of_week')]}: {s.get('start_time')}-{s.get('end_time')}, врач ID: {s.get('doctor_id')}")
        print()
else:
    print(f"❌ Ошибка: {response.status_code}")
    print(response.text)

print("="*80 + "\n")
