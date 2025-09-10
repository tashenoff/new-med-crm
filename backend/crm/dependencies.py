"""
CRM Dependencies - Зависимости для CRM модуля
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

# Загружаем переменные окружения
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
database = client[os.environ['DB_NAME']]


async def get_database() -> AsyncIOMotorDatabase:
    """Получить подключение к базе данных"""
    return database




