"""
Конфигурация Telegram бота
"""
import os
from dotenv import load_dotenv

load_dotenv()

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_ADMIN_ID = int(os.getenv("TELEGRAM_ADMIN_ID", "0"))

# MongoDB Configuration
MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME", "medcrm")

# Настройки авторизации
AUTH_CODE_LENGTH = 6  # Длина кода авторизации
AUTH_CODE_EXPIRY_MINUTES = 10  # Время жизни кода в минутах

# Коллекции в MongoDB
TELEGRAM_USERS_COLLECTION = "telegram_users"
VERIFICATION_CODES_COLLECTION = "verification_codes"
