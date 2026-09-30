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
        self,
        patient_phone: str,
        patient_name: str,
        doctor_name: str,
        appointment_date: str,
        appointment_time: str,
        cabinet: Optional[str] = None
    ):
        """
        Отправить уведомление о создании записи
        
        Args:
            patient_phone: Телефон пациента
            patient_name: Имя пациента
            doctor_name: Имя врача
            appointment_date: Дата записи
            appointment_time: Время записи
            cabinet: Кабинет (опционально)
        """
        try:
            # Получаем активные правила для создания записи
            rules = await self.rule_service.get_active_rules_by_trigger(
                trigger=NotificationTrigger.APPOINTMENT_CREATED,
                recipient=NotificationRecipient.PATIENT
            )
            
            if not rules:
                print("📭 Нет активных правил уведомлений для создания записи")
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
                    
                    print(f"Уведомление отправлено пациенту {patient_name} ({patient_phone})")
                    
                except Exception as e:
                    print(f"Ошибка отправки уведомления по правилу {rule.id}: {str(e)}")
                    continue
        
        except Exception as e:
            print(f"Ошибка в сервисе отправки уведомлений: {str(e)}")
            # Не прерываем выполнение основной операции

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
