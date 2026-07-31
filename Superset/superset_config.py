# Superset Configuration File

import os

# Секретный ключ для шифрования (замените на свой в продакшне)
SECRET_KEY = 'YourSuperSecretKeyForSuperset2026!'

# Подключение к MongoDB (ваша основная база данных medcrm)
MONGO_URI = 'mongodb://admin:admin123@localhost:27017/?authSource=admin'
MONGO_DB_NAME = 'medcrm'

# SQLAlchemy database URI для метаданных Superset
# Используем SQLite для простоты
SQLALCHEMY_DATABASE_URI = 'sqlite:///superset.db'

# Flask-WTF flag for CSRF
WTF_CSRF_ENABLED = True

# Set this API key to enable Mapbox visualizations
MAPBOX_API_KEY = ''

# Кэширование
CACHE_CONFIG = {
    'CACHE_TYPE': 'SimpleCache',
    'CACHE_DEFAULT_TIMEOUT': 300
}

# Настройки безопасности
SUPERSET_WEBSERVER_TIMEOUT = 300

# Настройки для работы с MongoDB
# Superset не поддерживает MongoDB напрямую, но можно использовать MongoDB Connector
# Для подключения к MongoDB используйте:
# mongodb://admin:admin123@localhost:27017/medcrm?authSource=admin
