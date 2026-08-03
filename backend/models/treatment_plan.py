from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import uuid


class TreatmentPlan(BaseModel):
    """Treatment plan model for patients"""
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
    doctor_name: Optional[str] = None  # Имя врача, составившего план (получается из description или lookup)
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
    """Schema for creating treatment plan"""
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
    """Schema for updating treatment plan"""
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
