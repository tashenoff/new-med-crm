from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import List, Optional, Union
from datetime import datetime
from enum import Enum
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid

# Import appointment models from models module
from models.appointment import (
    AppointmentStatus,
    Appointment,
    AppointmentCreate,
    AppointmentUpdate,
    AppointmentWithDetails
)

# Import auth models and dependencies
from models.auth import UserInDB, UserRole
from dependencies import get_current_active_user, require_role

# Router
appointments_router = APIRouter(prefix="/appointments", tags=["Appointments"])

# Dependency to get database
def get_database() -> AsyncIOMotorDatabase:
    from database import db
    return db

# Additional enums specific to appointments router
class CancelReason(str, Enum):
    patient_request = "patient_request"
    doctor_unavailable = "doctor_unavailable"
    emergency = "emergency"
    other = "other"

# Additional models specific to appointments router
class AppointmentStatusUpdate(BaseModel):
    status: AppointmentStatus
    cancel_reason: Optional[CancelReason] = None
    notes: Optional[str] = None


# Helper functions
async def check_doctor_availability(doctor_id: str, appointment_date: str, appointment_time: str, db: AsyncIOMotorDatabase):
    """Check if doctor is available on the given date and time"""
    try:
        # Parse the date to get day of week (0 = Monday, 6 = Sunday)
        date_obj = datetime.strptime(appointment_date, "%Y-%m-%d")
        day_of_week = date_obj.weekday()  # 0 = Monday, 6 = Sunday
        
        # Get doctor's schedule for this day of week
        schedule = await db.doctor_schedules.find_one({
            "doctor_id": doctor_id,
            "day_of_week": day_of_week,
            "is_active": True
        })
        
        if not schedule:
            return False, f"Врач не работает в этот день недели"
        
        # Check if appointment time is within working hours
        appointment_time_obj = datetime.strptime(appointment_time, "%H:%M").time()
        start_time_obj = datetime.strptime(schedule["start_time"], "%H:%M").time()
        end_time_obj = datetime.strptime(schedule["end_time"], "%H:%M").time()
        
        if not (start_time_obj <= appointment_time_obj <= end_time_obj):
            return False, f"Врач не работает в это время. Рабочие часы: {schedule['start_time']}-{schedule['end_time']}"
        
        return True, "Врач доступен"
        
    except Exception as e:
        return False, f"Ошибка при проверке расписания: {str(e)}"


