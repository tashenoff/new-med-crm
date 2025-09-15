from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import List, Optional, Union
from datetime import datetime
from enum import Enum
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

# Router
appointments_router = APIRouter(prefix="/appointments", tags=["Appointments"])

# Dependency to get database
def get_database():
    from ..server import db
    return db

# Enums
class AppointmentStatus(str, Enum):
    scheduled = "scheduled"
    confirmed = "confirmed"
    completed = "completed"
    cancelled = "cancelled"
    no_show = "no_show"

class CancelReason(str, Enum):
    patient_request = "patient_request"
    doctor_unavailable = "doctor_unavailable"
    emergency = "emergency"
    other = "other"

# Pydantic models
class Appointment(BaseModel):
    id: str
    patient_id: str
    doctor_id: str
    room_id: str = ""
    appointment_date: str
    appointment_time: str
    end_time: str = ""
    status: AppointmentStatus = AppointmentStatus.scheduled
    notes: str = ""
    price: Optional[float] = None
    created_at: datetime
    updated_at: datetime

class AppointmentCreate(BaseModel):
    patient_id: str
    doctor_id: str
    room_id: str = ""
    appointment_date: str
    appointment_time: str
    end_time: str = ""
    notes: str = ""
    price: Optional[float] = None

class AppointmentUpdate(BaseModel):
    patient_id: Optional[str] = None
    doctor_id: Optional[str] = None
    room_id: Optional[str] = None
    appointment_date: Optional[str] = None
    appointment_time: Optional[str] = None
    end_time: Optional[str] = None
    status: Optional[AppointmentStatus] = None
    notes: Optional[str] = None
    price: Optional[float] = None

class AppointmentStatusUpdate(BaseModel):
    status: AppointmentStatus
    cancel_reason: Optional[CancelReason] = None
    notes: Optional[str] = None

# Routes will be extracted here from server.py