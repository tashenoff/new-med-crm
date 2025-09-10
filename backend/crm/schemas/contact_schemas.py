"""Contact Schemas - Pydantic схемы для валидации источников контактов"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from ..models.contact import ContactType, ContactStatus


class ContactBase(BaseModel):
    """Базовая схема источника контактов"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    type: ContactType = Field(...)
    url: Optional[str] = Field(None, max_length=200)
    utm_source: Optional[str] = Field(None, max_length=50)
    utm_medium: Optional[str] = Field(None, max_length=50)
    utm_campaign: Optional[str] = Field(None, max_length=50)
    responsible_manager_id: Optional[str] = Field(None)
    cost_per_lead: float = Field(0.0, ge=0)
    monthly_budget: float = Field(0.0, ge=0)
    auto_assign_manager: bool = Field(False)
    default_manager_id: Optional[str] = Field(None)
    tags: Optional[List[str]] = Field(default_factory=list)


class ContactCreate(ContactBase):
    """Схема для создания источника контактов"""
    pass


class ContactUpdate(BaseModel):
    """Схема для обновления источника контактов"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    status: Optional[ContactStatus] = Field(None)
    url: Optional[str] = Field(None, max_length=200)
    responsible_manager_id: Optional[str] = Field(None)
    cost_per_lead: Optional[float] = Field(None, ge=0)
    monthly_budget: Optional[float] = Field(None, ge=0)
    auto_assign_manager: Optional[bool] = Field(None)
    default_manager_id: Optional[str] = Field(None)
    tags: Optional[List[str]] = Field(None)


class ContactResponse(BaseModel):
    """Схема ответа с данными источника контактов"""
    id: str
    name: str
    description: Optional[str]
    type: ContactType
    status: ContactStatus
    url: Optional[str]
    utm_source: Optional[str]
    utm_medium: Optional[str]
    utm_campaign: Optional[str]
    responsible_manager_id: Optional[str]
    cost_per_lead: float
    monthly_budget: float
    total_spent: float
    total_leads: int
    converted_leads: int
    total_revenue: float
    monthly_leads: int
    monthly_conversions: int
    monthly_revenue: float
    conversion_rate: float
    monthly_conversion_rate: float
    roi: float
    cost_per_conversion: float
    tags: List[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
