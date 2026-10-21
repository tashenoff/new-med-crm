"""Source Schemas - Pydantic схемы для валидации данных источников"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, validator
from ..models.source import SourceType, SourceStatus
from ..models.source_dimensions import SourceChannel, SourceCampaign, SourceTariff


class SourceBase(BaseModel):
    """Базовая схема источника"""
    name: str = Field(..., min_length=1, max_length=100)
    channels: list[SourceChannel] = Field(default_factory=list)
    campaigns: list[SourceCampaign] = Field(default_factory=list)
    tariff: Optional[SourceTariff] = None
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
    channels: Optional[list[SourceChannel]] = None
    campaigns: Optional[list[SourceCampaign]] = None
    dimensions_revision: Optional[int] = Field(None, ge=0)
    tariff: Optional[SourceTariff] = None
    type: Optional[SourceType] = Field(None)
    status: Optional[SourceStatus] = Field(None)
    description: Optional[str] = Field(None, max_length=500)
    url: Optional[str] = Field(None, max_length=200)
    cost_per_lead: Optional[float] = Field(None, ge=0)
    monthly_budget: Optional[float] = Field(None, ge=0)


class SourceResponse(BaseModel):
    """Схема ответа с данными источника"""
    id: str
    channels: list[SourceChannel] = Field(default_factory=list)
    campaigns: list[SourceCampaign] = Field(default_factory=list)
    pricing_history: list[dict] = Field(default_factory=list)
    dimensions_revision: int = 0
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



