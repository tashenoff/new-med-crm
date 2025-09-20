"""
Appointment Models Module

This module contains all Pydantic models related to appointments,
appointment scheduling, and appointment management.
"""

from pydantic import BaseModel, Field, validator
from typing import Optional
from datetime import datetime
from enum import Enum
import uuid


class AppointmentStatus(str, Enum):
    """Appointment status enum"""
    UNCONFIRMED = "unconfirmed"       # Не подтверждено - желтый
    CONFIRMED = "confirmed"           # Подтверждено - зеленый
    ARRIVED = "arrived"              # Пациент пришел - синий
    IN_PROGRESS = "in_progress"      # На приеме - оранжевый
    COMPLETED = "completed"          # Завершен - темно-зеленый
    CANCELLED = "cancelled"          # Отменено - красный
    NO_SHOW = "no_show"             # Не явился - серый


class Appointment(BaseModel):
    """Main appointment model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    doctor_id: str
    room_id: Optional[str] = None  # ID кабинета
    appointment_date: str  # Store as string in ISO format (YYYY-MM-DD)
    appointment_time: str  # Format: "HH:MM"
    end_time: Optional[str] = None  # Format: "HH:MM"
    price: Optional[float] = None  # Price of the appointment
    status: AppointmentStatus = AppointmentStatus.UNCONFIRMED
    reason: Optional[str] = None
    notes: Optional[str] = None
    patient_notes: Optional[str] = None  # Notes about the patient (separate from appointment notes)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    @validator('appointment_date')
    def validate_appointment_date(cls, v):
        """Validate appointment date is in YYYY-MM-DD format"""
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError('Date must be in YYYY-MM-DD format')
        return v
    
    @validator('appointment_time', 'end_time')
    def validate_time_format(cls, v):
        """Validate time format is HH:MM"""
        if v is not None:
            try:
                datetime.strptime(v, "%H:%M")
            except ValueError:
                raise ValueError('Time must be in HH:MM format')
        return v
    
    @validator('price')
    def validate_price(cls, v):
        """Validate price is positive"""
        if v is not None and v < 0:
            raise ValueError('Price must be positive')
        return v


class AppointmentCreate(BaseModel):
    """Model for creating appointment"""
    patient_id: str
    doctor_id: str
    room_id: Optional[str] = None
    appointment_date: str  # Accept as string in ISO format (YYYY-MM-DD)
    appointment_time: str
    end_time: Optional[str] = None
    price: Optional[float] = None
    status: Optional[AppointmentStatus] = AppointmentStatus.UNCONFIRMED
    reason: Optional[str] = None
    notes: Optional[str] = None
    patient_notes: Optional[str] = None
    
    @validator('appointment_date')
    def validate_appointment_date(cls, v):
        """Validate appointment date is in YYYY-MM-DD format"""
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError('Date must be in YYYY-MM-DD format')
        return v
    
    @validator('appointment_time', 'end_time')
    def validate_time_format(cls, v):
        """Validate time format is HH:MM"""
        if v is not None:
            try:
                datetime.strptime(v, "%H:%M")
            except ValueError:
                raise ValueError('Time must be in HH:MM format')
        return v
    
    @validator('price')
    def validate_price(cls, v):
        """Validate price is positive"""
        if v is not None and v < 0:
            raise ValueError('Price must be positive')
        return v


class AppointmentUpdate(BaseModel):
    """Model for updating appointment"""
    patient_id: Optional[str] = None
    doctor_id: Optional[str] = None
    room_id: Optional[str] = None
    appointment_date: Optional[str] = None  # Accept as string in ISO format (YYYY-MM-DD)
    appointment_time: Optional[str] = None
    end_time: Optional[str] = None
    price: Optional[float] = None
    status: Optional[AppointmentStatus] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    patient_notes: Optional[str] = None
    
    @validator('appointment_date')
    def validate_appointment_date(cls, v):
        """Validate appointment date is in YYYY-MM-DD format"""
        if v is not None:
            try:
                datetime.strptime(v, "%Y-%m-%d")
            except ValueError:
                raise ValueError('Date must be in YYYY-MM-DD format')
        return v
    
    @validator('appointment_time', 'end_time')
    def validate_time_format(cls, v):
        """Validate time format is HH:MM"""
        if v is not None:
            try:
                datetime.strptime(v, "%H:%M")
            except ValueError:
                raise ValueError('Time must be in HH:MM format')
        return v
    
    @validator('price')
    def validate_price(cls, v):
        """Validate price is positive"""
        if v is not None and v < 0:
            raise ValueError('Price must be positive')
        return v


class AppointmentWithDetails(BaseModel):
    """Appointment model with detailed information (for API responses)"""
    id: str
    patient_id: str
    doctor_id: str
    room_id: Optional[str] = None
    appointment_date: str  # Return as string in ISO format (YYYY-MM-DD)
    appointment_time: str
    end_time: Optional[str]
    price: Optional[float]
    status: AppointmentStatus
    reason: Optional[str]
    notes: Optional[str]
    patient_notes: Optional[str]
    patient_name: str
    doctor_name: str
    doctor_specialty: str
    doctor_color: str
    created_at: datetime
    updated_at: datetime
