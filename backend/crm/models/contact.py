"""
Contact Model - Модель источника контактов/обращений
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class ContactType(str, Enum):
    """Типы источников контактов"""
    WEBSITE = "website"                # Сайт
    LANDING_PAGE = "landing_page"      # Лендинг
    SOCIAL_MEDIA = "social_media"      # Социальные сети
    ADVERTISING = "advertising"        # Реклама
    EMAIL_CAMPAIGN = "email_campaign"  # Email кампания
    PHONE_CALL = "phone_call"         # Телефонный звонок
    REFERRAL = "referral"             # Рекомендация
    WALK_IN = "walk_in"              # Прямое обращение
    PARTNERSHIP = "partnership"       # Партнерство
    EVENT = "event"                   # Мероприятие
    OTHER = "other"                   # Другое


class ContactStatus(str, Enum):
    """Статусы источников"""
    ACTIVE = "active"                 # Активный
    INACTIVE = "inactive"             # Неактивный
    TESTING = "testing"               # Тестирование
    ARCHIVED = "archived"             # Архивный


class Contact(BaseModel):
    """Модель источника контактов"""
    
    id: Optional[str] = Field(None, description="Уникальный идентификатор")
    
    # Основная информация
    name: str = Field(..., description="Название источника")
    description: Optional[str] = Field(None, description="Описание источника")
    type: ContactType = Field(..., description="Тип источника")
    status: ContactStatus = Field(ContactStatus.ACTIVE, description="Статус источника")
    
    # Настройки источника
    url: Optional[str] = Field(None, description="URL источника")
    utm_source: Optional[str] = Field(None, description="UTM source")
    utm_medium: Optional[str] = Field(None, description="UTM medium")
    utm_campaign: Optional[str] = Field(None, description="UTM campaign")
    
    # Ответственный менеджер
    responsible_manager_id: Optional[str] = Field(None, description="ID ответственного менеджера")
    
    # Стоимость и бюджет
    cost_per_lead: float = Field(0.0, description="Стоимость за лид")
    monthly_budget: float = Field(0.0, description="Месячный бюджет")
    total_spent: float = Field(0.0, description="Всего потрачено")
    
    # Настройки автоматизации
    auto_assign_manager: bool = Field(False, description="Автоматически назначать менеджера")
    default_manager_id: Optional[str] = Field(None, description="Менеджер по умолчанию")
    auto_response_enabled: bool = Field(False, description="Включить автоответ")
    auto_response_template: Optional[str] = Field(None, description="Шаблон автоответа")
    
    # Метаданные и настройки
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Дополнительные данные")
    tags: Optional[List[str]] = Field(default_factory=list, description="Теги источника")
    
    # Системные поля
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Дата создания")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Дата последнего обновления")
    created_by: Optional[str] = Field(None, description="Кто создал")
    
    # Статистика (будет обновляться сервисами)
    total_leads: int = Field(0, description="Всего лидов")
    converted_leads: int = Field(0, description="Конвертированных лидов")
    total_revenue: float = Field(0.0, description="Общая выручка")
    
    # Статистика за период
    monthly_leads: int = Field(0, description="Лиды за месяц")
    monthly_conversions: int = Field(0, description="Конверсии за месяц")
    monthly_revenue: float = Field(0.0, description="Выручка за месяц")
    
    # Средние показатели
    avg_lead_value: float = Field(0.0, description="Средняя стоимость лида")
    avg_deal_size: float = Field(0.0, description="Средний размер сделки")
    
    class Config:
        """Конфигурация модели"""
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        
    @property
    def is_active(self) -> bool:
        """Проверка активности источника"""
        return self.status == ContactStatus.ACTIVE
    
    @property
    def conversion_rate(self) -> float:
        """Коэффициент конверсии (%)"""
        if self.total_leads == 0:
            return 0.0
        return (self.converted_leads / self.total_leads) * 100
    
    @property
    def monthly_conversion_rate(self) -> float:
        """Месячный коэффициент конверсии (%)"""
        if self.monthly_leads == 0:
            return 0.0
        return (self.monthly_conversions / self.monthly_leads) * 100
    
    @property
    def roi(self) -> float:
        """Возврат инвестиций (%)"""
        if self.total_spent == 0:
            return 0.0
        return ((self.total_revenue - self.total_spent) / self.total_spent) * 100
    
    @property
    def cost_per_conversion(self) -> float:
        """Стоимость за конверсию"""
        if self.converted_leads == 0:
            return 0.0
        return self.total_spent / self.converted_leads
    
    def is_digital_source(self) -> bool:
        """Проверка цифрового источника"""
        digital_types = [
            ContactType.WEBSITE,
            ContactType.LANDING_PAGE,
            ContactType.SOCIAL_MEDIA,
            ContactType.ADVERTISING,
            ContactType.EMAIL_CAMPAIGN
        ]
        return self.type in digital_types
    
    def add_lead_statistics(self, converted: bool = False, revenue: float = 0.0):
        """Добавить статистику по лиду"""
        self.total_leads += 1
        self.monthly_leads += 1
        
        if converted:
            self.converted_leads += 1
            self.monthly_conversions += 1
            
        if revenue > 0:
            self.total_revenue += revenue
            self.monthly_revenue += revenue
            
        # Пересчитываем средние значения
        if self.converted_leads > 0:
            self.avg_deal_size = self.total_revenue / self.converted_leads
            
        if self.total_leads > 0:
            self.avg_lead_value = self.total_revenue / self.total_leads
            
        self.updated_at = datetime.utcnow()
    
    def add_cost(self, amount: float):
        """Добавить затраты"""
        self.total_spent += amount
        self.updated_at = datetime.utcnow()
    
    def reset_monthly_stats(self):
        """Сбросить месячную статистику"""
        self.monthly_leads = 0
        self.monthly_conversions = 0
        self.monthly_revenue = 0.0
        self.updated_at = datetime.utcnow()


