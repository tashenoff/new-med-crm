"""Manager Schemas - Pydantic схемы для валидации данных менеджеров"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from ..models.manager import ManagerRole, ManagerStatus


class ManagerBase(BaseModel):
    """Базовая схема менеджера"""
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)
    middle_name: Optional[str] = Field(None, max_length=50)
    phone: str = Field(..., min_length=10, max_length=20)
    email: str = Field(...)
    employee_id: Optional[str] = Field(None, max_length=20)
    role: ManagerRole = Field(ManagerRole.SALES_MANAGER)
    department: Optional[str] = Field(None, max_length=50)
    team: Optional[str] = Field(None, max_length=50)
    max_leads: int = Field(50, ge=1, le=200)
    max_clients: int = Field(100, ge=1, le=500)
    specializations: Optional[List[str]] = Field(default_factory=list)
    monthly_target: float = Field(0.0, ge=0)


class ManagerCreate(ManagerBase):
    """Схема для создания менеджера"""
    user_id: Optional[str] = Field(None)
    supervisor_id: Optional[str] = Field(None)


class ManagerUpdate(BaseModel):
    """Схема для обновления менеджера"""
    first_name: Optional[str] = Field(None, min_length=1, max_length=50)
    last_name: Optional[str] = Field(None, min_length=1, max_length=50)
    phone: Optional[str] = Field(None, min_length=10, max_length=20)
    email: Optional[str] = Field(None)
    status: Optional[ManagerStatus] = Field(None)
    role: Optional[ManagerRole] = Field(None)
    department: Optional[str] = Field(None, max_length=50)
    max_leads: Optional[int] = Field(None, ge=1, le=200)
    max_clients: Optional[int] = Field(None, ge=1, le=500)
    monthly_target: Optional[float] = Field(None, ge=0)
    specializations: Optional[List[str]] = Field(None)


class ManagerResponse(BaseModel):
    """Схема ответа с данными менеджера"""
    id: str
    first_name: str
    last_name: str
    middle_name: Optional[str]
    phone: str
    email: str
    employee_id: Optional[str]
    role: ManagerRole
    status: ManagerStatus
    department: Optional[str]
    team: Optional[str]
    max_leads: int
    max_clients: int
    current_leads_count: int
    current_clients_count: int
    current_deals_count: int
    monthly_target: float
    monthly_revenue: float
    specializations: List[str]
    created_at: datetime
    full_name: str
    workload_percentage: float
    monthly_target_progress: float
    can_take_leads: bool
    can_take_clients: bool

    class Config:
        from_attributes = True


