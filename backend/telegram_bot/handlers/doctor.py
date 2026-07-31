"""
Обработчики команд для врачей
"""
from telegram import Update
from telegram.ext import ContextTypes
from datetime import datetime
from bson import ObjectId
from ..database import db


# Словарь для перевода дней недели
DAYS_OF_WEEK = {
    0: "Понедельник",
    1: "Вторник",
    2: "Среда",
    3: "Четверг",
    4: "Пятница",
    5: "Суббота",
    6: "Воскресенье"
}


async def schedule_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Получение расписания врача"""
    telegram_id = update.effective_user.id
    
    # Проверяем авторизацию
    user = await db.get_user(telegram_id)
    
    if not user or not user.is_authorized:
        await update.message.reply_text(
            "❌ Вы не авторизованы.\n"
            "Используйте /login для входа."
        )
        return
    
    if user.role != "doctor":
        await update.message.reply_text(
            "❌ Эта команда доступна только для врачей."
        )
        return
    
    if not user.doctor_id:
        await update.message.reply_text(
            "❌ Не удалось определить ваш профиль врача."
        )
        return
    
    # Получаем расписание врача
    schedules_collection = db.db["doctor_schedules"]
    
    # Поддерживаем оба формата: UUID и ObjectId
    try:
        filter_query = {
            "$or": [
                {"doctor_id": user.doctor_id},  # UUID формат
                {"doctor_id": ObjectId(user.doctor_id)}  # ObjectId формат (для старых записей)
            ],
            "is_active": True
        }
    except:
        # Если не удалось преобразовать в ObjectId, используем только UUID
        filter_query = {
            "doctor_id": user.doctor_id,
            "is_active": True
        }
    
    schedules = []
    async for schedule in schedules_collection.find(filter_query).sort("day_of_week", 1):
        schedules.append(schedule)
    
    if not schedules:
        await update.message.reply_text(
            "📅 У вас пока нет установленного расписания.\n\n"
            "Обратитесь к администратору для настройки расписания."
        )
        return
    
    # Формируем сообщение с расписанием
    message = "📅 Ваше расписание работы:\n\n"
    
    for schedule in schedules:
        day_of_week = schedule.get('day_of_week', 0)
        start_time = schedule.get('start_time', '00:00')
        end_time = schedule.get('end_time', '00:00')
        
        day_name = DAYS_OF_WEEK.get(day_of_week, f"День {day_of_week}")
        
        message += f"📌 {day_name}\n"
        message += f"   Время: {start_time} - {end_time}\n\n"
    
    await update.message.reply_text(message)


async def doctor_appointments_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Получение записей врача"""
    telegram_id = update.effective_user.id
    
    # Проверяем авторизацию
    user = await db.get_user(telegram_id)
    
    if not user or not user.is_authorized:
        await update.message.reply_text(
            "❌ Вы не авторизованы.\n"
            "Используйте /login для входа."
        )
        return
    
    if user.role != "doctor":
        await update.message.reply_text(
            "❌ Эта команда доступна только для врачей."
        )
        return
    
    if not user.doctor_id:
        await update.message.reply_text(
            "❌ Не удалось определить ваш профиль врача."
        )
        return
    
    # Получаем записи врача используя агрегацию как в CRM API
    appointments_collection = db.db["appointments"]
    
    # Поддерживаем оба формата doctor_id: UUID и ObjectId
    try:
        match_filter = {
            "$or": [
                {"doctor_id": user.doctor_id},  # UUID формат (основной)
                {"doctor_id": ObjectId(user.doctor_id)}  # ObjectId формат (для старых записей)
            ]
        }
    except:
        # Если не удалось преобразовать в ObjectId, используем только UUID
        match_filter = {"doctor_id": user.doctor_id}
    
    # Используем агрегацию как в CRM
    pipeline = [
        {
            "$match": match_filter
        },
        # Lookup для получения имени пациента
        {
            "$lookup": {
                "from": "patients",
                "let": {"patient_id_str": "$patient_id"},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$or": [
                                    {"$eq": ["$id", "$$patient_id_str"]},
                                    {"$eq": [{"$toString": "$_id"}, "$$patient_id_str"]}
                                ]
                            }
                        }
                    }
                ],
                "as": "patient"
            }
        },
        {
            "$project": {
                "appointment_date": 1,
                "appointment_time": 1,
                "date": 1,
                "start_time": 1,
                "status": 1,
                "reason": 1,
                "created_at": 1,
                "patient_name": {
                    "$ifNull": [
                        {"$arrayElemAt": ["$patient.full_name", 0]},
                        {"$arrayElemAt": ["$patient.name", 0]},
                        "$patient_name"
                    ]
                },
                "patient_phone": {
                    "$ifNull": [
                        {"$arrayElemAt": ["$patient.phone", 0]},
                        "$patient_phone"
                    ]
                }
            }
        },
        {"$sort": {"appointment_date": 1, "appointment_time": 1}}
    ]
    
    appointments = await appointments_collection.aggregate(pipeline).to_list(None)
    
    # Фильтруем только будущие и сегодняшние записи
    today = datetime.now().date()
    upcoming_appointments = []
    
    for apt in appointments:
        appointment_date = apt.get('appointment_date')
        if appointment_date:
            try:
                if isinstance(appointment_date, str):
                    date_obj = datetime.strptime(appointment_date, "%Y-%m-%d").date()
                    if date_obj >= today:
                        upcoming_appointments.append(apt)
            except:
                pass
        else:
            # Для старого формата
            date_value = apt.get('start_time') or apt.get('date')
            if date_value and isinstance(date_value, datetime):
                if date_value.date() >= today:
                    upcoming_appointments.append(apt)
    
    if not upcoming_appointments:
        await update.message.reply_text(
            "📅 У вас нет предстоящих записей.\n\n"
            "Все актуальные записи будут отображаться здесь."
        )
        return
    
    # Формируем сообщение со списком записей
    message = "📅 Ваши предстоящие записи:\n\n"
    
    for i, apt in enumerate(upcoming_appointments[:10], 1):  # Показываем 10 ближайших
        patient_name = apt.get('patient_name', 'Не указан')
        patient_phone = apt.get('patient_phone', '')
        reason = apt.get('reason', '')
        
        # Форматируем дату и время
        appointment_date = apt.get('appointment_date')
        appointment_time = apt.get('appointment_time')
        date_str = "Не указана"
        time_str = ""
        
        if appointment_date:
            try:
                if isinstance(appointment_date, str):
                    date_obj = datetime.strptime(appointment_date, "%Y-%m-%d")
                    date_str = date_obj.strftime("%d.%m.%Y")
                    if appointment_time:
                        time_str = appointment_time
            except:
                pass
        else:
            # Старый формат
            date_value = apt.get('start_time') or apt.get('date')
            if date_value and isinstance(date_value, datetime):
                date_str = date_value.strftime("%d.%m.%Y")
                time_str = date_value.strftime("%H:%M")
        
        # Статус приема
        status = apt.get('status', 'scheduled')
        status_emoji = {
            'scheduled': '🕐',
            'unconfirmed': '⏳',
            'confirmed': '✅',
            'completed': '✅',
            'cancelled': '❌',
            'no_show': '⚠️'
        }.get(status, '📌')
        
        message += f"{i}. {status_emoji} {date_str} в {time_str}\n"
        message += f"   Пациент: {patient_name}\n"
        
        if patient_phone:
            message += f"   Телефон: {patient_phone}\n"
        
        if reason:
            message += f"   Причина: {reason}\n"
        
        message += "\n"
    
    if len(upcoming_appointments) > 10:
        message += f"📌 Показаны ближайшие 10 из {len(upcoming_appointments)} записей"
    
    await update.message.reply_text(message)


async def patients_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Список пациентов врача"""
    telegram_id = update.effective_user.id
    
    # Проверяем авторизацию
    user = await db.get_user(telegram_id)
    
    if not user or not user.is_authorized:
        await update.message.reply_text(
            "❌ Вы не авторизованы.\n"
            "Используйте /login для входа."
        )
        return
    
    if user.role != "doctor":
        await update.message.reply_text(
            "❌ Эта команда доступна только для врачей."
        )
        return
    
    await update.message.reply_text(
        "👥 Список пациентов\n\n"
        "Эта функция находится в разработке.\n"
        "Пока вы можете просмотреть пациентов через веб-интерфейс CRM системы."
    )
