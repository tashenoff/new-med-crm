"""
Services Models Module

This module contains all Pydantic models related to services,
service categories, specialties, and service pricing.
"""

from pydantic import BaseModel, Field, validator
from typing import Optional
from datetime import datetime
import uuid


class ServiceCategory(BaseModel):
    """Service category model for organizing services"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ServiceCategoryCreate(BaseModel):
    """Model for creating service category"""
    name: str
    description: Optional[str] = None


class ServiceCategoryUpdate(BaseModel):
    """Model for updating service category"""
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class Specialty(BaseModel):
    """Medical specialty model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SpecialtyCreate(BaseModel):
    """Model for creating specialty"""
    name: str
    description: Optional[str] = None


class SpecialtyUpdate(BaseModel):
    """Model for updating specialty"""
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ServicePrice(BaseModel):
    """Service price directory model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    service_name: str
    service_code: Optional[str] = None
    category: Optional[str] = None
    price: float
    unit: Optional[str] = "процедура"  # единица измерения (процедура, час, зуб и т.д.)
    description: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    @validator('price')
    def validate_price(cls, v):
        """Validate price is positive"""
        if v is not None and v < 0:
            raise ValueError('Price must be positive')
        return v


class ServicePriceCreate(BaseModel):
    """Model for creating service price"""
    service_name: str
    service_code: Optional[str] = None
    category: Optional[str] = None
    price: float
    unit: Optional[str] = "процедура"
    description: Optional[str] = None
    
    @validator('price')
    def validate_price(cls, v):
        """Validate price is positive"""
        if v < 0:
            raise ValueError('Price must be positive')
        return v


class ServicePriceUpdate(BaseModel):
    """Model for updating service price"""
    service_name: Optional[str] = None
    service_code: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    unit: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    
    @validator('price')
    def validate_price(cls, v):
        """Validate price is positive"""
        if v is not None and v < 0:
            raise ValueError('Price must be positive')
        return v


class Service(BaseModel):
    """Service model for treatment plans"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str  # "Стоматолог", "Гинекология", "Ортодонт" etc.
    price: float
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    @validator('price')
    def validate_price(cls, v):
        """Validate price is positive"""
        if v < 0:
            raise ValueError('Price must be positive')
        return v


class ServiceCreate(BaseModel):
    """Model for creating service in treatment plans"""
    name: str
    category: str
    price: float
    description: Optional[str] = None
    
    @validator('price')
    def validate_price(cls, v):
        """Validate price is positive"""
        if v < 0:
            raise ValueError('Price must be positive')
        return v
