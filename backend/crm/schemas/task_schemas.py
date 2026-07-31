"""
Task Schemas - Схемы для задач CRM
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from ..models.task import TaskType, TaskStatus, TaskPriority


class TaskCreate(BaseModel):
    """Схема создания задачи"""
    title: str = Field(..., description="Название задачи")
    type: TaskType = Field(TaskType.CALL, description="Тип задачи")
    custom_type_name: Optional[str] = Field(None, description="Название пользовательского типа")
    description: Optional[str] = Field(None, description="Описание задачи")
    priority: TaskPriority = Field(TaskPriority.MEDIUM, description="Приоритет")
    assigned_to: Optional[str] = Field(None, description="ID ответственного менеджера")
    lead_id: Optional[str] = Field(None, description="ID связанного лида")
    client_id: Optional[str] = Field(None, description="ID связанного клиента")
    deal_id: Optional[str] = Field(None, description="ID связанной сделки")
    doctor_id: Optional[str] = Field(None, description="ID прикрепленного врача")
    due_date: Optional[datetime] = Field(None, description="Срок исполнения")
    due_time: Optional[str] = Field(None, description="Время исполнения (HH:MM)")
    comment: Optional[str] = Field(None, description="Комментарий к задаче")


class TaskUpdate(BaseModel):
    """Схема обновления задачи"""
    title: Optional[str] = Field(None, description="Название задачи")
    type: Optional[TaskType] = Field(None, description="Тип задачи")
    custom_type_name: Optional[str] = Field(None, description="Название пользовательского типа")
    description: Optional[str] = Field(None, description="Описание задачи")
    status: Optional[TaskStatus] = Field(None, description="Статус задачи")
    priority: Optional[TaskPriority] = Field(None, description="Приоритет")
    assigned_to: Optional[str] = Field(None, description="ID ответственного менеджера")
    lead_id: Optional[str] = Field(None, description="ID связанного лида")
    client_id: Optional[str] = Field(None, description="ID связанного клиента")
    deal_id: Optional[str] = Field(None, description="ID связанной сделки")
    doctor_id: Optional[str] = Field(None, description="ID прикрепленного врача")
    due_date: Optional[datetime] = Field(None, description="Срок исполнения")
    due_time: Optional[str] = Field(None, description="Время исполнения (HH:MM)")
    comment: Optional[str] = Field(None, description="Комментарий к задаче")


class TaskSearchFilters(BaseModel):
    """Фильтры для поиска задач"""
    status: Optional[list[TaskStatus]] = None
    type: Optional[list[TaskType]] = None
    priority: Optional[list[TaskPriority]] = None
    assigned_to: Optional[str] = None
    created_by: Optional[str] = None
    lead_id: Optional[str] = None
    client_id: Optional[str] = None
    deal_id: Optional[str] = None
    doctor_id: Optional[str] = None
    due_from: Optional[datetime] = None
    due_to: Optional[datetime] = None
    created_from: Optional[datetime] = None
    created_to: Optional[datetime] = None
    search: Optional[str] = None
    show_overdue: Optional[bool] = None
    show_completed: Optional[bool] = True
