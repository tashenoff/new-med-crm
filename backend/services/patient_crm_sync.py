"""Синхронизация ФИО пациента в CRM-карточку (клиенты и лиды)."""

import logging
from datetime import datetime
from typing import Dict, Any, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


def parse_full_name(full_name: str) -> Tuple[str, str, Optional[str]]:
    """Разобрать ФИО на last_name, first_name, middle_name.

    Формат: '<фамилия> <имя> [отчество]' (1–3 слова).
    Если слово одно — оно считается фамилией, first_name = "".
    middle_name возвращается как None, если не задано.
    """
    parts = (full_name or "").strip().split()
    last_name = parts[0] if parts else ""
    first_name = parts[1] if len(parts) > 1 else ""
    middle_name = parts[2] if len(parts) > 2 else None
    return last_name, first_name, middle_name


def _name_update_fields(full_name: str) -> Dict[str, Any]:
    """Подготовить поля для $set по разобранному ФИО."""
    last_name, first_name, middle_name = parse_full_name(full_name)
    fields: Dict[str, Any] = {
        "first_name": first_name,
        "last_name": last_name,
        "updated_at": datetime.utcnow(),
    }
    if middle_name is not None:
        fields["middle_name"] = middle_name
    else:
        fields["middle_name"] = None
    return fields


async def sync_crm_names_from_patient(
    db: AsyncIOMotorDatabase, patient_id: str, full_name: str
) -> None:
    """Обновить first_name/last_name/middle_name в crm_clients и crm_leads,
    связанных с пациентом patient_id, новым full_name.

    Ошибки не пробрасываются наружу — только логируются, чтобы не сломать
    сохранение пациента.
    """
    try:
        update_fields = _name_update_fields(full_name)

        await db.crm_clients.update_many(
            {"hms_patient_id": patient_id},
            {"$set": update_fields},
        )

        await db.crm_leads.update_many(
            {"converted_to_client_id": patient_id},
            {"$set": update_fields},
        )
    except Exception as exc:
        logger.exception(
            "Failed to sync CRM names for patient %s: %s", patient_id, exc
        )