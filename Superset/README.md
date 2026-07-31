# Apache Superset - Инструкция по установке и запуску

## Обзор

Эта папка содержит настройку Apache Superset для визуализации данных из вашей MongoDB базы данных `medcrm`.

## Предварительные требования

- Python 3.9 или выше
- pip (установщик пакетов Python)
- MongoDB (уже запущен в Docker)

## Установка

### Шаг 1: Активация виртуального окружения

```powershell
cd E:\new-med-crm\Superset
.\venv\Scripts\Activate.ps1
```

### Шаг 2: Установка Superset и зависимостей

```powershell
pip install -r requirements.txt
```

**Примечание:** Установка может занять 10-15 минут, так как Apache Superset имеет много зависимостей.

### Шаг 3: Настройка переменной окружения конфигурации

```powershell
$env:SUPERSET_CONFIG_PATH = "E:\new-med-crm\Superset\superset_config.py"
```

### Шаг 4: Инициализация базы данных Superset

```powershell
superset db upgrade
```

Эта команда создаст SQLite базу данных `superset.db` для хранения метаданных Superset.

### Шаг 5: Создание администратора

```powershell
superset fab create-admin
```

Вам будет предложено ввести:
- **Username**: admin (или любое другое имя)
- **First Name**: Admin
- **Last Name**: User
- **Email**: admin@example.com
- **Password**: (выберите надежный пароль)

### Шаг 6: Инициализация Superset

```powershell
superset init
```

Эта команда создаст роли, права доступа и примеры.

## Запуск Superset

### Режим разработки

```powershell
cd E:\new-med-crm\Superset
.\venv\Scripts\Activate.ps1
$env:SUPERSET_CONFIG_PATH = "E:\new-med-crm\Superset\superset_config.py"
superset run -p 8088 --with-threads --reload --debugger
```

После запуска откройте браузер и перейдите на: **http://localhost:8088**

### Режим продакшн (рекомендуется)

```powershell
cd E:\new-med-crm\Superset
.\venv\Scripts\Activate.ps1
$env:SUPERSET_CONFIG_PATH = "E:\new-med-crm\Superset\superset_config.py"
gunicorn -w 4 -k gevent --timeout 120 -b 0.0.0.0:8088 "superset.app:create_app()"
```

## Подключение к MongoDB

### Установка MongoDB коннектора

Superset не поддерживает MongoDB напрямую. Вам нужно установить дополнительный драйвер:

```powershell
pip install sqlalchemy-mongobi
```

Или используйте MongoDB Connector for BI (рекомендуется для продакшена).

### Альтернатива: Использование PyMongo через Custom SQL

1. В Superset перейдите к **Data** → **Databases**
2. Нажмите **+ Database**
3. Выберите **Other**
4. Введите SQLAlchemy URI:

```
mongodb://admin:admin123@localhost:27017/medcrm?authSource=admin
```

**Примечание:** Для полноценной работы с MongoDB рекомендуется использовать MongoDB BI Connector, который предоставляет SQL-интерфейс для MongoDB.

## Структура файлов

```
Superset/
├── venv/                    # Виртуальное окружение Python
├── docker-compose.yml       # Docker конфигурация для PostgreSQL (опционально)
├── requirements.txt         # Python зависимости
├── superset_config.py       # Конфигурация Superset
├── superset.db              # SQLite база данных (создается после инициализации)
└── README.md                # Этот файл
```

## Быстрый старт (все команды по порядку)

```powershell
# 1. Переход в папку Superset
cd E:\new-med-crm\Superset

# 2. Активация виртуального окружения
.\venv\Scripts\Activate.ps1

# 3. Установка зависимостей (если еще не установлены)
pip install -r requirements.txt

# 4. Установка переменной окружения
$env:SUPERSET_CONFIG_PATH = "E:\new-med-crm\Superset\superset_config.py"

# 5. Инициализация базы данных
superset db upgrade

# 6. Создание администратора
superset fab create-admin

# 7. Инициализация Superset
superset init

# 8. Запуск сервера
superset run -p 8088 --with-threads --reload --debugger
```

## Подключение к существующему PostgreSQL (если нужно)

Если вы хотите использовать PostgreSQL вместо SQLite для метаданных Superset:

1. Запустите PostgreSQL контейнер:
```powershell
cd E:\new-med-crm\Superset
docker-compose up -d
```

2. Измените в `superset_config.py`:
```python
SQLALCHEMY_DATABASE_URI = 'postgresql://superset:superset123@localhost:5432/superset'
```

3. Установите PostgreSQL драйвер:
```powershell
pip install psycopg2-binary
```

## Доступ к Superset

- **URL**: http://localhost:8088
- **Username**: admin (или то, что вы указали при создании)
- **Password**: пароль, который вы установили

## Решение проблем

### Ошибка: "superset: command not found"

Убедитесь, что виртуальное окружение активировано и Superset установлен.

### Ошибка подключения к MongoDB

Проверьте, что MongoDB контейнер запущен:
```powershell
docker ps
```

Вы должны увидеть контейнер `med-crm-mongo`.

### Порт 8088 уже занят

Запустите Superset на другом порту:
```powershell
superset run -p 8089
```

## Дополнительная информация

- [Официальная документация Superset](https://superset.apache.org/docs/intro)
- [MongoDB Connector for BI](https://www.mongodb.com/products/bi-connector)

## Полезные команды

```powershell
# Обновление Superset
pip install --upgrade apache-superset

# Проверка версии
superset version

# Очистка кэша
superset clear-cache

# Просмотр конфигурации
superset show-config
