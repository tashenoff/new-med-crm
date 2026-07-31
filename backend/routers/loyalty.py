"""
Loyalty Router Module

API endpoints for patient bonus system and doctor cashback.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime

from models.auth import UserInDB, UserRole
from models.loyalty import (
    LoyaltySettings,
    LoyaltySettingsUpdate,
    BonusTransaction,
    PatientBonusInfo,
    BonusPaymentCalculation,
    DoctorCashbackInfo,
    DoctorCashbackTransaction,
    LabServiceCashback,
    LabServiceCashbackCreate,
    LabServiceCashbackUpdate
)
from services.loyalty_service import LoyaltyService
from dependencies import get_current_active_user, require_role
from database import db

loyalty_router = APIRouter(prefix="/loyalty", tags=["Loyalty"])


# ===== BONUS SETTINGS ENDPOINTS =====

@loyalty_router.get("/settings", response_model=LoyaltySettings)
async def get_loyalty_settings(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get current loyalty program settings"""
    service = LoyaltyService(db)
    return await service.get_or_create_settings()


@loyalty_router.put("/settings", response_model=LoyaltySettings)
async def update_loyalty_settings(
    settings_update: LoyaltySettingsUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """Update loyalty program settings (Admin only)"""
    service = LoyaltyService(db)
    update_data = {k: v for k, v in settings_update.dict().items() if v is not None}
    return await service.update_settings(update_data)


# ===== PATIENT BONUS ENDPOINTS =====

@loyalty_router.get("/bonus/patient/{patient_id}", response_model=PatientBonusInfo)
async def get_patient_bonus(
    patient_id: str,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get patient bonus information"""
    # Patients can only see their own bonus info
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    service = LoyaltyService(db)
    try:
        return await service.get_patient_bonus_info(patient_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@loyalty_router.post("/bonus/calculate", response_model=BonusPaymentCalculation)
async def calculate_bonus_payment(
    patient_id: str,
    total_amount: float,
    requested_bonus: float,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Calculate how much bonus can be used for a payment"""
    # Only admin and doctor can calculate bonus payments
    if current_user.role not in [UserRole.ADMIN, UserRole.DOCTOR]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    service = LoyaltyService(db)
    try:
        return await service.calculate_bonus_payment(patient_id, total_amount, requested_bonus)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@loyalty_router.get("/bonus/patient/{patient_id}/history", response_model=List[BonusTransaction])
async def get_patient_bonus_history(
    patient_id: str,
    limit: int = 50,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get patient bonus transaction history"""
    # Patients can only see their own history
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    service = LoyaltyService(db)
    return await service.get_patient_bonus_history(patient_id, limit)


# ===== DOCTOR CASHBACK ENDPOINTS =====

@loyalty_router.get("/cashback/doctor/{doctor_id}", response_model=DoctorCashbackInfo)
async def get_doctor_cashback(
    doctor_id: str,
    include_transactions: bool = True,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get doctor cashback information"""
    # Doctors can only see their own cashback info
    if current_user.role == UserRole.DOCTOR and current_user.doctor_id != doctor_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    service = LoyaltyService(db)
    try:
        return await service.get_doctor_cashback_info(doctor_id, include_transactions)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@loyalty_router.get("/cashback/doctor/{doctor_id}/history", response_model=List[DoctorCashbackTransaction])
async def get_doctor_cashback_history(
    doctor_id: str,
    limit: int = 50,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get doctor cashback transaction history"""
    # Doctors can only see their own history
    if current_user.role == UserRole.DOCTOR and current_user.doctor_id != doctor_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    service = LoyaltyService(db)
    return await service.get_doctor_cashback_history(doctor_id, limit)


# ===== LAB SERVICE CASHBACK SETTINGS ENDPOINTS =====

@loyalty_router.get("/cashback/services", response_model=List[LabServiceCashback])
async def get_all_lab_services_cashback(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get all lab services with cashback settings"""
    service = LoyaltyService(db)
    return await service.get_all_lab_services_cashback()


@loyalty_router.get("/cashback/service/{service_id}", response_model=Optional[LabServiceCashback])
async def get_lab_service_cashback(
    service_id: str,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get cashback settings for a specific lab service"""
    service = LoyaltyService(db)
    result = await service.get_lab_service_cashback(service_id)
    if not result:
        raise HTTPException(status_code=404, detail="Lab service cashback settings not found")
    return result


@loyalty_router.post("/cashback/service", response_model=LabServiceCashback)
async def create_lab_service_cashback(
    cashback_create: LabServiceCashbackCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """Create or update cashback settings for a lab service (Admin only)"""
    service = LoyaltyService(db)
    return await service.create_lab_service_cashback(
        service_id=cashback_create.service_id,
        service_name=cashback_create.service_name,
        cashback_rate=cashback_create.cashback_rate
    )


@loyalty_router.put("/cashback/service/{service_id}", response_model=LabServiceCashback)
async def update_lab_service_cashback(
    service_id: str,
    cashback_update: LabServiceCashbackUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """Update cashback settings for a lab service (Admin only)"""
    service = LoyaltyService(db)
    update_data = {k: v for k, v in cashback_update.dict().items() if v is not None}
    result = await service.update_lab_service_cashback(service_id, update_data)
    if not result:
        raise HTTPException(status_code=404, detail="Lab service cashback settings not found")
    return result


@loyalty_router.delete("/cashback/service/{service_id}")
async def delete_lab_service_cashback(
    service_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """Deactivate cashback settings for a lab service (Admin only)"""
    service = LoyaltyService(db)
    result = await service.update_lab_service_cashback(service_id, {"is_active": False})
    if not result:
        raise HTTPException(status_code=404, detail="Lab service cashback settings not found")
    return {"message": "Lab service cashback deactivated successfully"}
