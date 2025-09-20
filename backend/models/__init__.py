"""
Models package for the medical CRM application.

This package contains all Pydantic models organized by domain:
- auth: Authentication and user management models
- doctor: Doctor and doctor schedule models
- room: Room and room schedule models
- services: Service pricing, categories, and specialties models
- appointment: Appointment and appointment scheduling models
- (other domain models can be added here in the future)
"""

from .auth import (
    UserRole,
    User,
    UserInDB,
    UserCreate,
    UserLogin,
    Token,
    TokenData
)

from .doctor import (
    PaymentType,
    Doctor,
    DoctorCreate,
    DoctorUpdate,
    DoctorSchedule,
    DoctorScheduleCreate,
    DoctorScheduleUpdate,
    DoctorWithSchedule
)

from .room import (
    Room,
    RoomCreate,
    RoomUpdate,
    RoomSchedule,
    RoomScheduleCreate,
    RoomScheduleUpdate,
    RoomWithSchedule
)

from .services import (
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

from .appointment import (
    AppointmentStatus,
    Appointment,
    AppointmentCreate,
    AppointmentUpdate,
    AppointmentWithDetails
)

__all__ = [
    # Auth models
    "UserRole",
    "User", 
    "UserInDB",
    "UserCreate",
    "UserLogin",
    "Token",
    "TokenData",
    # Doctor models
    "PaymentType",
    "Doctor",
    "DoctorCreate", 
    "DoctorUpdate",
    "DoctorSchedule",
    "DoctorScheduleCreate",
    "DoctorScheduleUpdate",
    "DoctorWithSchedule",
    # Room models
    "Room",
    "RoomCreate",
    "RoomUpdate",
    "RoomSchedule",
    "RoomScheduleCreate",
    "RoomScheduleUpdate",
    "RoomWithSchedule",
    # Service models
    "ServiceCategory",
    "ServiceCategoryCreate",
    "ServiceCategoryUpdate",
    "Specialty",
    "SpecialtyCreate",
    "SpecialtyUpdate",
    "ServicePrice",
    "ServicePriceCreate",
    "ServicePriceUpdate",
    "Service",
    "ServiceCreate"
]
