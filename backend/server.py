from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Form
from contextlib import asynccontextmanager
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

# Import database from new module
from database import db, client, close_database

# Import auth models from models module
from models.auth import UserRole, User, UserInDB, UserCreate, UserLogin, Token, TokenData

# Import doctor models from models module
from models.doctor import (
    PaymentType,
    Doctor,
    DoctorCreate,
    DoctorUpdate,
    DoctorSchedule,
    DoctorScheduleCreate,
    DoctorScheduleUpdate,
    DoctorWithSchedule
)

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

# Import service models from models module
from models.services import (
    ServiceCategory,
    ServiceCategoryCreate,
    ServiceCategoryUpdate,
    Specialty,
    SpecialtyCreate,
    SpecialtyUpdate,
    ServicePrice,
    ServicePriceCreate,
    ServicePriceUpdate,
    Service,
    ServiceCreate
)

# Import appointment models from models module
from models.appointment import (
    AppointmentStatus,
    Appointment,
    AppointmentCreate,
    AppointmentUpdate,
    AppointmentWithDetails
)

# Security
SECRET_KEY = os.environ.get("SECRET_KEY", "fallback-secret-key")
ALGORITHM = os.environ.get("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown
    await close_database()

# Create the main app without a prefix
app = FastAPI(lifespan=lifespan, redirect_slashes=False)

# Add CORS middleware first (before any routes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://127.0.0.1:3000", 
        "http://localhost:3001",
        "https://app.emergent.sh",
        "https://medicodebase.preview.emergentagent.com",
        "https://medicodebase.preview.emergentagent.com",
        "https://*.emergentagent.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Create uploads directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Mount static files for serving uploaded documents
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Auth Models are now imported from models.auth
# Doctor Models are now imported from models.doctor
# Room Models are now imported from models.room
# Service Models are now imported from models.services
# Appointment Models are now imported from models.appointment

class PaymentType(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    commission_rate: float = 0.0  # Комиссия в процентах (например, 2.5 = 2.5%)
    description: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class PaymentTypeCreate(BaseModel):
    name: str
    commission_rate: float = 0.0
    description: Optional[str] = None

class PaymentTypeUpdate(BaseModel):
    name: Optional[str] = None
    commission_rate: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


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
# Service models are now imported from models.services

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
    assigned_doctor_id: Optional[str] = None  # ID врача, которому назначен план
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
    assigned_doctor_id: Optional[str] = None  # ID врача, которому назначен план
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
    assigned_doctor_id: Optional[str] = None  # ID врача, которому назначен план
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

# Import authentication functions from auth router
from routers.auth import get_current_active_user, require_role, get_current_user


# Auth endpoints moved to routers/auth.py

# Root endpoint
@api_router.get("/")
async def root():
    return {"message": "Clinic Management System API with Authentication"}



# Protected Doctor endpoints
@api_router.post("/doctors", response_model=Doctor)
async def create_doctor(
    doctor: DoctorCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    doctor_dict = doctor.dict()
    
    # Проверка на дублирование врача по имени и телефону
    existing_doctor = await db.doctors.find_one({
        "$or": [
            {"full_name": doctor_dict["full_name"], "is_active": True},
            {"phone": doctor_dict["phone"], "is_active": True}
        ]
    })
    
    if existing_doctor:
        # Определяем по какому полю найдено совпадение
        if existing_doctor["full_name"] == doctor_dict["full_name"]:
            raise HTTPException(status_code=400, detail=f"Врач с именем '{doctor_dict['full_name']}' уже существует")
        elif existing_doctor["phone"] == doctor_dict["phone"]:
            raise HTTPException(status_code=400, detail=f"Врач с телефоном '{doctor_dict['phone']}' уже существует")
    
    # Автоматическое определение payment_mode при создании
    services = doctor_dict.get("services", [])
    
    # Проверяем, есть ли индивидуальные комиссии
    has_individual_commissions = False
    if isinstance(services, list) and services:
        for service in services:
            if isinstance(service, dict) and ("commission_type" in service or "commission_value" in service):
                has_individual_commissions = True
                break
    
    # Устанавливаем payment_mode на основе структуры данных (игнорируем что пришло с фронтенда)
    doctor_dict["payment_mode"] = "individual" if has_individual_commissions else "general"
    
    doctor_obj = Doctor(**doctor_dict)
    await db.doctors.insert_one(doctor_obj.dict())
    return doctor_obj

@api_router.get("/doctors", response_model=List[Doctor])
async def get_doctors(current_user: UserInDB = Depends(get_current_active_user)):
    doctors = await db.doctors.find({"is_active": True}).sort("full_name", 1).to_list(1000)
    return [Doctor(**doctor) for doctor in doctors]

# Doctor Statistics endpoints (must be before parameterized routes)
@api_router.get("/doctors/statistics")
async def get_doctor_statistics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Get doctor statistics"""
    
    # Build date filter for appointments
    appointment_date_filter = {}
    if date_from or date_to:
        date_query = {}
        if date_from:
            date_query["$gte"] = date_from
        if date_to:
            date_query["$lte"] = date_to
        appointment_date_filter["appointment_date"] = date_query
    
    # Get all appointments in date range
    all_appointments = await db.appointments.find(appointment_date_filter).to_list(None)
    
    # Get all doctors
    all_doctors = await db.doctors.find({"is_active": True}).to_list(None)
    
    # Calculate overall statistics
    total_appointments = len(all_appointments)
    completed_appointments = len([a for a in all_appointments if a.get('status') == 'completed'])
    cancelled_appointments = len([a for a in all_appointments if a.get('status') == 'cancelled'])
    no_show_appointments = len([a for a in all_appointments if a.get('status') == 'no_show'])
    
    total_revenue = sum(float(a.get('price') or 0) for a in all_appointments if a.get('status') == 'completed' and a.get('price'))
    potential_revenue = sum(float(a.get('price') or 0) for a in all_appointments if a.get('price'))
    
    # Monthly statistics for appointments
    monthly_stats = {}
    for appointment in all_appointments:
        appointment_date = appointment.get('appointment_date')
        if appointment_date:
            month_key = f"{appointment_date[:7]}"  # YYYY-MM format
            if month_key not in monthly_stats:
                monthly_stats[month_key] = {
                    'total_appointments': 0,
                    'completed_appointments': 0,
                    'cancelled_appointments': 0,
                    'no_show_appointments': 0,
                    'total_revenue': 0
                }
            monthly_stats[month_key]['total_appointments'] += 1
            if appointment.get('status') == 'completed':
                monthly_stats[month_key]['completed_appointments'] += 1
                monthly_stats[month_key]['total_revenue'] += float(appointment.get('price') or 0)
            elif appointment.get('status') == 'cancelled':
                monthly_stats[month_key]['cancelled_appointments'] += 1
            elif appointment.get('status') == 'no_show':
                monthly_stats[month_key]['no_show_appointments'] += 1
    
    return {
        "overview": {
            "total_doctors": len(all_doctors),
            "total_appointments": total_appointments,
            "completed_appointments": completed_appointments,
            "cancelled_appointments": cancelled_appointments,
            "no_show_appointments": no_show_appointments,
            "completion_rate": round((completed_appointments / total_appointments * 100) if total_appointments > 0 else 0, 1),
            "cancellation_rate": round((cancelled_appointments / total_appointments * 100) if total_appointments > 0 else 0, 1),
            "no_show_rate": round((no_show_appointments / total_appointments * 100) if total_appointments > 0 else 0, 1),
            "total_revenue": total_revenue,
            "potential_revenue": potential_revenue,
            "revenue_efficiency": round((total_revenue / potential_revenue * 100) if potential_revenue > 0 else 0, 1),
            "avg_revenue_per_appointment": round(total_revenue / completed_appointments if completed_appointments > 0 else 0, 2),
            "avg_appointments_per_doctor": round(total_appointments / len(all_doctors) if len(all_doctors) > 0 else 0, 1)
        },
        "monthly_statistics": [
            {
                "month": month,
                "total_appointments": data["total_appointments"],
                "completed_appointments": data["completed_appointments"],
                "cancelled_appointments": data["cancelled_appointments"], 
                "no_show_appointments": data["no_show_appointments"],
                "completion_rate": round((data["completed_appointments"] / data["total_appointments"] * 100) if data["total_appointments"] > 0 else 0, 1),
                "total_revenue": data["total_revenue"],
                "avg_revenue_per_appointment": round(data["total_revenue"] / data["completed_appointments"] if data["completed_appointments"] > 0 else 0, 2)
            }
            for month, data in sorted(monthly_stats.items())
        ]
    }

@api_router.get("/doctors/statistics/individual")
async def get_individual_doctor_statistics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Get individual doctor statistics with working hours and utilization"""
    
    # Build date filter
    date_filter = {}
    if date_from or date_to:
        date_query = {}
        if date_from:
            date_query["$gte"] = date_from
        if date_to:
            date_query["$lte"] = date_to
        date_filter["appointment_date"] = date_query
    
    # Helper function to calculate appointment duration in hours
    def calculate_duration_hours(start_time, end_time):
        """Calculate duration between start and end time in hours"""
        if not start_time or not end_time:
            return 0.5  # Default 30 minutes if no end time
        try:
            start = datetime.strptime(start_time, "%H:%M")
            end = datetime.strptime(end_time, "%H:%M")
            duration = (end - start).total_seconds() / 3600  # Convert to hours
            return max(duration, 0)  # Ensure non-negative
        except:
            return 0.5  # Default 30 minutes on parse error
    
    # Aggregate doctor statistics from appointments
    pipeline = [
        {"$match": date_filter},
        {
            "$addFields": {
                "appointment_duration": 0.5  # Fixed 30 minutes duration for now
            }
        },
        {
            "$group": {
                "_id": "$doctor_id",
                "total_appointments": {"$sum": 1},
                "completed_appointments": {
                    "$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}
                },
                "cancelled_appointments": {
                    "$sum": {"$cond": [{"$eq": ["$status", "cancelled"]}, 1, 0]}
                },
                "no_show_appointments": {
                    "$sum": {"$cond": [{"$eq": ["$status", "no_show"]}, 1, 0]}
                },
                "total_worked_hours": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$status", "completed"]},
                            "$appointment_duration",
                            0
                        ]
                    }
                },
                "total_scheduled_hours": {
                    "$sum": "$appointment_duration"
                },
                "total_revenue": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$status", "completed"]},
                            {"$toDouble": {"$ifNull": ["$price", 0]}},
                            0
                        ]
                    }
                },
                "potential_revenue": {
                    "$sum": {"$toDouble": {"$ifNull": ["$price", 0]}}
                }
            }
        },
        {
            "$lookup": {
                "from": "doctors",
                "localField": "_id",
                "foreignField": "id",
                "as": "doctor"
            }
        },
        {"$unwind": "$doctor"},
        {
            "$project": {
                "_id": 0,
                "doctor_id": "$_id",
                "doctor_name": "$doctor.full_name",
                "doctor_specialty": "$doctor.specialty",
                "doctor_phone": "$doctor.phone",
                "total_appointments": 1,
                "completed_appointments": 1,
                "cancelled_appointments": 1,
                "no_show_appointments": 1,
                "total_worked_hours": 1,
                "total_scheduled_hours": 1,
                "total_revenue": 1,
                "potential_revenue": 1,
                "completion_rate": {
                    "$cond": [
                        {"$gt": ["$total_appointments", 0]},
                        {"$multiply": [
                            {"$divide": ["$completed_appointments", "$total_appointments"]},
                            100
                        ]},
                        0
                    ]
                },
                "cancellation_rate": {
                    "$cond": [
                        {"$gt": ["$total_appointments", 0]},
                        {"$multiply": [
                            {"$divide": ["$cancelled_appointments", "$total_appointments"]}, 
                            100
                        ]},
                        0
                    ]
                },
                "no_show_rate": {
                    "$cond": [
                        {"$gt": ["$total_appointments", 0]},
                        {"$multiply": [
                            {"$divide": ["$no_show_appointments", "$total_appointments"]},
                            100
                        ]},
                        0
                    ]
                },
                "utilization_rate": {
                    "$cond": [
                        {"$gt": ["$total_scheduled_hours", 0]},
                        {"$multiply": [
                            {"$divide": ["$total_worked_hours", "$total_scheduled_hours"]},
                            100
                        ]},
                        0
                    ]
                },
                "revenue_efficiency": {
                    "$cond": [
                        {"$gt": ["$potential_revenue", 0]},
                        {"$multiply": [
                            {"$divide": ["$total_revenue", "$potential_revenue"]},
                            100
                        ]},
                        0
                    ]
                },
                "avg_revenue_per_appointment": {
                    "$cond": [
                        {"$gt": ["$completed_appointments", 0]},
                        {"$divide": ["$total_revenue", "$completed_appointments"]},
                        0
                    ]
                },
                "avg_revenue_per_hour": {
                    "$cond": [
                        {"$gt": ["$total_worked_hours", 0]},
                        {"$divide": ["$total_revenue", "$total_worked_hours"]},
                        0
                    ]
                }
            }
        },
        {"$sort": {"total_revenue": -1}}
    ]
    
    doctor_stats = await db.appointments.aggregate(pipeline).to_list(None)
    
    # Get doctors with no appointments in the period
    doctor_ids_with_appointments = [stat["doctor_id"] for stat in doctor_stats]
    doctors_without_appointments = await db.doctors.find({
        "id": {"$nin": doctor_ids_with_appointments},
        "is_active": True
    }).to_list(None)
    
    # Add doctors with zero stats
    for doctor in doctors_without_appointments:
        doctor_stats.append({
            "doctor_id": doctor["id"],
            "doctor_name": doctor["full_name"],
            "doctor_specialty": doctor["specialty"],
            "doctor_phone": doctor.get("phone", ""),
            "total_appointments": 0,
            "completed_appointments": 0,
            "cancelled_appointments": 0,
            "no_show_appointments": 0,
            "total_worked_hours": 0,
            "total_scheduled_hours": 0,
            "total_revenue": 0,
            "potential_revenue": 0,
            "completion_rate": 0,
            "cancellation_rate": 0,
            "no_show_rate": 0,
            "utilization_rate": 0,
            "revenue_efficiency": 0,
            "avg_revenue_per_appointment": 0,
            "avg_revenue_per_hour": 0
        })
    
    return {
        "doctor_statistics": doctor_stats,
        "summary": {
            "total_doctors": len(doctor_stats),
            "active_doctors": len([d for d in doctor_stats if d["total_appointments"] > 0]),
            "top_performers": len([d for d in doctor_stats if d["completion_rate"] > 80 and d["total_appointments"] > 5]),
            "high_revenue_doctors": len([d for d in doctor_stats if d["total_revenue"] > 100000]),
            "doctors_with_no_shows": len([d for d in doctor_stats if d["no_show_rate"] > 10 and d["total_appointments"] > 5]),
            "high_utilization_doctors": len([d for d in doctor_stats if d["utilization_rate"] > 80 and d["total_worked_hours"] > 0]),
            "avg_worked_hours": round(sum(d["total_worked_hours"] for d in doctor_stats) / len([d for d in doctor_stats if d["total_worked_hours"] > 0]) if len([d for d in doctor_stats if d["total_worked_hours"] > 0]) > 0 else 0, 2),
            "avg_utilization_rate": round(sum(d["utilization_rate"] for d in doctor_stats) / len([d for d in doctor_stats if d["total_scheduled_hours"] > 0]) if len([d for d in doctor_stats if d["total_scheduled_hours"] > 0]) > 0 else 0, 1)
        }
    }

