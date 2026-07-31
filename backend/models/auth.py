"""
Authentication Models Module

This module contains all Pydantic models related to authentication,
user management, and authorization.
"""

from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime
from enum import Enum
import uuid


class UserRole(str, Enum):
    """User roles enum"""
    SUPER_ADMIN = "super_admin"  # Супер администратор - полный доступ
    ADMIN = "admin"  # Администратор - управление пациентами, врачами
    DOCTOR = "doctor"  # Врач - доступ к пациентам и календарю
    MARKETER = "marketer"  # Маркетолог - доступ к CRM и статистике
    ADMINISTRATOR = "administrator"  # Администратор клиники - базовый доступ
    PATIENT = "patient"  # Пациент


class User(BaseModel):
    """Main user model for API responses"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    password_expires_at: Optional[datetime] = None  # When password expires
    permissions: List[str] = Field(default_factory=list)  # Список прав доступа
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


class ChangePasswordRequest(BaseModel):
    """Model for password change request"""
    current_password: str
    new_password: str
