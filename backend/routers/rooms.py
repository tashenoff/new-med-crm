"""
Rooms router - HTTP endpoints for room operations
Uses RoomService for business logic
"""
from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
from datetime import datetime
from bson import ObjectId

# Import room models
from models.room import (
    Room,
    RoomCreate,
    RoomUpdate,
    RoomSchedule,
    RoomScheduleCreate,
    RoomScheduleUpdate,
    RoomWithSchedule
)

# Import auth dependencies
from models.auth import UserInDB, UserRole
from routers.auth import get_current_active_user, require_role
from database import db

# Import service
from services.room_service import RoomService

# Router
rooms_router = APIRouter(prefix="/rooms", tags=["Rooms"])


# Dependency to get service
def get_room_service():
    return RoomService(db)


# ============================================================================
# Room CRUD Endpoints
# ============================================================================

@rooms_router.get("", response_model=List[Room])
async def get_rooms(
    current_user: UserInDB = Depends(get_current_active_user),
    service: RoomService = Depends(get_room_service)
):
    """Get all active rooms"""
    return await service.get_rooms()


@rooms_router.post("", response_model=Room)
async def create_room(
    room_data: RoomCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN])),
    service: RoomService = Depends(get_room_service)
):
    """Create new room"""
    return await service.create_room(room_data)


@rooms_router.put("/{room_id}", response_model=Room)
async def update_room(
    room_id: str,
    room_update: RoomUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN])),
    service: RoomService = Depends(get_room_service)
):
    """Update room"""
    return await service.update_room(room_id, room_update)


@rooms_router.delete("/{room_id}")
async def delete_room(
    room_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN])),
    service: RoomService = Depends(get_room_service)
):
    """Delete room (soft delete)"""
    return await service.delete_room(room_id)


# ============================================================================
# Room Schedule Endpoints
# ============================================================================

@rooms_router.get("/{room_id}/schedule", response_model=List[RoomSchedule])
async def get_room_schedule(
    room_id: str,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get schedule for a specific room"""
    schedules = await db.room_schedules.find(
        {"room_id": room_id, "is_active": True}
    ).sort("day_of_week", 1).to_list(1000)
    return [RoomSchedule(**schedule) for schedule in schedules]


@rooms_router.post("/{room_id}/schedule", response_model=RoomSchedule)
async def create_room_schedule(
    room_id: str,
    schedule_data: RoomScheduleCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Create room schedule entry"""
    # Verify room exists - check multiple ID formats
    room_search_queries = [
        {"id": room_id},
        {"_id": room_id}
    ]
    if len(room_id) == 24:
        try:
            room_search_queries.append({"_id": ObjectId(room_id)})
        except:
            pass
    
    room = await db.rooms.find_one({
        "$or": room_search_queries,
        "is_active": True
    })
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Verify doctor exists - check multiple ID formats
    doctor_search_queries = [
        {"id": schedule_data.doctor_id},
        {"_id": schedule_data.doctor_id}
    ]
    if len(schedule_data.doctor_id) == 24:
        try:
            doctor_search_queries.append({"_id": ObjectId(schedule_data.doctor_id)})
        except:
            pass
    
    doctor = await db.doctors.find_one({
        "$or": doctor_search_queries,
        "is_active": True
    })
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    
    # Check for time conflicts in the same room
    conflicting_schedules = await db.room_schedules.find({
        "room_id": room_id,
        "day_of_week": schedule_data.day_of_week,
        "is_active": True,
        "$or": [
            # New schedule starts during existing schedule
            {
                "start_time": {"$lte": schedule_data.start_time},
                "end_time": {"$gt": schedule_data.start_time}
            },
            # New schedule ends during existing schedule
            {
                "start_time": {"$lt": schedule_data.end_time},
                "end_time": {"$gte": schedule_data.end_time}
            },
            # New schedule encompasses existing schedule
            {
                "start_time": {"$gte": schedule_data.start_time},
                "end_time": {"$lte": schedule_data.end_time}
            }
        ]
    }).to_list(None)
    
    if conflicting_schedules:
        raise HTTPException(status_code=400, detail="Time conflict: room is already scheduled during this time")
    
    # Override room_id from URL
    schedule_data.room_id = room_id
    schedule_obj = RoomSchedule(**schedule_data.dict())
    await db.room_schedules.insert_one(schedule_obj.dict())
    
    return schedule_obj


@rooms_router.put("/schedules/{schedule_id}", response_model=RoomSchedule)
async def update_room_schedule(
    schedule_id: str,
    schedule_update: RoomScheduleUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Update room schedule entry"""
    existing_schedule = await db.room_schedules.find_one({"id": schedule_id})
    if not existing_schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    update_data = {k: v for k, v in schedule_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    await db.room_schedules.update_one(
        {"id": schedule_id},
        {"$set": update_data}
    )
    
    updated_schedule = await db.room_schedules.find_one({"id": schedule_id})
    return RoomSchedule(**updated_schedule)


@rooms_router.delete("/schedules/{schedule_id}")
async def delete_room_schedule(
    schedule_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Delete room schedule entry"""
    await db.room_schedules.update_one(
        {"id": schedule_id},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    return {"message": "Room schedule deleted successfully"}


# ============================================================================
# Helper Endpoints
# ============================================================================

@rooms_router.get("/-with-schedule", response_model=List[RoomWithSchedule])
async def get_rooms_with_schedule(
    current_user: UserInDB = Depends(get_current_active_user),
    service: RoomService = Depends(get_room_service)
):
    """Get all rooms with their schedules (accessible at /api/rooms-with-schedule)"""
    return await service.get_rooms_with_schedule()


@rooms_router.get("/{room_id}/available-doctor")
async def get_available_doctor_for_room(
    room_id: str,
    day_of_week: int,
    time: str,  # HH:MM format
    current_user: UserInDB = Depends(get_current_active_user),
    service: RoomService = Depends(get_room_service)
):
    """Find which doctor is available in the room at specific day and time"""
    return await service.get_available_doctor_for_room(room_id, day_of_week, time)
