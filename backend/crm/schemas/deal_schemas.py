"""Deal Schemas - Pydantic схемы для валидации данных сделок"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from ..models.deal import DealStatus, DealStage, DealPriority


class DealBase(BaseModel):
    """Базовая схема сделки"""
    title: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    client_id: Optional[str] = Field(None)
    lead_id: Optional[str] = Field(None)
    assigned_manager_id: Optional[str] = Field(None)
    stage: DealStage = Field(DealStage.LEAD)
    priority: DealPriority = Field(DealPriority.MEDIUM)
    amount: float = Field(0.0, ge=0)
    currency: str = Field("KZT")
    probability: int = Field(50, ge=0, le=100)
    services: Optional[List[str]] = Field(default_factory=list)
    expected_close_date: Optional[datetime] = Field(None)
    source: Optional[str] = Field(None)


class DealCreate(DealBase):
    """Схема для создания сделки"""
    pass


class DealUpdate(BaseModel):
    """Схема для обновления сделки"""
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    status: Optional[DealStatus] = Field(None)
    stage: Optional[DealStage] = Field(None)
    priority: Optional[DealPriority] = Field(None)
    assigned_manager_id: Optional[str] = Field(None)
    amount: Optional[float] = Field(None, ge=0)
    probability: Optional[int] = Field(None, ge=0, le=100)
    expected_close_date: Optional[datetime] = Field(None)
    notes: Optional[str] = Field(None, max_length=2000)
    next_action: Optional[str] = Field(None, max_length=500)
    next_action_date: Optional[datetime] = Field(None)


class DealResponse(BaseModel):
    """Схема ответа с данными сделки"""
    id: str
    title: str
    description: Optional[str]
    client_id: Optional[str]
    lead_id: Optional[str]
    assigned_manager_id: Optional[str]
    status: DealStatus
    stage: DealStage
    priority: DealPriority
    amount: float
    currency: str
    probability: int
    services: List[str]
    expected_close_date: Optional[datetime]
    actual_close_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    weighted_amount: float
    is_active: bool
    is_overdue: bool

    class Config:
        from_attributes = True


