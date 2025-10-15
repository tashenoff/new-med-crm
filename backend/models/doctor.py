"""
Doctor Models Module

This module contains all Pydantic models related to doctors,
doctor schedules, and payment management.
"""

from pydantic import BaseModel, Field, validator
from typing import List, Optional
from datetime import datetime
from enum import Enum
import uuid


class PaymentType(str, Enum):
    """Payment type enum for doctor compensation"""
    PERCENTAGE = "percentage"
    FIXED = "fixed"
    HYBRID = "hybrid"


class Doctor(BaseModel):
    """Main doctor model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    full_name: str
    specialty: str
    phone: Optional[str] = None
    calendar_color: str = "#3B82F6"  # Default blue color
    is_active: bool = True
    user_id: Optional[str] = None  # Link to User if doctor has account
    
    @validator('phone')
    def validate_phone(cls, v):
        """Validate phone number contains only digits, spaces, +, -, (, )"""
        if v is not None:
            # Allow only digits and common phone formatting characters
            allowed_chars = set('0123456789 +()-')
            if not all(c in allowed_chars for c in v):
                raise ValueError('Phone number contains invalid characters. Use only digits and +, -, (, ), space')
            # Ensure there are at least 10 digits
            digits_only = ''.join(filter(str.isdigit, v))
            if len(digits_only) < 10:
                raise ValueError('Phone number must contain at least 10 digits')
        return v
    # Поля для оплаты врача (опциональные для обратной совместимости)
    payment_type: Optional[PaymentType] = PaymentType.PERCENTAGE  # Тип оплаты: процент, фиксированная сумма или гибридная
    payment_value: Optional[float] = 0.0  # Значение оплаты (процент 0-100 или фиксированная сумма)
    currency: Optional[str] = "KZT"  # Валюта для фиксированной оплаты
    # Дополнительные поля для гибридного типа оплаты
    hybrid_fixed_amount: Optional[float] = 0.0  # Фиксированная часть при гибридном типе
    hybrid_percentage_value: Optional[float] = 0.0  # Процентная часть при гибридном типе
    # Отдельные настройки комиссий за консультации (для обратной совместимости)
    consultation_payment_type: Optional[PaymentType] = PaymentType.PERCENTAGE  # Тип оплаты за консультации
    consultation_payment_value: Optional[float] = 0.0  # Значение оплаты за консультации
    consultation_currency: Optional[str] = "KZT"  # Валюта для фиксированной оплаты за консультации
    # Услуги, которые может оказывать врач (для расчета зарплаты с планов лечения)
    services: Optional[List] = []  # Список ID услуг или объектов с настройками комиссий
    payment_mode: Optional[str] = "general"  # Режим оплаты: "general" или "individual"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class DoctorCreate(BaseModel):
    """Model for creating a new doctor"""
    full_name: str
    specialty: str
    phone: Optional[str] = None
    calendar_color: str = "#3B82F6"
    user_id: Optional[str] = None
    
    @validator('phone')
    def validate_phone(cls, v):
        """Validate phone number contains only digits, spaces, +, -, (, )"""
        if v is not None:
            # Allow only digits and common phone formatting characters
            allowed_chars = set('0123456789 +()-')
            if not all(c in allowed_chars for c in v):
                raise ValueError('Phone number contains invalid characters. Use only digits and +, -, (, ), space')
            # Ensure there are at least 10 digits
            digits_only = ''.join(filter(str.isdigit, v))
            if len(digits_only) < 10:
                raise ValueError('Phone number must contain at least 10 digits')
        return v
    # Поля для оплаты врача (опциональные с дефолтными значениями)
    payment_type: Optional[PaymentType] = PaymentType.PERCENTAGE
    payment_value: Optional[float] = 0.0
    currency: Optional[str] = "KZT"
    # Дополнительные поля для гибридного типа оплаты планов лечения
    hybrid_fixed_amount: Optional[float] = 0.0
    hybrid_percentage_value: Optional[float] = 0.0
    # Отдельные настройки комиссий за консультации
    consultation_payment_type: Optional[PaymentType] = PaymentType.PERCENTAGE
    consultation_payment_value: Optional[float] = 0.0
    consultation_currency: Optional[str] = "KZT"
    # Дополнительные поля для гибридного типа оплаты за консультации
    consultation_hybrid_fixed_amount: Optional[float] = 0.0
    consultation_hybrid_percentage_value: Optional[float] = 0.0
    # Услуги врача
    services: Optional[List] = []
    payment_mode: Optional[str] = "general"


class DoctorUpdate(BaseModel):
    """Model for updating doctor information"""
    full_name: Optional[str] = None
    specialty: Optional[str] = None
    phone: Optional[str] = None
    calendar_color: Optional[str] = None
    is_active: Optional[bool] = None
    
    @validator('phone')
    def validate_phone(cls, v):
        """Validate phone number contains only digits, spaces, +, -, (, )"""
        if v is not None:
            # Allow only digits and common phone formatting characters
            allowed_chars = set('0123456789 +()-')
            if not all(c in allowed_chars for c in v):
                raise ValueError('Phone number contains invalid characters. Use only digits and +, -, (, ), space')
            # Ensure there are at least 10 digits
            digits_only = ''.join(filter(str.isdigit, v))
            if len(digits_only) < 10:
                raise ValueError('Phone number must contain at least 10 digits')
        return v
    # Поля для оплаты врача
    payment_type: Optional[PaymentType] = None
    payment_value: Optional[float] = None
    currency: Optional[str] = None
    # Дополнительные поля для гибридного типа оплаты
    hybrid_fixed_amount: Optional[float] = None
    hybrid_percentage_value: Optional[float] = None
    # Отдельные настройки комиссий за консультации
    consultation_payment_type: Optional[PaymentType] = None
    consultation_payment_value: Optional[float] = None
    consultation_currency: Optional[str] = None
    # Дополнительные поля для гибридного типа оплаты за консультации
    consultation_hybrid_fixed_amount: Optional[float] = None
    consultation_hybrid_percentage_value: Optional[float] = None
    # Услуги врача
    services: Optional[List] = None
    payment_mode: Optional[str] = None


class DoctorSchedule(BaseModel):
    """Doctor schedule model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    doctor_id: str
    day_of_week: int  # 0 = Понедельник, 1 = Вторник, ..., 6 = Воскресенье
    start_time: str   # Format: "HH:MM"
    end_time: str     # Format: "HH:MM"
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class DoctorScheduleCreate(BaseModel):
    """Model for creating doctor schedule"""
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


class DoctorScheduleUpdate(BaseModel):
    """Model for updating doctor schedule"""
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


class DoctorWithSchedule(BaseModel):
    """Doctor model with schedule information"""
    id: str
    full_name: str
    specialty: str
    phone: Optional[str]
    calendar_color: str
    is_active: bool
    user_id: Optional[str]
    # Поля для оплаты врача (опциональные для обратной совместимости)
    payment_type: Optional[PaymentType] = PaymentType.PERCENTAGE
    payment_value: Optional[float] = 0.0
    currency: Optional[str] = "KZT"
    # Услуги врача
    services: Optional[List] = []
    created_at: datetime
    updated_at: datetime
    schedule: List[DoctorSchedule] = []
