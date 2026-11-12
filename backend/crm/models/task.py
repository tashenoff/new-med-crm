"""
Task Model - Модель задач CRM
"""

from datetime import datetime, timezone
from typing import Optional, Literal
from pydantic import BaseModel, Field, field_serializer, model_validator
from enum import Enum


class TaskType(str, Enum):
    """Типы задач"""
    CALL = "call"                  # Звонок
    EMAIL = "email"                # Письмо
    MEETING = "meeting"            # Встреча
    FOLLOW_UP = "follow_up"        # Дозвон
    NOTE = "note"                  # Заметка
    CUSTOM = "custom"              # Пользовательский тип


class TaskStatus(str, Enum):
    """Статусы задач"""
    NEW = "new"                    # Новая
    IN_PROGRESS = "in_progress"    # В работе
    COMPLETED = "completed"        # Выполнена
    CANCELLED = "cancelled"        # Отменена
    OVERDUE = "overdue"           # Просрочена


class TaskPriority(str, Enum):
    """Приоритет задач"""
    LOW = "low"                    # Низкий
    MEDIUM = "medium"              # Средний
    HIGH = "high"                  # Высокий
    URGENT = "urgent"              # Срочный


class Task(BaseModel):
    """Модель задачи CRM"""
    
    id: Optional[str] = Field(None, description="Уникальный идентификатор")
    
    # Основная информация
    kind: Literal["task", "note", "comment"] = "task"
    title_id: Optional[str] = None
    contact_id: Optional[str] = None
    contact_name: Optional[str] = None
    chat_phone: Optional[str] = None
    chat_name: Optional[str] = None
    assigned_to_name: Optional[str] = None
    title: str = Field(..., description="Название задачи")
    type: TaskType = Field(TaskType.CALL, description="Тип задачи")
    custom_type_name: Optional[str] = Field(None, description="Название пользовательского типа")
    description: Optional[str] = Field(None, description="Описание задачи")
    
    # Статус и приоритет
    status: TaskStatus = Field(TaskStatus.NEW, description="Статус задачи")
    priority: TaskPriority = Field(TaskPriority.MEDIUM, description="Приоритет")
    
    # Ответственные
    assigned_to: Optional[str] = Field(None, description="ID ответственного менеджера")
    created_by: Optional[str] = Field(None, description="ID автора задачи")
    
    # Привязки
    lead_id: Optional[str] = Field(None, description="ID связанного лида")
    client_id: Optional[str] = Field(None, description="ID связанного клиента (пациента)")
    deal_id: Optional[str] = Field(None, description="ID связанной сделки")
    
    # Врач (для медицинских задач)
    doctor_id: Optional[str] = Field(None, description="ID прикрепленного врача")
    
    # Даты и время
    due_date: Optional[datetime] = Field(None, description="Срок исполнения")
    due_time: Optional[str] = Field(None, description="Время исполнения (HH:MM)")
    completed_at: Optional[datetime] = Field(None, description="Дата выполнения")
    
    # Системные поля
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Дата создания")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Дата обновления")
    
    # Комментарий
    comment: Optional[str] = Field(None, description="Комментарий к задаче")
    
    class Config:
        """Конфигурация модели"""
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
    
    @model_validator(mode='before')
    @classmethod
    def legacy_note_kind(cls, values):
        if isinstance(values, dict) and not values.get('kind') and values.get('type') == TaskType.NOTE:
            values = dict(values, kind='note')
        return values

    @field_serializer('due_date', 'completed_at', 'created_at', 'updated_at', when_used='json')
    def serialize_utc_datetime(self, value):
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc).isoformat() if value.tzinfo is None else value.astimezone(timezone.utc).isoformat()

    def is_overdue(self) -> bool:
        """Проверка просрочена ли задача"""
        if self.kind == "task" and self.due_date and self.status not in [TaskStatus.COMPLETED, TaskStatus.CANCELLED]:
            return (datetime.now(timezone.utc) if self.due_date.tzinfo else datetime.utcnow()) > self.due_date
        return False
    
    def mark_completed(self):
        """Отметить задачу как выполненную"""
        self.status = TaskStatus.COMPLETED
        self.completed_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
    
    def mark_cancelled(self):
        """Отметить задачу как отмененную"""
        self.status = TaskStatus.CANCELLED
        self.updated_at = datetime.utcnow()
