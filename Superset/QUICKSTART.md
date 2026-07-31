# Superset - Быстрый старт

## 🚀 Установка и запуск

### Вариант 1: Автоматическая установка (Рекомендуется)

```powershell
cd E:\new-med-crm\Superset
.\install_superset.ps1
```

Скрипт автоматически:
- Создаст виртуальное окружение
- Установит Apache Superset и все зависимости
- Инициализирует базу данных
- Попросит создать администратора
- Настроит все необходимые компоненты

### Вариант 2: Ручная установка

```powershell
cd E:\new-med-crm\Superset
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:SUPERSET_CONFIG_PATH = "E:\new-med-crm\Superset\superset_config.py"
superset db upgrade
superset fab create-admin
superset init
```

## ▶️ Запуск Superset

### Быстрый запуск

```powershell
cd E:\new-med-crm\Superset
.\start_superset.ps1
```

### Ручной запуск

```powershell
cd E:\new-med-crm\Superset
.\venv\Scripts\Activate.ps1
$env:SUPERSET_CONFIG_PATH = "E:\new-med-crm\Superset\superset_config.py"
superset run -p 8088 --with-threads --reload --debugger
```

## 🌐 Доступ к Superset

После запуска откройте браузер:
- **URL**: http://localhost:8088
- **Логин**: admin (или то, что вы указали при установке)
- **Пароль**: пароль, который вы установили

## 📊 Подключение к MongoDB

1. В Superset перейдите: **Settings** → **Database Connections**
2. Нажмите **+ Database**
3. Выберите **Other**
4. Введите подключение:
   ```
   mongodb://admin:admin123@localhost:27017/medcrm?authSource=admin
   ```

**Важно**: Superset не поддерживает MongoDB напрямую. Для полноценной работы рекомендуется использовать [MongoDB BI Connector](https://www.mongodb.com/products/bi-connector).

## 📁 Структура проекта

```
Superset/
├── venv/                      # Виртуальное окружение Python
├── docker-compose.yml         # PostgreSQL для метаданных (опция)
├── requirements.txt           # Зависимости Python
├── superset_config.py         # Конфигурация Superset
├── install_superset.ps1       # Скрипт установки
├── start_superset.ps1         # Скрипт запуска
├── README.md                  # Подробная документация
└── QUICKSTART.md              # Этот файл
```

## ❓ Решение проблем

### Порт 8088 занят
```powershell
superset run -p 8089
```

### MongoDB не подключается
Проверьте, что контейнер запущен:
```powershell
docker ps
```

### Superset не запускается
Убедитесь, что виртуальное окружение активировано и переменная SUPERSET_CONFIG_PATH установлена.

## 📚 Дополнительная информация

Полная документация: [README.md](./README.md)

Официальная документация Superset: https://superset.apache.org/docs/intro
