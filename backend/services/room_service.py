"""
Room service - business logic for room operations
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException
from datetime import datetime
from typing import List, Optional

from models.room import Room, RoomCreate, RoomUpdate, RoomSchedule, RoomWithSchedule
import logging

logger = logging.getLogger(__name__)


class RoomService:
    """Service for room-related business logic"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    # Room CRUD operations
    async def create_room(self, room_data: RoomCreate) -> Room:
        """Create a new room"""
        # Check if room with same name already exists
        existing = await self.db.rooms.find_one({
            "name": room_data.name,
            "is_active": True
        })
        
        if existing:
            raise HTTPException(status_code=400, detail="Room with this name already exists")
        
        room_obj = Room(**room_data.dict())
        await self.db.rooms.insert_one(room_obj.dict())
        logger.info(f"Room created: {room_obj.name}")
        return room_obj
    
    async def get_rooms(self) -> List[Room]:
        """Get all active rooms"""
        try:
            rooms = await self.db.rooms.find({"is_active": True}).sort("name", 1).to_list(1000)
            result = []
            for room in rooms:
                try:
                    # Исключаем поле _id от MongoDB
                    room_data = {k: v for k, v in room.items() if k != '_id'}
                    result.append(Room(**room_data))
                except Exception as e:
                    logger.error(f"Error processing room {room.get('id', 'unknown')}: {e}")
                    continue
            return result
        except Exception as e:
            logger.error(f"Error getting rooms: {e}")
            raise HTTPException(status_code=500, detail=f"Error getting rooms: {str(e)}")
    
    async def update_room(self, room_id: str, update_data: RoomUpdate) -> Room:
        """Update room"""
        existing_room = await self.db.rooms.find_one({"id": room_id})
        if not existing_room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        
        await self.db.rooms.update_one(
            {"id": room_id},
            {"$set": update_dict}
        )
        
        updated_room = await self.db.rooms.find_one({"id": room_id})
        logger.info(f"Room updated: {updated_room['name']}")
        return Room(**updated_room)
    
    async def delete_room(self, room_id: str) -> dict:
        """Delete room (soft delete)"""
        # Check if room has any schedules
        schedules_count = await self.db.room_schedules.count_documents({"room_id": room_id, "is_active": True})
        if schedules_count > 0:
            raise HTTPException(status_code=400, detail="Cannot delete room: it has active schedules")
        
        # Check if room has any appointments
        appointments_count = await self.db.appointments.count_documents({"room_id": room_id})
        if appointments_count > 0:
            raise HTTPException(status_code=400, detail="Cannot delete room: it has appointments")
        
        await self.db.rooms.update_one(
            {"id": room_id},
            {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
        )
        
        logger.info(f"Room deleted: {room_id}")
        return {"message": "Room deleted successfully"}
    
    async def get_rooms_with_schedule(self) -> List[RoomWithSchedule]:
        """Get all rooms with their schedules"""
        try:
            rooms = await self.db.rooms.find({"is_active": True}).sort("name", 1).to_list(1000)
            rooms_with_schedule = []
            
            for room in rooms:
                try:
                    # Get schedules for this room
                    schedules = await self.db.room_schedules.find(
                        {"room_id": room["id"], "is_active": True}
                    ).sort("day_of_week", 1).to_list(1000)
                    
                    # Исключаем поле _id от MongoDB
                    room_data = {k: v for k, v in room.items() if k != '_id'}
                    schedule_data = []
                    
                    for schedule in schedules:
                        try:
                            schedule_clean = {k: v for k, v in schedule.items() if k != '_id'}
                            schedule_data.append(RoomSchedule(**schedule_clean))
                        except Exception as e:
                            logger.error(f"Error processing schedule {schedule.get('id', 'unknown')}: {e}")
                            continue
                    
                    room_with_schedule = RoomWithSchedule(
                        **room_data,
                        schedule=schedule_data
                    )
                    rooms_with_schedule.append(room_with_schedule)
                    
                except Exception as e:
                    logger.error(f"Error processing room {room.get('id', 'unknown')}: {e}")
                    continue
            
            return rooms_with_schedule
            
        except Exception as e:
            logger.error(f"Error getting rooms with schedule: {e}")
            raise HTTPException(status_code=500, detail=f"Error getting rooms with schedule: {str(e)}")
    
    async def get_available_doctor_for_room(
        self, 
        room_id: str, 
        day_of_week: int, 
        time: str
    ) -> dict:
        """Find which doctor is available in the room at specific day and time"""
        # Find schedule entry that matches the criteria
        schedule = await self.db.room_schedules.find_one({
            "room_id": room_id,
            "day_of_week": day_of_week,
            "start_time": {"$lte": time},
            "end_time": {"$gt": time},
            "is_active": True
        })
        
        if not schedule:
            raise HTTPException(status_code=404, detail="No doctor available at this time")
        
        # Get doctor details
        doctor = await self.db.doctors.find_one({"id": schedule["doctor_id"], "is_active": True})
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")
        
        # Получаем специальность врача (поддерживаем оба формата: specialty и specialties)
        doctor_specialty = ""
        doctor_specialties = doctor.get("specialties", [])
        if isinstance(doctor_specialties, list) and len(doctor_specialties) > 0:
            doctor_specialty = doctor_specialties[0]
        else:
            doctor_specialty = doctor.get("specialty", "")
        
        return {
            "doctor_id": doctor["id"],
            "doctor_name": doctor["full_name"],
            "doctor_specialty": doctor_specialty,
            "schedule_id": schedule["id"],
            "start_time": schedule["start_time"],
            "end_time": schedule["end_time"]
        }
