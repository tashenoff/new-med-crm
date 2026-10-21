"""
Сервис отправки уведомлений по правилам
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
from datetime import datetime

from services.notification_rule_service import NotificationRuleService
from services.wazzup_service import wazzup_service
from models.notification_rule import NotificationTrigger, NotificationRecipient
from models.wazzup import SendMessageRequest


class NotificationSender:
    """Сервис для автоматической отправки уведомлений"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.rule_service = NotificationRuleService(db)
    
    def _replace_macros(self, template: str, data: dict) -> str:
        """Заменить макросы в шаблоне"""
        message = template
        
        # Базовые макросы
        message = message.replace('%name%', data.get('patient_name', ''))
        message = message.replace('%doctor%', data.get('doctor_name', ''))
        message = message.replace('%date%', data.get('appointment_date', ''))
        message = message.replace('%time%', data.get('appointment_time', ''))
        message = message.replace('%cabinet%', data.get('cabinet', ''))
        message = message.replace('%old_date%', data.get('old_date', ''))
        message = message.replace('%old_time%', data.get('old_time', ''))
        
        return message
    
    async def send_appointment_created_notification(
        self, patient_phone, patient_name, doctor_name, appointment_date,
        appointment_time, cabinet=None, *, patient_id=None, appointment_id=None,
    ):
        """One provider submission per stored appointment; never claim delivery.

        A transport failure has an uncertain outcome. Retrying it automatically
        would duplicate WhatsApp messages, since this provider API has no local
        idempotency contract. Such events require provider reconciliation.
        """
        from pymongo.errors import DuplicateKeyError
        from services.patient_consent import PatientConsentService
        import logging
        log = logging.getLogger(__name__)
        if not patient_id or not appointment_id:
            log.error("Appointment notification missing stored identity")
            return {"state": "blocked"}
        event_id = "appointment_created:" + appointment_id
        previous = await self.db.appointment_notifications.find_one({"_id": event_id})
        if previous:
            return {"state": previous["state"]}
        try:
            consent = PatientConsentService(self.db)
            # Never send using an unverified caller-supplied patient/appointment pair.
            patient = await consent.patient(patient_id)
            appointment = await self.db.appointments.find_one({"id": appointment_id, "patient_id": patient_id})
            if not appointment or not patient.get("phone"):
                return {"state": "blocked"}
            rules = await self.rule_service.get_active_rules_by_trigger(
                trigger=NotificationTrigger.APPOINTMENT_CREATED,
                recipient=NotificationRecipient.PATIENT)
            if not rules:
                return {"state": "disabled"}
            # Stable priority, one existing rule only. Never a second consent message.
            rule = sorted(rules, key=lambda r: str(r.id))[0]
            text = self._replace_macros(rule.message_template, {
                "patient_name": patient_name, "doctor_name": doctor_name,
                "appointment_date": appointment_date, "appointment_time": appointment_time,
                "cabinet": cabinet or ""})
            # Existing templates occasionally omit one of these macros.
            if appointment_date not in text or appointment_time not in text:
                text += f"\nЗапись: {appointment_date} {appointment_time}"
            url = await consent.issue(patient_id)
            persisted_text = text
            if url:
                text += "\nУсловия для пациента (демонстрационный пример): " + url
                persisted_text += "\nУсловия для пациента: [персональная ссылка скрыта]"
        except Exception:
            log.error("Appointment notification preparation blocked; no submission attempted")
            return {"state": "blocked"}
        try:
            await self.db.appointment_notifications.insert_one({
                "_id": event_id, "appointment_id": appointment_id,
                "clinic_id": consent.config.clinic, "state": "submitting",
                "created_at": datetime.utcnow(), "rule_id": str(rule.id)})
        except DuplicateKeyError:
            previous = await self.db.appointment_notifications.find_one({"_id": event_id})
            return {"state": previous["state"]}
        try:
            result = await wazzup_service.send_message(
                SendMessageRequest(phone=patient["phone"], text=text),
                persisted_text=persisted_text)
            if not result.id:
                raise RuntimeError("No provider acknowledgement")
        except Exception:
            await self.db.appointment_notifications.update_one({"_id": event_id}, {"$set": {
                "state": "unknown", "updated_at": datetime.utcnow()}})
            log.warning("Appointment notification outcome unknown; automatic retry suppressed")
            return {"state": "unknown"}
        await self.db.appointment_notifications.update_one({"_id": event_id}, {"$set": {
            "state": "submitted", "provider_message_id": result.id, "updated_at": datetime.utcnow()}})
        return {"state": "submitted"}

    async def send_appointment_no_show_notification(
        self,
        patient_phone: str,
        patient_name: str,
        doctor_name: str,
        appointment_date: str,
        appointment_time: str,
        cabinet: Optional[str] = None
    ):
        """
        Отправить уведомление при неявке пациента (опрос причины)
        "
        """
        try:
            # Получаем активные правила для неявки на прием
            rules = await self.rule_service.get_active_rules_by_trigger(
                trigger=NotificationTrigger.APPOINTMENT_NO_SHOW,
                recipient=NotificationRecipient.PATIENT
            )

            if not rules:
                print("📭 Нет активных правил уведомлений для неявки на прием")
                return

            # Данные для макросов
            macro_data = {
                'patient_name': patient_name,
                'doctor_name': doctor_name,
                'appointment_date': appointment_date,
                'appointment_time': appointment_time,
                'cabinet': cabinet or ''
            }

            # Отправляем уведомления по каждому правилу
            for rule in rules:
                try:
                    # Заменяем макросы в шаблоне
                    message_text = self._replace_macros(rule.message_template, macro_data)

                    # Отправляем через Wazzup
                    request = SendMessageRequest(
                        phone=patient_phone,
                        text=message_text
                    )

                    await wazzup_service.send_message(request)

                    print(f"Уведомление о неявке отправлено пациенту {patient_name} ({patient_phone})")

                except Exception as e:
                    print(f"Ошибка отправки уведомления о неявке по правилу {rule.id}: {str(e)}")
                    continue

        except Exception as e:
            print(f"Ошибка в сервисе отправки уведомлений о неявке: {str(e)}")
            # Не прерываем выполнение основной операции

    async def send_appointment_cancelled_notification(
        self,
        patient_phone: str,
        patient_name: str,
        doctor_name: str,
        appointment_date: str,
        appointment_time: str,
        cabinet: Optional[str] = None
    ):
        """Отправить уведомление при отмене записи (по правилам)."""
        try:
            rules = await self.rule_service.get_active_rules_by_trigger(
                trigger=NotificationTrigger.APPOINTMENT_CANCELLED,
                recipient=NotificationRecipient.PATIENT
            )
            if not rules:
                print("📭 Нет активных правил уведомлений для отмены записи")
                return
            macro_data = {
                'patient_name': patient_name, 'doctor_name': doctor_name,
                'appointment_date': appointment_date, 'appointment_time': appointment_time,
                'cabinet': cabinet or ''
            }
            for rule in rules:
                try:
                    message_text = self._replace_macros(rule.message_template, macro_data)
                    await wazzup_service.send_message(SendMessageRequest(phone=patient_phone, text=message_text))
                    print(f"Уведомление об отмене отправлено пациенту {patient_name} ({patient_phone})")
                except Exception as e:
                    print(f"Ошибка отправки уведомления об отмене по правилу {rule.id}: {str(e)}")
                    continue
        except Exception as e:
            print(f"Ошибка в сервисе отправки уведомлений об отмене: {str(e)}")

    async def send_appointment_completed_notification(
        self,
        patient_phone: str,
        patient_name: str,
        doctor_name: str,
        appointment_date: str,
        appointment_time: str,
        cabinet: Optional[str] = None
    ):
        """Отправить уведомление при завершении приема (запрос обратной связи)."""
        try:
            rules = await self.rule_service.get_active_rules_by_trigger(
                trigger=NotificationTrigger.APPOINTMENT_COMPLETED,
                recipient=NotificationRecipient.PATIENT
            )
            if not rules:
                print("📭 Нет активных правил уведомлений для завершения приема")
                return
            macro_data = {
                'patient_name': patient_name, 'doctor_name': doctor_name,
                'appointment_date': appointment_date, 'appointment_time': appointment_time,
                'cabinet': cabinet or ''
            }
            for rule in rules:
                try:
                    message_text = self._replace_macros(rule.message_template, macro_data)
                    await wazzup_service.send_message(SendMessageRequest(phone=patient_phone, text=message_text))
                    print(f"Уведомление о завершении приема отправлено пациенту {patient_name} ({patient_phone})")
                except Exception as e:
                    print(f"Ошибка отправки уведомления о завершении по правилу {rule.id}: {str(e)}")
                    continue
        except Exception as e:
            print(f"Ошибка в сервисе отправки уведомлений о завершении: {str(e)}")

    async def send_appointment_rescheduled_notification(
        self,
        patient_phone: str,
        patient_name: str,
        doctor_name: str,
        appointment_date: str,
        appointment_time: str,
        old_date: Optional[str] = None,
        old_time: Optional[str] = None,
        cabinet: Optional[str] = None
    ):
        """Отправить уведомление при переносе записи (со старым и новым временем)."""
        try:
            rules = await self.rule_service.get_active_rules_by_trigger(
                trigger=NotificationTrigger.APPOINTMENT_RESCHEDULED,
                recipient=NotificationRecipient.PATIENT
            )
            if not rules:
                print("📭 Нет активных правил уведомлений для переноса записи")
                return
            macro_data = {
                'patient_name': patient_name, 'doctor_name': doctor_name,
                'appointment_date': appointment_date, 'appointment_time': appointment_time,
                'old_date': old_date or '', 'old_time': old_time or '',
                'cabinet': cabinet or ''
            }
            for rule in rules:
                try:
                    message_text = self._replace_macros(rule.message_template, macro_data)
                    await wazzup_service.send_message(SendMessageRequest(phone=patient_phone, text=message_text))
                    print(f"Уведомление о переносе отправлено пациенту {patient_name} ({patient_phone})")
                except Exception as e:
                    print(f"Ошибка отправки уведомления о переносе по правилу {rule.id}: {str(e)}")
                    continue
        except Exception as e:
            print(f"Ошибка в сервисе отправки уведомлений о переносе: {str(e)}")


async def notify_created_appointment(db, appointment):
    """Shared entry for the two legacy CRM conversion paths."""
    from services.patient_consent import PatientConsentService
    import logging
    try:
        patient = await PatientConsentService(db).patient(appointment["patient_id"])
        doctor = await db.doctors.find_one({"id": appointment.get("doctor_id")})
        room = await db.rooms.find_one({"id": appointment.get("room_id")}) if appointment.get("room_id") else None
        date = appointment.get("appointment_date", "")
        if isinstance(date, datetime):
            date = date.strftime("%Y-%m-%d")
        return await NotificationSender(db).send_appointment_created_notification(
            patient_phone=patient.get("phone"), patient_name=patient.get("full_name", "Пациент"),
            doctor_name=(doctor or {}).get("full_name", "Врач"), appointment_date=date,
            appointment_time=appointment.get("appointment_time", ""), cabinet=(room or {}).get("name"),
            patient_id=appointment["patient_id"], appointment_id=appointment["id"])
    except Exception:
        logging.getLogger(__name__).error("Conversion appointment notification blocked")
        return {"state": "blocked"}
