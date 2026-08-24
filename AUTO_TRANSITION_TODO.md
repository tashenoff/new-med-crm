# Автопереход статусов карточек в CRM

## Описание задачи
Автоматический переход карточки (записи на приём / лида) с этапа **«Пациент пришёл»** на этап **«Приём завершён»** через заданное время.
Например, ежедневно в **20:00** все записи со статусом `arrived` автоматически переводятся в `completed`.

---

## 1. Анализ текущей системы

### Модели статусов

**Appointment (запись на приём):**
| Статус | Значение | Этап |
|--------|----------|------|
| `unconfirmed` | Не подтверждено | 🟡 |
| `confirmed` | Подтверждено | 🟢 |
| `arrived` | Пациент пришёл | 🔵 |
| `in_progress` | На приёме | 🟠 |
| `completed` | Приём завершён | 🟤 |
| `cancelled` | Отменено | 🔴 |
| `no_show` | Не явился | ⚪ |

**Lead (заявка в CRM):**
| Статус | Значение |
|--------|----------|
| `NEW` | Неразобранные |
| `CONTACTED` | Записан на приём |
| `IN_PROGRESS` | Запись подтверждена |
| `CONVERTED` | Пациент пришёл |
| `CLOSED` | Оплачено |

### Текущий флоу (из CRM_TASKS_SYSTEM.md)
```
NEW → CONTACTED → IN_PROGRESS → CONVERTED → CLOSED
```

### Существующая синхронизация
В `routers/appointments.py` уже есть механизм синхронизации статусов Appointment → Lead через `sync_lead_from_appointment_status`. При переводе `arrived` → `completed` нужно, чтобы лид шёл `CONVERTED` → `CLOSED`.

---

## 2. Предлагаемые варианты реализации

### 🔷 Вариант A: APScheduler (РЕКОМЕНДУЕТСЯ)

**Суть:** Добавить `APScheduler` — встроенный планировщик внутри FastAPI.

**Плюсы:**
- ✅ Не требует внешних сервисов (Redis/Celery)
- ✅ Работает в том же процессе FastAPI
- ✅ Поддерживает cron-расписание (`20:00 daily`)
- ✅ Job coalescing (не запустит повторно, если предыдущая ещё выполняется)
- ✅ Легко конфигурируется через `.env`
- ✅ Стандартное решение для FastAPI

**Минусы:**
- ❌ Нужна новая зависимость
- ❌ Планировщик сбрасывается при рестарте (но это нормально)

**Файлы для изменений:**
| Файл | Действие |
|------|----------|
| `backend/requirements.txt` | + `apscheduler>=3.10.0` |
| `backend/scheduler.py` | **Создать** — модуль с планировщиком и задачей |
| `backend/server.py` | Подключить планировщик в `lifespan` |
| `.env` | Параметры: `AUTO_COMPLETE_TIME=20:00` |

**Пример:**
```python
# scheduler.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

async def auto_complete_appointments(db: AsyncIOMotorDatabase):
    today = datetime.utcnow().strftime("%Y-%m-%d")
    result = await db.appointments.update_many(
        {"status": "arrived", "appointment_date": today},
        {"$set": {"status": "completed", "updated_at": datetime.utcnow()}}
    )
    # Синхронизация лидов (вызов lead_service)
    logger.info(f"[Scheduler] Auto-completed {result.modified_count} appointments")

def setup_scheduler(db: AsyncIOMotorDatabase):
    scheduler.add_job(
        auto_complete_appointments,
        CronTrigger(hour=20, minute=0),
        args=[db],
        id='auto_complete_appointments',
        replace_existing=True,
        coalesce=True
    )