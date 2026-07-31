"""
Обработчики команд для пациентов
"""
from telegram import Update
from telegram.ext import ContextTypes
from datetime import datetime
from bson import ObjectId
from ..database import db


async def my_appointments_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Получение списка записей пациента"""
    telegram_id = update.effective_user.id
    
    # Проверяем авторизацию
    user = await db.get_user(telegram_id)
    
    if not user or not user.is_authorized:
        await update.message.reply_text(
            "❌ Вы не авторизованы.\n"
            "Используйте /login для входа."
        )
        return
    
    if user.role != "patient":
        await update.message.reply_text(
            "❌ Эта команда доступна только для пациентов."
        )
        return
    
    if not user.patient_id:
        await update.message.reply_text(
            "❌ Не удалось определить ваш профиль пациента."
        )
        return
    
    # Получаем записи пациента используя тот же подход что и CRM API
    appointments_collection = db.db["appointments"]
    
    # Используем агрегацию как в CRM
    pipeline = [
        {
            "$match": {
                "$or": [
                    {"patient_id": user.patient_id},  # Строковый ID
                    {"patient_id": ObjectId(user.patient_id)}  # ObjectId
                ]
            }
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
        # Lookup для получения имени врача
        {
            "$lookup": {
                "from": "doctors",
                "localField": "doctor_id",
                "foreignField": "id",
                "as": "doctor"
            }
        },
        {
            "$project": {
                "appointment_date": 1,
                "appointment_time": 1,
                "date": 1,
                "start_time": 1,
                "status": 1,
                "services": 1,
                "created_at": 1,
                "doctor_id": 1,
                "patient_name": {
                    "$ifNull": [
                        {"$arrayElemAt": ["$patient.full_name", 0]},
                        {"$arrayElemAt": ["$patient.name", 0]},
                        "$patient_name"
                    ]
                },
                "doctor_name": {
                    "$ifNull": [
                        {"$arrayElemAt": ["$doctor.full_name", 0]},
                        {"$arrayElemAt": ["$doctor.name", 0]},
                        "$doctor_name"
                    ]
                }
            }
        },
        {"$sort": {"created_at": -1}}
    ]
    
    appointments = await appointments_collection.aggregate(pipeline).to_list(None)
    
    if not appointments:
        await update.message.reply_text(
            "📅 У вас пока нет записей на прием.\n\n"
            "Используйте /book для записи к врачу."
        )
        return
    
    # Формируем сообщение со списком записей
    message = "📅 Ваши записи на прием:\n\n"
    
    for i, apt in enumerate(appointments[:10], 1):  # Показываем последние 10 записей
        # ОТЛАДКА: покажем что пришло из агрегации
        print(f"\n=== ЗАПИСЬ {i} ИЗ АГРЕГАЦИИ ===")
        print(f"doctor_name из агрегации: {apt.get('doctor_name')}")
        print(f"doctor_id: {apt.get('doctor_id')}")
        print(f"status: {apt.get('status')}")
        print(f"appointment_date: {apt.get('appointment_date')}")
        print(f"appointment_time: {apt.get('appointment_time')}")
        
        # Получаем имя врача
        # В старом формате хранится в поле doctor_name, в новом - нужно получать по doctor_id
        doctor_name = apt.get('doctor_name', 'Не указан')
        
        # Если doctor_name не указан, пробуем получить по doctor_id
        if not doctor_name or doctor_name == 'Не указан':
            doctor_id = apt.get('doctor_id')
            if doctor_id:
                try:
                    if isinstance(doctor_id, ObjectId):
                        doctor = await db.doctors.find_one({"_id": doctor_id})
                    elif isinstance(doctor_id, str):
                        doctor = await db.doctors.find_one({"_id": ObjectId(doctor_id)})
                    else:
                        doctor = None
                        
                    if doctor:
                        doctor_name = doctor.get('name', 'Не указан')
                except Exception as e:
                    print(f"Ошибка получения врача: {e}")
        
        # Форматируем дату и время
        # Приоритет: appointment_date + appointment_time (новый формат) -> date/start_time (старый)
        appointment_date = apt.get('appointment_date')
        appointment_time = apt.get('appointment_time')
        date_str = "Не указана"
        time_str = ""
        
        if appointment_date:
            # Новый формат CRM: appointment_date (строка "YYYY-MM-DD") + appointment_time (строка "HH:MM")
            try:
                if isinstance(appointment_date, str):
                    date_obj = datetime.strptime(appointment_date, "%Y-%m-%d")
                    date_str = date_obj.strftime("%d.%m.%Y")
                    if appointment_time:
                        time_str = appointment_time  # Уже в формате HH:MM
            except Exception as e:
                print(f"Ошибка обработки appointment_date: {e}")
        else:
            # Старый формат: date или start_time (datetime объекты)
            date_value = apt.get('start_time') or apt.get('date')
            if date_value:
                try:
                    if isinstance(date_value, datetime):
                        date_str = date_value.strftime("%d.%m.%Y")
                        if date_value.hour != 0 or date_value.minute != 0:
                            time_str = date_value.strftime("%H:%M")
                except Exception as e:
                    print(f"Ошибка обработки даты: {e}")
        
        # Статус приема
        status = apt.get('status')
        if not status:
            status = 'scheduled'  # Дефолт для старых записей
            
        status_emoji = {
            'scheduled': '🕐',
            'unconfirmed': '⏳',
            'confirmed': '✅',
            'completed': '✅',
            'cancelled': '❌',
            'no_show': '⚠️'
        }.get(status, '📌')
        
        status_text = {
            'scheduled': 'Запланирован',
            'unconfirmed': 'Не подтверждён',
            'confirmed': 'Подтверждён',
            'completed': 'Завершён',
            'cancelled': 'Отменён',
            'no_show': 'Не явился'
        }.get(status, 'Неизвестен')
        
        # Услуги
        services = apt.get('services', [])
        services_text = ""
        if services:
            service_names = [s.get('name', '') for s in services if isinstance(s, dict)]
            if service_names:
                services_text = f"\n   Услуги: {', '.join(service_names[:2])}"
                if len(service_names) > 2:
                    services_text += f" и еще {len(service_names) - 2}"
        
        message += (
            f"{i}. {status_emoji} {date_str} в {time_str}\n"
            f"   Врач: {doctor_name}\n"
            f"   Статус: {status_text}"
            f"{services_text}\n\n"
        )
    
    if len(appointments) > 10:
        message += f"📌 Показаны последние 10 из {len(appointments)} записей"
    
    await update.message.reply_text(message)


async def book_appointment_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Запись на прием (заглушка)"""
    telegram_id = update.effective_user.id
    
    # Проверяем авторизацию
    user = await db.get_user(telegram_id)
    
    if not user or not user.is_authorized:
        await update.message.reply_text(
            "❌ Вы не авторизованы.\n"
            "Используйте /login для входа."
        )
        return
    
    if user.role != "patient":
        await update.message.reply_text(
            "❌ Эта команда доступна только для пациентов."
        )
        return
    
    await update.message.reply_text(
        "📝 Запись на прием\n\n"
        "Эта функция находится в разработке.\n"
        "Пока вы можете записаться через веб-интерфейс CRM системы."
    )


