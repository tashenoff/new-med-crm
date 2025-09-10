"""
Deal Model - Модель сделки
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from enum import Enum


class DealStatus(str, Enum):
    """Статусы сделок"""
    DRAFT = "draft"                # Черновик
    ACTIVE = "active"              # Активная
    WON = "won"                   # Выиграна
    LOST = "lost"                 # Проиграна
    CANCELLED = "cancelled"       # Отменена
    ON_HOLD = "on_hold"          # Приостановлена


class DealStage(str, Enum):
    """Этапы сделки"""
    LEAD = "lead"                 # Лид
    QUALIFIED = "qualified"       # Квалификация
    PROPOSAL = "proposal"         # Предложение
    NEGOTIATION = "negotiation"   # Переговоры
    DECISION = "decision"         # Принятие решения
    CLOSED = "closed"            # Закрыта


class DealPriority(str, Enum):
    """Приоритет сделки"""
    LOW = "low"                   # Низкий
    MEDIUM = "medium"             # Средний
    HIGH = "high"                 # Высокий
    URGENT = "urgent"             # Срочный


class Deal(BaseModel):
    """Модель сделки"""
    
    id: Optional[str] = Field(None, description="Уникальный идентификатор")
    
    # Основная информация
    title: str = Field(..., description="Название сделки")
    description: Optional[str] = Field(None, description="Описание сделки")
    
    # Связанные сущности
    client_id: Optional[str] = Field(None, description="ID клиента")
    lead_id: Optional[str] = Field(None, description="ID исходного лида")
    assigned_manager_id: Optional[str] = Field(None, description="ID ответственного менеджера")
    
    # Статус и этап
    status: DealStatus = Field(DealStatus.ACTIVE, description="Статус сделки")
    stage: DealStage = Field(DealStage.LEAD, description="Этап сделки")
    priority: DealPriority = Field(DealPriority.MEDIUM, description="Приоритет")
    
    # Финансовая информация
    amount: float = Field(0.0, description="Сумма сделки")
    currency: str = Field("KZT", description="Валюта")
    probability: int = Field(50, description="Вероятность закрытия (%)")
    
    # Услуги и продукты
    services: Optional[List[str]] = Field(default_factory=list, description="Список услуг")
    products: Optional[List[str]] = Field(default_factory=list, description="Список продуктов")
    
    # Даты
    expected_close_date: Optional[datetime] = Field(None, description="Ожидаемая дата закрытия")
    actual_close_date: Optional[datetime] = Field(None, description="Фактическая дата закрытия")
    won_at: Optional[datetime] = Field(None, description="Дата выигрыша сделки")
    
    # Интеграция с HMS
    hms_appointment_ids: Optional[List[str]] = Field(default_factory=list, description="ID записей в HMS")
    hms_treatment_plan_id: Optional[str] = Field(None, description="ID плана лечения в HMS")
    hms_patient_id: Optional[str] = Field(None, description="ID пациента в HMS")
    
    # Заметки и активности
    notes: Optional[str] = Field(None, description="Заметки по сделке")
    next_action: Optional[str] = Field(None, description="Следующее действие")
    next_action_date: Optional[datetime] = Field(None, description="Дата следующего действия")
    
    # Источник сделки
    source: Optional[str] = Field(None, description="Источник сделки")
    campaign: Optional[str] = Field(None, description="Рекламная кампания")
    tags: Optional[List[str]] = Field(default_factory=list, description="Теги сделки")
    
    # Системные поля
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Дата создания")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Дата последнего обновления")
    created_by: Optional[str] = Field(None, description="Кто создал")
    
    # Статистика
    activities_count: int = Field(0, description="Количество активностей")
    last_activity_date: Optional[datetime] = Field(None, description="Дата последней активности")
    
    class Config:
        """Конфигурация модели"""
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        
    @property
    def weighted_amount(self) -> float:
        """Взвешенная сумма (с учетом вероятности)"""
        return self.amount * (self.probability / 100)
    
    @property
    def is_active(self) -> bool:
        """Проверка активности сделки"""
        return self.status == DealStatus.ACTIVE
    
    @property
    def is_closed(self) -> bool:
        """Проверка закрытия сделки"""
        return self.status in [DealStatus.WON, DealStatus.LOST, DealStatus.CANCELLED]
    
    @property
    def is_overdue(self) -> bool:
        """Проверка просрочки"""
        if not self.expected_close_date or self.is_closed:
            return False
        return datetime.utcnow() > self.expected_close_date
    
    def close_as_won(self, amount: Optional[float] = None):
        """Закрыть сделку как выигранную"""
        self.status = DealStatus.WON
        self.stage = DealStage.CLOSED
        self.actual_close_date = datetime.utcnow()
        self.probability = 100
        if amount is not None:
            self.amount = amount
        self.updated_at = datetime.utcnow()
    
    def close_as_lost(self, reason: Optional[str] = None):
        """Закрыть сделку как проигранную"""
        self.status = DealStatus.LOST
        self.stage = DealStage.CLOSED
        self.actual_close_date = datetime.utcnow()
        self.probability = 0
        if reason:
            self.notes = f"{self.notes or ''}\nПричина проигрыша: {reason}".strip()
        self.updated_at = datetime.utcnow()
    
    def advance_stage(self):
        """Перевести на следующий этап"""
        stages = list(DealStage)
        current_index = stages.index(self.stage)
        if current_index < len(stages) - 1:
            self.stage = stages[current_index + 1]
            self.updated_at = datetime.utcnow()

