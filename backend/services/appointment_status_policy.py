"""Visit-day guard shared by appointment PUT and status PATCH."""
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException


def clinic_today():
    return datetime.now(timezone(timedelta(hours=6))).date().isoformat()


def guard_appointment_status(appointment, status):
    if status not in ('arrived', 'in_progress', 'completed', 'no_show'):
        return
    date = appointment.get('appointment_date')
    try:
        datetime.strptime(date, '%Y-%m-%d')
    except (TypeError, ValueError):
        raise HTTPException(409, 'Не удалось определить дату приёма') from None
    if date > clinic_today():
        raise HTTPException(409, 'Статус посещения доступен с даты приёма')
