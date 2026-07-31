from dotenv import load_dotenv
import os
from pathlib import Path

# Load environment variables FIRST
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter
from contextlib import asynccontextmanager
from fastapi.security import HTTPBearer
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
import logging
from passlib.context import CryptContext

# Import database
from database import db, client, close_database

# Import models from new modules
from models.auth import UserRole, User, UserInDB, UserCreate, UserLogin, Token, TokenData
from models.doctor import Doctor, DoctorCreate, DoctorUpdate
from models.room import Room, RoomCreate, RoomUpdate
from models.services import ServicePrice, ServiceCategory, Specialty, Service
from models.appointment import Appointment, AppointmentCreate, AppointmentUpdate
from models.payment import PaymentType, PaymentTypeCreate, PaymentTypeUpdate
from models.document import Document
from models.treatment_plan import TreatmentPlan

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

# Create the main app
app = FastAPI(lifespan=lifespan, redirect_slashes=False)

# Add CORS middleware first (before any routes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:3000", 
    "http://127.0.0.1:3000", 
    "http://localhost:3001",
    "http://localhost:5173",
    "http://172.19.7.60:5173",
    "http://89.218.15.72:5173",
        "https://app.emergent.sh",
        "https://medicodebase.preview.emergentagent.com",
        "https://*.emergentagent.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Create uploads directory and mount static files
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Root endpoint
@app.get("/")
async def root():
    return {"message": "Medical CRM API is running"}

# Import and include all routers
from routers.auth import auth_router
from routers.patients import patients_router
from routers.doctors import doctors_router
from routers.appointments import appointments_router
from routers.rooms import rooms_router
from routers.documents import documents_router
from routers.treatment_plans import treatment_plans_router
from routers.services_router import services_api_router
from routers.directories import directories_router
from routers.materials import materials_router
from routers.insights import insights_router
from routers.chat import chat_router
from routers.inventory import inventory_router
from routers.loyalty import loyalty_router
from routers.consultations import router as consultations_router
from routers.wazzup import router as wazzup_router
from routers.notification_rules import router as notification_rules_router
from routers.laboratories import laboratories_router
from routers.staff import router as staff_router

# Include all API routers with /api prefix
app.include_router(auth_router, prefix="/api")
app.include_router(patients_router, prefix="/api")
app.include_router(doctors_router, prefix="/api")
app.include_router(appointments_router, prefix="/api")
app.include_router(rooms_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(treatment_plans_router, prefix="/api")
app.include_router(services_api_router, prefix="/api")
app.include_router(directories_router, prefix="/api")
app.include_router(materials_router, prefix="/api")
app.include_router(insights_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(inventory_router, prefix="/api")
app.include_router(loyalty_router, prefix="/api")
app.include_router(consultations_router)
app.include_router(wazzup_router)
app.include_router(notification_rules_router)
app.include_router(laboratories_router)
app.include_router(staff_router)

# Include the CRM router
from crm import crm_router
app.include_router(crm_router, prefix="/api/crm")

# Special compatibility endpoints for frontend
from fastapi import Depends
from typing import List
from models.room import RoomWithSchedule, RoomSchedule
from routers.auth import get_current_active_user, require_role

@app.get("/api/rooms-with-schedule", response_model=List[RoomWithSchedule], tags=["Rooms"])
async def get_rooms_with_schedule_compat(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get all rooms with schedules - compatibility endpoint"""
    from services.room_service import RoomService
    service = RoomService(db)
    return await service.get_rooms_with_schedule()

@app.delete("/api/room-schedules/{schedule_id}", tags=["Rooms"])
async def delete_room_schedule_compat(
    schedule_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN]))
):
    """Delete room schedule - compatibility endpoint"""
    from datetime import datetime
    result = await db.room_schedules.update_one(
        {"id": schedule_id},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    return {"message": "Room schedule deleted successfully"}

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
