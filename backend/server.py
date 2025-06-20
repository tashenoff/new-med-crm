from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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

# Existing Models (updated to link with users)
class Patient(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    full_name: str
    phone: str
    iin: Optional[str] = None  # ИИН (Individual Identification Number)
    source: PatientSource = PatientSource.OTHER
    notes: Optional[str] = None
    user_id: Optional[str] = None  # Link to User if patient has account
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class PatientCreate(BaseModel):
    full_name: str
    phone: str
    iin: Optional[str] = None
    source: PatientSource = PatientSource.OTHER
    notes: Optional[str] = None
    user_id: Optional[str] = None

class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    iin: Optional[str] = None
    source: Optional[PatientSource] = None
    notes: Optional[str] = None

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
    status: AppointmentStatus = AppointmentStatus.UNCONFIRMED
    reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class AppointmentCreate(BaseModel):
    patient_id: str
    doctor_id: str
    appointment_date: str  # Accept as string in ISO format (YYYY-MM-DD)
    appointment_time: str
    reason: Optional[str] = None
    notes: Optional[str] = None

class AppointmentUpdate(BaseModel):
    patient_id: Optional[str] = None
    doctor_id: Optional[str] = None
    appointment_date: Optional[str] = None  # Accept as string in ISO format (YYYY-MM-DD)
    appointment_time: Optional[str] = None
    status: Optional[AppointmentStatus] = None
    reason: Optional[str] = None
    notes: Optional[str] = None

class AppointmentWithDetails(BaseModel):
    id: str
    patient_id: str
    doctor_id: str
    appointment_date: str  # Return as string in ISO format (YYYY-MM-DD)
    appointment_time: str
    status: AppointmentStatus
    reason: Optional[str]
    notes: Optional[str]
    patient_name: str
    doctor_name: str
    doctor_specialty: str
    doctor_color: str
    created_at: datetime
    updated_at: datetime

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
    await db.patients.insert_one(patient_obj.dict())
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
                "status": 1,
                "reason": 1,
                "notes": 1,
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
    
    appointments = await db.appointments.aggregate(pipeline).to_list(1000)
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
                "status": 1,
                "reason": 1,
                "notes": 1,
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