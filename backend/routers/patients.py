from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
from enum import Enum
import uuid
import logging

# Import auth dependencies and database
from .auth import get_current_active_user, require_role
from models.auth import UserInDB, UserRole
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
    # Bonus system fields
    bonus_balance: Optional[float] = 0.0  # Current bonus balance
    total_bonus_earned: Optional[float] = 0.0  # Total bonuses earned
    total_bonus_spent: Optional[float] = 0.0  # Total bonuses spent
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    # Legacy fields from import
    external_id: Optional[str] = None
    name: Optional[str] = None
    FirstName: Optional[str] = None
    Phone: Optional[str] = None
    DateOfBirth: Optional[str] = None

    class Config:
        extra = "ignore"  # Ignore extra fields not defined in the model

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
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR]))
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
    is_returning: Optional[str] = None,  # "all", "returning", "new"
    date_from: Optional[str] = None,  # Дата начала периода (YYYY-MM-DD)
    date_to: Optional[str] = None,  # Дата окончания периода (YYYY-MM-DD)
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR]))
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
    
    # Фильтрация по периоду (по дате создания пациента)
    if date_from or date_to:
        date_query = {}
        if date_from:
            try:
                date_from_dt = datetime.strptime(date_from, "%Y-%m-%d")
                date_query["$gte"] = date_from_dt
            except ValueError:
                logger.warning(f"Invalid date_from format: {date_from}")
        
        if date_to:
            try:
                # Добавляем 1 день, чтобы включить весь день date_to
                date_to_dt = datetime.strptime(date_to, "%Y-%m-%d")
                from datetime import timedelta
                date_to_dt = date_to_dt + timedelta(days=1)
                date_query["$lt"] = date_to_dt
            except ValueError:
                logger.warning(f"Invalid date_to format: {date_to}")
        
        if date_query:
            if "$or" in query:
                # Если уже есть условие поиска, комбинируем его с датой
                query = {"$and": [query, {"created_at": date_query}]}
            else:
                query["created_at"] = date_query
    
    patients = await db.patients.find(query).sort("created_at", -1).to_list(1000)
    
    # Фильтрация по статусу повторности (только завершённые записи)
    if is_returning and is_returning != "all":
        filtered_patients = []
        for patient_data in patients:
            patient_id = patient_data.get('id') or str(patient_data.get('_id'))
            
            # Запрос для подсчета ЗАВЕРШЁННЫХ записей с учетом периода
            appointments_query = {
                "patient_id": patient_id,
                "status": "completed"  # Только завершённые записи
            }
            if date_from or date_to:
                appt_date_query = {}
                if date_from:
                    try:
                        date_from_dt = datetime.strptime(date_from, "%Y-%m-%d")
                        appt_date_query["$gte"] = date_from_dt
                    except ValueError:
                        pass
                
                if date_to:
                    try:
                        from datetime import timedelta
                        date_to_dt = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
                        appt_date_query["$lt"] = date_to_dt
                    except ValueError:
                        pass
                
                if appt_date_query:
                    appointments_query["appointment_date"] = appt_date_query
            
            # Проверяем наличие ЗАВЕРШЁННЫХ записей у пациента
            completed_count = await db.appointments.count_documents(appointments_query)
            
            if is_returning == "returning" and completed_count > 0:
                filtered_patients.append(patient_data)
            elif is_returning == "new" and completed_count == 0:
                filtered_patients.append(patient_data)
        
        patients = filtered_patients

    # Convert patients with proper data mapping
    result = []
    for patient_data in patients:
        try:
            # Convert MongoDB _id to id field for old patients without id
            if 'id' not in patient_data and '_id' in patient_data:
                patient_data['id'] = str(patient_data['_id'])
            
            patient_id = patient_data.get('id')
            
            # Remove MongoDB _id field
            if '_id' in patient_data:
                del patient_data['_id']

            # Map legacy fields to proper fields
            if 'name' in patient_data and not patient_data.get('full_name'):
                patient_data['full_name'] = patient_data['name']

            # Convert datetime objects to strings for birth_date and DateOfBirth
            if 'birth_date' in patient_data and isinstance(patient_data['birth_date'], datetime):
                patient_data['birth_date'] = patient_data['birth_date'].strftime('%Y-%m-%d')
            if 'DateOfBirth' in patient_data and isinstance(patient_data['DateOfBirth'], datetime):
                patient_data['DateOfBirth'] = patient_data['DateOfBirth'].strftime('%Y-%m-%d')
            
            # Добавляем информацию о количестве ЗАВЕРШЁННЫХ записей (для определения "повторный")
            if patient_id:
                # Считаем только завершённые записи (completed)
                completed_appointments_count = await db.appointments.count_documents({
                    "patient_id": patient_id,
                    "status": "completed"
                })
                patient_data['appointments_count'] = completed_appointments_count

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
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR]))
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
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    result = await db.patients.delete_one({"id": patient_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"message": "Patient deleted successfully"}

# Statistics endpoint
class PatientStats(BaseModel):
    total_patients: int
    active_patients: int  # patients with appointments_count > 0
    total_revenue: float
    total_debt: float
    patients_by_source: dict

@patients_router.get("/stats", response_model=PatientStats)
async def get_patient_stats(
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR]))
):
    """Получить статистику по пациентам"""
    # Общее количество пациентов
    total_patients = await db.patients.count_documents({})

    # Активные пациенты (с приемами)
    active_patients = await db.patients.count_documents({"appointments_count": {"$gt": 0}})

    # Общая выручка
    revenue_pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$revenue"}}}
    ]
    revenue_result = await db.patients.aggregate(revenue_pipeline).to_list(1)
    total_revenue = revenue_result[0]["total"] if revenue_result else 0.0

    # Общий долг
    debt_pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$debt"}}}
    ]
    debt_result = await db.patients.aggregate(debt_pipeline).to_list(1)
    total_debt = debt_result[0]["total"] if debt_result else 0.0

    # Распределение по источникам
    source_pipeline = [
        {"$group": {"_id": "$source", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    source_result = await db.patients.aggregate(source_pipeline).to_list(None)
    patients_by_source = {item["_id"] or "other": item["count"] for item in source_result}

    return PatientStats(
        total_patients=total_patients,
        active_patients=active_patients,
        total_revenue=total_revenue,
        total_debt=total_debt,
        patients_by_source=patients_by_source
    )
