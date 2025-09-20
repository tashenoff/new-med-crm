"""
Authentication Models Module

This module contains all Pydantic models related to authentication,
user management, and authorization.
"""

from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime
from enum import Enum
import uuid


class UserRole(str, Enum):
    """User roles enum"""
    ADMIN = "admin"
    DOCTOR = "doctor"
    PATIENT = "patient"


class User(BaseModel):
    """Main user model for API responses"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    # Optional reference fields
    doctor_id: Optional[str] = None  # If role is doctor
    patient_id: Optional[str] = None  # If role is patient


class UserInDB(User):
    """User model with password hash for database operations"""
    hashed_password: str


class UserCreate(BaseModel):
    """Model for user registration"""
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.PATIENT


class UserLogin(BaseModel):
    """Model for user login"""
    email: EmailStr
    password: str


class Token(BaseModel):
    """JWT token response model"""
    access_token: str
    token_type: str
    user: User


class TokenData(BaseModel):
    """Token payload data model"""
    email: Optional[str] = None
