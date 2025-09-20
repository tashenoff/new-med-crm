"""
Room Models Module

This module contains all Pydantic models related to rooms,
room schedules, and room management.
"""

from pydantic import BaseModel, Field, validator
from typing import List, Optional
from datetime import datetime
import uuid


class Room(BaseModel):
    """Main room model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # "Кабинет 1", "Стоматологический кабинет", "Терапевтический кабинет"
    number: Optional[str] = None  # "101", "202А"
    description: Optional[str] = None
    equipment: Optional[List[str]] = []  # оборудование в кабинете
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    @validator('number', pre=True)
    def convert_number_to_string(cls, v):
        """Convert number from int to string for backward compatibility"""
        if v is not None and not isinstance(v, str):
            return str(v)
        return v


class RoomCreate(BaseModel):
    """Model for creating a new room"""
    name: str
    number: Optional[str] = None
    description: Optional[str] = None
    equipment: Optional[List[str]] = []


class RoomUpdate(BaseModel):
    """Model for updating room information"""
    name: Optional[str] = None
    number: Optional[str] = None
    description: Optional[str] = None
    equipment: Optional[List[str]] = None
    is_active: Optional[bool] = None


class RoomSchedule(BaseModel):
    """Room schedule model for doctor assignments"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    room_id: str
    doctor_id: str
    day_of_week: int  # 0 = Понедельник, 1 = Вторник, ..., 6 = Воскресенье
    start_time: str   # Format: "HH:MM"
    end_time: str     # Format: "HH:MM"
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    @validator('day_of_week')
    def validate_day_of_week(cls, v):
        """Validate day_of_week is between 0-6"""
        if not isinstance(v, int) or v < 0 or v > 6:
            raise ValueError('day_of_week must be an integer between 0 (Monday) and 6 (Sunday)')
        return v
    
    @validator('start_time', 'end_time')
    def validate_time_format(cls, v):
        """Validate time format is HH:MM"""
        try:
            datetime.strptime(v, "%H:%M")
        except ValueError:
            raise ValueError('Time must be in HH:MM format')
        return v


class RoomScheduleCreate(BaseModel):
    """Model for creating room schedule"""
    room_id: Optional[str] = None  # Будет подставлено из URL
    doctor_id: str
    day_of_week: int
    start_time: str
    end_time: str
    
    @validator('day_of_week')
    def validate_day_of_week(cls, v):
        """Validate day_of_week is between 0-6"""
        if not isinstance(v, int) or v < 0 or v > 6:
            raise ValueError('day_of_week must be an integer between 0 (Monday) and 6 (Sunday)')
        return v
    
    @validator('start_time', 'end_time')
    def validate_time_format(cls, v):
        """Validate time format is HH:MM"""
        try:
            datetime.strptime(v, "%H:%M")
        except ValueError:
            raise ValueError('Time must be in HH:MM format')
        return v


class RoomScheduleUpdate(BaseModel):
    """Model for updating room schedule"""
    room_id: Optional[str] = None
    doctor_id: Optional[str] = None
    day_of_week: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    is_active: Optional[bool] = None
    
    @validator('day_of_week')
    def validate_day_of_week(cls, v):
        """Validate day_of_week is between 0-6"""
        if v is not None and (not isinstance(v, int) or v < 0 or v > 6):
            raise ValueError('day_of_week must be an integer between 0 (Monday) and 6 (Sunday)')
        return v
    
    @validator('start_time', 'end_time')
    def validate_time_format(cls, v):
        """Validate time format is HH:MM"""
        if v is not None:
            try:
                datetime.strptime(v, "%H:%M")
            except ValueError:
                raise ValueError('Time must be in HH:MM format')
        return v


class RoomWithSchedule(BaseModel):
    """Room model with schedule information"""
    id: str
    name: str
    number: Optional[str]  # Изменил с int на str для консистентности
    description: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    schedule: List[RoomSchedule] = []
    
    @validator('number', pre=True)
    def convert_number_to_string(cls, v):
        """Convert number from int to string for backward compatibility"""
        if v is not None and not isinstance(v, str):
            return str(v)
        return v
