"""
Обработчики авторизации
"""
import re
from telegram import Update, ReplyKeyboardMarkup, KeyboardButton, ReplyKeyboardRemove
from telegram.ext import ContextTypes, ConversationHandler
from ..database import db
from ..config import AUTH_CODE_EXPIRY_MINUTES

# Состояния для ConversationHandler
PHONE_NUMBER, VERIFICATION_CODE = range(2)


async def login_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Начало процесса авторизации"""
    telegram_id = update.effective_user.id
    
    # Проверяем, авторизован ли пользователь
    is_authorized = await db.is_user_authorized(telegram_id)
    
    if is_authorized:
        await update.message.reply_text(
            "✅ Вы уже авторизованы!\n"
            "Используйте /help для просмотра доступных команд."
        )
        return ConversationHandler.END
    
    # Запрашиваем номер телефона
    keyboard = [[KeyboardButton("📱 Отправить номер телефона", request_contact=True)]]
    reply_markup = ReplyKeyboardMarkup(keyboard, resize_keyboard=True, one_time_keyboard=True)
    
    await update.message.reply_text(
        "📱 Для авторизации необходимо указать номер телефона.\n\n"
        "Нажмите кнопку ниже или отправьте номер в формате: +996XXXXXXXXX",
        reply_markup=reply_markup
    )
    
    return PHONE_NUMBER


async def receive_phone_number(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Получение номера телефона"""
    telegram_id = update.effective_user.id
    
    # Получаем номер телефона
    if update.message.contact:
        phone_number = update.message.contact.phone_number
    else:
        phone_number = update.message.text.strip()
    
    # Нормализуем номер телефона
    phone_number = phone_number.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    
    # Проверяем формат
    if not re.match(r'^\+?\d{10,15}$', phone_number):
        await update.message.reply_text(
            "❌ Неверный формат номера телефона.\n"
            "Пожалуйста, отправьте номер в формате: +996XXXXXXXXX"
        )
        return PHONE_NUMBER
    
    # Добавляем + в начало, если его нет
    if not phone_number.startswith('+'):
        phone_number = '+' + phone_number
    
    # Функция для нормализации номера (убираем все кроме цифр)
    def normalize_phone(phone):
        if not phone:
            return ""
        return ''.join(filter(str.isdigit, phone))
    
    # Нормализуем введенный номер для сравнения
    normalized_input = normalize_phone(phone_number)
    
    # Ищем пользователя с учетом разных форматов номера
    patient = None
    doctor = None
    
    # Ищем среди всех пациентов
    async for p in db.patients.find({}):
        if p.get('phone'):
            if normalize_phone(p['phone']) == normalized_input:
                patient = p
                break
    
    # Ищем среди всех врачей
    if not patient:
        async for d in db.doctors.find({}):
            if d.get('phone'):
                if normalize_phone(d['phone']) == normalized_input:
                    doctor = d
                    break
    
    user_info = ""
    if patient:
        name = patient.get('full_name') or patient.get('name', 'Не указано')
        user_info = f"\n👤 Найден пациент: {name}\n"
    elif doctor:
        name = doctor.get('full_name') or doctor.get('name', 'Не указано')
        specialty = doctor.get('specialty', {})
        specialty_name = specialty.get('name', 'Не указана') if isinstance(specialty, dict) else 'Не указана'
        user_info = f"\n👨‍⚕️ Найден врач: {name}\nСпециальность: {specialty_name}\n"
    else:
        user_info = "\n⚠️ Пользователь с таким номером не найден в системе.\nВы будете зарегистрированы как новый пациент.\n"
    
    # Генерируем код верификации
    code = await db.generate_verification_code(phone_number, telegram_id)
    
    # Сохраняем номер телефона в контекст
    context.user_data['phone_number'] = phone_number
    
    # В продакшене здесь должна быть отправка SMS
    # Для тестирования отправляем код в чат
    await update.message.reply_text(
        f"✅ Код верификации отправлен на номер {phone_number}\n"
        f"{user_info}\n"
        f"🔐 Код для тестирования: {code}\n\n"
        f"Введите код (действителен {AUTH_CODE_EXPIRY_MINUTES} минут):",
        reply_markup=ReplyKeyboardRemove()
    )
    
    return VERIFICATION_CODE


