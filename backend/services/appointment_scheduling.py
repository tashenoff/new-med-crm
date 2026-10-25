"""Shared booking validation for create, move and status reactivation."""
from datetime import datetime

from fastapi import HTTPException


INACTIVE_STATUSES = ("cancelled", "no_show")
SCHEDULE_FIELDS = ("doctor_id", "room_id", "appointment_date", "appointment_time", "end_time")


def interval(appointment):
    def minutes(value):
        parsed = datetime.strptime(value, "%H:%M")
        return parsed.hour * 60 + parsed.minute

    try:
        start = minutes(appointment["appointment_time"])
        # Legacy bookings without an end occupy the calendar's default slot.
        end = minutes(appointment["end_time"]) if appointment.get("end_time") else start + 30
    except (KeyError, TypeError, ValueError):
        raise HTTPException(400, "Некорректное время записи")
    if end <= start or end > 24 * 60:
        raise HTTPException(400, "Время окончания должно быть позже начала в пределах одного дня")
    return start, end


async def validate_booking(db, appointment, exclude_id=None):
    if appointment.get("status") in INACTIVE_STATUSES:
        return
    start, end = interval(appointment)
    if end - start < 30:
        raise HTTPException(400, "Минимальная длительность приёма — 30 минут")
    if not appointment.get("complex_id"):
        day = datetime.strptime(appointment["appointment_date"], "%Y-%m-%d").weekday()
        schedules = await db.doctor_schedules.find({
            "doctor_id": appointment["doctor_id"], "day_of_week": day, "is_active": True,
        }).to_list(None)
        def fits(schedule):
            shift_start, shift_end = interval({"appointment_time": schedule["start_time"], "end_time": schedule["end_time"]})
            return shift_start <= start < end <= shift_end
        if not any(fits(schedule) for schedule in schedules):
            raise HTTPException(400, "Запись не помещается в рабочее расписание врача")

    resources = [{"doctor_id": appointment["doctor_id"]}]
    if appointment.get("room_id"):
        resources.append({"room_id": appointment["room_id"]})
    query = {"appointment_date": appointment["appointment_date"],
             "status": {"$nin": list(INACTIVE_STATUSES)}, "$or": resources}
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    for other in await db.appointments.find(query).to_list(None):
        other_start, other_end = interval(other)
        if start < other_end and other_start < end:
            raise HTTPException(400, "Время пересекается с другой записью врача или кабинета")


async def resolve_booking_time(db, appointment):
    """Move a NEW booking forward to the first fitting gap on the same day.

    Keep its doctor, room and duration. Existing bookings are never moved.
    Updates/reactivation continue to use strict validate_booking.
    """
    resolved = dict(appointment)
    start, end = interval(resolved)
    duration = end - start
    if duration < 30:
        raise HTTPException(400, "Минимальная длительность приёма — 30 минут")
    try:
        day = datetime.strptime(resolved["appointment_date"], "%Y-%m-%d").weekday()
    except (KeyError, TypeError, ValueError):
        raise HTTPException(400, "Некорректная дата записи") from None
    if not resolved.get("doctor_id"):
        raise HTTPException(400, "Выберите врача")
    if resolved.get("status") in INACTIVE_STATUSES:
        return resolved
    resources = [{"doctor_id": resolved["doctor_id"]}]
    if resolved.get("room_id"):
        resources.append({"room_id": resolved["room_id"]})
    rows = await db.appointments.find({"appointment_date": resolved["appointment_date"],
        "status": {"$nin": list(INACTIVE_STATUSES)}, "$or": resources}).to_list(None)
    occupied = sorted(interval(row) for row in rows)
    if any(start < other_end and other_start < end for other_start, other_end in occupied):
        if resolved.get("complex_id"):
            windows = [(0, 24 * 60 - 1)]  # Preserve the existing manual complex exception.
        else:
            schedules = await db.doctor_schedules.find({"doctor_id": resolved["doctor_id"],
                "day_of_week": day, "is_active": True}).to_list(None)
            windows = sorted(interval({"appointment_time": row["start_time"], "end_time": row["end_time"]})
                for row in schedules if not resolved.get("room_id") or not row.get("room_id")
                or row["room_id"] == resolved["room_id"])
        chosen = None
        for shift_start, shift_end in windows:
            candidate = max(start, shift_start)
            for other_start, other_end in occupied:
                if other_end <= candidate:
                    continue
                if candidate + duration <= other_start:
                    break
                candidate = other_end
            if candidate + duration <= shift_end:
                chosen = candidate
                break
        if chosen is None:
            raise HTTPException(409, "На выбранную дату больше нет свободного времени для приёма этой длительности. Выберите другую дату.")
        start, end = chosen, chosen + duration
    resolved.update(appointment_time=f"{start // 60:02d}:{start % 60:02d}",
                    end_time=f"{end // 60:02d}:{end % 60:02d}")
    await validate_booking(db, resolved)
    return resolved


def needs_booking_validation(existing, updated):
    return (any(existing.get(key) != updated.get(key) for key in SCHEDULE_FIELDS)
            or (existing.get("status") in INACTIVE_STATUSES and updated.get("status") not in INACTIVE_STATUSES))
