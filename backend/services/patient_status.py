"""Статус визита пациента: новый / повторный.

Повторный  только если есть хотя бы один приём со статусом completed.
Scheduled / cancelled / no-show не меняют статус.
"""
from datetime import datetime
from typing import Optional


COMPLETED_STATUS = "completed"


def patient_visit_status(completed_count: int) -> str:
    """Новый  нет завершённых приёмов; повторный  есть хотя бы один completed."""
    return "returning" if (completed_count or 0) > 0 else "new"


def matches_returning_filter(is_returning: Optional[str], completed_count: int) -> bool:
    """Фильтр списка пациентов: all / returning / new."""
    if not is_returning or is_returning == "all":
        return True
    status = patient_visit_status(completed_count)
    if is_returning == "returning":
        return status == "returning"
    if is_returning == "new":
        return status == "new"
    return True


async def count_completed_appointments(db, patient_id: str) -> int:
    if not patient_id:
        return 0
    return await db.appointments.count_documents({
        "patient_id": patient_id,
        "status": COMPLETED_STATUS,
    })


async def refresh_patient_appointments_count(db, patient_id: str) -> int:
    """Пересчитать и сохранить appointments_count (только completed)."""
    if not patient_id:
        return 0
    completed_count = await count_completed_appointments(db, patient_id)
    await db.patients.update_one(
        {"id": patient_id},
        {"$set": {
            "appointments_count": completed_count,
            "updated_at": datetime.utcnow(),
        }},
    )
    return completed_count
