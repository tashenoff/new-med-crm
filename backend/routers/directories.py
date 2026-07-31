"""
Directories router - HTTP endpoints for reference directories
Handles service categories, specialties, and payment types
"""
from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
from datetime import datetime

# Import models
from models.services import (
    ServiceCategory,
    ServiceCategoryCreate,
    ServiceCategoryUpdate,
    Specialty,
    SpecialtyCreate,
    SpecialtyUpdate
)
from models.payment import PaymentType, PaymentTypeCreate, PaymentTypeUpdate

# Import auth dependencies
from models.auth import UserInDB, UserRole
from routers.auth import get_current_active_user, require_role
from database import db

# Router
directories_router = APIRouter(tags=["Directories"])


# ============================================================================
# Service Categories Endpoints
# ============================================================================

@directories_router.get("/service-categories", response_model=List[ServiceCategory])
async def get_categories(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get all service categories"""
    categories = await db.service_categories.find({"is_active": True}).to_list(None)
    return categories


@directories_router.post("/service-categories", response_model=ServiceCategory)
async def create_category(
    category: ServiceCategoryCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """Create new service category"""
    # Check if category name already exists
    existing = await db.service_categories.find_one({"name": category.name, "is_active": True})
    if existing:
        raise HTTPException(status_code=400, detail="Category with this name already exists")
    
    category_data = ServiceCategory(**category.dict())
    await db.service_categories.insert_one(category_data.dict())
    return category_data


@directories_router.put("/service-categories/{category_id}", response_model=ServiceCategory)
async def update_category(
    category_id: str,
    category_update: ServiceCategoryUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
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


@directories_router.delete("/service-categories/{category_id}")
async def delete_category(
    category_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """Delete (deactivate) service category"""
    # Check if category is used by any services
    category = await db.service_categories.find_one({"id": category_id})
    if category:
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


# ============================================================================
# Specialties Endpoints
# ============================================================================

@directories_router.get("/specialties", response_model=List[Specialty])
async def get_specialties(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get all active specialties"""
    specialties = await db.specialties.find({"is_active": True}).to_list(None)
    return specialties


@directories_router.post("/specialties", response_model=Specialty)
async def create_specialty(
    specialty: SpecialtyCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """Create new specialty"""
    # Check if specialty name already exists
    existing = await db.specialties.find_one({"name": specialty.name, "is_active": True})
    if existing:
        raise HTTPException(status_code=400, detail="Specialty with this name already exists")
    
    specialty_data = Specialty(**specialty.dict())
    await db.specialties.insert_one(specialty_data.dict())
    return specialty_data


@directories_router.put("/specialties/{specialty_id}", response_model=Specialty)
async def update_specialty(
    specialty_id: str,
    specialty_update: SpecialtyUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
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


@directories_router.delete("/specialties/{specialty_id}")
async def delete_specialty(
    specialty_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """Delete (deactivate) specialty"""
    # Check if specialty is used by any doctors
    specialty = await db.specialties.find_one({"id": specialty_id})
    if specialty:
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


# ============================================================================
# Payment Types Endpoints
# ============================================================================

@directories_router.get("/payment-types", response_model=List[PaymentType])
async def get_payment_types(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Get all active payment types"""
    payment_types = await db.payment_types.find({"is_active": True}).to_list(None)
    return payment_types


@directories_router.post("/payment-types", response_model=PaymentType)
async def create_payment_type(
    payment_type: PaymentTypeCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """Create new payment type"""
    # Check if payment type name already exists
    existing = await db.payment_types.find_one({"name": payment_type.name, "is_active": True})
    if existing:
        raise HTTPException(status_code=400, detail="Payment type with this name already exists")
    
    payment_type_data = PaymentType(**payment_type.dict())
    await db.payment_types.insert_one(payment_type_data.dict())
    return payment_type_data


@directories_router.put("/payment-types/{payment_type_id}", response_model=PaymentType)
async def update_payment_type(
    payment_type_id: str,
    payment_type_update: PaymentTypeUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
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


@directories_router.delete("/payment-types/{payment_type_id}")
async def delete_payment_type(
    payment_type_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """Delete (deactivate) payment type"""
    result = await db.payment_types.update_one(
        {"id": payment_type_id}, 
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Payment type not found")
    
    return {"message": "Payment type deleted successfully"}
