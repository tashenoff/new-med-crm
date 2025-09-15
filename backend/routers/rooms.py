from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

# Router
rooms_router = APIRouter(prefix="/rooms", tags=["Rooms"])

# Dependency to get database
def get_database():
    from ..server import db
    return db

# Pydantic models
class Room(BaseModel):
    id: str
    name: str
    description: str = ""
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

class RoomCreate(BaseModel):
    name: str
    description: str = ""

class RoomUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

# Routes will be extracted here from server.py