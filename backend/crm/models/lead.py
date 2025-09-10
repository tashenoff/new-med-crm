"""
Lead Model - Модель заявки/лида
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from enum import Enum


class LeadStatus(str, Enum):
    """Статусы лидов"""
    NEW = "new"                    # Новый
    IN_PROGRESS = "in_progress"    # В работе
    CONTACTED = "contacted"        # Связались
    QUALIFIED = "qualified"        # Квалифицирован
    CONVERTED = "converted"        # Конвертирован
    REJECTED = "rejected"          # Отказ
    LOST = "lost"                  # Потерян


class LeadSource(str, Enum):
    """Источники лидов"""
    WEBSITE = "website"            # Сайт
    PHONE = "phone"               # Телефон
    EMAIL = "email"               # Email
    SOCIAL = "social"             # Соцсети
    REFERRAL = "referral"         # Рекомендация
    ADVERTISING = "advertising"    # Реклама
    WALK_IN = "walk_in"           # Прямое обращение
    OTHER = "other"               # Другое


class LeadPriority(str, Enum):
    """Приоритет лидов"""
    LOW = "low"                   # Низкий
    MEDIUM = "medium"             # Средний
    HIGH = "high"                 # Высокий
    URGENT = "urgent"             # Срочный


class Lead(BaseModel):
    """Модель лида/заявки"""
    
    id: Optional[str] = Field(None, description="Уникальный идентификатор")
    
    # Основная информация
    first_name: str = Field(..., description="Имя")
    last_name: str = Field(..., description="Фамилия")
    middle_name: Optional[str] = Field(None, description="Отчество")
    
    # Контактная информация
    phone: str = Field(..., description="Номер телефона")
    email: Optional[str] = Field(None, description="Email адрес")
    
    # Статус и классификация
    status: LeadStatus = Field(LeadStatus.NEW, description="Статус лида")
    source: LeadSource = Field(..., description="Источник лида")
    source_id: Optional[str] = Field(None, description="ID источника из CRM")
    priority: LeadPriority = Field(LeadPriority.MEDIUM, description="Приоритет")
    
    # Менеджер
    assigned_manager_id: Optional[str] = Field(None, description="ID назначенного менеджера")
    
    # Бизнес-информация
    company: Optional[str] = Field(None, description="Компания")
    position: Optional[str] = Field(None, description="Должность")
    budget: Optional[float] = Field(None, description="Предполагаемый бюджет")
    
    # Описание и заметки
    description: Optional[str] = Field(None, description="Описание заявки")
    notes: Optional[str] = Field(None, description="Заметки менеджера")
    
    # Интересы и потребности
    services_interested: Optional[List[str]] = Field(default_factory=list, description="Интересующие услуги")
    preferred_contact_time: Optional[str] = Field(None, description="Предпочитаемое время связи")
    
    # Интеграция с HMS
    converted_to_client_id: Optional[str] = Field(None, description="ID клиента после конвертации")
    converted_to_appointment_id: Optional[str] = Field(None, description="ID записи после конвертации")
    
    # Системные поля
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Дата создания")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Дата последнего обновления")
    created_by: Optional[str] = Field(None, description="Кто создал")
    
    # Статистика
    contact_attempts: int = Field(0, description="Количество попыток связи")
    last_contact_date: Optional[datetime] = Field(None, description="Дата последней связи")
    
    class Config:
        """Конфигурация модели"""
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        
    @property
    def full_name(self) -> str:
        """Полное имя лида"""
        parts = [self.last_name, self.first_name]
        if self.middle_name:
            parts.append(self.middle_name)
        return " ".join(parts)
    
    def can_convert_to_client(self) -> bool:
        """Проверка возможности конвертации в клиента"""
        # Можно конвертировать все статусы кроме уже конвертированных, отказов и потерянных
        convertible_statuses = [
            LeadStatus.NEW, 
            LeadStatus.IN_PROGRESS, 
            LeadStatus.CONTACTED, 
            LeadStatus.QUALIFIED
        ]
        return self.status in convertible_statuses and not self.converted_to_client_id
    
    def mark_as_converted(self, client_id: str, appointment_id: Optional[str] = None):
        """Отметить как конвертированный"""
        self.status = LeadStatus.CONVERTED
        self.converted_to_client_id = client_id
        if appointment_id:
            self.converted_to_appointment_id = appointment_id
        self.updated_at = datetime.utcnow()
