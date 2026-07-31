"""
Laboratory model - represents external laboratories
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid


class Laboratory(BaseModel):
    """Laboratory model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class LaboratoryCreate(BaseModel):
    """Laboratory creation model"""
    name: str
    description: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None


class LaboratoryUpdate(BaseModel):
    """Laboratory update model"""
    name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None
    is_active: Optional[bool] = None
