"""Source Schemas - Pydantic схемы для валидации данных источников"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, validator
from ..models.source import SourceType, SourceStatus


class SourceBase(BaseModel):
    """Базовая схема источника"""
    name: str = Field(..., min_length=1, max_length=100)
    type: SourceType = Field(...)
    description: Optional[str] = Field(None, max_length=500)
    url: Optional[str] = Field(None, max_length=200)
    cost_per_lead: Optional[float] = Field(0.0, ge=0)
    monthly_budget: Optional[float] = Field(None, ge=0)


class SourceCreate(SourceBase):
    """Схема для создания источника"""
    pass


class SourceUpdate(BaseModel):
    """Схема для обновления источника"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    type: Optional[SourceType] = Field(None)
    status: Optional[SourceStatus] = Field(None)
    description: Optional[str] = Field(None, max_length=500)
    url: Optional[str] = Field(None, max_length=200)
    cost_per_lead: Optional[float] = Field(None, ge=0)
    monthly_budget: Optional[float] = Field(None, ge=0)


class SourceResponse(BaseModel):
    """Схема ответа с данными источника"""
    id: str
    name: str
    type: SourceType
    status: SourceStatus
    description: Optional[str]
    url: Optional[str]
    cost_per_lead: float
    monthly_budget: Optional[float]
    
    # Статистика
    leads_count: int
    leads_this_month: int
    conversion_count: int
    conversion_rate: float
    roi: float
    total_cost: float
    avg_monthly_leads: float
    
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str]
    
    class Config:
        from_attributes = True


class SourceStatistics(BaseModel):
    """Статистика по источникам"""
    total_sources: int
    active_sources: int
    inactive_sources: int
    total_leads: int
    total_conversions: int
    avg_conversion_rate: float
    total_cost: float
    avg_cost_per_lead: float
    by_type: dict[str, int] = {}
    top_sources: list[dict] = []  # Топ источников по конверсии

