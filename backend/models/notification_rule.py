from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class NotificationTrigger(str, Enum):
    """Триггер уведомления"""
    APPOINTMENT_CREATED = "appointment_created"  # При создании записи
    APPOINTMENT_REMINDER = "appointment_reminder"  # Напоминание о записи
    APPOINTMENT_CANCELLED = "appointment_cancelled"  # При отмене записи


class NotificationMethod(str, Enum):
    """Метод отправки уведомления"""
    WAZZUP = "wazzup"  # Через Wazzup WhatsApp API


class NotificationRecipient(str, Enum):
    """Получатель уведомления"""
    PATIENT = "patient"  # Пациент
    DOCTOR = "doctor"  # Врач


class NotificationRule(BaseModel):
    """Модель правила уведомления"""
    id: Optional[str] = Field(None, alias="_id")
    status: bool = Field(True, description="Статус правила (включено/выключено)")
    recipient: NotificationRecipient = Field(..., description="Кого уведомляем")
    trigger: NotificationTrigger = Field(..., description="Триггер события")
    method: NotificationMethod = Field(..., description="Метод отправки")
    message_template: str = Field(..., description="Шаблон сообщения")
    doctors: Optional[List[str]] = Field(None, description="Список ID врачей (если применимо ко всем - оставить None)")
    services: Optional[List[str]] = Field(None, description="Список услуг (если применимо ко всем - оставить None)")
    
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "status": True,
                "recipient": "patient",
                "trigger": "appointment_created",
                "method": "wazzup",
                "message_template": "%name%, Ваша запись: Дата: %date% Врач: %doctor%",
                "doctors": None,
                "services": None
            }
        }


class NotificationRuleCreate(BaseModel):
    """Схема создания правила уведомления"""
    status: bool = True
    recipient: NotificationRecipient
    trigger: NotificationTrigger
    method: NotificationMethod
    message_template: str
    doctors: Optional[List[str]] = None
    services: Optional[List[str]] = None


class NotificationRuleUpdate(BaseModel):
    """Схема обновления правила уведомления"""
    status: Optional[bool] = None
    message_template: Optional[str] = None
    doctors: Optional[List[str]] = None
    services: Optional[List[str]] = None
