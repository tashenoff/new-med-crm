"""
Общие обработчики команд
"""
from telegram import Update, ReplyKeyboardMarkup, ReplyKeyboardRemove
from telegram.ext import ContextTypes
from ..database import db


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /start"""
    user = update.effective_user
    telegram_id = user.id
    
    # Получаем или создаем пользователя
    tg_user = await db.get_or_create_user(
        telegram_id=telegram_id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name
    )
    
    if tg_user.is_authorized:
        # Пользователь уже авторизован
        role_text = {
            "admin": "Администратор",
            "doctor": "Врач",
            "patient": "Пациент"
        }.get(tg_user.role, "Пользователь")
        
        await update.message.reply_text(
            f"👋 Добро пожаловать, {user.first_name}!\n\n"
            f"Ваша роль: {role_text}\n\n"
            f"Используйте /help для просмотра доступных команд."
        )
    else:
        # Пользователь не авторизован
        await update.message.reply_text(
            f"👋 Здравствуйте, {user.first_name}!\n\n"
            f"Добро пожаловать в Medical CRM Bot!\n\n"
            f"Для использования бота необходимо пройти авторизацию.\n"
            f"Используйте команду /login для входа."
        )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /help"""
    telegram_id = update.effective_user.id
    
    is_authorized = await db.is_user_authorized(telegram_id)
    
    if not is_authorized:
        await update.message.reply_text(
            "ℹ️ Доступные команды:\n\n"
            "/start - Начать работу с ботом\n"
            "/login - Авторизация по номеру телефона\n"
            "/help - Показать это сообщение"
        )
        return
    
    role = await db.get_user_role(telegram_id)
    
    help_text = "ℹ️ Доступные команды:\n\n"
    
    # Общие команды
    help_text += "📋 Общие команды:\n"
    help_text += "/start - Главное меню\n"
    help_text += "/help - Справка\n"
    help_text += "/profile - Мой профиль\n"
    help_text += "/logout - Выйти из аккаунта\n\n"
    
    # Команды для админа
    if role == "admin":
        help_text += "👨‍💼 Команды администратора:\n"
        help_text += "/stats - Статистика системы\n"
        help_text += "/users - Список пользователей\n"
        help_text += "/broadcast - Рассылка сообщений\n\n"
    
    # Команды для врача
    elif role == "doctor":
        help_text += "👨‍⚕️ Команды врача:\n"
        help_text += "/schedule - Моё расписание работы\n"
        help_text += "/appointments - Предстоящие приёмы\n"
        help_text += "/patients - Мои пациенты\n\n"
    
    # Команды для пациента
    elif role == "patient":
        help_text += "👤 Команды пациента:\n"
        help_text += "/book - Записаться на прием\n"
        help_text += "/myappointments - Мои записи\n"
        help_text += "/mytreatments - Мои планы лечения\n"
        help_text += "/doctors - Список врачей\n"
        help_text += "/results - Результаты анализов\n\n"
    
    await update.message.reply_text(help_text)


async def profile_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /profile"""
    telegram_id = update.effective_user.id
    
    user = await db.get_user(telegram_id)
    
    if not user or not user.is_authorized:
        await update.message.reply_text(
            "❌ Вы не авторизованы.\n"
            "Используйте /login для входа."
        )
        return
    
    role_text = {
        "admin": "👨‍💼 Администратор",
        "doctor": "👨‍⚕️ Врач",
        "patient": "👤 Пациент"
    }.get(user.role, "Пользователь")
    
    profile_text = (
        f"👤 Ваш профиль:\n\n"
        f"Роль: {role_text}\n"
        f"Телефон: {user.phone_number or 'Не указан'}\n"
        f"Telegram ID: {user.telegram_id}\n"
        f"Username: @{user.username or 'Не указан'}\n"
    )
    
    await update.message.reply_text(profile_text)


async def logout_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /logout"""
    telegram_id = update.effective_user.id
    
    # Деавторизуем пользователя
    await db.users.update_one(
        {"telegram_id": telegram_id},
        {
            "$set": {
                "is_authorized": False,
                "phone_number": None,
                "role": None,
                "patient_id": None,
                "doctor_id": None
            }
        }
    )
    
    await update.message.reply_text(
        "👋 Вы успешно вышли из системы.\n"
        "Используйте /login для повторного входа.",
        reply_markup=ReplyKeyboardRemove()
    )


async def unknown_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик неизвестных команд"""
    await update.message.reply_text(
        "❓ Неизвестная команда.\n"
        "Используйте /help для просмотра доступных команд."
    )
