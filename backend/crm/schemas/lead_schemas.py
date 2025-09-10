"""
Lead Schemas - Pydantic схемы для валидации данных лидов
"""

from datetime import datetime
from typing import Optional, List, Dict
from pydantic import BaseModel, Field, validator
from ..models.lead import LeadStatus, LeadSource, LeadPriority


class LeadBase(BaseModel):
    """Базовая схема лида"""
    first_name: str = Field(..., min_length=1, max_length=50, description="Имя")
    last_name: str = Field(..., min_length=1, max_length=50, description="Фамилия")
    middle_name: Optional[str] = Field(None, max_length=50, description="Отчество")
    phone: str = Field(..., min_length=10, max_length=20, description="Номер телефона")
    email: Optional[str] = Field(None, description="Email адрес")
    source: LeadSource = Field(..., description="Источник лида")
    source_id: Optional[str] = Field(None, description="ID источника из CRM")
    priority: LeadPriority = Field(LeadPriority.MEDIUM, description="Приоритет")
    company: Optional[str] = Field(None, max_length=100, description="Компания")
    position: Optional[str] = Field(None, max_length=100, description="Должность")
    budget: Optional[float] = Field(None, ge=0, description="Предполагаемый бюджет")
    description: Optional[str] = Field(None, max_length=1000, description="Описание заявки")
    services_interested: Optional[List[str]] = Field(default_factory=list, description="Интересующие услуги")
    preferred_contact_time: Optional[str] = Field(None, max_length=100, description="Предпочитаемое время связи")

    @validator('email')
    def validate_email(cls, v):
        if v and '@' not in v:
            raise ValueError('Некорректный email адрес')
        return v

    @validator('phone')
    def validate_phone(cls, v):
        # Простая валидация телефона
        cleaned = ''.join(filter(str.isdigit, v))
        if len(cleaned) < 10:
            raise ValueError('Номер телефона должен содержать минимум 10 цифр')
        return v


class LeadCreate(LeadBase):
    """Схема для создания лида"""
    assigned_manager_id: Optional[str] = Field(None, description="ID назначенного менеджера")


class LeadUpdate(BaseModel):
    """Схема для обновления лида"""
    first_name: Optional[str] = Field(None, min_length=1, max_length=50)
    last_name: Optional[str] = Field(None, min_length=1, max_length=50)
    middle_name: Optional[str] = Field(None, max_length=50)
    phone: Optional[str] = Field(None, min_length=10, max_length=20)
    email: Optional[str] = Field(None)
    status: Optional[LeadStatus] = Field(None)
    source: Optional[LeadSource] = Field(None)
    source_id: Optional[str] = Field(None, description="ID источника из CRM")
    priority: Optional[LeadPriority] = Field(None)
    assigned_manager_id: Optional[str] = Field(None)
    company: Optional[str] = Field(None, max_length=100)
    position: Optional[str] = Field(None, max_length=100)
    budget: Optional[float] = Field(None, ge=0)
    description: Optional[str] = Field(None, max_length=1000)
    notes: Optional[str] = Field(None, max_length=2000)
    services_interested: Optional[List[str]] = Field(None)
    preferred_contact_time: Optional[str] = Field(None, max_length=100)

    @validator('email')
    def validate_email(cls, v):
        if v and '@' not in v:
            raise ValueError('Некорректный email адрес')
        return v

    @validator('phone')
    def validate_phone(cls, v):
        if v:
            cleaned = ''.join(filter(str.isdigit, v))
            if len(cleaned) < 10:
                raise ValueError('Номер телефона должен содержать минимум 10 цифр')
        return v


class LeadResponse(BaseModel):
    """Схема ответа с данными лида"""
    id: str
    first_name: str
    last_name: str
    middle_name: Optional[str]
    phone: str
    email: Optional[str]
    status: LeadStatus
    source: LeadSource
    source_id: Optional[str]
    priority: LeadPriority
    assigned_manager_id: Optional[str]
    company: Optional[str]
    position: Optional[str]
    budget: Optional[float]
    description: Optional[str]
    notes: Optional[str]
    services_interested: List[str]
    preferred_contact_time: Optional[str]
    converted_to_client_id: Optional[str]
    converted_to_appointment_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str]
    contact_attempts: int
    last_contact_date: Optional[datetime]
    full_name: str  # computed field

    class Config:
        from_attributes = True


class LeadStatusUpdate(BaseModel):
    """Схема для обновления статуса лида"""
    status: LeadStatus = Field(..., description="Новый статус лида")
    notes: Optional[str] = Field(None, max_length=500, description="Комментарий к изменению статуса")


class LeadAssignment(BaseModel):
    """Схема для назначения лида менеджеру"""
    manager_id: str = Field(..., description="ID менеджера")
    notes: Optional[str] = Field(None, max_length=500, description="Комментарий к назначению")


class LeadConversion(BaseModel):
    """Схема для конвертации лида в клиента"""
    create_hms_patient: bool = Field(True, description="Создать пациента в HMS")
    create_appointment: bool = Field(False, description="Создать запись на прием")
    appointment_date: Optional[datetime] = Field(None, description="Дата записи")
    appointment_doctor_id: Optional[str] = Field(None, description="ID врача")
    notes: Optional[str] = Field(None, max_length=500, description="Комментарий к конвертации")


class LeadSearchFilters(BaseModel):
    """Фильтры для поиска лидов"""
    status: Optional[List[LeadStatus]] = Field(None, description="Статусы")
    source: Optional[List[LeadSource]] = Field(None, description="Источники")
    priority: Optional[List[LeadPriority]] = Field(None, description="Приоритеты")
    assigned_manager_id: Optional[str] = Field(None, description="ID менеджера")
    created_from: Optional[datetime] = Field(None, description="Дата создания от")
    created_to: Optional[datetime] = Field(None, description="Дата создания до")
    search: Optional[str] = Field(None, description="Поиск по тексту")


class LeadStatistics(BaseModel):
    """Статистика по лидам"""
    total_leads: int
    new_leads: int
    in_progress_leads: int
    converted_leads: int
    rejected_leads: int
    conversion_rate: float
    avg_conversion_time: Optional[float] = None  # в днях
    by_source: Dict[str, int] = {}
    by_manager: Dict[str, int] = {}

