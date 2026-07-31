"""
Staff Management Models Module

Модуль для управления персоналом с системой ролей и прав доступа
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Dict, List
from datetime import datetime
from enum import Enum
import uuid


class Permission(str, Enum):
    """Права доступа"""
    # Пациенты
    PATIENTS_VIEW = "patients_view"
    PATIENTS_EDIT = "patients_edit"
    PATIENTS_DELETE = "patients_delete"
    
    # Рассылка
    BROADCAST_VIEW = "broadcast_view"
    
    # Врачи
    DOCTORS_VIEW = "doctors_view"
    DOCTORS_EDIT = "doctors_edit"
    DOCTORS_DELETE = "doctors_delete"
    
    # Календарь
    CALENDAR_VIEW = "calendar_view"
    CALENDAR_EDIT = "calendar_edit"
    
    # CRM
    CRM_VIEW = "crm_view"
    CRM_EDIT = "crm_edit"
    
    # Склад
    WAREHOUSE_VIEW = "warehouse_view"
    WAREHOUSE_EDIT = "warehouse_edit"
    
    # Справочники
    DIRECTORY_VIEW = "directory_view"
    DIRECTORY_EDIT = "directory_edit"
    
    # Финансы
    FINANCE_VIEW = "finance_view"
    FINANCE_EDIT = "finance_edit"
    
    # Статистика
    STATISTICS_VIEW = "statistics_view"
    
    # Персонал
    STAFF_VIEW = "staff_view"
    STAFF_EDIT = "staff_edit"
    STAFF_DELETE = "staff_delete"
    
    # Системные
    SYSTEM_SETTINGS = "system_settings"


class StaffRole(str, Enum):
    """Роли персонала"""
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    DOCTOR = "doctor"
    MARKETER = "marketer"
    ADMINISTRATOR = "administrator"


# Права доступа для каждой роли
ROLE_PERMISSIONS: Dict[StaffRole, List[Permission]] = {
    StaffRole.SUPER_ADMIN: [p for p in Permission],  # Все права
    
    StaffRole.ADMIN: [
        Permission.PATIENTS_VIEW,
        Permission.PATIENTS_EDIT,
        Permission.PATIENTS_DELETE,
        Permission.DOCTORS_VIEW,
        Permission.DOCTORS_EDIT,
        Permission.CALENDAR_VIEW,
        Permission.CALENDAR_EDIT,
        Permission.CRM_VIEW,
        Permission.CRM_EDIT,
        Permission.WAREHOUSE_VIEW,
        Permission.WAREHOUSE_EDIT,
        Permission.DIRECTORY_VIEW,
        Permission.DIRECTORY_EDIT,
        Permission.FINANCE_VIEW,
        Permission.STATISTICS_VIEW,
        Permission.STAFF_VIEW,
    ],
    
    StaffRole.DOCTOR: [
        # Базовые права для врача пустые - права назначаются через custom_permissions
        # в разделе "Управление персоналом"
    ],
    
    StaffRole.MARKETER: [
        Permission.PATIENTS_VIEW,
        Permission.CRM_VIEW,
        Permission.CRM_EDIT,
        Permission.STATISTICS_VIEW,
    ],
    
    StaffRole.ADMINISTRATOR: [
        Permission.PATIENTS_VIEW,
        Permission.CALENDAR_VIEW,
        Permission.CALENDAR_EDIT,
        Permission.DIRECTORY_VIEW,
    ],
}


class StaffMember(BaseModel):
    """Модель сотрудника"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    full_name: str
    role: StaffRole
    phone: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None
    
    # Связь с пользователем
    user_id: Optional[str] = None
    
    # Дополнительные настройки прав (если нужны исключения)
    custom_permissions: List[Permission] = Field(default_factory=list)
    
    def get_permissions(self) -> List[Permission]:
        """Получить все права доступа сотрудника"""
        base_permissions = ROLE_PERMISSIONS.get(self.role, [])
        return list(set(base_permissions + self.custom_permissions))
    
    def has_permission(self, permission: Permission) -> bool:
        """Проверить наличие конкретного права"""
        return permission in self.get_permissions()


class StaffMemberInDB(StaffMember):
    """Модель сотрудника в БД с хешированным паролем"""
    hashed_password: str


class StaffMemberCreate(BaseModel):
    """Модель для создания сотрудника"""
    email: EmailStr
    password: str
    full_name: str
    role: StaffRole
    phone: Optional[str] = None
    custom_permissions: List[Permission] = Field(default_factory=list)


class StaffMemberUpdate(BaseModel):
    """Модель для обновления сотрудника"""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[StaffRole] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    custom_permissions: Optional[List[Permission]] = None


class StaffMemberResponse(BaseModel):
    """Модель ответа с информацией о сотруднике"""
    id: str
    email: EmailStr
    full_name: str
    role: StaffRole
    phone: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None
    permissions: List[Permission]
    custom_permissions: List[Permission] = Field(default_factory=list)  # Добавлено для редактирования
    
    class Config:
        from_attributes = True
