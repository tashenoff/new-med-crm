from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Union
import uuid
from datetime import datetime, timedelta
from enum import Enum
from passlib.context import CryptContext
from jose import JWTError, jwt
import shutil


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
SECRET_KEY = os.environ.get("SECRET_KEY", "fallback-secret-key")
ALGORITHM = os.environ.get("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Create uploads directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Mount static files for serving uploaded documents
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Enums
class UserRole(str, Enum):
    ADMIN = "admin"
    DOCTOR = "doctor"
    PATIENT = "patient"

class AppointmentStatus(str, Enum):
    UNCONFIRMED = "unconfirmed"       # Не подтверждено - желтый
    CONFIRMED = "confirmed"           # Подтверждено - зеленый
    ARRIVED = "arrived"              # Пациент пришел - синий
    IN_PROGRESS = "in_progress"      # На приеме - оранжевый
    COMPLETED = "completed"          # Завершен - темно-зеленый
    CANCELLED = "cancelled"          # Отменено - красный
    NO_SHOW = "no_show"             # Не явился - серый

class PatientSource(str, Enum):
    WEBSITE = "website"
    PHONE = "phone"
    REFERRAL = "referral"
    WALK_IN = "walk_in"
    SOCIAL_MEDIA = "social_media"
    OTHER = "other"

class EntryType(str, Enum):
    VISIT = "visit"          # Запись о приеме
    DIAGNOSIS = "diagnosis"  # Диагноз
    TREATMENT = "treatment"  # Лечение
    MEDICATION = "medication" # Назначение лекарств
    ALLERGY = "allergy"      # Аллергия
    NOTE = "note"           # Заметка врача

class SeverityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

# Auth Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    # Optional reference fields
    doctor_id: Optional[str] = None  # If role is doctor
    patient_id: Optional[str] = None  # If role is patient

class UserInDB(User):
    hashed_password: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.PATIENT

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class TokenData(BaseModel):
    email: Optional[str] = None

# Medical Records Models
class MedicalRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    blood_type: Optional[str] = None
    height: Optional[float] = None  # в см
    weight: Optional[float] = None  # в кг
    emergency_contact: Optional[str] = None
    emergency_phone: Optional[str] = None
    insurance_number: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class MedicalEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    doctor_id: str
    appointment_id: Optional[str] = None  # Связь с записью на прием
    entry_type: EntryType
    title: str
    description: str
    severity: Optional[SeverityLevel] = None
    date: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True  # Для диагнозов/аллергий - активно ли сейчас
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Allergy(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    allergen: str
    reaction: str
    severity: SeverityLevel
    discovered_date: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Medication(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    doctor_id: str
    medication_name: str
    dosage: str
    frequency: str
    start_date: datetime = Field(default_factory=datetime.utcnow)
    end_date: Optional[datetime] = None
    instructions: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Diagnosis(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    doctor_id: str
    diagnosis_code: Optional[str] = None  # МКБ-10 код
    diagnosis_name: str
    description: Optional[str] = None
    diagnosed_date: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# Create/Update models
class MedicalRecordCreate(BaseModel):
    patient_id: str
    blood_type: Optional[str] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    emergency_contact: Optional[str] = None
    emergency_phone: Optional[str] = None
    insurance_number: Optional[str] = None

class MedicalEntryCreate(BaseModel):
    patient_id: str
    appointment_id: Optional[str] = None
    entry_type: EntryType
    title: str
    description: str
    severity: Optional[SeverityLevel] = None

class AllergyCreate(BaseModel):
    patient_id: str
    allergen: str
    reaction: str
    severity: SeverityLevel
    discovered_date: Optional[datetime] = None

class MedicationCreate(BaseModel):
    patient_id: str
    medication_name: str
    dosage: str
    frequency: str
    end_date: Optional[datetime] = None
    instructions: Optional[str] = None

class DiagnosisCreate(BaseModel):
    patient_id: str
    diagnosis_code: Optional[str] = None
    diagnosis_name: str
    description: Optional[str] = None

# Response models with doctor/patient details
class MedicalEntryWithDetails(BaseModel):
    id: str
    patient_id: str
    doctor_id: str
    appointment_id: Optional[str]
    entry_type: EntryType
    title: str
    description: str
    severity: Optional[SeverityLevel]
    date: datetime
    is_active: bool
    created_at: datetime
    updated_at: datetime
    doctor_name: str
    patient_name: str

class MedicationWithDetails(BaseModel):
    id: str
    patient_id: str
    doctor_id: str
    medication_name: str
    dosage: str
    frequency: str
    start_date: datetime
    end_date: Optional[datetime]
    instructions: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    doctor_name: str
    patient_name: str

class DiagnosisWithDetails(BaseModel):
    id: str
    patient_id: str
    doctor_id: str
    diagnosis_code: Optional[str]
    diagnosis_name: str
    description: Optional[str]
    diagnosed_date: datetime
    is_active: bool
    created_at: datetime
    updated_at: datetime
    doctor_name: str
    patient_name: str

# Existing Models (updated to link with users)
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
    # Financial information
    revenue: Optional[float] = 0.0  # Total revenue from this patient
    debt: Optional[float] = 0.0  # Patient's debt
    overpayment: Optional[float] = 0.0  # Patient's overpayment
    appointments_count: Optional[int] = 0  # Total completed appointments
    records_count: Optional[int] = 0  # Total records count
    user_id: Optional[str] = None  # Link to User if patient has account
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class PatientMedicalSummary(BaseModel):
    patient: Patient
    medical_record: Optional[MedicalRecord]
    active_diagnoses: List[DiagnosisWithDetails]
    active_medications: List[MedicationWithDetails]
    allergies: List[Allergy]
    recent_entries: List[MedicalEntryWithDetails]

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

class Doctor(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    full_name: str
    specialty: str
    phone: Optional[str] = None
    calendar_color: str = "#3B82F6"  # Default blue color
    is_active: bool = True
    user_id: Optional[str] = None  # Link to User if doctor has account
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class DoctorCreate(BaseModel):
    full_name: str
    specialty: str
    phone: Optional[str] = None
    calendar_color: str = "#3B82F6"
    user_id: Optional[str] = None

class DoctorUpdate(BaseModel):
    full_name: Optional[str] = None
    specialty: Optional[str] = None
    phone: Optional[str] = None
    calendar_color: Optional[str] = None
    is_active: Optional[bool] = None

class Appointment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    doctor_id: str
    appointment_date: str  # Store as string in ISO format (YYYY-MM-DD)
    appointment_time: str  # Format: "HH:MM"
    end_time: Optional[str] = None  # Format: "HH:MM"
    chair_number: Optional[str] = None  # Chair/Station number
    price: Optional[float] = None  # Price of the appointment
    status: AppointmentStatus = AppointmentStatus.UNCONFIRMED
    reason: Optional[str] = None
    notes: Optional[str] = None
    patient_notes: Optional[str] = None  # Notes about the patient (separate from appointment notes)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class AppointmentCreate(BaseModel):
    patient_id: str
    doctor_id: str
    appointment_date: str  # Accept as string in ISO format (YYYY-MM-DD)
    appointment_time: str
    end_time: Optional[str] = None
    chair_number: Optional[str] = None
    price: Optional[float] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    patient_notes: Optional[str] = None

class AppointmentUpdate(BaseModel):
    patient_id: Optional[str] = None
    doctor_id: Optional[str] = None
    appointment_date: Optional[str] = None  # Accept as string in ISO format (YYYY-MM-DD)
    appointment_time: Optional[str] = None
    end_time: Optional[str] = None
    chair_number: Optional[str] = None
    price: Optional[float] = None
    status: Optional[AppointmentStatus] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    patient_notes: Optional[str] = None

class AppointmentWithDetails(BaseModel):
    id: str
    patient_id: str
    doctor_id: str
    appointment_date: str  # Return as string in ISO format (YYYY-MM-DD)
    appointment_time: str
    end_time: Optional[str]
    chair_number: Optional[str]
    price: Optional[float]
    status: AppointmentStatus
    reason: Optional[str]
    notes: Optional[str]
    patient_notes: Optional[str]
    patient_name: str
    doctor_name: str
    doctor_specialty: str
    doctor_color: str
    created_at: datetime
    updated_at: datetime

# Document models
class Document(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    filename: str
    original_filename: str
    file_path: str
    file_size: int
    file_type: str
    uploaded_by: str  # User ID who uploaded the file
    uploaded_by_name: str  # Name of the user who uploaded
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class DocumentCreate(BaseModel):
    patient_id: str
    description: Optional[str] = None

class DocumentUpdate(BaseModel):
    description: Optional[str] = None

# Treatment Plan models
class Service(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str  # "Стоматолог", "Гинекология", "Ортодонт" etc.
    price: float
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ServiceCreate(BaseModel):
    name: str
    category: str
    price: float
    description: Optional[str] = None

class TreatmentPlan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    title: str
    description: Optional[str] = None
    services: List[dict] = []  # List of services with details like tooth number, service name, price, quantity, discount
    total_cost: Optional[float] = 0.0
    status: str = "draft"  # draft, approved, completed, cancelled, in_progress
    created_by: str  # User ID who created the plan
    created_by_name: str  # Name of the user who created
    notes: Optional[str] = None
    # Payment tracking
    payment_status: str = "unpaid"  # unpaid, partially_paid, paid, overdue
    paid_amount: Optional[float] = 0.0
    payment_date: Optional[datetime] = None
    # Execution tracking  
    execution_status: str = "pending"  # pending, in_progress, completed, cancelled, no_show
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    appointment_ids: List[str] = []  # Related appointment IDs
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class TreatmentPlanCreate(BaseModel):
    patient_id: Optional[str] = None  # Made optional since it's provided in URL path
    title: str
    description: Optional[str] = None
    services: List[dict] = []
    total_cost: Optional[float] = 0.0
    status: str = "draft"
    notes: Optional[str] = None
    # Payment tracking
    payment_status: str = "unpaid"
    paid_amount: Optional[float] = 0.0
    payment_date: Optional[datetime] = None
    # Execution tracking
    execution_status: str = "pending"
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    appointment_ids: List[str] = []

class TreatmentPlanUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    services: Optional[List[dict]] = None
    total_cost: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    # Payment tracking
    payment_status: Optional[str] = None
    paid_amount: Optional[float] = None
    payment_date: Optional[datetime] = None
    # Execution tracking
    execution_status: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    appointment_ids: Optional[List[str]] = None

# Auth utility functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_user_by_email(email: str):
    user = await db.users.find_one({"email": email})
    if user:
        return UserInDB(**user)
    return None

async def authenticate_user(email: str, password: str):
    user = await get_user_by_email(email)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    
    user = await get_user_by_email(email=token_data.email)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: UserInDB = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

def require_role(allowed_roles: List[UserRole]):
    def role_checker(current_user: UserInDB = Depends(get_current_active_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return current_user
    return role_checker

# Auth endpoints
@api_router.post("/auth/register", response_model=Token)
async def register(user: UserCreate):
    # Check if user already exists
    existing_user = await get_user_by_email(user.email)
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )
    
    # Hash password
    hashed_password = get_password_hash(user.password)
    
    # Create user
    user_dict = user.dict()
    user_dict.pop("password")
    user_dict["hashed_password"] = hashed_password
    user_obj = UserInDB(**user_dict)
    
    await db.users.insert_one(user_obj.dict())
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_obj.email}, expires_delta=access_token_expires
    )
    
    # Convert to public user model
    public_user = User(**{k: v for k, v in user_obj.dict().items() if k != "hashed_password"})
    
    return {"access_token": access_token, "token_type": "bearer", "user": public_user}

@api_router.post("/auth/login", response_model=Token)
async def login(form_data: UserLogin):
    user = await authenticate_user(form_data.email, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    # Convert to public user model
    public_user = User(**{k: v for k, v in user.dict().items() if k != "hashed_password"})
    
    return {"access_token": access_token, "token_type": "bearer", "user": public_user}

@api_router.get("/auth/me", response_model=User)
async def read_users_me(current_user: UserInDB = Depends(get_current_active_user)):
    # Convert to public user model
    return User(**{k: v for k, v in current_user.dict().items() if k != "hashed_password"})

# Root endpoint
@api_router.get("/")
async def root():
    return {"message": "Clinic Management System API with Authentication"}

# Protected Patient endpoints
@api_router.post("/patients", response_model=Patient)
async def create_patient(
    patient: PatientCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    patient_dict = patient.dict()
    patient_obj = Patient(**patient_dict)
    
    # Insert patient first
    await db.patients.insert_one(patient_obj.dict())
    
    # Automatically create an empty medical record for the new patient
    try:
        medical_record = MedicalRecord(patient_id=patient_obj.id)
        await db.medical_records.insert_one(medical_record.dict())
        print(f"✅ Auto-created medical record for patient {patient_obj.id}")
    except Exception as e:
        print(f"⚠️ Failed to auto-create medical record for patient {patient_obj.id}: {e}")
        # Don't fail patient creation if medical record creation fails
    
    return patient_obj

@api_router.get("/patients", response_model=List[Patient])
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
    return [Patient(**patient) for patient in patients]

@api_router.get("/patients/{patient_id}", response_model=Patient)
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

@api_router.put("/patients/{patient_id}", response_model=Patient)
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

@api_router.delete("/patients/{patient_id}")
async def delete_patient(
    patient_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    result = await db.patients.delete_one({"id": patient_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"message": "Patient deleted successfully"}

# Protected Doctor endpoints
@api_router.post("/doctors", response_model=Doctor)
async def create_doctor(
    doctor: DoctorCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    doctor_dict = doctor.dict()
    doctor_obj = Doctor(**doctor_dict)
    await db.doctors.insert_one(doctor_obj.dict())
    return doctor_obj

@api_router.get("/doctors", response_model=List[Doctor])
async def get_doctors(current_user: UserInDB = Depends(get_current_active_user)):
    doctors = await db.doctors.find({"is_active": True}).sort("full_name", 1).to_list(1000)
    return [Doctor(**doctor) for doctor in doctors]

@api_router.get("/doctors/{doctor_id}", response_model=Doctor)
async def get_doctor(
    doctor_id: str,
    current_user: UserInDB = Depends(get_current_active_user)
):
    doctor = await db.doctors.find_one({"id": doctor_id})
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    return Doctor(**doctor)

@api_router.put("/doctors/{doctor_id}", response_model=Doctor)
async def update_doctor(
    doctor_id: str,
    doctor_update: DoctorUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    update_dict = {k: v for k, v in doctor_update.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.utcnow()
    
    result = await db.doctors.update_one(
        {"id": doctor_id}, 
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Doctor not found")
    
    updated_doctor = await db.doctors.find_one({"id": doctor_id})
    return Doctor(**updated_doctor)

@api_router.delete("/doctors/{doctor_id}")
async def delete_doctor(
    doctor_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    # Soft delete - mark as inactive
    result = await db.doctors.update_one(
        {"id": doctor_id}, 
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Doctor not found")
    return {"message": "Doctor deactivated successfully"}

# Protected Appointment endpoints
@api_router.post("/appointments", response_model=Appointment)
async def create_appointment(
    appointment: AppointmentCreate,
    current_user: UserInDB = Depends(get_current_active_user)
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

@api_router.get("/appointments", response_model=List[AppointmentWithDetails])
async def get_appointments(
    date_from: Optional[str] = None, 
    date_to: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_active_user)
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
                "appointment_date": 1,
                "appointment_time": 1,
                "end_time": {"$ifNull": ["$end_time", None]},
                "chair_number": {"$ifNull": ["$chair_number", None]},
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

@api_router.get("/appointments/{appointment_id}", response_model=AppointmentWithDetails)
async def get_appointment(
    appointment_id: str,
    current_user: UserInDB = Depends(get_current_active_user)
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
                "appointment_date": 1,
                "appointment_time": 1,
                "end_time": {"$ifNull": ["$end_time", None]},
                "chair_number": {"$ifNull": ["$chair_number", None]},
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

@api_router.put("/appointments/{appointment_id}", response_model=Appointment)
async def update_appointment(
    appointment_id: str,
    appointment_update: AppointmentUpdate,
    current_user: UserInDB = Depends(get_current_active_user)
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

@api_router.delete("/appointments/{appointment_id}")
async def delete_appointment(
    appointment_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    result = await db.appointments.delete_one({"id": appointment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"message": "Appointment deleted successfully"}

# Medical Records endpoints
@api_router.post("/medical-records", response_model=MedicalRecord)
async def create_medical_record(
    record: MedicalRecordCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    # Check if patient exists
    patient = await db.patients.find_one({"id": record.patient_id})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Check if medical record already exists
    existing = await db.medical_records.find_one({"patient_id": record.patient_id})
    if existing:
        raise HTTPException(status_code=400, detail="Medical record already exists for this patient")
    
    record_dict = record.dict()
    record_obj = MedicalRecord(**record_dict)
    await db.medical_records.insert_one(record_obj.dict())
    return record_obj

@api_router.get("/medical-records/{patient_id}", response_model=MedicalRecord)
async def get_medical_record(
    patient_id: str,
    current_user: UserInDB = Depends(get_current_active_user)
):
    # Check access rights
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    record = await db.medical_records.find_one({"patient_id": patient_id})
    if not record:
        raise HTTPException(status_code=404, detail="Medical record not found")
    return MedicalRecord(**record)

@api_router.put("/medical-records/{patient_id}", response_model=MedicalRecord)
async def update_medical_record(
    patient_id: str,
    record_update: MedicalRecordCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    update_dict = {k: v for k, v in record_update.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.utcnow()
    
    result = await db.medical_records.update_one(
        {"patient_id": patient_id}, 
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Medical record not found")
    
    updated_record = await db.medical_records.find_one({"patient_id": patient_id})
    return MedicalRecord(**updated_record)

# Medical Entries endpoints
@api_router.post("/medical-entries", response_model=MedicalEntry)
async def create_medical_entry(
    entry: MedicalEntryCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    entry_dict = entry.dict()
    # Set doctor_id based on current user
    if current_user.role == UserRole.DOCTOR and current_user.doctor_id:
        entry_dict["doctor_id"] = current_user.doctor_id
    elif current_user.role == UserRole.ADMIN:
        # For admin, try to find a doctor or use a default
        doctors = await db.doctors.find({"is_active": True}).limit(1).to_list(1)
        if doctors:
            entry_dict["doctor_id"] = doctors[0]["id"]
        else:
            raise HTTPException(status_code=400, detail="No active doctors found")
    else:
        raise HTTPException(status_code=400, detail="User not associated with any doctor")
    
    entry_obj = MedicalEntry(**entry_dict)
    await db.medical_entries.insert_one(entry_obj.dict())
    return entry_obj

@api_router.get("/medical-entries/{patient_id}", response_model=List[MedicalEntryWithDetails])
async def get_patient_medical_entries(
    patient_id: str,
    current_user: UserInDB = Depends(get_current_active_user)
):
    # Check access rights
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Aggregate entries with doctor and patient details
    pipeline = [
        {"$match": {"patient_id": patient_id}},
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
                "appointment_id": 1,
                "entry_type": 1,
                "title": 1,
                "description": 1,
                "severity": 1,
                "date": 1,
                "is_active": 1,
                "created_at": 1,
                "updated_at": 1,
                "doctor_name": "$doctor.full_name",
                "patient_name": "$patient.full_name"
            }
        },
        {"$sort": {"date": -1}}
    ]
    
    entries = await db.medical_entries.aggregate(pipeline).to_list(1000)
    return [MedicalEntryWithDetails(**entry) for entry in entries]

# Diagnoses endpoints
@api_router.post("/diagnoses", response_model=Diagnosis)
async def create_diagnosis(
    diagnosis: DiagnosisCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    diagnosis_dict = diagnosis.dict()
    # Set doctor_id based on current user
    if current_user.role == UserRole.DOCTOR and current_user.doctor_id:
        diagnosis_dict["doctor_id"] = current_user.doctor_id
    elif current_user.role == UserRole.ADMIN:
        # For admin, try to find a doctor or use a default
        doctors = await db.doctors.find({"is_active": True}).limit(1).to_list(1)
        if doctors:
            diagnosis_dict["doctor_id"] = doctors[0]["id"]
        else:
            raise HTTPException(status_code=400, detail="No active doctors found")
    else:
        raise HTTPException(status_code=400, detail="User not associated with any doctor")
    
    diagnosis_obj = Diagnosis(**diagnosis_dict)
    await db.diagnoses.insert_one(diagnosis_obj.dict())
    return diagnosis_obj

@api_router.get("/diagnoses/{patient_id}", response_model=List[DiagnosisWithDetails])
async def get_patient_diagnoses(
    patient_id: str,
    active_only: bool = True,
    current_user: UserInDB = Depends(get_current_active_user)
):
    # Check access rights
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = {"patient_id": patient_id}
    if active_only:
        query["is_active"] = True
    
    # Aggregate diagnoses with doctor and patient details
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
                "diagnosis_code": 1,
                "diagnosis_name": 1,
                "description": 1,
                "diagnosed_date": 1,
                "is_active": 1,
                "created_at": 1,
                "updated_at": 1,
                "doctor_name": "$doctor.full_name",
                "patient_name": "$patient.full_name"
            }
        },
        {"$sort": {"diagnosed_date": -1}}
    ]
    
    diagnoses = await db.diagnoses.aggregate(pipeline).to_list(1000)
    return [DiagnosisWithDetails(**diagnosis) for diagnosis in diagnoses]

# Medications endpoints
@api_router.post("/medications", response_model=Medication)
async def create_medication(
    medication: MedicationCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    medication_dict = medication.dict()
    # Set doctor_id based on current user
    if current_user.role == UserRole.DOCTOR and current_user.doctor_id:
        medication_dict["doctor_id"] = current_user.doctor_id
    elif current_user.role == UserRole.ADMIN:
        # For admin, try to find a doctor or use a default
        doctors = await db.doctors.find({"is_active": True}).limit(1).to_list(1)
        if doctors:
            medication_dict["doctor_id"] = doctors[0]["id"]
        else:
            raise HTTPException(status_code=400, detail="No active doctors found")
    else:
        raise HTTPException(status_code=400, detail="User not associated with any doctor")
    
    medication_obj = Medication(**medication_dict)
    await db.medications.insert_one(medication_obj.dict())
    return medication_obj

@api_router.get("/medications/{patient_id}", response_model=List[MedicationWithDetails])
async def get_patient_medications(
    patient_id: str,
    active_only: bool = True,
    current_user: UserInDB = Depends(get_current_active_user)
):
    # Check access rights
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = {"patient_id": patient_id}
    if active_only:
        query["is_active"] = True
    
    # Aggregate medications with doctor and patient details
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
                "medication_name": 1,
                "dosage": 1,
                "frequency": 1,
                "start_date": 1,
                "end_date": 1,
                "instructions": 1,
                "is_active": 1,
                "created_at": 1,
                "updated_at": 1,
                "doctor_name": "$doctor.full_name",
                "patient_name": "$patient.full_name"
            }
        },
        {"$sort": {"start_date": -1}}
    ]
    
    medications = await db.medications.aggregate(pipeline).to_list(1000)
    return [MedicationWithDetails(**medication) for medication in medications]

# Allergies endpoints
@api_router.post("/allergies", response_model=Allergy)
async def create_allergy(
    allergy: AllergyCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    allergy_obj = Allergy(**allergy.dict())
    await db.allergies.insert_one(allergy_obj.dict())
    return allergy_obj

@api_router.get("/allergies/{patient_id}", response_model=List[Allergy])
async def get_patient_allergies(
    patient_id: str,
    active_only: bool = True,
    current_user: UserInDB = Depends(get_current_active_user)
):
    # Check access rights
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = {"patient_id": patient_id}
    if active_only:
        query["is_active"] = True
    
    allergies = await db.allergies.find(query).sort("created_at", -1).to_list(1000)
    return [Allergy(**allergy) for allergy in allergies]

# Patient Medical Summary endpoint
@api_router.get("/patients/{patient_id}/medical-summary", response_model=PatientMedicalSummary)
async def get_patient_medical_summary(
    patient_id: str,
    current_user: UserInDB = Depends(get_current_active_user)
):
    # Check access rights
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get patient
    patient = await db.patients.find_one({"id": patient_id})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Get medical record
    medical_record = await db.medical_records.find_one({"patient_id": patient_id})
    
    # Get active diagnoses (last 5)
    diagnoses_pipeline = [
        {"$match": {"patient_id": patient_id, "is_active": True}},
        {
            "$lookup": {
                "from": "doctors",
                "localField": "doctor_id",
                "foreignField": "id",
                "as": "doctor"
            }
        },
        {"$unwind": "$doctor"},
        {
            "$project": {
                "_id": 0,
                "id": 1,
                "patient_id": 1,
                "doctor_id": 1,
                "diagnosis_code": 1,
                "diagnosis_name": 1,
                "description": 1,
                "diagnosed_date": 1,
                "is_active": 1,
                "created_at": 1,
                "updated_at": 1,
                "doctor_name": "$doctor.full_name",
                "patient_name": patient["full_name"]
            }
        },
        {"$sort": {"diagnosed_date": -1}},
        {"$limit": 5}
    ]
    
    diagnoses = await db.diagnoses.aggregate(diagnoses_pipeline).to_list(5)
    
    # Get active medications (last 5)
    medications_pipeline = [
        {"$match": {"patient_id": patient_id, "is_active": True}},
        {
            "$lookup": {
                "from": "doctors",
                "localField": "doctor_id",
                "foreignField": "id",
                "as": "doctor"
            }
        },
        {"$unwind": "$doctor"},
        {
            "$project": {
                "_id": 0,
                "id": 1,
                "patient_id": 1,
                "doctor_id": 1,
                "medication_name": 1,
                "dosage": 1,
                "frequency": 1,
                "start_date": 1,
                "end_date": 1,
                "instructions": 1,
                "is_active": 1,
                "created_at": 1,
                "updated_at": 1,
                "doctor_name": "$doctor.full_name",
                "patient_name": patient["full_name"]
            }
        },
        {"$sort": {"start_date": -1}},
        {"$limit": 5}
    ]
    
    medications = await db.medications.aggregate(medications_pipeline).to_list(5)
    
    # Get allergies
    allergies = await db.allergies.find({"patient_id": patient_id, "is_active": True}).to_list(1000)
    
    # Get recent medical entries (last 10)
    entries_pipeline = [
        {"$match": {"patient_id": patient_id}},
        {
            "$lookup": {
                "from": "doctors",
                "localField": "doctor_id",
                "foreignField": "id",
                "as": "doctor"
            }
        },
        {"$unwind": "$doctor"},
        {
            "$project": {
                "_id": 0,
                "id": 1,
                "patient_id": 1,
                "doctor_id": 1,
                "appointment_id": 1,
                "entry_type": 1,
                "title": 1,
                "description": 1,
                "severity": 1,
                "date": 1,
                "is_active": 1,
                "created_at": 1,
                "updated_at": 1,
                "doctor_name": "$doctor.full_name",
                "patient_name": patient["full_name"]
            }
        },
        {"$sort": {"date": -1}},
        {"$limit": 10}
    ]
    
    entries = await db.medical_entries.aggregate(entries_pipeline).to_list(10)
    
    return PatientMedicalSummary(
        patient=Patient(**patient),
        medical_record=MedicalRecord(**medical_record) if medical_record else None,
        active_diagnoses=[DiagnosisWithDetails(**d) for d in diagnoses],
        active_medications=[MedicationWithDetails(**m) for m in medications],
        allergies=[Allergy(**a) for a in allergies],
        recent_entries=[MedicalEntryWithDetails(**e) for e in entries]
    )

# Document endpoints
@api_router.post("/patients/{patient_id}/documents", response_model=Document)
async def upload_document(
    patient_id: str,
    file: UploadFile = File(...),
    description: Optional[str] = Form(None),
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Upload a document for a patient"""
    # Check if patient exists
    patient = await db.patients.find_one({"id": patient_id})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Generate unique filename
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = UPLOAD_DIR / unique_filename
    
    try:
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Create document record
        document = Document(
            patient_id=patient_id,
            filename=unique_filename,
            original_filename=file.filename,
            file_path=str(file_path),
            file_size=file_path.stat().st_size,
            file_type=file.content_type or "application/octet-stream",
            uploaded_by=current_user.id,
            uploaded_by_name=current_user.full_name,
            description=description
        )
        
        # Insert to database
        await db.documents.insert_one(document.dict())
        
        logger.info(f"Document uploaded: {file.filename} for patient {patient_id}")
        return document
        
    except Exception as e:
        # Clean up file if database insert fails
        if file_path.exists():
            file_path.unlink()
        logger.error(f"Error uploading document: {e}")
        raise HTTPException(status_code=500, detail="Error uploading document")

@api_router.get("/patients/{patient_id}/documents", response_model=List[Document])
async def get_patient_documents(
    patient_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT]))
):
    """Get all documents for a patient"""
    # Check if patient exists
    patient = await db.patients.find_one({"id": patient_id})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Patients can only access their own documents
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    documents = await db.documents.find({"patient_id": patient_id}).sort("created_at", -1).to_list(100)
    return [Document(**doc) for doc in documents]

@api_router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Delete a document"""
    document = await db.documents.find_one({"id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Delete file from disk
    file_path = Path(document["file_path"])
    if file_path.exists():
        file_path.unlink()
    
    # Delete from database
    await db.documents.delete_one({"id": document_id})
    
    logger.info(f"Document deleted: {document_id}")
    return {"message": "Document deleted successfully"}

@api_router.get("/uploads/{filename}")
async def download_file(filename: str):
    """Serve uploaded files through API endpoint (workaround for ingress routing)"""
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Import here to avoid circular imports
    from fastapi.responses import FileResponse
    
    # Determine content type based on file extension
    content_type_map = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif'
    }
    
    file_extension = file_path.suffix.lower()
    media_type = content_type_map.get(file_extension, 'application/octet-stream')
    
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=filename
    )

@api_router.put("/documents/{document_id}", response_model=Document)
async def update_document(
    document_id: str,
    update_data: DocumentUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Update document description"""
    document = await db.documents.find_one({"id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Update document
    await db.documents.update_one(
        {"id": document_id},
        {"$set": update_data.dict(exclude_unset=True)}
    )
    
    # Return updated document
    updated_document = await db.documents.find_one({"id": document_id})
    return Document(**updated_document)

# Treatment Plan endpoints
@api_router.post("/patients/{patient_id}/treatment-plans", response_model=TreatmentPlan)
async def create_treatment_plan(
    patient_id: str,
    plan_data: TreatmentPlanCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Create a treatment plan for a patient"""
    # Check if patient exists
    patient = await db.patients.find_one({"id": patient_id})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Create treatment plan record
    treatment_plan = TreatmentPlan(
        patient_id=patient_id,
        title=plan_data.title,
        description=plan_data.description,
        services=plan_data.services,
        total_cost=plan_data.total_cost,
        status=plan_data.status,
        created_by=current_user.id,
        created_by_name=current_user.full_name,
        notes=plan_data.notes,
        # Enhanced tracking fields
        payment_status=plan_data.payment_status,
        paid_amount=plan_data.paid_amount,
        payment_date=plan_data.payment_date,
        execution_status=plan_data.execution_status,
        started_at=plan_data.started_at,
        completed_at=plan_data.completed_at,
        appointment_ids=plan_data.appointment_ids
    )
    
    # Insert to database
    await db.treatment_plans.insert_one(treatment_plan.dict())
    
    logger.info(f"Treatment plan created: {treatment_plan.title} for patient {patient_id}")
    return treatment_plan

@api_router.get("/patients/{patient_id}/treatment-plans", response_model=List[TreatmentPlan])
async def get_patient_treatment_plans(
    patient_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT]))
):
    """Get all treatment plans for a patient"""
    # Check if patient exists
    patient = await db.patients.find_one({"id": patient_id})
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Patients can only access their own treatment plans
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    treatment_plans = await db.treatment_plans.find({"patient_id": patient_id}).sort("created_at", -1).to_list(100)
    return [TreatmentPlan(**plan) for plan in treatment_plans]

# Treatment Plan Statistics endpoints (must be before parameterized routes)
@api_router.get("/treatment-plans/statistics")
async def get_treatment_plan_statistics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Get treatment plan statistics"""
    
    # Build date filter
    date_filter = {}
    if date_from or date_to:
        date_query = {}
        if date_from:
            date_query["$gte"] = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
        if date_to:
            date_query["$lte"] = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
        date_filter["created_at"] = date_query
    
    # Get all treatment plans
    all_plans = await db.treatment_plans.find(date_filter).to_list(None)
    
    # Calculate statistics
    total_plans = len(all_plans)
    
    # Status statistics
    status_counts = {}
    execution_counts = {}
    payment_counts = {}
    
    total_cost = 0
    total_paid = 0
    
    for plan in all_plans:
        # Status counts
        status = plan.get('status', 'draft')
        status_counts[status] = status_counts.get(status, 0) + 1
        
        # Execution status counts
        execution_status = plan.get('execution_status', 'pending')
        execution_counts[execution_status] = execution_counts.get(execution_status, 0) + 1
        
        # Payment status counts
        payment_status = plan.get('payment_status', 'unpaid')
        payment_counts[payment_status] = payment_counts.get(payment_status, 0) + 1
        
        # Financial calculations
        total_cost += plan.get('total_cost', 0)
        total_paid += plan.get('paid_amount', 0)
    
    # Calculate percentages and additional metrics
    completed_plans = execution_counts.get('completed', 0)
    no_show_plans = execution_counts.get('no_show', 0)
    in_progress_plans = execution_counts.get('in_progress', 0)
    pending_plans = execution_counts.get('pending', 0)
    
    paid_plans = payment_counts.get('paid', 0)
    unpaid_plans = payment_counts.get('unpaid', 0)
    partially_paid_plans = payment_counts.get('partially_paid', 0)
    overdue_plans = payment_counts.get('overdue', 0)
    
    # Monthly statistics
    monthly_stats = {}
    for plan in all_plans:
        created_date = plan.get('created_at')
        if created_date:
            if isinstance(created_date, str):
                created_date = datetime.fromisoformat(created_date.replace('Z', '+00:00'))
            month_key = f"{created_date.year}-{created_date.month:02d}"
            if month_key not in monthly_stats:
                monthly_stats[month_key] = {
                    'created': 0,
                    'completed': 0,
                    'no_show': 0,
                    'total_cost': 0,
                    'paid_amount': 0
                }
            monthly_stats[month_key]['created'] += 1
            monthly_stats[month_key]['total_cost'] += plan.get('total_cost', 0)
            monthly_stats[month_key]['paid_amount'] += plan.get('paid_amount', 0)
            
            if plan.get('execution_status') == 'completed':
                monthly_stats[month_key]['completed'] += 1
            elif plan.get('execution_status') == 'no_show':
                monthly_stats[month_key]['no_show'] += 1
    
    return {
        "overview": {
            "total_plans": total_plans,
            "completed_plans": completed_plans,
            "no_show_plans": no_show_plans,
            "in_progress_plans": in_progress_plans,
            "pending_plans": pending_plans,
            "completion_rate": round((completed_plans / total_plans * 100) if total_plans > 0 else 0, 1),
            "no_show_rate": round((no_show_plans / total_plans * 100) if total_plans > 0 else 0, 1),
            "total_cost": total_cost,
            "total_paid": total_paid,
            "outstanding_amount": total_cost - total_paid,
            "collection_rate": round((total_paid / total_cost * 100) if total_cost > 0 else 0, 1)
        },
        "status_distribution": status_counts,
        "execution_distribution": execution_counts,
        "payment_distribution": payment_counts,
        "payment_summary": {
            "paid_plans": paid_plans,
            "unpaid_plans": unpaid_plans,
            "partially_paid_plans": partially_paid_plans,
            "overdue_plans": overdue_plans,
            "total_revenue": total_paid,
            "outstanding_revenue": total_cost - total_paid
        },
        "monthly_statistics": [
            {
                "month": month,
                "created": data["created"],
                "completed": data["completed"], 
                "no_show": data["no_show"],
                "completion_rate": round((data["completed"] / data["created"] * 100) if data["created"] > 0 else 0, 1),
                "no_show_rate": round((data["no_show"] / data["created"] * 100) if data["created"] > 0 else 0, 1),
                "total_cost": data["total_cost"],
                "paid_amount": data["paid_amount"],
                "collection_rate": round((data["paid_amount"] / data["total_cost"] * 100) if data["total_cost"] > 0 else 0, 1)
            }
            for month, data in sorted(monthly_stats.items())
        ]
    }

@api_router.get("/treatment-plans/statistics/patients")
async def get_patient_statistics(
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Get patient-specific treatment plan statistics"""
    
    # Aggregate patient statistics
    pipeline = [
        {
            "$group": {
                "_id": "$patient_id",
                "total_plans": {"$sum": 1},
                "completed_plans": {
                    "$sum": {"$cond": [{"$eq": ["$execution_status", "completed"]}, 1, 0]}
                },
                "no_show_plans": {
                    "$sum": {"$cond": [{"$eq": ["$execution_status", "no_show"]}, 1, 0]}
                },
                "total_cost": {"$sum": "$total_cost"},
                "total_paid": {"$sum": "$paid_amount"},
                "unpaid_plans": {
                    "$sum": {"$cond": [{"$eq": ["$payment_status", "unpaid"]}, 1, 0]}
                }
            }
        },
        {
            "$lookup": {
                "from": "patients",
                "localField": "_id",
                "foreignField": "id",
                "as": "patient"
            }
        },
        {"$unwind": "$patient"},
        {
            "$project": {
                "_id": 0,
                "patient_id": "$_id",
                "patient_name": "$patient.full_name",
                "patient_phone": "$patient.phone",
                "total_plans": 1,
                "completed_plans": 1,
                "no_show_plans": 1,
                "total_cost": 1,
                "total_paid": 1,
                "outstanding_amount": {"$subtract": ["$total_cost", "$total_paid"]},
                "unpaid_plans": 1,
                "completion_rate": {
                    "$multiply": [
                        {"$divide": ["$completed_plans", "$total_plans"]},
                        100
                    ]
                },
                "no_show_rate": {
                    "$multiply": [
                        {"$divide": ["$no_show_plans", "$total_plans"]},
                        100
                    ]
                },
                "collection_rate": {
                    "$multiply": [
                        {"$divide": ["$total_paid", "$total_cost"]},
                        100
                    ]
                }
            }
        },
        {"$sort": {"total_cost": -1}}
    ]
    
    patient_stats = await db.treatment_plans.aggregate(pipeline).to_list(None)
    
    return {
        "patient_statistics": patient_stats,
        "summary": {
            "total_patients": len(patient_stats),
            "patients_with_unpaid": len([p for p in patient_stats if p["unpaid_plans"] > 0]),
            "patients_with_no_shows": len([p for p in patient_stats if p["no_show_plans"] > 0]),
            "high_value_patients": len([p for p in patient_stats if p["total_cost"] > 50000])
        }
    }

@api_router.get("/treatment-plans/{plan_id}", response_model=TreatmentPlan)
async def get_treatment_plan(
    plan_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT]))
):
    """Get a specific treatment plan"""
    treatment_plan = await db.treatment_plans.find_one({"id": plan_id})
    if not treatment_plan:
        raise HTTPException(status_code=404, detail="Treatment plan not found")
    
    # Patients can only access their own treatment plans
    if current_user.role == UserRole.PATIENT:
        patient = await db.patients.find_one({"id": treatment_plan["patient_id"]})
        if not patient or current_user.patient_id != treatment_plan["patient_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return TreatmentPlan(**treatment_plan)

@api_router.put("/treatment-plans/{plan_id}", response_model=TreatmentPlan)
async def update_treatment_plan(
    plan_id: str,
    update_data: TreatmentPlanUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Update treatment plan"""
    treatment_plan = await db.treatment_plans.find_one({"id": plan_id})
    if not treatment_plan:
        raise HTTPException(status_code=404, detail="Treatment plan not found")
    
    # Update treatment plan
    update_dict = update_data.dict(exclude_unset=True)
    if update_dict:
        update_dict["updated_at"] = datetime.utcnow()
        await db.treatment_plans.update_one(
            {"id": plan_id},
            {"$set": update_dict}
        )
    
    # Return updated treatment plan
    updated_plan = await db.treatment_plans.find_one({"id": plan_id})
    return TreatmentPlan(**updated_plan)

@api_router.delete("/treatment-plans/{plan_id}")
async def delete_treatment_plan(
    plan_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Delete a treatment plan"""
    treatment_plan = await db.treatment_plans.find_one({"id": plan_id})
    if not treatment_plan:
        raise HTTPException(status_code=404, detail="Treatment plan not found")
    
    # Delete from database
    await db.treatment_plans.delete_one({"id": plan_id})
    
    logger.info(f"Treatment plan deleted: {plan_id}")
    return {"message": "Treatment plan deleted successfully"}

# Service endpoints
@api_router.get("/services", response_model=List[Service])
async def get_services(
    category: Optional[str] = None,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Get all services, optionally filtered by category"""
    query = {}
    if category:
        query["category"] = category
    
    services = await db.services.find(query).sort("category", 1).sort("name", 1).to_list(1000)
    return [Service(**service) for service in services]

@api_router.get("/service-categories")
async def get_service_categories(
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Get all service categories"""
    categories = await db.services.distinct("category")
    return {"categories": sorted(categories)}

@api_router.post("/services", response_model=Service)
async def create_service(
    service_data: ServiceCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Create a new service (admin only)"""
    service = Service(**service_data.dict())
    await db.services.insert_one(service.dict())
    
    logger.info(f"Service created: {service.name} in category {service.category}")
    return service

# Initialize default services if none exist
@api_router.post("/services/initialize")
async def initialize_default_services(
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Initialize default services (admin only)"""
    existing_count = await db.services.count_documents({})
    if existing_count > 0:
        return {"message": f"Services already exist ({existing_count} services found)"}
    
    default_services = [
        # Стоматология
        {"name": "14C-уреазный дыхательный тест на определение Хеликобактер пилори (Helicobacter pylori)", "category": "Стоматолог", "price": 9960.0},
        {"name": "17-OH Прогестерон (17-ОП)", "category": "Стоматолог", "price": 4200.0},
        {"name": "Лечение кариеса", "category": "Стоматолог", "price": 15000.0},
        {"name": "Удаление зуба", "category": "Стоматолог", "price": 8000.0},
        {"name": "Установка пломбы", "category": "Стоматолог", "price": 12000.0},
        {"name": "Чистка зубов", "category": "Стоматолог", "price": 6000.0},
        
        # Гинекология
        {"name": "Консультация гинеколога", "category": "Гинекология", "price": 5000.0},
        {"name": "УЗИ органов малого таза", "category": "Гинекология", "price": 7000.0},
        
        # Ортодонт
        {"name": "Установка брекетов", "category": "Ортодонт", "price": 150000.0},
        {"name": "Коррекция прикуса", "category": "Ортодонт", "price": 25000.0},
        
        # Дерматовенеролог
        {"name": "Консультация дерматолога", "category": "Дерматовенеролог", "price": 4500.0},
        {"name": "Удаление новообразований", "category": "Дерматовенеролог", "price": 8000.0},
        
        # Медикаменты
        {"name": "Антибиотики", "category": "Медикаменты", "price": 2500.0},
        {"name": "Обезболивающие", "category": "Медикаменты", "price": 1200.0},
    ]
    
    services = [Service(**service_data) for service_data in default_services]
    await db.services.insert_many([service.dict() for service in services])
    
    logger.info(f"Initialized {len(services)} default services")
    return {"message": f"Successfully initialized {len(services)} default services"}

# Treatment Plan Statistics endpoints
@api_router.get("/treatment-plans/statistics")
async def get_treatment_plan_statistics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Get treatment plan statistics"""
    
    # Build date filter
    date_filter = {}
    if date_from or date_to:
        date_query = {}
        if date_from:
            date_query["$gte"] = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
        if date_to:
            date_query["$lte"] = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
        date_filter["created_at"] = date_query
    
    # Get all treatment plans
    all_plans = await db.treatment_plans.find(date_filter).to_list(None)
    
    # Calculate statistics
    total_plans = len(all_plans)
    
    # Status statistics
    status_counts = {}
    execution_counts = {}
    payment_counts = {}
    
    total_cost = 0
    total_paid = 0
    
    for plan in all_plans:
        # Status counts
        status = plan.get('status', 'draft')
        status_counts[status] = status_counts.get(status, 0) + 1
        
        # Execution status counts
        execution_status = plan.get('execution_status', 'pending')
        execution_counts[execution_status] = execution_counts.get(execution_status, 0) + 1
        
        # Payment status counts
        payment_status = plan.get('payment_status', 'unpaid')
        payment_counts[payment_status] = payment_counts.get(payment_status, 0) + 1
        
        # Financial calculations
        total_cost += plan.get('total_cost', 0)
        total_paid += plan.get('paid_amount', 0)
    
    # Calculate percentages and additional metrics
    completed_plans = execution_counts.get('completed', 0)
    no_show_plans = execution_counts.get('no_show', 0)
    in_progress_plans = execution_counts.get('in_progress', 0)
    pending_plans = execution_counts.get('pending', 0)
    
    paid_plans = payment_counts.get('paid', 0)
    unpaid_plans = payment_counts.get('unpaid', 0)
    partially_paid_plans = payment_counts.get('partially_paid', 0)
    overdue_plans = payment_counts.get('overdue', 0)
    
    # Monthly statistics
    monthly_stats = {}
    for plan in all_plans:
        created_date = plan.get('created_at')
        if created_date:
            if isinstance(created_date, str):
                created_date = datetime.fromisoformat(created_date.replace('Z', '+00:00'))
            month_key = f"{created_date.year}-{created_date.month:02d}"
            if month_key not in monthly_stats:
                monthly_stats[month_key] = {
                    'created': 0,
                    'completed': 0,
                    'no_show': 0,
                    'total_cost': 0,
                    'paid_amount': 0
                }
            monthly_stats[month_key]['created'] += 1
            monthly_stats[month_key]['total_cost'] += plan.get('total_cost', 0)
            monthly_stats[month_key]['paid_amount'] += plan.get('paid_amount', 0)
            
            if plan.get('execution_status') == 'completed':
                monthly_stats[month_key]['completed'] += 1
            elif plan.get('execution_status') == 'no_show':
                monthly_stats[month_key]['no_show'] += 1
    
    return {
        "overview": {
            "total_plans": total_plans,
            "completed_plans": completed_plans,
            "no_show_plans": no_show_plans,
            "in_progress_plans": in_progress_plans,
            "pending_plans": pending_plans,
            "completion_rate": round((completed_plans / total_plans * 100) if total_plans > 0 else 0, 1),
            "no_show_rate": round((no_show_plans / total_plans * 100) if total_plans > 0 else 0, 1),
            "total_cost": total_cost,
            "total_paid": total_paid,
            "outstanding_amount": total_cost - total_paid,
            "collection_rate": round((total_paid / total_cost * 100) if total_cost > 0 else 0, 1)
        },
        "status_distribution": status_counts,
        "execution_distribution": execution_counts,
        "payment_distribution": payment_counts,
        "payment_summary": {
            "paid_plans": paid_plans,
            "unpaid_plans": unpaid_plans,
            "partially_paid_plans": partially_paid_plans,
            "overdue_plans": overdue_plans,
            "total_revenue": total_paid,
            "outstanding_revenue": total_cost - total_paid
        },
        "monthly_statistics": [
            {
                "month": month,
                "created": data["created"],
                "completed": data["completed"], 
                "no_show": data["no_show"],
                "completion_rate": round((data["completed"] / data["created"] * 100) if data["created"] > 0 else 0, 1),
                "no_show_rate": round((data["no_show"] / data["created"] * 100) if data["created"] > 0 else 0, 1),
                "total_cost": data["total_cost"],
                "paid_amount": data["paid_amount"],
                "collection_rate": round((data["paid_amount"] / data["total_cost"] * 100) if data["total_cost"] > 0 else 0, 1)
            }
            for month, data in sorted(monthly_stats.items())
        ]
    }

@api_router.get("/treatment-plans/statistics/patients")
async def get_patient_statistics(
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Get patient-specific treatment plan statistics"""
    
    # Aggregate patient statistics
    pipeline = [
        {
            "$group": {
                "_id": "$patient_id",
                "total_plans": {"$sum": 1},
                "completed_plans": {
                    "$sum": {"$cond": [{"$eq": ["$execution_status", "completed"]}, 1, 0]}
                },
                "no_show_plans": {
                    "$sum": {"$cond": [{"$eq": ["$execution_status", "no_show"]}, 1, 0]}
                },
                "total_cost": {"$sum": "$total_cost"},
                "total_paid": {"$sum": "$paid_amount"},
                "unpaid_plans": {
                    "$sum": {"$cond": [{"$eq": ["$payment_status", "unpaid"]}, 1, 0]}
                }
            }
        },
        {
            "$lookup": {
                "from": "patients",
                "localField": "_id",
                "foreignField": "id",
                "as": "patient"
            }
        },
        {"$unwind": "$patient"},
        {
            "$project": {
                "_id": 0,
                "patient_id": "$_id",
                "patient_name": "$patient.full_name",
                "patient_phone": "$patient.phone",
                "total_plans": 1,
                "completed_plans": 1,
                "no_show_plans": 1,
                "total_cost": 1,
                "total_paid": 1,
                "outstanding_amount": {"$subtract": ["$total_cost", "$total_paid"]},
                "unpaid_plans": 1,
                "completion_rate": {
                    "$multiply": [
                        {"$divide": ["$completed_plans", "$total_plans"]},
                        100
                    ]
                },
                "no_show_rate": {
                    "$multiply": [
                        {"$divide": ["$no_show_plans", "$total_plans"]},
                        100
                    ]
                },
                "collection_rate": {
                    "$multiply": [
                        {"$divide": ["$total_paid", "$total_cost"]},
                        100
                    ]
                }
            }
        },
        {"$sort": {"total_cost": -1}}
    ]
    
    patient_stats = await db.treatment_plans.aggregate(pipeline).to_list(None)
    
    return {
        "patient_statistics": patient_stats,
        "summary": {
            "total_patients": len(patient_stats),
            "patients_with_unpaid": len([p for p in patient_stats if p["unpaid_plans"] > 0]),
            "patients_with_no_shows": len([p for p in patient_stats if p["no_show_plans"] > 0]),
            "high_value_patients": len([p for p in patient_stats if p["total_cost"] > 50000])
        }
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()