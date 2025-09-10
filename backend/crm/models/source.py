"""
Source Model - Модель источника обращений
"""

import uuid
from datetime import datetime
from typing import Optional
from enum import Enum
from pydantic import BaseModel, Field


class SourceType(str, Enum):
    """Типы источников"""
    WEBSITE = "website"        # Сайт
    SOCIAL = "social"         # Соц. сети
    REFERRAL = "referral"     # Рекомендации
    ADVERTISING = "advertising" # Реклама
    PHONE = "phone"           # Телефон
    EMAIL = "email"           # Email
    OTHER = "other"           # Другое


class SourceStatus(str, Enum):
    """Статусы источников"""
    ACTIVE = "active"         # Активный
    INACTIVE = "inactive"     # Неактивный
    PAUSED = "paused"        # Приостановлен


class Source(BaseModel):
    """Модель источника обращений"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(..., min_length=1, max_length=100, description="Название источника")
    type: SourceType = Field(..., description="Тип источника")
    status: SourceStatus = Field(SourceStatus.ACTIVE, description="Статус источника")
    description: Optional[str] = Field(None, max_length=500, description="Описание источника")
    url: Optional[str] = Field(None, max_length=200, description="URL источника")
    cost_per_lead: Optional[float] = Field(0.0, ge=0, description="Стоимость за заявку")
    monthly_budget: Optional[float] = Field(None, ge=0, description="Месячный бюджет")
    
    # Статистика (заполняется автоматически из заявок)
    leads_count: int = Field(0, ge=0, description="Количество заявок")
    leads_this_month: int = Field(0, ge=0, description="Заявки за месяц")
    conversion_count: int = Field(0, ge=0, description="Количество конверсий")
    conversion_rate: float = Field(0.0, ge=0, le=100, description="Процент конверсии")
    
    # Мета-информация
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = Field(None, description="ID пользователя, создавшего источник")
    
    class Config:
        use_enum_values = True
        
    @property
    def roi(self) -> float:
        """Рассчитать ROI источника"""
        if self.cost_per_lead <= 0:
            return 100.0  # Для бесплатных источников ROI = 100%
        
        # Простой расчет ROI на основе конверсии
        return self.conversion_rate if self.conversion_rate > 0 else 0.0
    
    @property
    def total_cost(self) -> float:
        """Общие затраты на источник"""
        return self.cost_per_lead * self.leads_count
    
    @property
    def avg_monthly_leads(self) -> float:
        """Среднее количество заявок в месяц"""
        # Упрощенный расчет - можно улучшить с учетом реального времени работы
        months_active = max(1, (datetime.utcnow() - self.created_at).days / 30)
        return self.leads_count / months_active if self.leads_count > 0 else 0.0

