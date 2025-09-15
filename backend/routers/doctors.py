from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

# Router
doctors_router = APIRouter(prefix="/doctors", tags=["Doctors"])

# Dependency to get database
def get_database():
    from ..server import db
    return db

# Pydantic models
class Doctor(BaseModel):
    id: str
    name: str
    email: str = ""
    phone: str = ""
    specialization: str = ""
    license_number: str = ""
    created_at: datetime
    updated_at: datetime
    is_active: bool = True

class DoctorCreate(BaseModel):
    name: str
    email: str = ""
    phone: str = ""
    specialization: str = ""
    license_number: str = ""

class DoctorUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    specialization: Optional[str] = None
    license_number: Optional[str] = None
    is_active: Optional[bool] = None

class DoctorSchedule(BaseModel):
    id: str
    doctor_id: str
    room_id: str
    day_of_week: int  # 0=Monday, 6=Sunday
    start_time: str
    end_time: str
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

class DoctorScheduleCreate(BaseModel):
    room_id: str
    day_of_week: int
    start_time: str
    end_time: str

class DoctorScheduleUpdate(BaseModel):
    room_id: Optional[str] = None
    day_of_week: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    is_active: Optional[bool] = None

class DoctorWithSchedule(BaseModel):
    id: str
    name: str
    email: str = ""
    phone: str = ""
    specialization: str = ""
    license_number: str = ""
    created_at: datetime
    updated_at: datetime
    is_active: bool = True
    schedule: List[DoctorSchedule] = []

# Routes will be extracted here from server.py