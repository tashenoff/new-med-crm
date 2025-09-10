"""
Manager Model - Модель менеджера CRM
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from enum import Enum


class ManagerRole(str, Enum):
    """Роли менеджеров"""
    SALES_MANAGER = "sales_manager"       # Менеджер по продажам
    ACCOUNT_MANAGER = "account_manager"   # Аккаунт-менеджер
    SENIOR_MANAGER = "senior_manager"     # Старший менеджер
    TEAM_LEAD = "team_lead"              # Руководитель группы
    DIRECTOR = "director"                # Директор


class ManagerStatus(str, Enum):
    """Статусы менеджеров"""
    ACTIVE = "active"                    # Активный
    INACTIVE = "inactive"                # Неактивный
    ON_VACATION = "on_vacation"          # В отпуске
    SICK_LEAVE = "sick_leave"           # На больничном


class Manager(BaseModel):
    """Модель менеджера CRM"""
    
    id: Optional[str] = Field(None, description="Уникальный идентификатор")
    
    # Основная информация
    first_name: str = Field(..., description="Имя")
    last_name: str = Field(..., description="Фамилия")
    middle_name: Optional[str] = Field(None, description="Отчество")
    
    # Контактная информация
    phone: str = Field(..., description="Номер телефона")
    email: str = Field(..., description="Email адрес")
    
    # Рабочая информация
    employee_id: Optional[str] = Field(None, description="Табельный номер")
    role: ManagerRole = Field(ManagerRole.SALES_MANAGER, description="Роль менеджера")
    status: ManagerStatus = Field(ManagerStatus.ACTIVE, description="Статус менеджера")
    
    # Отдел и команда
    department: Optional[str] = Field(None, description="Отдел")
    team: Optional[str] = Field(None, description="Команда")
    supervisor_id: Optional[str] = Field(None, description="ID руководителя")
    
    # Рабочие настройки
    max_leads: int = Field(50, description="Максимум лидов")
    max_clients: int = Field(100, description="Максимум клиентов")
    working_hours_start: Optional[str] = Field("09:00", description="Начало рабочего дня")
    working_hours_end: Optional[str] = Field("18:00", description="Конец рабочего дня")
    
    # Специализация
    specializations: Optional[List[str]] = Field(default_factory=list, description="Специализации")
    languages: Optional[List[str]] = Field(default_factory=list, description="Языки")
    
    # Цели и KPI
    monthly_target: float = Field(0.0, description="Месячная цель по выручке")
    quarterly_target: float = Field(0.0, description="Квартальная цель")
    annual_target: float = Field(0.0, description="Годовая цель")
    
    # Комиссионные
    commission_rate: float = Field(0.0, description="Процент комиссии")
    base_salary: float = Field(0.0, description="Базовая зарплата")
    
    # Связь с системой пользователей
    user_id: Optional[str] = Field(None, description="ID пользователя в системе")
    
    # Системные поля
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Дата создания")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Дата последнего обновления")
    hired_date: Optional[datetime] = Field(None, description="Дата трудоустройства")
    
    # Статистика (будет обновляться сервисами)
    current_leads_count: int = Field(0, description="Текущее количество лидов")
    current_clients_count: int = Field(0, description="Текущее количество клиентов")
    current_deals_count: int = Field(0, description="Текущее количество активных сделок")
    
    # Достижения за текущий месяц
    monthly_revenue: float = Field(0.0, description="Выручка за месяц")
    monthly_deals_closed: int = Field(0, description="Закрыто сделок за месяц")
    monthly_leads_converted: int = Field(0, description="Конвертировано лидов за месяц")
    
    class Config:
        """Конфигурация модели"""
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        
    @property
    def full_name(self) -> str:
        """Полное имя менеджера"""
        parts = [self.last_name, self.first_name]
        if self.middle_name:
            parts.append(self.middle_name)
        return " ".join(parts)
    
    @property
    def is_active(self) -> bool:
        """Проверка активности менеджера"""
        return self.status == ManagerStatus.ACTIVE
    
    @property
    def can_take_leads(self) -> bool:
        """Может ли принимать новые лиды"""
        return self.is_active and self.current_leads_count < self.max_leads
    
    @property
    def can_take_clients(self) -> bool:
        """Может ли принимать новых клиентов"""
        return self.is_active and self.current_clients_count < self.max_clients
    
    @property
    def monthly_target_progress(self) -> float:
        """Прогресс по месячной цели (%)"""
        if self.monthly_target <= 0:
            return 0.0
        return min((self.monthly_revenue / self.monthly_target) * 100, 100.0)
    
    @property
    def workload_percentage(self) -> float:
        """Процент загрузки менеджера"""
        leads_load = (self.current_leads_count / self.max_leads) * 100 if self.max_leads > 0 else 0
        clients_load = (self.current_clients_count / self.max_clients) * 100 if self.max_clients > 0 else 0
        return max(leads_load, clients_load)
    
    def can_handle_specialization(self, specialization: str) -> bool:
        """Проверка специализации"""
        return specialization in self.specializations or not self.specializations
    
    def update_statistics(self, leads_count: int, clients_count: int, deals_count: int):
        """Обновить статистику"""
        self.current_leads_count = leads_count
        self.current_clients_count = clients_count
        self.current_deals_count = deals_count
        self.updated_at = datetime.utcnow()
    
    def add_monthly_revenue(self, amount: float):
        """Добавить к месячной выручке"""
        self.monthly_revenue += amount
        self.monthly_deals_closed += 1
        self.updated_at = datetime.utcnow()




