from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
from enum import Enum
import uuid
import logging

# Import auth dependencies and database
from .auth import get_current_active_user, require_role, UserInDB, UserRole
from database import db

# Router
patients_router = APIRouter(prefix="/patients", tags=["Patients"])

# Set up logging
logger = logging.getLogger(__name__)

# Enums
class PatientSource(str, Enum):
    WEBSITE = "website"
    PHONE = "phone"
    REFERRAL = "referral"
    WALK_IN = "walk_in"
    SOCIAL_MEDIA = "social_media"
    CRM_CONVERSION = "crm_conversion"
    OTHER = "other"

# Pydantic models
class Patient(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    full_name: str
    phone: str
    iin: Optional[str] = None  # ИИН (Individual Identification Number)
    birth_date: Optional[str] = None  # Date of birth (YYYY-MM-DD format)
    gender: Optional[str] = None  # "male", "female", "other"
    source: PatientSource = PatientSource.OTHER
    referrer: Optional[str] = None  # Who referred this patient
    notes: Optional[str] = None
    # Additional name fields (for CRM integration)
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    # CRM integration
    crm_client_id: Optional[str] = None  # Link to CRM client
    # Financial information
    revenue: Optional[float] = 0.0  # Total revenue from this patient
    debt: Optional[float] = 0.0  # Patient's debt
    overpayment: Optional[float] = 0.0  # Patient's overpayment
    appointments_count: Optional[int] = 0  # Total completed appointments
    records_count: Optional[int] = 0  # Total records count
    user_id: Optional[str] = None  # Link to User if patient has account
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class PatientCreate(BaseModel):
    full_name: str
    phone: str
    iin: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    source: PatientSource = PatientSource.OTHER
    referrer: Optional[str] = None
    notes: Optional[str] = None
    user_id: Optional[str] = None

class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    iin: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    source: Optional[PatientSource] = None
    referrer: Optional[str] = None
    notes: Optional[str] = None
    revenue: Optional[float] = None
    debt: Optional[float] = None
    overpayment: Optional[float] = None
    appointments_count: Optional[int] = None
    records_count: Optional[int] = None

# Patient API routes
@patients_router.post("", response_model=Patient)
async def create_patient(
    patient: PatientCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    patient_dict = patient.dict()
    patient_obj = Patient(**patient_dict)
    
    # Insert patient first
    await db.patients.insert_one(patient_obj.dict())
    
    # TODO: Automatically create an empty medical record for the new patient
    # This will be implemented when MedicalRecord model is defined
    # try:
    #     medical_record = MedicalRecord(patient_id=patient_obj.id)
    #     await db.medical_records.insert_one(medical_record.dict())
    #     print(f"✅ Auto-created medical record for patient {patient_obj.id}")
    # except Exception as e:
    #     print(f"⚠️ Failed to auto-create medical record for patient {patient_obj.id}: {e}")
    #     # Don't fail patient creation if medical record creation fails
    
    return patient_obj

@patients_router.get("", response_model=List[Patient])
async def get_patients(
    search: Optional[str] = None,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    query = {}
    if search:
        query = {
            "$or": [
                {"full_name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}},
                {"iin": {"$regex": search, "$options": "i"}}
            ]
        }
    
    patients = await db.patients.find(query).sort("created_at", -1).to_list(1000)
    
    # Convert patients with error handling
    result = []
    for patient_data in patients:
        try:
            # Remove MongoDB _id field
            if '_id' in patient_data:
                del patient_data['_id']
            result.append(Patient(**patient_data))
        except Exception as e:
            logger.error(f"Error converting patient {patient_data.get('id', 'unknown')}: {str(e)}")
            logger.error(f"Patient data keys: {list(patient_data.keys())}")
            logger.error(f"Patient data: {patient_data}")
            continue
    
    return result

@patients_router.get("/{patient_id}", response_model=Patient)
async def get_patient(
    patient_id: str,
    current_user: UserInDB = Depends(get_current_active_user)
):
    # Patients can only see their own data, doctors and admins can see any
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    patient = await db.patients.find_one({"id": patient_id})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return Patient(**patient)

@patients_router.put("/{patient_id}", response_model=Patient)
async def update_patient(
    patient_id: str,
    patient_update: PatientUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    update_dict = {k: v for k, v in patient_update.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.utcnow()
    
    result = await db.patients.update_one(
        {"id": patient_id}, 
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    updated_patient = await db.patients.find_one({"id": patient_id})
    return Patient(**updated_patient)

@patients_router.delete("/{patient_id}")
async def delete_patient(
    patient_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    result = await db.patients.delete_one({"id": patient_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"message": "Patient deleted successfully"}