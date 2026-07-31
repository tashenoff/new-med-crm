"""
Loyalty System Models Module

This module contains models for patient bonus system and doctor cashback.
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime
from enum import Enum
import uuid


class BonusTransactionType(str, Enum):
    """Bonus transaction types"""
    EARNED = "earned"  # Начислено
    SPENT = "spent"  # Потрачено
    REFUND = "refund"  # Возврат (при отмене)


class CashbackTransactionType(str, Enum):
    """Cashback transaction types"""
    EARNED = "earned"  # Начислено
    WITHDRAWN = "withdrawn"  # Выведено
    REFUND = "refund"  # Возврат (при отмене)


class LoyaltySettings(BaseModel):
    """Global bonus program settings"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    earning_rate: float = 5.0  # Процент начисления бонусов (5 = 5%)
    max_usage_percent: float = 30.0  # Максимум для оплаты бонусами (30 = 30%)
    is_active: bool = True  # Включена ли программа
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    @validator('earning_rate', 'max_usage_percent')
    def validate_percent(cls, v):
        """Validate percentage is between 0 and 100"""
        if v < 0 or v > 100:
            raise ValueError('Percentage must be between 0 and 100')
        return v


class LoyaltySettingsUpdate(BaseModel):
    """Schema for updating loyalty settings"""
    earning_rate: Optional[float] = None
    max_usage_percent: Optional[float] = None
    is_active: Optional[bool] = None
    
    @validator('earning_rate', 'max_usage_percent')
    def validate_percent(cls, v):
        """Validate percentage is between 0 and 100"""
        if v is not None and (v < 0 or v > 100):
            raise ValueError('Percentage must be between 0 and 100')
        return v


class BonusTransaction(BaseModel):
    """Patient bonus transaction history"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    transaction_type: BonusTransactionType
    amount: float  # Сумма бонусов
    balance_after: float  # Баланс после операции
    related_id: Optional[str] = None  # ID приема или плана лечения
    related_type: Optional[str] = None  # "appointment" или "treatment_plan"
    description: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    @validator('amount')
    def validate_amount(cls, v):
        """Validate amount is positive"""
        if v < 0:
            raise ValueError('Amount must be positive')
        return v


class BonusTransactionCreate(BaseModel):
    """Schema for creating bonus transaction"""
    patient_id: str
    transaction_type: BonusTransactionType
    amount: float
    balance_after: float
    related_id: Optional[str] = None
    related_type: Optional[str] = None
    description: str
    
    @validator('amount')
    def validate_amount(cls, v):
        """Validate amount is positive"""
        if v < 0:
            raise ValueError('Amount must be positive')
        return v


class LabServiceCashback(BaseModel):
    """Cashback settings for lab services (analyses)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    service_id: str  # ID услуги из service_prices
    service_name: str  # Название для удобства
    cashback_rate: float  # Процент кэшбэка врачу (5 = 5%)
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    @validator('cashback_rate')
    def validate_percent(cls, v):
        """Validate percentage is between 0 and 100"""
        if v < 0 or v > 100:
            raise ValueError('Percentage must be between 0 and 100')
        return v


class LabServiceCashbackCreate(BaseModel):
    """Schema for creating lab service cashback"""
    service_id: str
    service_name: str
    cashback_rate: float
    
    @validator('cashback_rate')
    def validate_percent(cls, v):
        """Validate percentage is between 0 and 100"""
        if v < 0 or v > 100:
            raise ValueError('Percentage must be between 0 and 100')
        return v


class LabServiceCashbackUpdate(BaseModel):
    """Schema for updating lab service cashback"""
    cashback_rate: Optional[float] = None
    is_active: Optional[bool] = None
    
    @validator('cashback_rate')
    def validate_percent(cls, v):
        """Validate percentage is between 0 and 100"""
        if v is not None and (v < 0 or v > 100):
            raise ValueError('Percentage must be between 0 and 100')
        return v


class DoctorCashbackTransaction(BaseModel):
    """Doctor cashback transaction history"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    doctor_id: str
    patient_id: str  # За какого пациента
    patient_name: Optional[str] = None  # Для удобства отображения
    service_id: str  # Какой анализ
    service_name: Optional[str] = None  # Для удобства отображения
    transaction_type: CashbackTransactionType
    amount: float  # Сумма кэшбэка
    balance_after: float  # Баланс после операции
    related_appointment_id: Optional[str] = None  # Связь с приемом
    description: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    @validator('amount')
    def validate_amount(cls, v):
        """Validate amount is positive"""
        if v < 0:
            raise ValueError('Amount must be positive')
        return v


class DoctorCashbackTransactionCreate(BaseModel):
    """Schema for creating doctor cashback transaction"""
    doctor_id: str
    patient_id: str
    patient_name: Optional[str] = None
    service_id: str
    service_name: Optional[str] = None
    transaction_type: CashbackTransactionType
    amount: float
    balance_after: float
    related_appointment_id: Optional[str] = None
    description: str
    
    @validator('amount')
    def validate_amount(cls, v):
        """Validate amount is positive"""
        if v < 0:
            raise ValueError('Amount must be positive')
        return v


class PatientBonusInfo(BaseModel):
    """Patient bonus information response"""
    patient_id: str
    bonus_balance: float
    total_earned: float
    total_spent: float
    can_use_bonus: bool  # Активна ли программа
    earning_rate: float  # Текущий процент начисления
    max_usage_percent: float  # Максимум для оплаты


class DoctorCashbackInfo(BaseModel):
    """Doctor cashback information response"""
    doctor_id: str
    cashback_balance: float
    total_earned: float
    recent_transactions: List[DoctorCashbackTransaction] = []


class BonusPaymentCalculation(BaseModel):
    """Bonus payment calculation result"""
    requested_bonus: float
    available_bonus: float  # Доступный баланс
    max_allowed_bonus: float  # Максимум по правилам (30%)
    bonus_to_use: float  # Итоговая сумма к использованию
    remaining_payment: float  # Остаток к оплате
    patient_new_balance: float  # Новый баланс после списания
