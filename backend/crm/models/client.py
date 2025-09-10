"""
Client Model - Модель клиента CRM
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from enum import Enum


class ClientStatus(str, Enum):
    """Статусы клиентов"""
    ACTIVE = "active"              # Активный
    INACTIVE = "inactive"          # Неактивный
    VIP = "vip"                   # VIP клиент
    BLOCKED = "blocked"           # Заблокирован


class ClientType(str, Enum):
    """Типы клиентов"""
    INDIVIDUAL = "individual"      # Физическое лицо
    CORPORATE = "corporate"        # Юридическое лицо


class Client(BaseModel):
    """Модель клиента CRM"""
    
    id: Optional[str] = Field(None, description="Уникальный идентификатор")
    
    # Основная информация
    first_name: str = Field(..., description="Имя")
    last_name: str = Field(..., description="Фамилия")
    middle_name: Optional[str] = Field(None, description="Отчество")
    
    # Контактная информация
    phone: str = Field(..., description="Номер телефона")
    email: Optional[str] = Field(None, description="Email адрес")
    
    # Статус и классификация
    status: ClientStatus = Field(ClientStatus.ACTIVE, description="Статус клиента")
    client_type: ClientType = Field(ClientType.INDIVIDUAL, description="Тип клиента")
    
    # Менеджер
    assigned_manager_id: Optional[str] = Field(None, description="ID назначенного менеджера")
    
    # Для корпоративных клиентов
    company: Optional[str] = Field(None, description="Название компании")
    inn: Optional[str] = Field(None, description="ИНН")
    position: Optional[str] = Field(None, description="Должность контактного лица")
    
    # Адрес
    address: Optional[str] = Field(None, description="Адрес")
    city: Optional[str] = Field(None, description="Город")
    
    # Персональная информация
    birth_date: Optional[datetime] = Field(None, description="Дата рождения")
    gender: Optional[str] = Field(None, description="Пол")
    
    # Заметки и описание
    notes: Optional[str] = Field(None, description="Заметки менеджера")
    description: Optional[str] = Field(None, description="Описание клиента")
    
    # Предпочтения
    preferred_contact_method: Optional[str] = Field(None, description="Предпочитаемый способ связи")
    preferred_contact_time: Optional[str] = Field(None, description="Предпочитаемое время связи")
    
    # Связь с HMS
    hms_patient_id: Optional[str] = Field(None, description="ID пациента в HMS")
    is_hms_patient: bool = Field(False, description="Конвертирован ли в пациента HMS")
    
    # Связь с лидом
    source_lead_id: Optional[str] = Field(None, description="ID исходного лида")
    
    # Финансовая информация
    total_revenue: float = Field(0.0, description="Общая выручка от клиента")
    total_deals: int = Field(0, description="Общее количество сделок")
    
    # Системные поля
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Дата создания")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Дата последнего обновления")
    created_by: Optional[str] = Field(None, description="Кто создал")
    
    # Статистика активности
    last_contact_date: Optional[datetime] = Field(None, description="Дата последнего контакта")
    last_deal_date: Optional[datetime] = Field(None, description="Дата последней сделки")
    
    class Config:
        """Конфигурация модели"""
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        
    @property
    def full_name(self) -> str:
        """Полное имя клиента"""
        parts = [self.last_name, self.first_name]
        if self.middle_name:
            parts.append(self.middle_name)
        return " ".join(parts)
    
    @property
    def display_name(self) -> str:
        """Отображаемое имя (компания или ФИО)"""
        if self.client_type == ClientType.CORPORATE and self.company:
            return f"{self.company} ({self.full_name})"
        return self.full_name
    
    def is_vip(self) -> bool:
        """Проверка VIP статуса"""
        return self.status == ClientStatus.VIP
    
    def can_create_hms_patient(self) -> bool:
        """Проверка возможности создания пациента в HMS"""
        return not self.hms_patient_id and self.status != ClientStatus.BLOCKED
    
    def update_revenue(self, amount: float):
        """Обновить выручку от клиента"""
        self.total_revenue += amount
        self.total_deals += 1
        self.last_deal_date = datetime.utcnow()
        self.updated_at = datetime.utcnow()

