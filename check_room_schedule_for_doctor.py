"""
Проверка расписания кабинетов для врача сврач
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')

MONGODB_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'medcrm')

async def check():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DB_NAME]
    
    print('\n' + '='*80)
    print('🔍 ПРОВЕРКА РАСПИСАНИЯ КАБИНЕТОВ ДЛЯ ВРАЧА "сврач"')
    print('='*80 + '\n')
    
    # Находим врача
    doctor = await db.doctors.find_one({'full_name': 'сврач'})
    
    if not doctor:
        print('❌ Врач не найден')
        client.close()
        return
    
    doctor_id = doctor.get('id')
    doctor_mongodb_id = doctor.get('_id')
    
    print(f'✅ Врач найден:')
    print(f'   id: {doctor_id}')
    print(f'   _id: {doctor_mongodb_id}')
    
    # Ищем расписание врача в doctor_schedules
    print(f'\n📅 Расписание ВРАЧА (doctor_schedules):')
    doctor_schedules = await db.doctor_schedules.find({'doctor_id': str(doctor_id)}).to_list(None)
    if doctor_schedules:
        days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
        for s in doctor_schedules:
            print(f'   - {days[s.get("day_of_week")]}: {s.get("start_time")} - {s.get("end_time")}')
    else:
        print('   ❌ Нет расписания врача')
    
    # Ищем расписание кабинетов для этого врача
    print(f'\n🏥 Расписание КАБИНЕТОВ (room_schedules):')
    
    # Ищем по id
    room_schedules_by_id = await db.room_schedules.find({'doctor_id': str(doctor_id), 'is_active': True}).to_list(None)
    print(f'   По id ({doctor_id}): {len(room_schedules_by_id)} записей')
    
    # Ищем по _id
    room_schedules_by_mongodb_id = await db.room_schedules.find({'doctor_id': str(doctor_mongodb_id), 'is_active': True}).to_list(None)
    print(f'   По _id ({doctor_mongodb_id}): {len(room_schedules_by_mongodb_id)} записей')
    
    if room_schedules_by_id or room_schedules_by_mongodb_id:
        schedules = room_schedules_by_id if room_schedules_by_id else room_schedules_by_mongodb_id
        days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
        for s in schedules:
            room = await db.rooms.find_one({'id': s.get('room_id')})
            room_name = room.get('name') if room else 'Неизвестный кабинет'
            print(f'   - Кабинет: {room_name}, {days[s.get("day_of_week")]}: {s.get("start_time")} - {s.get("end_time")}')
    else:
        print('   ❌ НЕТ расписания кабинетов для этого врача!')
        print('   💡 Нужно добавить врача в расписание кабинета через интерфейс')
    
    # Показываем все кабинеты
    print(f'\n🏥 Все кабинеты в системе:')
    rooms = await db.rooms.find({'is_active': True}).to_list(None)
    for room in rooms:
        print(f'   - ID: {room.get("id")}, Название: {room.get("name")}')
    
    print('\n' + '='*80 + '\n')
    client.close()

if __name__ == "__main__":
    asyncio.run(check())
