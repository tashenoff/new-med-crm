"""Сервис интерактивной обратной связи (оценка 1-10 после завершения приёма).

Поток: завершение приёма -> start_survey (ждём оценку) -> приходит балл ->
хороший -> шлём ссылку на отзыв; плохой -> просим причины -> сохраняем (BAD).
Входная точка для ответа пациента — входящий вебхук WhatsApp (handle_incoming).
"""
import re
from datetime import datetime
from typing import Optional, Dict, Any, List

from models.feedback import FeedbackSettings, FeedbackStatus, PatientFeedback


class FeedbackService:
    def __init__(self, db):
        self.db = db
        self.settings_coll = db.feedback_settings
        self.feedback_coll = db.patient_feedback

    # ---------- НАСТРОЙКИ ----------

    async def get_settings(self) -> FeedbackSettings:
        doc = await self.settings_coll.find_one({"_id": "main"})
        if not doc:
            return FeedbackSettings()
        kwargs = {k: v for k, v in doc.items() if k in FeedbackSettings.model_fields and k != "_id"}
        return FeedbackSettings(**kwargs)

    async def update_settings(self, patch: Dict[str, Any]) -> FeedbackSettings:
        cur = (await self.get_settings()).model_dump()
        for k, v in (patch or {}).items():
            if v is not None and k in cur:
                cur[k] = v
        cur["updated_at"] = datetime.utcnow()
        doc = {**cur, "_id": "main"}
        await self.settings_coll.replace_one({"_id": "main"}, doc, upsert=True)
        return await self.get_settings()

    # ---------- ПРАВИЛО (автодобавление) ----------

    async def ensure_completed_rule(self) -> None:
        """Авто-создаёт правило appointment_completed (запрос оценки), если его нет."""
        exists = await self.db.notification_rules.find_one({
            "trigger": "appointment_completed",
            "recipient": "patient",
        })
        if exists:
            return
        await self.db.notification_rules.insert_one({
            "status": True,
            "recipient": "patient",
            "trigger": "appointment_completed",
            "method": "wazzup",
            "message_template": (
                "%name%, спасибо, что посетили нашу клинику! Пожалуйста, оцените приём "
                "%doctor% %date% в %time% по шкале от 1 до 10 (1 — очень плохо, 10 — отлично)."
            ),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        })

    # ---------- ЗАПУСК ОПРОСА ----------

    async def start_survey(self, appointment: dict, patient_name: str, phone: str, doctor_name: str) -> None:
        """Создать активный опрос при завершении приёма (статус pending_score)."""
        settings = await self.get_settings()
        if not settings.enabled:
            return
        existing = await self.feedback_coll.find_one({
            "appointment_id": appointment.get("id"),
            "status": {"$in": [FeedbackStatus.PENDING_SCORE.value, FeedbackStatus.PENDING_REASON.value]},
        })
        if existing:
            return
        await self.feedback_coll.insert_one({
            "patient_id": appointment.get("patient_id"),
            "patient_name": patient_name,
            "patient_phone": phone,
            "appointment_id": appointment.get("id"),
            "doctor_name": doctor_name,
            "score": None,
            "reason": None,
            "status": FeedbackStatus.PENDING_SCORE.value,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        })

    # ---------- ОБРАБОТКА ВХОДЯЩЕГО ----------

    @staticmethod
    def _parse_score(text: str) -> Optional[int]:
        m = re.search(r"\b(10|[1-9])\b", text or "")
        if not m:
            return None
        return int(m.group(1))

    async def _latest_pending(self, phone: str) -> Optional[dict]:
        return await self.feedback_coll.find_one(
            {"patient_phone": phone, "status": {"$in": [
                FeedbackStatus.PENDING_SCORE.value, FeedbackStatus.PENDING_REASON.value]}},
            sort=[("created_at", -1)],
        )

    async def handle_incoming(self, phone: str, text: str) -> Optional[Dict[str, str]]:
        """Обработать ответ пациента. Возвращает {"consumed", "reply"}: consumed=True если
        сообщение — ответ на активный опрос (лид создавать не нужно); reply = текст для
        отправки пациенту или None."""
        settings = await self.get_settings()
        if not settings.enabled:
            return {"consumed": False, "reply": None}
        survey = await self._latest_pending(phone)
        if not survey:
            return {"consumed": False, "reply": None}

        status = survey["status"]
        now = datetime.utcnow()

        if status == FeedbackStatus.PENDING_SCORE.value:
            score = self._parse_score(text)
            if score is None:
                return {"consumed": True, "reply": None}  # не число — опрос остаётся открытым
            await self.feedback_coll.update_one(
                {"_id": survey["_id"]},
                {"$set": {"score": score, "updated_at": now}},
            )
            if score >= settings.good_score_min:
                await self.feedback_coll.update_one(
                    {"_id": survey["_id"]},
                    {"$set": {"status": FeedbackStatus.GOOD.value, "updated_at": now}},
                )
                reply = settings.good_message.format(score=score, link=settings.review_link)
            else:
                await self.feedback_coll.update_one(
                    {"_id": survey["_id"]},
                    {"$set": {"status": FeedbackStatus.PENDING_REASON.value, "updated_at": now}},
                )
                reply = settings.ask_reason_message.format(score=score)
            return {"consumed": True, "reply": {"phone": phone, "text": reply}}

        if status == FeedbackStatus.PENDING_REASON.value:
            reason = (text or "").strip()[:2000]
            await self.feedback_coll.update_one(
                {"_id": survey["_id"]},
                {"$set": {"reason": reason or None, "status": FeedbackStatus.BAD.value, "updated_at": now}},
            )
            return {"consumed": True, "reply": None}  # просто сохранили причину

        return {"consumed": False, "reply": None}

    # ---------- СПИСОК ----------

    async def list_feedback(self, limit: int = 500) -> List[PatientFeedback]:
        cursor = self.feedback_coll.find().sort("created_at", -1).limit(limit)
        out = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            out.append(PatientFeedback(**doc))
        return out
