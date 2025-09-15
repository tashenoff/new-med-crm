from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

# Router
patients_router = APIRouter(prefix="/patients", tags=["Patients"])

# Dependency to get database
def get_database():
    from ..server import db
    return db

# Dependency for auth
def get_current_user():
    from .auth import get_current_user as _get_current_user
    return _get_current_user

# Pydantic models
class Patient(BaseModel):
    id: str
    name: str
    email: str = ""
    phone: str = ""
    address: str = ""
    birth_date: str = ""
    gender: str = ""
    emergency_contact: str = ""
    created_at: datetime
    updated_at: datetime
    is_active: bool = True
    # Medical info
    allergies: str = ""
    chronic_conditions: str = ""
    medications: str = ""
    insurance_number: str = ""
    notes: str = ""
    # Добавленные поля
    medical_history: str = ""
    blood_type: str = ""
    height: Optional[float] = None
    weight: Optional[float] = None

class PatientCreate(BaseModel):
    name: str
    email: str = ""
    phone: str = ""
    address: str = ""
    birth_date: str = ""
    gender: str = ""
    emergency_contact: str = ""
    # Medical info
    allergies: str = ""
    chronic_conditions: str = ""
    medications: str = ""
    insurance_number: str = ""
    notes: str = ""

class PatientUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    emergency_contact: Optional[str] = None
    is_active: Optional[bool] = None
    # Medical info
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    medications: Optional[str] = None
    insurance_number: Optional[str] = None
    notes: Optional[str] = None

# Routes will be extracted here from server.py