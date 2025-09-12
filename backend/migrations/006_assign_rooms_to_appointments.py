import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

# Добавляем родительскую директорию в путь для импорта
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

async def assign_rooms_to_appointments():
    # Подключение к MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'medical_crm')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        print("🔧 Обновление записей: назначение кабинетов...")
        
        # Получаем все записи без room_id
        appointments_without_room = await db.appointments.find({
            "$or": [
                {"room_id": {"$exists": False}},
                {"room_id": None},
                {"room_id": ""}
            ]
        }).to_list(None)
        
        print(f"📊 Найдено записей без кабинета: {len(appointments_without_room)}")
        
        if len(appointments_without_room) == 0:
            print("✅ Все записи уже имеют назначенные кабинеты")
            return
        
        # Получаем кабинеты с расписанием
        rooms_with_schedule = await db.rooms.aggregate([
            {"$match": {"is_active": True}},
            {"$lookup": {
                "from": "room_schedules",
                "localField": "id",
                "foreignField": "room_id",
                "as": "schedules"
            }}
        ]).to_list(None)
        
        print(f"📊 Найдено кабинетов с расписанием: {len(rooms_with_schedule)}")
        
        # Создаем словарь: врач -> кабинет для каждого дня и времени
        doctor_room_mapping = {}
        
        for room in rooms_with_schedule:
            for schedule in room.get('schedules', []):
                if not schedule.get('is_active', True):
                    continue
                    
                key = f"{schedule['doctor_id']}_{schedule['day_of_week']}_{schedule['start_time']}_{schedule['end_time']}"
                doctor_room_mapping[key] = room['id']
        
        print(f"📊 Создано сопоставлений врач-кабинет: {len(doctor_room_mapping)}")
        
        # Обновляем записи
        updated_count = 0
        assigned_to_first_room = 0
        
        # Получаем первый доступный кабинет для записей, которые не удалось сопоставить
        first_room = None
        if rooms_with_schedule:
            first_room = rooms_with_schedule[0]['id']
        
        for appointment in appointments_without_room:
            room_id = None
            
            # Пытаемся найти кабинет на основе врача и времени
            if appointment.get('doctor_id') and appointment.get('appointment_date') and appointment.get('appointment_time'):
                # Определяем день недели
                try:
                    appointment_date = datetime.fromisoformat(appointment['appointment_date'])
                    day_of_week = appointment_date.weekday()  # 0 = Понедельник
                    
                    appointment_time = appointment['appointment_time']
                    
                    # Ищем подходящее расписание
                    for key, mapped_room_id in doctor_room_mapping.items():
                        parts = key.split('_')
                        if len(parts) >= 4:
                            doctor_id, schedule_day, start_time, end_time = parts[0], int(parts[1]), parts[2], parts[3]
                            
                            if (doctor_id == appointment['doctor_id'] and 
                                schedule_day == day_of_week and 
                                start_time <= appointment_time < end_time):
                                room_id = mapped_room_id
                                break
                except Exception as e:
                    print(f"⚠️ Ошибка обработки даты для записи {appointment.get('id')}: {e}")
            
            # Если не удалось найти подходящий кабинет, назначаем первый доступный
            if not room_id and first_room:
                room_id = first_room
                assigned_to_first_room += 1
            
            # Обновляем запись
            if room_id:
                await db.appointments.update_one(
                    {"id": appointment["id"]},
                    {"$set": {"room_id": room_id, "updated_at": datetime.utcnow()}}
                )
                updated_count += 1
                print(f"✅ Запись {appointment.get('id')} назначена в кабинет {room_id}")
        
        print(f"🎉 Обновлено записей: {updated_count}")
        print(f"📋 Назначено в первый доступный кабинет: {assigned_to_first_room}")
        print("✅ Миграция завершена успешно!")
        
    except Exception as e:
        print(f"❌ Ошибка при обновлении записей: {e}")
        raise
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(assign_rooms_to_appointments())
