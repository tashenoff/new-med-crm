"""
Laboratories router - HTTP endpoints for laboratory operations
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional

from models.laboratory import Laboratory, LaboratoryCreate, LaboratoryUpdate
from models.auth import UserInDB, UserRole
from routers.auth import get_current_active_user, require_role
from database import db
from services.laboratory_service import LaboratoryService

# Router
laboratories_router = APIRouter(tags=["Laboratories"], prefix="/api/laboratories")


# Dependency to get service
def get_laboratory_service():
    return LaboratoryService(db)


@laboratories_router.get("", response_model=List[Laboratory])
async def get_laboratories(
    active_only: bool = True,
    current_user: UserInDB = Depends(get_current_active_user),
    service: LaboratoryService = Depends(get_laboratory_service)
):
    """Get all laboratories"""
    return await service.get_laboratories(active_only)


@laboratories_router.get("/{laboratory_id}", response_model=Laboratory)
async def get_laboratory(
    laboratory_id: str,
    current_user: UserInDB = Depends(get_current_active_user),
    service: LaboratoryService = Depends(get_laboratory_service)
):
    """Get laboratory by ID"""
    return await service.get_laboratory(laboratory_id)


@laboratories_router.post("", response_model=Laboratory)
async def create_laboratory(
    laboratory: LaboratoryCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN])),
    service: LaboratoryService = Depends(get_laboratory_service)
):
    """Create new laboratory (admin only)"""
    return await service.create_laboratory(laboratory)


@laboratories_router.put("/{laboratory_id}", response_model=Laboratory)
async def update_laboratory(
    laboratory_id: str,
    laboratory_update: LaboratoryUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN])),
    service: LaboratoryService = Depends(get_laboratory_service)
):
    """Update laboratory (admin only)"""
    return await service.update_laboratory(laboratory_id, laboratory_update)


@laboratories_router.delete("/{laboratory_id}")
async def delete_laboratory(
    laboratory_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN])),
    service: LaboratoryService = Depends(get_laboratory_service)
):
    """Delete (deactivate) laboratory (admin only)"""
    return await service.delete_laboratory(laboratory_id)


@laboratories_router.get("/statistics/all")
async def get_laboratory_statistics(
    laboratory_id: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_active_user),
    service: LaboratoryService = Depends(get_laboratory_service)
):
    """Get statistics for laboratories"""
    return await service.get_laboratory_statistics(laboratory_id)