@api_router.get("/doctors/salary-report")
async def get_doctor_salary_report(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Получить отчет по зарплатам врачей с учетом записей и планов лечения"""
    from datetime import datetime
    
    # Устанавливаем даты по умолчанию (текущий месяц)
    if not date_from:
        date_from = datetime.now().replace(day=1).strftime('%Y-%m-%d')
    if not date_to:
        date_to = datetime.now().strftime('%Y-%m-%d')
    
    # Конвертируем строки в datetime объекты для MongoDB запросов
    date_from_dt = datetime.strptime(date_from, '%Y-%m-%d')
    date_to_dt = datetime.strptime(date_to, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
    
    # Получаем всех активных врачей
    doctors = await db.doctors.find({"is_active": True}).to_list(None)
    
    salary_data = []
    
    for doctor in doctors:
        doctor_id = doctor["id"]
        
        # 1. Выручка с записей на прием
        appointments_revenue = 0.0
        appointments_pipeline = [
            {
                "$match": {
                    "doctor_id": doctor_id,
                    "appointment_date": {"$gte": date_from_dt, "$lte": date_to_dt},
                    "status": "completed"
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total_appointments": {"$sum": 1},
                    "total_revenue": {
                        "$sum": {"$toDouble": {"$ifNull": ["$price", 0]}}
                    }
                }
            }
        ]
        
        appointment_stats = await db.appointments.aggregate(appointments_pipeline).to_list(1)
        total_appointments = appointment_stats[0]["total_appointments"] if appointment_stats else 0
        appointments_revenue = appointment_stats[0]["total_revenue"] if appointment_stats else 0.0
        
        # 2. Выручка с планов лечения (если у врача настроены услуги)
        treatment_plans_revenue = 0.0
        treatment_plans_salary = 0.0
        doctor_services = doctor.get("services", [])
        
        if doctor_services:
            # Обрабатываем режим оплаты врача
            payment_mode = doctor.get("payment_mode", "general")
            service_commissions = {}
            service_ids = []
            
            if doctor_services and len(doctor_services) > 0:
                if payment_mode == "individual" and isinstance(doctor_services[0], dict):
                    # Индивидуальный режим: массив объектов с настройками комиссий
                    for service_config in doctor_services:
                        service_id = service_config.get("service_id")
                        if service_id:
                            service_ids.append(service_id)
                            service_commissions[service_id] = {
                                "type": service_config.get("commission_type", "percentage"),
                                "value": service_config.get("commission_value", 0),
                                "currency": service_config.get("commission_currency", "KZT")
                            }
                else:
                    # Общий режим: массив строк (ID услуг) или старый формат
                    if isinstance(doctor_services[0], dict):
                        # Если данные в формате объектов, но режим общий - извлекаем только ID
                        service_ids = [s.get("service_id") for s in doctor_services if s.get("service_id")]
                    else:
                        # Старый формат: массив строк (ID услуг)
                        service_ids = doctor_services
                    
                    # Используем общие настройки врача для всех услуг
                    for service_id in service_ids:
                        service_commissions[service_id] = {
                            "type": doctor.get("payment_type", "percentage"),
                            "value": doctor.get("payment_value", 0),
                            "currency": doctor.get("currency", "KZT")
                        }
            
            if service_ids:
                # Получаем оплаченные планы лечения в периоде
                # Если payment_date пустая, используем created_at для фильтрации
                treatment_plans = await db.treatment_plans.find({
                    "payment_status": "paid",
                    "$or": [
                        {"payment_date": {"$gte": date_from_dt, "$lte": date_to_dt}},
                        {
                            "payment_date": {"$in": [None, ""]},
                            "created_at": {"$gte": date_from_dt, "$lte": date_to_dt}
                        }
                    ]
                }).to_list(None)
                
                for plan in treatment_plans:
                    # ВАЖНО: Проверяем, назначен ли план этому врачу
                    plan_doctor_id = plan.get("assigned_doctor_id") or plan.get("doctor_id")
                    
                    # Если план не назначен конкретному врачу, пропускаем его
                    # Это исправляет проблему с начислением комиссии всем врачам с одинаковыми услугами
                    if plan_doctor_id and plan_doctor_id != doctor_id:
                        continue
                    
                    # Если план не имеет назначенного врача, тоже пропускаем
                    # (чтобы избежать начисления всем врачам с этими услугами)
                    if not plan_doctor_id:
                        continue
                    
                    plan_services = plan.get("services", [])
                    # Рассчитываем долю врача в плане лечения
                    for service in plan_services:
                        # service_id может быть в разных полях в зависимости от версии
                        service_id = service.get("service_id") or service.get("id") or service.get("serviceId")
                        
                        # Проверяем есть ли эта услуга в списке услуг врача
                        if service_id and service_id in service_ids:
                            service_price = service.get("price", 0) * service.get("quantity", 1)
                            # Применяем скидку если есть
                            discount = service.get("discount", 0)
                            service_price = service_price * (1 - discount / 100)
                            treatment_plans_revenue += service_price
                            
                            # Рассчитываем комиссию для этой конкретной услуги
                            commission_config = service_commissions.get(service_id, {})
                            if commission_config.get("type") == "fixed":
                                # Фиксированная сумма за услугу
                                service_quantity = service.get("quantity", 1)
                                treatment_plans_salary += commission_config.get("value", 0) * service_quantity
                            else:
                                # Процент от стоимости услуги
                                commission_percent = commission_config.get("value", 0)
                                treatment_plans_salary += service_price * (commission_percent / 100)
        
        # 3. Общая выручка врача
        total_revenue = appointments_revenue + treatment_plans_revenue
        
        # 4. Расчет зарплаты за консультации
        consultations_salary = 0.0
        
        # Инициализируем переменные для избежания ошибок
        payment_type = doctor.get("payment_type", "percentage")
        payment_value = doctor.get("payment_value", 0.0)
        consultation_payment_type = doctor.get("consultation_payment_type", "percentage")
        consultation_payment_value = doctor.get("consultation_payment_value", 0.0)
        
        # Проверяем, есть ли у врача настройки комиссий за консультации
        has_consultation_settings = (
            doctor.get("consultation_payment_type") is not None or 
            doctor.get("consultation_payment_value", 0) > 0
        )
        
        if has_consultation_settings:
            # Используем настройки комиссий за консультации (переменные уже инициализированы выше)

            if consultation_payment_type == "hybrid":
                # Гибридный тип: фиксированная сумма + процент
                consultations_salary = (
                    (consultation_payment_value or 0) +  # fixed amount
                    appointments_revenue * ((doctor.get("consultation_hybrid_percentage_value", 0) or 0) / 100)
                )
            elif consultation_payment_type == "fixed":
                # Фиксированная сумма за каждую консультацию
                consultations_salary = consultation_payment_value * total_appointments
            else:
                # Процент от выручки консультаций
                consultations_salary = appointments_revenue * (consultation_payment_value / 100)
        else:
            # Если нет настроек комиссий за консультации, используем общие настройки врача
            # Это обеспечивает обратную совместимость для существующих врачей (переменные уже инициализированы выше)
            
            if payment_type == "fixed":
                # Фиксированная сумма за каждую консультацию (используем общую настройку)
                consultations_salary = payment_value * total_appointments if total_appointments > 0 else 0
            else:
                # Процент от выручки консультаций (используем общую настройку)
                consultations_salary = appointments_revenue * (payment_value / 100)
        
        # Если зарплата за планы лечения не была рассчитана выше (нет услуг), используем общую логику
        if not doctor_services and not has_consultation_settings:
            # Если нет ни услуг, ни настроек консультаций, используем старую логику для всей выручки (переменные уже инициализированы выше)

            if payment_type == "hybrid":
                # Гибридный тип: фиксированная сумма + процент от выручки
                consultations_salary = (
                    (payment_value or 0) +  # fixed amount
                    appointments_revenue * ((doctor.get("hybrid_percentage_value", 0) or 0) / 100)
                )
                treatment_plans_salary = (
                    (payment_value or 0) +  # fixed amount
                    treatment_plans_revenue * ((doctor.get("hybrid_percentage_value", 0) or 0) / 100)
                )
                calculated_salary = consultations_salary + treatment_plans_salary
            elif payment_type == "fixed":
                # В старой логике фиксированная сумма была за весь период
                calculated_salary = payment_value
                consultations_salary = 0  # Обнуляем, так как уже включено в общую сумму
                treatment_plans_salary = payment_value
            else:
                # В старой логике процент был от общей выручки
                total_salary_from_general = total_revenue * (payment_value / 100)
                # Распределяем пропорционально между консультациями и планами
                if total_revenue > 0:
                    consultation_ratio = appointments_revenue / total_revenue
                    treatment_ratio = treatment_plans_revenue / total_revenue
                    consultations_salary = total_salary_from_general * consultation_ratio
                    treatment_plans_salary = total_salary_from_general * treatment_ratio
                else:
                    consultations_salary = 0
                    treatment_plans_salary = 0
        
        
        # Общая зарплата (если не была рассчитана выше в старой логике)
        if not (not doctor_services and not has_consultation_settings and doctor.get("payment_type") == "fixed"):
            calculated_salary = treatment_plans_salary + consultations_salary
        
        
        # 5. Формируем данные врача
        salary_item = {
            "doctor_id": doctor_id,
            "doctor_name": doctor["full_name"],
            "doctor_specialty": doctor["specialty"],
            # Настройки оплаты за планы лечения
            "payment_type": payment_type,
            "payment_value": payment_value,
            "currency": doctor.get("currency", "KZT"),
            # Настройки оплаты за консультации
            "consultation_payment_type": consultation_payment_type,
            "consultation_payment_value": consultation_payment_value,
            "consultation_currency": doctor.get("consultation_currency", "KZT"),
            # Статистика
            "total_appointments": total_appointments,
            "completed_appointments": total_appointments,
            "appointments_revenue": appointments_revenue,
            "treatment_plans_revenue": treatment_plans_revenue,
            "total_revenue": total_revenue,
            # Детализация зарплаты по источникам
            "consultations_salary": consultations_salary,
            "treatment_plans_salary": treatment_plans_salary,
            "calculated_salary": calculated_salary,
            "total_salary": calculated_salary,  # Добавляем для совместимости с фронтендом
            "has_services": len(doctor_services) > 0,
            "services_count": len(doctor_services),
            # Детализация гибридных начислений
            "hybrid_fixed_amount": doctor.get("hybrid_fixed_amount", 0),
            "hybrid_percentage_value": doctor.get("hybrid_percentage_value", 0),
            "consultation_hybrid_fixed_amount": doctor.get("consultation_payment_value", 0),  # Фиксированная часть консультаций
            "consultation_hybrid_percentage_value": doctor.get("consultation_hybrid_percentage_value", 0)
        }
        
        salary_data.append(salary_item)
    
    # Сортируем по общей выручке
    salary_data.sort(key=lambda x: x["total_revenue"], reverse=True)
    
    # Общая статистика
    total_revenue = sum(item["total_revenue"] for item in salary_data)
    total_salary = sum(item["calculated_salary"] for item in salary_data)
    total_doctors = len(salary_data)
    
    return {
        "salary_data": salary_data,
        "summary": {
            "total_revenue": total_revenue,
            "total_salary": total_salary,
            "total_doctors": total_doctors,
            "date_from": date_from,
            "date_to": date_to,
            "salary_percentage": round((total_salary / total_revenue * 100) if total_revenue > 0 else 0, 2)
        }
    }

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
    
    # Автоматическое определение payment_mode на основе структуры services
    if "services" in update_dict and update_dict["services"] is not None:
        services = update_dict["services"]
        
        # Проверяем, есть ли индивидуальные комиссии
        has_individual_commissions = False
        if isinstance(services, list) and services:
            for service in services:
                if isinstance(service, dict) and ("commission_type" in service or "commission_value" in service):
                    has_individual_commissions = True
                    break
        
        # Устанавливаем payment_mode на основе структуры данных (игнорируем что пришло с фронтенда)
        update_dict["payment_mode"] = "individual" if has_individual_commissions else "general"
    
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

# Doctor Schedule endpoints
@api_router.post("/doctors/{doctor_id}/schedule", response_model=DoctorSchedule)
async def create_doctor_schedule(
    doctor_id: str,
    schedule: DoctorScheduleCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Create doctor's working schedule"""
    # Check if doctor exists
    doctor = await db.doctors.find_one({"id": doctor_id})
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
    
    schedule_dict = schedule.dict()
    schedule_dict["doctor_id"] = doctor_id  # Ensure doctor_id is set
    schedule_obj = DoctorSchedule(**schedule_dict)
    await db.doctor_schedules.insert_one(schedule_obj.dict())
    return schedule_obj

@api_router.get("/doctors/{doctor_id}/schedule", response_model=List[DoctorSchedule])
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

@api_router.put("/doctors/{doctor_id}/schedule/{schedule_id}", response_model=DoctorSchedule)
async def update_doctor_schedule(
    doctor_id: str,
    schedule_id: str,
    schedule_update: DoctorScheduleUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
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

@api_router.delete("/doctors/{doctor_id}/schedule/{schedule_id}")
async def delete_doctor_schedule(
    doctor_id: str,
    schedule_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Delete doctor's working schedule"""
    result = await db.doctor_schedules.update_one(
        {"id": schedule_id, "doctor_id": doctor_id}, 
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    return {"message": "Schedule deleted successfully"}

@api_router.get("/doctors/available/{appointment_date}", response_model=List[DoctorWithSchedule])
async def get_available_doctors(
    appointment_date: str,
    appointment_time: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get doctors available on a specific date and optionally time"""
    try:
        # Parse date to get day of week
        date_obj = datetime.strptime(appointment_date, "%Y-%m-%d")
        day_of_week = date_obj.weekday()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Get doctors with schedules for this day
    pipeline = [
        {"$match": {"is_active": True}},
        {
            "$lookup": {
                "from": "doctor_schedules",
                "localField": "id",
                "foreignField": "doctor_id",
                "as": "schedule"
            }
        },
        {
            "$match": {
                "schedule": {
                    "$elemMatch": {
                        "day_of_week": day_of_week,
                        "is_active": True
                    }
                }
            }
        }
    ]
    
    available_doctors = []
    doctors = await db.doctors.aggregate(pipeline).to_list(None)
    
    for doctor in doctors:
        # Filter schedule for the requested day
        day_schedules = [s for s in doctor["schedule"] if s["day_of_week"] == day_of_week and s["is_active"]]
        
        if appointment_time:
            # Check if appointment time is within working hours
            time_available = False
            try:
                appointment_time_obj = datetime.strptime(appointment_time, "%H:%M").time()
                for schedule in day_schedules:
                    start_time_obj = datetime.strptime(schedule["start_time"], "%H:%M").time()
                    end_time_obj = datetime.strptime(schedule["end_time"], "%H:%M").time()
                    if start_time_obj <= appointment_time_obj <= end_time_obj:
                        time_available = True
                        break
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM")
            
            if not time_available:
                continue
        
        doctor_with_schedule = DoctorWithSchedule(
            id=doctor["id"],
            full_name=doctor["full_name"],
            specialty=doctor["specialty"],
            phone=doctor.get("phone"),
            calendar_color=doctor["calendar_color"],
            is_active=doctor["is_active"],
            user_id=doctor.get("user_id"),
            created_at=doctor["created_at"],
            updated_at=doctor["updated_at"],
            schedule=[DoctorSchedule(**s) for s in day_schedules]
        )
        available_doctors.append(doctor_with_schedule)
    
    return available_doctors

# Service Price Directory endpoints
@api_router.get("/service-prices", response_model=List[ServicePrice])
async def get_service_prices(
    category: Optional[str] = None,
    active_only: bool = True,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get all service prices from directory"""
    filters = {}
    if active_only:
        filters["is_active"] = True
    if category:
        filters["category"] = category
    
    prices = await db.service_prices.find(filters).sort("category", 1).sort("service_name", 1).to_list(None)
    return [ServicePrice(**price) for price in prices]

@api_router.post("/service-prices", response_model=ServicePrice)
async def create_service_price(
    service_price: ServicePriceCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Create new service price"""
    # Check if service with same name already exists
    existing = await db.service_prices.find_one({
        "service_name": service_price.service_name,
        "is_active": True
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Service with this name already exists")
    
    price_dict = service_price.dict()
    price_obj = ServicePrice(**price_dict)
    await db.service_prices.insert_one(price_obj.dict())
    return price_obj

@api_router.put("/service-prices/{price_id}", response_model=ServicePrice)
async def update_service_price(
    price_id: str,
    service_price_update: ServicePriceUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Update service price"""
    update_dict = {k: v for k, v in service_price_update.dict().items() if v is not None}
    update_dict["updated_at"] = datetime.utcnow()
    
    result = await db.service_prices.update_one(
        {"id": price_id}, 
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Service price not found")
    
    updated_price = await db.service_prices.find_one({"id": price_id})
    return ServicePrice(**updated_price)

@api_router.delete("/service-prices/{price_id}")
async def delete_service_price(
    price_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Delete (deactivate) service price"""
    result = await db.service_prices.update_one(
        {"id": price_id}, 
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Service price not found")
    
    return {"message": "Service price deleted successfully"}

@api_router.get("/service-prices/categories")
async def get_service_categories(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get all service categories"""
    categories = await db.service_prices.distinct("category", {"is_active": True, "category": {"$ne": None}})
    return {"categories": categories}

# Service Categories Management
@api_router.get("/service-categories", response_model=List[ServiceCategory])
async def get_categories(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get all service categories"""
    categories = await db.service_categories.find({"is_active": True}).to_list(None)
    return categories

@api_router.post("/service-categories", response_model=ServiceCategory)
async def create_category(
    category: ServiceCategoryCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Create new service category"""
    # Check if category name already exists
    existing = await db.service_categories.find_one({"name": category.name, "is_active": True})
    if existing:
        raise HTTPException(status_code=400, detail="Category with this name already exists")
    
    category_data = ServiceCategory(**category.dict())
    await db.service_categories.insert_one(category_data.dict())
    return category_data

@api_router.put("/service-categories/{category_id}", response_model=ServiceCategory)
async def update_category(
    category_id: str,
    category_update: ServiceCategoryUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Update service category"""
    existing = await db.service_categories.find_one({"id": category_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check if new name already exists (if name is being updated)
    if category_update.name and category_update.name != existing["name"]:
        name_exists = await db.service_categories.find_one({"name": category_update.name, "is_active": True, "id": {"$ne": category_id}})
        if name_exists:
            raise HTTPException(status_code=400, detail="Category with this name already exists")
    
    update_data = {k: v for k, v in category_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    result = await db.service_categories.update_one(
        {"id": category_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    
    updated_category = await db.service_categories.find_one({"id": category_id})
    return ServiceCategory(**updated_category)

@api_router.delete("/service-categories/{category_id}")
async def delete_category(
    category_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Delete (deactivate) service category"""
    # Check if category is used by any services
    services_count = await db.service_prices.count_documents({"category": {"$exists": True}, "is_active": True})
    category = await db.service_categories.find_one({"id": category_id})
    if category and services_count > 0:
        # Check if this specific category is used
        used_count = await db.service_prices.count_documents({"category": category["name"], "is_active": True})
        if used_count > 0:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot delete category '{category['name']}' because it is used by {used_count} services"
            )
    
    result = await db.service_categories.update_one(
        {"id": category_id}, 
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    
    return {"message": "Category deleted successfully"}

# Specialties Management
@api_router.get("/specialties", response_model=List[Specialty])
async def get_specialties(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get all active specialties"""
    specialties = await db.specialties.find({"is_active": True}).to_list(None)
    return specialties

@api_router.post("/specialties", response_model=Specialty)
async def create_specialty(
    specialty: SpecialtyCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Create new specialty"""
    # Check if specialty name already exists
    existing = await db.specialties.find_one({"name": specialty.name, "is_active": True})
    if existing:
        raise HTTPException(status_code=400, detail="Specialty with this name already exists")
    
    specialty_data = Specialty(**specialty.dict())
    await db.specialties.insert_one(specialty_data.dict())
    return specialty_data

@api_router.put("/specialties/{specialty_id}", response_model=Specialty)
async def update_specialty(
    specialty_id: str,
    specialty_update: SpecialtyUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Update specialty"""
    existing = await db.specialties.find_one({"id": specialty_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Specialty not found")
    
    # Check if new name already exists (if name is being updated)
    if specialty_update.name and specialty_update.name != existing["name"]:
        name_exists = await db.specialties.find_one({"name": specialty_update.name, "is_active": True, "id": {"$ne": specialty_id}})
        if name_exists:
            raise HTTPException(status_code=400, detail="Specialty with this name already exists")
    
    update_data = {k: v for k, v in specialty_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    result = await db.specialties.update_one(
        {"id": specialty_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Specialty not found")
    
    updated_specialty = await db.specialties.find_one({"id": specialty_id})
    return Specialty(**updated_specialty)

@api_router.delete("/specialties/{specialty_id}")
async def delete_specialty(
    specialty_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Delete (deactivate) specialty"""
    # Check if specialty is used by any doctors
    doctors_count = await db.doctors.count_documents({"specialty": {"$exists": True}, "is_active": True})
    specialty = await db.specialties.find_one({"id": specialty_id})
    if specialty and doctors_count > 0:
        # Check if this specific specialty is used
        used_count = await db.doctors.count_documents({"specialty": specialty["name"], "is_active": True})
        if used_count > 0:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot delete specialty '{specialty['name']}' because it is used by {used_count} doctors"
            )
    
    result = await db.specialties.update_one(
        {"id": specialty_id}, 
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Specialty not found")
    
    return {"message": "Specialty deleted successfully"}

# Payment Types Management
@api_router.get("/payment-types", response_model=List[PaymentType])
async def get_payment_types(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get all active payment types"""
    payment_types = await db.payment_types.find({"is_active": True}).to_list(None)
    return payment_types

@api_router.post("/payment-types", response_model=PaymentType)
async def create_payment_type(
    payment_type: PaymentTypeCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Create new payment type"""
    # Check if payment type name already exists
    existing = await db.payment_types.find_one({"name": payment_type.name, "is_active": True})
    if existing:
        raise HTTPException(status_code=400, detail="Payment type with this name already exists")
    
    payment_type_data = PaymentType(**payment_type.dict())
    await db.payment_types.insert_one(payment_type_data.dict())
    return payment_type_data

@api_router.put("/payment-types/{payment_type_id}", response_model=PaymentType)
async def update_payment_type(
    payment_type_id: str,
    payment_type_update: PaymentTypeUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Update payment type"""
    existing = await db.payment_types.find_one({"id": payment_type_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Payment type not found")
    
    # Check if new name already exists (if name is being updated)
    if payment_type_update.name and payment_type_update.name != existing["name"]:
        name_exists = await db.payment_types.find_one({"name": payment_type_update.name, "is_active": True, "id": {"$ne": payment_type_id}})
        if name_exists:
            raise HTTPException(status_code=400, detail="Payment type with this name already exists")
    
    update_data = {k: v for k, v in payment_type_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    result = await db.payment_types.update_one(
        {"id": payment_type_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Payment type not found")
    
    updated_payment_type = await db.payment_types.find_one({"id": payment_type_id})
    return PaymentType(**updated_payment_type)

@api_router.delete("/payment-types/{payment_type_id}")
async def delete_payment_type(
    payment_type_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Delete (deactivate) payment type"""
    result = await db.payment_types.update_one(
        {"id": payment_type_id}, 
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Payment type not found")
    
    return {"message": "Payment type deleted successfully"}

# Appointment endpoints moved to routers/appointments.py

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
        assigned_doctor_id=plan_data.assigned_doctor_id,  # Добавляем назначенного врача
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

802# Treatment Plan Statistics endpoints (must be before parameterized routes)
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
        
        # Financial calculations with proper null handling
        plan_total_cost = plan.get('total_cost', 0) or 0
        plan_paid_amount = plan.get('paid_amount', 0) or 0
        
        # Ensure non-negative values
        if plan_total_cost < 0:
            plan_total_cost = 0
        if plan_paid_amount < 0:
            plan_paid_amount = 0
            
        total_cost += plan_total_cost
        total_paid += plan_paid_amount
    
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
            
            # Safe calculations for monthly stats
            month_total_cost = plan.get('total_cost', 0) or 0
            month_paid_amount = plan.get('paid_amount', 0) or 0
            
            if month_total_cost < 0:
                month_total_cost = 0
            if month_paid_amount < 0:
                month_paid_amount = 0
                
            monthly_stats[month_key]['total_cost'] += month_total_cost
            monthly_stats[month_key]['paid_amount'] += month_paid_amount
            
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
            "outstanding_amount": max(0, total_cost - total_paid),
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
            "outstanding_revenue": max(0, total_cost - total_paid)
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
                "total_cost": {"$sum": {"$ifNull": ["$total_cost", 0]}},
                "total_paid": {"$sum": {"$ifNull": ["$paid_amount", 0]}},
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
                "outstanding_amount": {
                    "$max": [0, {"$subtract": ["$total_cost", "$total_paid"]}]
                },
                "unpaid_plans": 1,
                "completion_rate": {
                    "$multiply": [
                        {"$cond": {
                            "if": {"$eq": ["$total_plans", 0]},
                            "then": 0,
                            "else": {"$divide": ["$completed_plans", "$total_plans"]}
                        }},
                        100
                    ]
                },
                "no_show_rate": {
                    "$multiply": [
                        {"$cond": {
                            "if": {"$eq": ["$total_plans", 0]},
                            "then": 0,
                            "else": {"$divide": ["$no_show_plans", "$total_plans"]}
                        }},
                        100
                    ]
                },
                "collection_rate": {
                    "$multiply": [
                        {"$cond": {
                            "if": {"$eq": ["$total_cost", 0]},
                            "then": 0,
                            "else": {"$divide": ["$total_paid", "$total_cost"]}
                        }},
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
    
    # Автоматическая синхронизация с CRM при изменении статуса оплаты
    if "payment_status" in update_dict or "paid_amount" in update_dict:
        try:
            from backend.crm.services.integration_service import IntegrationService
            integration_service = IntegrationService(db)
            
            await integration_service.sync_treatment_plan_payment(
                treatment_plan_id=updated_plan["id"],
                patient_id=updated_plan["patient_id"],
                payment_status=updated_plan["payment_status"],
                paid_amount=updated_plan.get("paid_amount", 0.0),
                total_cost=updated_plan.get("total_cost", 0.0),
                plan_title=updated_plan["title"]
            )
            
            logger.info(f"Автоматическая синхронизация с CRM для плана {plan_id} выполнена")
            
        except Exception as e:
            logger.error(f"Ошибка синхронизации с CRM для плана {plan_id}: {str(e)}")
            # Не прерываем выполнение, только логируем ошибку
    
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

# Root endpoint
@app.get("/")
async def root():
    return {"message": "Medical CRM API is running"}

# Remove the global OPTIONS handler - CORS middleware should handle this

# Room Directory endpoints
@api_router.get("/rooms", response_model=List[Room])
async def get_rooms(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get all active rooms"""
    try:
        rooms = await db.rooms.find({"is_active": True}).sort("name", 1).to_list(1000)
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

@api_router.post("/rooms", response_model=Room)
async def create_room(
    room_data: RoomCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Create new room"""
    # Check if room with same name already exists
    existing = await db.rooms.find_one({
        "name": room_data.name,
        "is_active": True
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Room with this name already exists")
    
    room_obj = Room(**room_data.dict())
    await db.rooms.insert_one(room_obj.dict())
    logger.info(f"Room created: {room_obj.name}")
    return room_obj

@api_router.put("/rooms/{room_id}", response_model=Room)
async def update_room(
    room_id: str,
    room_update: RoomUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Update room"""
    existing_room = await db.rooms.find_one({"id": room_id})
    if not existing_room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    update_data = {k: v for k, v in room_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    await db.rooms.update_one(
        {"id": room_id},
        {"$set": update_data}
    )
    
    updated_room = await db.rooms.find_one({"id": room_id})
    logger.info(f"Room updated: {updated_room['name']}")
    return Room(**updated_room)

@api_router.delete("/rooms/{room_id}")
async def delete_room(
    room_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Delete room (soft delete)"""
    # Check if room has any schedules
    schedules_count = await db.room_schedules.count_documents({"room_id": room_id, "is_active": True})
    if schedules_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete room: it has active schedules")
    
    # Check if room has any appointments
    appointments_count = await db.appointments.count_documents({"room_id": room_id})
    if appointments_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete room: it has appointments")
    
    await db.rooms.update_one(
        {"id": room_id},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    logger.info(f"Room deleted: {room_id}")
    return {"message": "Room deleted successfully"}

# Room Schedule endpoints
@api_router.get("/rooms/{room_id}/schedule", response_model=List[RoomSchedule])
async def get_room_schedule(
    room_id: str,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get schedule for a specific room"""
    schedules = await db.room_schedules.find(
        {"room_id": room_id, "is_active": True}
    ).sort("day_of_week", 1).to_list(1000)
    return [RoomSchedule(**schedule) for schedule in schedules]

@api_router.post("/rooms/{room_id}/schedule", response_model=RoomSchedule)
async def create_room_schedule(
    room_id: str,
    schedule_data: RoomScheduleCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Create room schedule entry"""
    # Verify room exists
    room = await db.rooms.find_one({"id": room_id, "is_active": True})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Verify doctor exists
    doctor = await db.doctors.find_one({"id": schedule_data.doctor_id, "is_active": True})
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
    
    logger.info(f"Room schedule created: Room {room_id}, Doctor {schedule_data.doctor_id}")
    return schedule_obj

@api_router.put("/room-schedules/{schedule_id}", response_model=RoomSchedule)
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
    logger.info(f"Room schedule updated: {schedule_id}")
    return RoomSchedule(**updated_schedule)

@api_router.delete("/room-schedules/{schedule_id}")
async def delete_room_schedule(
    schedule_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Delete room schedule entry"""
    await db.room_schedules.update_one(
        {"id": schedule_id},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    logger.info(f"Room schedule deleted: {schedule_id}")
    return {"message": "Room schedule deleted successfully"}

@api_router.get("/rooms-with-schedule", response_model=List[RoomWithSchedule])
async def get_rooms_with_schedule(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get all rooms with their schedules"""
    try:
        rooms = await db.rooms.find({"is_active": True}).sort("name", 1).to_list(1000)
        rooms_with_schedule = []
        
        for room in rooms:
            try:
                # Get schedules for this room
                schedules = await db.room_schedules.find(
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

# Helper endpoint to find available doctor for a room at specific time
@api_router.get("/rooms/{room_id}/available-doctor")
async def get_available_doctor_for_room(
    room_id: str,
    day_of_week: int,
    time: str,  # HH:MM format
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Find which doctor is available in the room at specific day and time"""
    # Find schedule entry that matches the criteria
    schedule = await db.room_schedules.find_one({
        "room_id": room_id,
        "day_of_week": day_of_week,
        "start_time": {"$lte": time},
        "end_time": {"$gt": time},
        "is_active": True
    })
    
    if not schedule:
        raise HTTPException(status_code=404, detail="No doctor available at this time")
    
    # Get doctor details
    doctor = await db.doctors.find_one({"id": schedule["doctor_id"], "is_active": True})
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    
    return {
        "doctor_id": doctor["id"],
        "doctor_name": doctor["full_name"],
        "doctor_specialty": doctor["specialty"],
        "schedule_id": schedule["id"],
        "start_time": schedule["start_time"],
        "end_time": schedule["end_time"]
    }

# Include modular routers
from routers.auth import auth_router
from routers.patients import patients_router, Patient, PatientCreate, PatientUpdate 
from routers.doctors import doctors_router
from routers.appointments import appointments_router

# Include all API routers with /api prefix
app.include_router(auth_router, prefix="/api")
app.include_router(patients_router, prefix="/api")
app.include_router(doctors_router, prefix="/api") 
app.include_router(appointments_router, prefix="/api")
# rooms_router removed - rooms endpoints are in api_router

# Keep legacy api_router for any remaining endpoints
app.include_router(api_router)

# Include the CRM router
from crm import crm_router
app.include_router(crm_router, prefix="/api/crm")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Database shutdown is now handled in lifespan context manager

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host="127.0.0.1",
        port=8001,
        reload=True,
        log_level="info"
    )
