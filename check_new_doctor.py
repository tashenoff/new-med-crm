"""
Проверка ID нового врача
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
    print('🔍 ПРОВЕРКА ВРАЧА "сврач"')
    print('='*80 + '\n')
    
    doctor = await db.doctors.find_one({'full_name': 'сврач'})
    
    if doctor:
        print(f'✅ Врач найден:')
        print(f'   Имя: {doctor.get("full_name")}')
        print(f'   id (UUID): {doctor.get("id")}')
        print(f'   _id (MongoDB): {doctor.get("_id")}')
        
        if str(doctor.get("id")) == str(doctor.get("_id")):
            print(f'\n   ✅ ОТЛИЧНО! id и _id СОВПАДАЮТ')
            print(f'   Это означает что исправление работает!')
        else:
            print(f'\n   ❌ ПРОБЛЕМА! id и _id НЕ СОВПАДАЮТ')
            print(f'   Нужно перезапустить backend сервер')
        
        # Проверяем расп исание
        schedule_by_id = await db.doctor_schedules.find({'doctor_id': str(doctor.get('id'))}).to_list(None)
        schedule_by_mongodb_id = await db.doctor_schedules.find({'doctor_id': str(doctor.get('_id'))}).to_list(None)
        
        print(f'\n📅 Расписание:')
        print(f'   По id (UUID): {len(schedule_by_id)} записей')
        print(f'   По _id (MongoDB): {len(schedule_by_mongodb_id)} записей')
        
        if schedule_by_id:
            for s in schedule_by_id:
                days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
                print(f'   - {days[s.get("day_of_week")]}: {s.get("start_time")} - {s.get("end_time")}')
    else:
        print('❌ Врач "сврач" не найден в базе')
    
    print('\n' + '='*80 + '\n')
    client.close()

if __name__ == "__main__":
    asyncio.run(check())
