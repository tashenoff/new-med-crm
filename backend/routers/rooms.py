from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

# Import room models from models module
from models.room import (
    Room,
    RoomCreate,
    RoomUpdate,
    RoomSchedule,
    RoomScheduleCreate,
    RoomScheduleUpdate,
    RoomWithSchedule
)

# Router
rooms_router = APIRouter(prefix="/rooms", tags=["Rooms"])

# Dependency to get database
def get_database():
    from ..server import db
    return db

# Routes will be extracted here from server.py