"""Validated task inputs; legacy task types remain supported."""
from datetime import datetime, timezone
from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator
from ..models.task import TaskType, TaskStatus, TaskPriority

class TaskFields(BaseModel):
    @field_validator('title', check_fields=False)
    @classmethod
    def clean_title(cls, value):
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError('Название не может быть пустым')
        return value

    @field_validator('due_date', check_fields=False)
    @classmethod
    def normalize_due_date(cls, value):
        # Database stores UTC naive datetimes, as do existing tasks.
        return value.astimezone(timezone.utc).replace(tzinfo=None) if value and value.tzinfo else value

class TaskCreate(TaskFields):
    title: str = Field(..., min_length=1, max_length=250)
    kind: Literal['task', 'note', 'comment'] = 'task'
    title_id: Optional[str] = Field(None, max_length=100)
    chat_phone: Optional[str] = Field(None, max_length=40)
    type: TaskType = TaskType.CALL
    custom_type_name: Optional[str] = Field(None, max_length=250)
    description: Optional[str] = Field(None, max_length=10000)
    status: TaskStatus = TaskStatus.NEW
    priority: TaskPriority = TaskPriority.MEDIUM
    assigned_to: Optional[str] = Field(None, max_length=100)
    lead_id: Optional[str] = Field(None, max_length=100)
    client_id: Optional[str] = Field(None, max_length=100)
    deal_id: Optional[str] = Field(None, max_length=100)
    doctor_id: Optional[str] = Field(None, max_length=100)
    due_date: Optional[datetime] = None
    due_time: Optional[str] = Field(None, pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    comment: Optional[str] = Field(None, max_length=10000)

class TaskUpdate(TaskFields):
    title: Optional[str] = Field(None, min_length=1, max_length=250)
    kind: Optional[Literal['task', 'note', 'comment']] = None
    title_id: Optional[str] = Field(None, max_length=100)
    chat_phone: Optional[str] = Field(None, max_length=40)
    type: Optional[TaskType] = None
    custom_type_name: Optional[str] = Field(None, max_length=250)
    description: Optional[str] = Field(None, max_length=10000)
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assigned_to: Optional[str] = Field(None, max_length=100)
    lead_id: Optional[str] = Field(None, max_length=100)
    client_id: Optional[str] = Field(None, max_length=100)
    deal_id: Optional[str] = Field(None, max_length=100)
    doctor_id: Optional[str] = Field(None, max_length=100)
    due_date: Optional[datetime] = None
    due_time: Optional[str] = Field(None, pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    comment: Optional[str] = Field(None, max_length=10000)

class TaskSearchFilters(BaseModel):
    status: Optional[list[TaskStatus]] = None
    type: Optional[list[TaskType]] = None
    priority: Optional[list[TaskPriority]] = None
    kind: Optional[Literal['task', 'note', 'comment']] = None
    chat_phone: Optional[str] = None
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
    search: Optional[str] = Field(None, max_length=250)
    show_overdue: Optional[bool] = None
    show_completed: Optional[bool] = True

class TaskTitleInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=250)
    is_active: bool = True

    @field_validator('name')
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError('Название не может быть пустым')
        return value

class TaskTitleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=250)
    is_active: Optional[bool] = None
    _clean_name = field_validator('name')(classmethod(lambda cls, value: TaskTitleInput.clean_name(value) if value is not None else value))
