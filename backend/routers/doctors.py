"""
Doctors router - HTTP endpoints for doctor operations
Uses DoctorService, SalaryService, and StatisticsService for business logic
"""
from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
from datetime import datetime
from bson import ObjectId

# Import doctor models
from models.doctor import (
    Doctor,
    DoctorCreate,
    DoctorUpdate,
    DoctorSchedule,
    DoctorScheduleCreate,
    DoctorScheduleUpdate,
    DoctorWithSchedule
)

# Import auth dependencies
from models.auth import UserInDB, UserRole
from routers.auth import get_current_active_user, require_role
from database import db

# Import services
from services.doctor_service import DoctorService
from services.salary_service import SalaryService
from services.statistics_service import StatisticsService

# Router
doctors_router = APIRouter(prefix="/doctors", tags=["Doctors"])


# Dependency to get services
def get_doctor_service():
    return DoctorService(db)

def get_salary_service():
    return SalaryService(db)

def get_statistics_service():
    return StatisticsService(db)


# ============================================================================
# Statistics Endpoints (MUST be before parameterized routes!)
# ============================================================================

@doctors_router.get("/statistics")
async def get_doctor_statistics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR])),
    service: StatisticsService = Depends(get_statistics_service)
):
    """Get overall doctor statistics"""
    return await service.get_doctor_statistics(date_from, date_to)


@doctors_router.get("/statistics/individual")
async def get_individual_doctor_statistics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR])),
    service: StatisticsService = Depends(get_statistics_service)
):
    """Get individual doctor statistics with working hours and utilization"""
    return await service.get_individual_doctor_statistics(date_from, date_to)


@doctors_router.get("/salary-report")
async def get_doctor_salary_report(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])),
    service: SalaryService = Depends(get_salary_service)
):
    """Get doctor salary report with detailed commission calculations"""
    return await service.get_doctor_salary_report(date_from, date_to)


@doctors_router.get("/available/{appointment_date}", response_model=List[DoctorWithSchedule])
async def get_available_doctors(
    appointment_date: str,
    appointment_time: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_active_user),
    service: DoctorService = Depends(get_doctor_service)
):
    """Get doctors available on a specific date and optionally time"""
    return await service.get_available_doctors(appointment_date, appointment_time)


# ============================================================================
# CRUD Endpoints
# ============================================================================

@doctors_router.post("", response_model=Doctor)
async def create_doctor(
    doctor: DoctorCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])),
    service: DoctorService = Depends(get_doctor_service)
):
    """Create a new doctor"""
    return await service.create_doctor(doctor)


@doctors_router.get("", response_model=List[Doctor])
async def get_doctors(
    current_user: UserInDB = Depends(get_current_active_user),
    service: DoctorService = Depends(get_doctor_service)
):
    """Get all active doctors"""
    return await service.get_doctors()


@doctors_router.get("/{doctor_id}", response_model=Doctor)
async def get_doctor(
    doctor_id: str,
    current_user: UserInDB = Depends(get_current_active_user),
    service: DoctorService = Depends(get_doctor_service)
):
    """Get doctor by ID"""
    return await service.get_doctor_by_id(doctor_id)


@doctors_router.put("/{doctor_id}", response_model=Doctor)
async def update_doctor(
    doctor_id: str,
    doctor_update: DoctorUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])),
    service: DoctorService = Depends(get_doctor_service)
):
    """Update doctor"""
    return await service.update_doctor(doctor_id, doctor_update)


@doctors_router.delete("/{doctor_id}")
async def delete_doctor(
    doctor_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])),
    service: DoctorService = Depends(get_doctor_service)
):
    """Soft delete doctor (mark as inactive)"""
    return await service.delete_doctor(doctor_id)


# ============================================================================
# Doctor Schedule Endpoints
# ============================================================================

@doctors_router.post("/{doctor_id}/schedule", response_model=DoctorSchedule)
async def create_doctor_schedule(
    doctor_id: str,
    schedule: DoctorScheduleCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """Create doctor's working schedule"""
    # Check if doctor exists - check both _id (for MongoDB ObjectId) and id field
    # Try multiple ways to find the doctor
    search_queries = [
        {"id": doctor_id},
        {"_id": doctor_id}
    ]
    
    # If doctor_id looks like a valid ObjectId (24 hex chars), also try ObjectId
    if len(doctor_id) == 24:
        try:
            search_queries.append({"_id": ObjectId(doctor_id)})
        except:
            pass
    
    doctor = await db.doctors.find_one({
        "$or": search_queries,
        "is_active": True
    })
    
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    
    # Validate day_of_week (0-6)
    if schedule.day_of_week < 0 or schedule.day_of_week > 6:
        raise HTTPException(status_code=400, detail="Invalid day_of_week. Must be 0-6 (Monday-Sunday)")
    
    # Validate time format
    try:
        datetime.strptime(schedule.start_time, "%H:%M")
        datetime.strptime(schedule.end_time, "%H:%M")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM")
    
    # Check for existing schedule for this day
    existing = await db.doctor_schedules.find_one({
        "doctor_id": doctor_id,
        "day_of_week": schedule.day_of_week,
        "is_active": True
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Schedule already exists for this day")
    
    # Create schedule with doctor_id from URL parameter (ignore the one in request body)
    schedule_obj = DoctorSchedule(
        doctor_id=doctor_id,  # Use doctor_id from URL
        day_of_week=schedule.day_of_week,
        start_time=schedule.start_time,
        end_time=schedule.end_time
    )
    await db.doctor_schedules.insert_one(schedule_obj.dict())
    return schedule_obj


@doctors_router.get("/{doctor_id}/schedule", response_model=List[DoctorSchedule])
async def get_doctor_schedule(
    doctor_id: str,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get doctor's working schedule"""
    schedules = await db.doctor_schedules.find({
        "doctor_id": doctor_id,
        "is_active": True
    }).sort("day_of_week", 1).to_list(7)  # Max 7 days
    
    return [DoctorSchedule(**schedule) for schedule in schedules]


@doctors_router.put("/{doctor_id}/schedule/{schedule_id}", response_model=DoctorSchedule)
async def update_doctor_schedule(
    doctor_id: str,
    schedule_id: str,
    schedule_update: DoctorScheduleUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """Update doctor's working schedule"""
    update_dict = {k: v for k, v in schedule_update.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.utcnow()
    
    # Validate time format if provided
    if "start_time" in update_dict:
        try:
            datetime.strptime(update_dict["start_time"], "%H:%M")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_time format. Use HH:MM")
    
    if "end_time" in update_dict:
        try:
            datetime.strptime(update_dict["end_time"], "%H:%M")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_time format. Use HH:MM")
    
    result = await db.doctor_schedules.update_one(
        {"id": schedule_id, "doctor_id": doctor_id}, 
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    updated_schedule = await db.doctor_schedules.find_one({"id": schedule_id})
    return DoctorSchedule(**updated_schedule)


@doctors_router.delete("/{doctor_id}/schedule/{schedule_id}")
async def delete_doctor_schedule(
    doctor_id: str,
    schedule_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """Delete doctor's working schedule"""
    result = await db.doctor_schedules.update_one(
        {"id": schedule_id, "doctor_id": doctor_id}, 
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    return {"message": "Schedule deleted successfully"}