async def doctors_list_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Список врачей"""
    telegram_id = update.effective_user.id
    
    # Проверяем авторизацию
    user = await db.get_user(telegram_id)
    
    if not user or not user.is_authorized:
        await update.message.reply_text(
            "❌ Вы не авторизованы.\n"
            "Используйте /login для входа."
        )
        return
    
    # Получаем список врачей
    doctors = []
    async for doctor in db.doctors.find({}).limit(20):
        doctors.append(doctor)
    
    if not doctors:
        await update.message.reply_text(
            "👨‍⚕️ Список врачей пуст."
        )
        return
    
    message = "👨‍⚕️ Наши врачи:\n\n"
    
    for i, doctor in enumerate(doctors, 1):
        name = doctor.get('name', 'Не указано')
        specialty = doctor.get('specialty', {})
        specialty_name = specialty.get('name', 'Не указана') if isinstance(specialty, dict) else 'Не указана'
        phone = doctor.get('phone', 'Не указан')
        
        message += f"{i}. {name}\n"
        message += f"   Специальность: {specialty_name}\n"
        message += f"   Телефон: {phone}\n\n"
    
    await update.message.reply_text(message)


async def my_treatments_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Получение планов лечения пациента"""
    telegram_id = update.effective_user.id
    
    # Проверяем авторизацию
    user = await db.get_user(telegram_id)
    
    if not user or not user.is_authorized:
        await update.message.reply_text(
            "❌ Вы не авторизованы.\n"
            "Используйте /login для входа."
        )
        return
    
    if user.role != "patient":
        await update.message.reply_text(
            "❌ Эта команда доступна только для пациентов."
        )
        return
    
    if not user.patient_id:
        await update.message.reply_text(
            "❌ Не удалось определить ваш профиль пациента."
        )
        return
    
    # Получаем планы лечения пациента
    treatment_plans_collection = db.db["treatment_plans"]
    
    plans = []
    async for plan in treatment_plans_collection.find({
        "$or": [
            {"patient_id": user.patient_id},
            {"patient_id": ObjectId(user.patient_id)}
        ]
    }).sort("created_at", -1):
        plans.append(plan)
    
    if not plans:
        await update.message.reply_text(
            "📋 У вас пока нет планов лечения.\n\n"
            "Планы лечения создаются врачом после консультации."
        )
        return
    
    # Формируем сообщение со списком планов
    message = "📋 Ваши планы лечения:\n\n"
    
    for i, plan in enumerate(plans, 1):
        title = plan.get('title', 'План лечения')
        status = plan.get('status', 'draft')
        execution_status = plan.get('execution_status', 'pending')
        payment_status = plan.get('payment_status', 'unpaid')
        total_cost = plan.get('total_cost', 0)
        paid_amount = plan.get('paid_amount', 0)
        services = plan.get('services', [])
        
        # Эмодзи для статуса
        status_emoji = {
            'draft': '📝',
            'approved': '✅',
            'in_progress': '⏳',
            'completed': '✔️',
            'cancelled': '❌'
        }.get(status, '📌')
        
        status_text = {
            'draft': 'Черновик',
            'approved': 'Утверждён',
            'in_progress': 'В процессе',
            'completed': 'Завершён',
            'cancelled': 'Отменён'
        }.get(status, status)
        
        # Эмодзи для статуса оплаты
        payment_emoji = {
            'unpaid': '💳',
            'partially_paid': '💰',
            'paid': '✅',
            'overdue': '⚠️'
        }.get(payment_status, '💳')
        
        payment_text = {
            'unpaid': 'Не оплачен',
            'partially_paid': f'Частично ({paid_amount:.0f} ₸)',
            'paid': 'Оплачен',
            'overdue': 'Просрочен'
        }.get(payment_status, payment_status)
        
        message += f"{i}. {status_emoji} {title}\n"
        message += f"   Статус: {status_text}\n"
        message += f"   {payment_emoji} Оплата: {payment_text}\n"
        message += f"   💵 Стоимость: {total_cost:.0f} ₸\n"
        
        # Показываем услуги из плана
        if services:
            message += f"   📋 Услуги ({len(services)}):\n"
            for j, service in enumerate(services[:5], 1):  # Показываем до 5 услуг
                service_name = service.get('service_name', service.get('name', 'Услуга'))
                service_price = service.get('price', 0)
                tooth = service.get('tooth_number', '')
                tooth_text = f" #{tooth}" if tooth else ""
                message += f"      • {service_name}{tooth_text} - {service_price:.0f} ₸\n"
            
            if len(services) > 5:
                message += f"      ... и еще {len(services) - 5}\n"
        
        message += "\n"
    
    if len(plans) > 10:
        message += f"📌 Показаны последние 10 из {len(plans)} планов"
    
    await update.message.reply_text(message)


async def results_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Результаты анализов (заглушка)"""
    telegram_id = update.effective_user.id
    
    # Проверяем авторизацию
    user = await db.get_user(telegram_id)
    
    if not user or not user.is_authorized:
        await update.message.reply_text(
            "❌ Вы не авторизованы.\n"
            "Используйте /login для входа."
        )
        return
    
    if user.role != "patient":
        await update.message.reply_text(
            "❌ Эта команда доступна только для пациентов."
        )
        return
    
    await update.message.reply_text(
        "🧪 Результаты анализов\n\n"
        "Эта функция находится в разработке.\n"
        "Пока вы можете просмотреть результаты через веб-интерфейс CRM системы."
    )
