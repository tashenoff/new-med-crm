from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

# Import doctor models from models module
from models.doctor import (
    PaymentType,
    Doctor,
    DoctorCreate,
    DoctorUpdate,
    DoctorSchedule,
    DoctorScheduleCreate,
    DoctorScheduleUpdate,
    DoctorWithSchedule
)

# Router
doctors_router = APIRouter(prefix="/doctors", tags=["Doctors"])

# Dependency to get database
def get_database():
    from ..server import db
    return db

# Routes will be extracted here from server.py