# Appointment endpoints
@appointments_router.post("", response_model=Appointment)
async def create_appointment(
    appointment: AppointmentCreate,
    current_user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    # Check if patient exists
    patient = await db.patients.find_one({"id": appointment.patient_id})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Check if doctor exists
    doctor = await db.doctors.find_one({"id": appointment.doctor_id})
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    
    # Patients can only create appointments for themselves
    if current_user.role == UserRole.PATIENT and current_user.patient_id != appointment.patient_id:
        raise HTTPException(status_code=403, detail="You can only create appointments for yourself")
    
    # Check doctor's schedule availability
    is_available, availability_message = await check_doctor_availability(
        appointment.doctor_id, 
        appointment.appointment_date, 
        appointment.appointment_time,
        db
    )
    
    if not is_available:
        raise HTTPException(status_code=400, detail=availability_message)
    
    # Check for time conflicts
    print(f"Checking conflicts for doctor {appointment.doctor_id} on {appointment.appointment_date} at {appointment.appointment_time}")
    existing_appointment = await db.appointments.find_one({
        "doctor_id": appointment.doctor_id,
        "appointment_date": appointment.appointment_date,  # Now both are strings
        "appointment_time": appointment.appointment_time,
        "status": {"$nin": [AppointmentStatus.CANCELLED.value, AppointmentStatus.NO_SHOW.value]}
    })
    
    print(f"Found existing appointment: {existing_appointment}")
    if existing_appointment:
        print(f"Conflict detected with appointment ID: {existing_appointment['id']}")
        raise HTTPException(status_code=400, detail="Time slot already booked")
    
    appointment_dict = appointment.dict()
    appointment_obj = Appointment(**appointment_dict)
    await db.appointments.insert_one(appointment_obj.dict())
    return appointment_obj


@appointments_router.get("", response_model=List[AppointmentWithDetails])
async def get_appointments(
    date_from: Optional[str] = None, 
    date_to: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    query = {}
    
    # Role-based filtering
    if current_user.role == UserRole.PATIENT:
        query["patient_id"] = current_user.patient_id
    elif current_user.role == UserRole.DOCTOR:
        query["doctor_id"] = current_user.doctor_id
    # Admins can see all appointments
    
    if date_from or date_to:
        date_query = {}
        if date_from:
            date_query["$gte"] = date_from
        if date_to:
            date_query["$lte"] = date_to
        query["appointment_date"] = date_query
    
    # Aggregate appointments with patient and doctor details
    pipeline = [
        {"$match": query},
        {
            "$lookup": {
                "from": "patients",
                "localField": "patient_id",
                "foreignField": "id",
                "as": "patient"
            }
        },
        {
            "$lookup": {
                "from": "doctors",
                "localField": "doctor_id",
                "foreignField": "id",
                "as": "doctor"
            }
        },
        {"$unwind": "$patient"},
        {"$unwind": "$doctor"},
        {
            "$project": {
                "_id": 0,
                "id": 1,
                "patient_id": 1,
                "doctor_id": 1,
                "room_id": {"$ifNull": ["$room_id", None]},
                "appointment_date": 1,
                "appointment_time": 1,
                "end_time": {"$ifNull": ["$end_time", None]},
                "price": {"$ifNull": ["$price", None]},
                "status": 1,
                "reason": 1,
                "notes": 1,
                "patient_notes": {"$ifNull": ["$patient_notes", None]},
                "created_at": 1,
                "updated_at": 1,
                "patient_name": "$patient.full_name",
                "doctor_name": "$doctor.full_name",
                "doctor_specialty": "$doctor.specialty",
                "doctor_color": "$doctor.calendar_color"
            }
        },
        {"$sort": {"appointment_date": 1, "appointment_time": 1}}
    ]
    
    appointments = await db.appointments.aggregate(pipeline).to_list(None)  # Убираем лимит
    return [AppointmentWithDetails(**appointment) for appointment in appointments]


@appointments_router.get("/{appointment_id}", response_model=AppointmentWithDetails)
async def get_appointment(
    appointment_id: str,
    current_user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    pipeline = [
        {"$match": {"id": appointment_id}},
        {
            "$lookup": {
                "from": "patients",
                "localField": "patient_id",
                "foreignField": "id",
                "as": "patient"
            }
        },
        {
            "$lookup": {
                "from": "doctors",
                "localField": "doctor_id",
                "foreignField": "id",
                "as": "doctor"
            }
        },
        {"$unwind": "$patient"},
        {"$unwind": "$doctor"},
        {
            "$project": {
                "_id": 0,
                "id": 1,
                "patient_id": 1,
                "doctor_id": 1,
                "room_id": {"$ifNull": ["$room_id", None]},
                "appointment_date": 1,
                "appointment_time": 1,
                "end_time": {"$ifNull": ["$end_time", None]},
                "price": {"$ifNull": ["$price", None]},
                "status": 1,
                "reason": 1,
                "notes": 1,
                "patient_notes": {"$ifNull": ["$patient_notes", None]},
                "created_at": 1,
                "updated_at": 1,
                "patient_name": "$patient.full_name",
                "doctor_name": "$doctor.full_name",
                "doctor_specialty": "$doctor.specialty",
                "doctor_color": "$doctor.calendar_color"
            }
        }
    ]
    
    appointments = await db.appointments.aggregate(pipeline).to_list(1)
    if not appointments:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    appointment = appointments[0]
    
    # Check access rights
    if current_user.role == UserRole.PATIENT and current_user.patient_id != appointment["patient_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    elif current_user.role == UserRole.DOCTOR and current_user.doctor_id != appointment["doctor_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return AppointmentWithDetails(**appointment)


@appointments_router.put("/{appointment_id}", response_model=Appointment)
async def update_appointment(
    appointment_id: str,
    appointment_update: AppointmentUpdate,
    current_user: UserInDB = Depends(get_current_active_user),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    # Check if appointment exists
    existing = await db.appointments.find_one({"id": appointment_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    # Check access rights
    if current_user.role == UserRole.PATIENT:
        if current_user.patient_id != existing["patient_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        # Patients can only update limited fields
        allowed_fields = {"reason", "notes"}
        update_dict = {k: v for k, v in appointment_update.dict().items() 
                      if v is not None and k in allowed_fields}
    elif current_user.role == UserRole.DOCTOR:
        if current_user.doctor_id != existing["doctor_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        # Doctors can update more fields but not reassign to other doctors
        update_dict = {k: v for k, v in appointment_update.dict().items() if v is not None}
        if "doctor_id" in update_dict and update_dict["doctor_id"] != current_user.doctor_id:
            del update_dict["doctor_id"]  # Don't allow doctors to reassign appointments
    else:  # Admin
        update_dict = {k: v for k, v in appointment_update.dict().items() if v is not None}
    
    update_dict["updated_at"] = datetime.utcnow()
    
    # Check for time conflicts if updating time/date
    if "appointment_date" in update_dict or "appointment_time" in update_dict or "doctor_id" in update_dict:
        check_date = update_dict.get("appointment_date", existing["appointment_date"])
        check_time = update_dict.get("appointment_time", existing["appointment_time"])
        check_doctor = update_dict.get("doctor_id", existing["doctor_id"])
        
        conflict = await db.appointments.find_one({
            "id": {"$ne": appointment_id},
            "doctor_id": check_doctor,
            "appointment_date": check_date,
            "appointment_time": check_time,
            "status": {"$nin": [AppointmentStatus.CANCELLED.value, AppointmentStatus.NO_SHOW.value]}
        })
        
        if conflict:
            raise HTTPException(status_code=400, detail="Time slot already booked")
    
    result = await db.appointments.update_one(
        {"id": appointment_id}, 
        {"$set": update_dict}
    )
    
    updated_appointment = await db.appointments.find_one({"id": appointment_id})
    return Appointment(**updated_appointment)


@appointments_router.delete("/{appointment_id}")
async def delete_appointment(
    appointment_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN])),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    result = await db.appointments.delete_one({"id": appointment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"message": "Appointment deleted successfully"}