async def receive_verification_code(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Получение и проверка кода верификации"""
    telegram_id = update.effective_user.id
    code = update.message.text.strip()
    phone_number = context.user_data.get('phone_number')
    
    if not phone_number:
        await update.message.reply_text(
            "❌ Ошибка: номер телефона не найден.\n"
            "Начните процесс авторизации заново с команды /login"
        )
        return ConversationHandler.END
    
    # Проверяем код
    is_valid = await db.verify_code(phone_number, code, telegram_id)
    
    if not is_valid:
        await update.message.reply_text(
            "❌ Неверный или истекший код.\n\n"
            "Попробуйте еще раз или начните заново с /login"
        )
        return VERIFICATION_CODE
    
    # Авторизуем пользователя
    user = await db.authorize_user(telegram_id, phone_number)
    
    if not user:
        await update.message.reply_text(
            "❌ Ошибка авторизации.\n"
            "Пожалуйста, попробуйте позже."
        )
        return ConversationHandler.END
    
    # Получаем данные пользователя из CRM
    from bson import ObjectId
    user_name = "Пользователь"
    user_details = ""
    
    if user.role == "patient" and user.patient_id:
        try:
            patient = await db.patients.find_one({"_id": ObjectId(user.patient_id)})
            if patient:
                user_name = patient.get('full_name') or patient.get('name', 'Пациент')
        except:
            pass
    elif user.role == "doctor" and user.doctor_id:
        try:
            doctor = await db.doctors.find_one({"_id": ObjectId(user.doctor_id)})
            if doctor:
                user_name = doctor.get('full_name') or doctor.get('name', 'Врач')
                specialty = doctor.get('specialty', {})
                specialty_name = specialty.get('name', '') if isinstance(specialty, dict) else ''
                if specialty_name:
                    user_details = f"\n📋 Специальность: {specialty_name}"
        except:
            pass
    
    role_text = {
        "admin": "👨‍💼 Администратор",
        "doctor": "👨‍⚕️ Врач",
        "patient": "👤 Пациент"
    }.get(user.role, "Пользователь")
    
    # Формируем список команд в зависимости от роли
    commands = "\n\n📱 Доступные команды:\n"
    
    if user.role == "admin":
        commands += "👨‍💼 Администратор:\n"
        commands += "  /stats - Статистика системы\n"
        commands += "  /users - Список пользователей\n"
        commands += "  /broadcast - Рассылка сообщений\n"
    elif user.role == "doctor":
        commands += "👨‍⚕️ Врач:\n"
        commands += "  /schedule - Мое расписание\n"
        commands += "  /appointments - Мои приемы\n"
        commands += "  /patients - Мои пациенты\n"
    elif user.role == "patient":
        commands += "👤 Пациент:\n"
        commands += "  /book - Записаться на прием\n"
        commands += "  /myappointments - Мои записи\n"
        commands += "  /mytreatments - Мои планы лечения\n"
        commands += "  /doctors - Список врачей\n"
        commands += "  /results - Результаты анализов\n"
    
    commands += "\n📋 Общие:\n"
    commands += "  /profile - Мой профиль\n"
    commands += "  /help - Справка\n"
    commands += "  /logout - Выйти"
    
    await update.message.reply_text(
        f"✅ Успешная авторизация!\n\n"
        f"👋 Здравствуйте, {user_name}!\n"
        f"Роль: {role_text}{user_details}"
        f"{commands}"
    )
    
    # Очищаем данные из контекста
    context.user_data.clear()
    
    return ConversationHandler.END


async def cancel_login(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Отмена процесса авторизации"""
    await update.message.reply_text(
        "❌ Авторизация отменена.\n"
        "Используйте /login для повторной попытки.",
        reply_markup=ReplyKeyboardRemove()
    )
    
    context.user_data.clear()
    return ConversationHandler.END
