"""
Основной файл Telegram бота
"""
import logging
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ConversationHandler,
    filters
)

from .config import TELEGRAM_BOT_TOKEN
from .database import db
from .handlers.auth import (
    login_command,
    receive_phone_number,
    receive_verification_code,
    cancel_login,
    PHONE_NUMBER,
    VERIFICATION_CODE
)
from .handlers.common import (
    start_command,
    help_command,
    profile_command,
    logout_command,
    unknown_command
)
from .handlers.patient import (
    my_appointments_command,
    book_appointment_command,
    doctors_list_command,
    my_treatments_command,
    results_command
)
from .handlers.doctor import (
    schedule_command,
    doctor_appointments_command,
    patients_command
)

# Настройка логирования
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)


async def post_init(application: Application) -> None:
    """Инициализация после запуска бота"""
    await db.init_indexes()
    logger.info("Telegram бот инициализирован")


def create_bot_application():
    """Создание и настройка приложения бота"""
    
    # Создаем приложение
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).post_init(post_init).build()
    
    # ConversationHandler для авторизации
    login_conv_handler = ConversationHandler(
        entry_points=[CommandHandler('login', login_command)],
        states={
            PHONE_NUMBER: [
                MessageHandler(filters.CONTACT, receive_phone_number),
                MessageHandler(filters.TEXT & ~filters.COMMAND, receive_phone_number)
            ],
            VERIFICATION_CODE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, receive_verification_code)
            ]
        },
        fallbacks=[
            CommandHandler('cancel', cancel_login),
            CommandHandler('login', login_command)  # Разрешаем начать заново
        ]
    )
    
    # Регистрируем обработчики
    application.add_handler(CommandHandler('start', start_command))
    application.add_handler(CommandHandler('help', help_command))
    application.add_handler(CommandHandler('profile', profile_command))
    application.add_handler(CommandHandler('logout', logout_command))
    application.add_handler(login_conv_handler)
    
    # Команды для пациентов
    application.add_handler(CommandHandler('myappointments', my_appointments_command))
    application.add_handler(CommandHandler('mytreatments', my_treatments_command))
    application.add_handler(CommandHandler('book', book_appointment_command))
    application.add_handler(CommandHandler('doctors', doctors_list_command))
    application.add_handler(CommandHandler('results', results_command))
    
    # Команды для врачей
    application.add_handler(CommandHandler('schedule', schedule_command))
    application.add_handler(CommandHandler('appointments', doctor_appointments_command))
    application.add_handler(CommandHandler('patients', patients_command))
    
    # Обработчик неизвестных команд (должен быть последним)
    application.add_handler(MessageHandler(filters.COMMAND, unknown_command))
    
    return application


def run_bot():
    """Запуск бота"""
    logger.info("Запуск Telegram бота...")
    
    application = create_bot_application()
    
    # Запускаем бота
    application.run_polling(allowed_updates=["message", "callback_query"])


if __name__ == '__main__':
    run_bot()
