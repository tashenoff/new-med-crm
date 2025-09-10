"""Client Schemas - Pydantic схемы для валидации данных клиентов"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, validator
from ..models.client import ClientStatus, ClientType


class ClientBase(BaseModel):
    """Базовая схема клиента"""
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)
    middle_name: Optional[str] = Field(None, max_length=50)
    phone: str = Field(..., min_length=10, max_length=20)
    email: Optional[str] = Field(None)
    client_type: ClientType = Field(ClientType.INDIVIDUAL)
    company: Optional[str] = Field(None, max_length=100)
    inn: Optional[str] = Field(None, max_length=20)
    position: Optional[str] = Field(None, max_length=100)
    address: Optional[str] = Field(None, max_length=200)
    city: Optional[str] = Field(None, max_length=50)
    birth_date: Optional[datetime] = Field(None)
    gender: Optional[str] = Field(None)
    preferred_contact_method: Optional[str] = Field(None)
    preferred_contact_time: Optional[str] = Field(None)


class ClientCreate(ClientBase):
    """Схема для создания клиента"""
    assigned_manager_id: Optional[str] = Field(None)
    source_lead_id: Optional[str] = Field(None)


class ClientUpdate(BaseModel):
    """Схема для обновления клиента"""
    first_name: Optional[str] = Field(None, min_length=1, max_length=50)
    last_name: Optional[str] = Field(None, min_length=1, max_length=50)
    middle_name: Optional[str] = Field(None, max_length=50)
    phone: Optional[str] = Field(None, min_length=10, max_length=20)
    email: Optional[str] = Field(None)
    status: Optional[ClientStatus] = Field(None)
    client_type: Optional[ClientType] = Field(None)
    assigned_manager_id: Optional[str] = Field(None)
    company: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=2000)
    address: Optional[str] = Field(None, max_length=200)
    city: Optional[str] = Field(None, max_length=50)
    preferred_contact_method: Optional[str] = Field(None)
    preferred_contact_time: Optional[str] = Field(None)


class ClientResponse(BaseModel):
    """Схема ответа с данными клиента"""
    id: str
    first_name: str
    last_name: str
    middle_name: Optional[str]
    phone: str
    email: Optional[str]
    status: ClientStatus
    client_type: ClientType
    assigned_manager_id: Optional[str]
    company: Optional[str]
    total_revenue: float
    total_deals: int
    hms_patient_id: Optional[str]
    is_hms_patient: bool
    source_lead_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    last_contact_date: Optional[datetime]
    last_deal_date: Optional[datetime]
    
    # Вычисляемые поля
    @property
    def full_name(self) -> str:
        """Полное имя клиента"""
        parts = [self.last_name, self.first_name]
        if self.middle_name:
            parts.append(self.middle_name)
        return " ".join(parts)
    
    @property
    def display_name(self) -> str:
        """Отображаемое имя"""
        if self.company and self.client_type == ClientType.CORPORATE:
            return f"{self.company} ({self.full_name})"
        return self.full_name

    class Config:
        from_attributes = True


class ClientStatistics(BaseModel):
    """Статистика по клиентам"""
    total_clients: int
    crm_only_clients: int  # Только клиенты CRM
    hms_patients: int      # Конвертированные в пациентов HMS
    hms_conversion_rate: float  # Процент конвертации в HMS
    by_status: dict[str, int] = {}
    by_type: dict[str, int] = {}
    total_revenue: float
    avg_revenue_per_client: float
