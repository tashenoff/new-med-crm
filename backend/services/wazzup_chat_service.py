"""Сервис WhatsApp-инбокса: сущность «чат» (агрегат на номер телефона).

Отдельная от wazzup_service (API Wazzup24) логика: здесь живёт только
Mongo-часть — апсейт чата на входящее/исходящее, список, статусы, привязки.
Принимает db аргументом для тестируемости (как LeadService).
"""
import re
from typing import List, Optional, Dict, Any
from datetime import datetime

from motor.motor_asyncio import AsyncIOMotorDatabase


class WazzupChatService:
    """Агрегат чата по нормализованному номеру телефона."""

    COLLECTION = "wazzup_chats"

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db[self.COLLECTION]

    @staticmethod
    def _norm_phone(phone: str) -> str:
        """Нормализация телефона до +7... (тот же формат, что у сообщений)."""
        p = "".join(c for c in (phone or "") if c.isdigit() or c == "+")
        if p.startswith("8") and len(p) == 11:
            p = "+7" + p[1:]
        elif p and not p.startswith("+"):
            p = "+" + p
        return p

    async def upsert_incoming(
        self,
        phone: str,
        contact_name: Optional[str],
        text: Optional[str],
        channel_id: Optional[str],
        ts: datetime,
        linked_lead_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> None:
        """Новое входящее сообщение: инкремент непрочитанных, обновить последнее."""
        key = self._norm_phone(phone)
        update: Dict[str, Any] = {
            "$set": {
                "phone": key,
                "contact_name": contact_name or "",
                "channel_id": channel_id or "",
                "last_message": text or "",
                "last_message_time": ts,
                "updated_at": ts,
            },
            "$inc": {"unread_count": 1},
        }
        if linked_lead_id:
            update["$set"]["linked_lead_id"] = str(linked_lead_id)
            if status is not None:
                update["$set"]["status"] = status
        await self.collection.update_one({"phone": key}, update, upsert=True)

    async def upsert_outgoing(
        self,
        phone: str,
        text: Optional[str],
        ts: datetime,
        status: Optional[str] = None,
    ) -> None:
        """Исходящее: сброс непрочитанных, обновить последнее сообщение."""
        key = self._norm_phone(phone)
        update: Dict[str, Any] = {
            "$set": {
                "phone": key,
                "last_message": text or "",
                "last_message_time": ts,
                "updated_at": ts,
                "unread_count": 0,
            }
        }
        if status is not None:
            update["$set"]["status"] = status
        await self.collection.update_one({"phone": key}, update, upsert=True)

    @staticmethod
    def _phone_key(phone):
        """Стабильный ключ для поиска пациента: последние 10 цифр (сглаживает +7/8/7 префиксы)."""
        digits = re.sub(r"\D", "", phone or "")
        return digits[-10:] if len(digits) >= 10 else digits

    async def _resolve_patient(self, phone):
        """Найти существующего пациента по телефону (сравнение по last-10-цифрам)."""
        key = self._phone_key(phone)
        if not key:
            return None
        cursor = self.db.patients.find({}, {"id": 1, "full_name": 1, "phone": 1})
        async for pat in cursor:
            if self._phone_key(pat.get("phone")) == key:
                return pat
        return None

    async def _enrich_patient(self, doc):
        """Привязать к текущему чат-доку пациентa из CRM и вернуть обогащённый doc."""
        patient = None
        if doc.get("linked_patient_id"):
            patient = await self.db.patients.find_one(
                {"id": doc["linked_patient_id"]}, {"id": 1, "full_name": 1, "phone": 1}
            )
        else:
            patient = await self._resolve_patient(doc["phone"])
            if patient:
                await self.collection.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {
                        "linked_patient_id": patient.get("id"),
                        "patient_name": patient.get("full_name") or "",
                        "updated_at": datetime.utcnow(),
                    }},
                )
        if patient:
            doc["patient_id"] = patient.get("id")
            doc["patient_name"] = patient.get("full_name") or doc.get("contact_name")
            doc["patient_phone"] = patient.get("phone") or doc.get("phone")
        else:
            doc["patient_id"] = None
            doc["patient_name"] = doc.get("contact_name")
        return doc

    async def list_chats(
        self,
        status: Optional[str] = None,
        assigned_manager_id: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 100,
        skip: int = 0,
    ) -> List[Dict[str, Any]]:
        """Список чатов, новые сверху. Фильтры: статус, менеджер, поиск по имени/телефону."""
        query: Dict[str, Any] = {}
        if status:
            query["status"] = status
        if assigned_manager_id:
            query["assigned_manager_id"] = assigned_manager_id
        if search:
            import re

            rx = re.compile(re.escape(search), re.IGNORECASE)
            query["$or"] = [{"contact_name": rx}, {"phone": rx}]

        cursor = self.collection.find(query).sort("last_message_time", -1).skip(skip).limit(limit)
        docs = []
        async for doc in cursor:
            doc = await self._enrich_patient(doc)
            doc.pop("_id", None)
            docs.append(doc)
        return docs

    async def get_chat(self, phone: str) -> Optional[Dict[str, Any]]:
        key = self._norm_phone(phone)
        doc = await self.collection.find_one({"phone": key})
        if doc:
            doc = await self._enrich_patient(doc)
            doc.pop("_id", None)
        return doc

    async def set_field(self, phone: str, field: str, value: Any) -> bool:
        """Обновить одно поле чата (status/assigned_manager_id/linked_patient_id...)."""
        key = self._norm_phone(phone)
        result = await self.collection.update_one(
            {"phone": key}, {"$set": {field: value, "updated_at": datetime.utcnow()}}
        )
        return result.matched_count > 0


# Основной инстанс с db из environment (как wazzup_service), но методы обычно
# зовутся с явным db из роутов/вебхука.
def get_chat_service(db):
    return WazzupChatService(db)