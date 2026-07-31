from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid


class PaymentType(BaseModel):
    """Payment type model for doctor commissions"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    commission_rate: float = 0.0  # Комиссия в процентах (например, 2.5 = 2.5%)
    description: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PaymentTypeCreate(BaseModel):
    """Schema for creating payment type"""
    name: str
    commission_rate: float = 0.0
    description: Optional[str] = None


class PaymentTypeUpdate(BaseModel):
    """Schema for updating payment type"""
    name: Optional[str] = None
    commission_rate: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
