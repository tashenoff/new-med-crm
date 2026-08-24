"""
Task Status Model - Модель пользовательских статусов задач CRM
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class TaskStatusConfig(BaseModel):
    """Модель пользовательского статуса задачи"""
    
    id: Optional[str] = Field(None, description="Уникальный идентификатор")
    
    # Основная информация
    name: str = Field(..., description="Название статуса", min_length=1, max_length=100)
    code: str = Field(..., description="Код статуса (латиницей)", min_length=1, max_length=50)
    description: Optional[str] = Field(None, description="Описание статуса")
    
    # Визуальные настройки
    color: str = Field("#6B7280", description="Цвет статуса (HEX)")
    icon: Optional[str] = Field(None, description="Иконка статуса (emoji или icon name)")
    
    # Порядок сортировки
    order: int = Field(0, description="Порядок в списке")
    
    # Системные флаги
    is_default: bool = Field(False, description="Статус по умолчанию для новых задач")
    is_completed: bool = Field(False, description="Считается завершённым статусом")
    is_cancelled: bool = Field(False, description="Считается отменённым статусом")
    is_system: bool = Field(False, description="Системный статус (нельзя удалить)")
    is_active: bool = Field(True, description="Активен ли статус")
    
    # Системные поля
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Дата создания")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Дата обновления")
    created_by: Optional[str] = Field(None, description="ID создателя")
    
    class Config:
        """Конфигурация модели"""
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class TaskStatusCreate(BaseModel):
    """Схема для создания статуса"""
    name: str = Field(..., description="Название статуса", min_length=1, max_length=100)
    code: str = Field(..., description="Код статуса (латиницей)", min_length=1, max_length=50)
    description: Optional[str] = Field(None, description="Описание статуса")
    color: str = Field("#6B7280", description="Цвет статуса (HEX)")
    icon: Optional[str] = Field(None, description="Иконка статуса")
    order: int = Field(0, description="Порядок в списке")
    is_default: bool = Field(False, description="Статус по умолчанию")
    is_completed: bool = Field(False, description="Считается завершённым")
    is_cancelled: bool = Field(False, description="Считается отменённым")


class TaskStatusUpdate(BaseModel):
    """Схема для обновления статуса"""
    name: Optional[str] = Field(None, description="Название статуса", max_length=100)
    code: Optional[str] = Field(None, description="Код статуса", max_length=50)
    description: Optional[str] = Field(None, description="Описание статуса")
    color: Optional[str] = Field(None, description="Цвет статуса (HEX)")
    icon: Optional[str] = Field(None, description="Иконка статуса")
    order: Optional[int] = Field(None, description="Порядок в списке")
    is_default: Optional[bool] = Field(None, description="Статус по умолчанию")
    is_completed: Optional[bool] = Field(None, description="Считается завершённым")
    is_cancelled: Optional[bool] = Field(None, description="Считается отменённым")
    is_active: Optional[bool] = Field(None, description="Активен ли статус")
