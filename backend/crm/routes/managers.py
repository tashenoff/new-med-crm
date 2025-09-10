"""
Managers Routes - API маршруты для работы с менеджерами
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..services.manager_service import ManagerService
from ..schemas.manager_schemas import ManagerCreate, ManagerUpdate, ManagerResponse
from ..models.manager import ManagerStatus, ManagerRole

from ..dependencies import get_database

managers_router = APIRouter(prefix="/managers", tags=["Managers"])


@managers_router.post("/", response_model=ManagerResponse)
async def create_manager(
    manager_data: ManagerCreate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Создать нового менеджера"""
    try:
        manager_service = ManagerService(db)
        manager = await manager_service.create_manager(manager_data)
        return ManagerResponse(**manager.dict())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@managers_router.get("/", response_model=List[ManagerResponse])
async def get_managers(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[ManagerStatus] = Query(None),
    role: Optional[ManagerRole] = Query(None),
    department: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить список менеджеров"""
    try:
        manager_service = ManagerService(db)
        managers = await manager_service.get_managers(
            skip=skip, 
            limit=limit, 
            status=status, 
            role=role, 
            department=department
        )
        return [ManagerResponse(**manager.dict()) for manager in managers]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@managers_router.get("/available", response_model=List[ManagerResponse])
async def get_available_managers(
    specialization: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить доступных менеджеров для назначения"""
    try:
        manager_service = ManagerService(db)
        managers = await manager_service.get_available_managers(specialization)
        return [ManagerResponse(**manager.dict()) for manager in managers]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@managers_router.get("/{manager_id}", response_model=ManagerResponse)
async def get_manager(
    manager_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить менеджера по ID"""
    manager_service = ManagerService(db)
    manager = await manager_service.get_manager_by_id(manager_id)
    
    if not manager:
        raise HTTPException(status_code=404, detail="Менеджер не найден")
    
    return ManagerResponse(**manager.dict())


@managers_router.put("/{manager_id}", response_model=ManagerResponse)
async def update_manager(
    manager_id: str,
    update_data: ManagerUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Обновить менеджера"""
    try:
        manager_service = ManagerService(db)
        manager = await manager_service.update_manager(manager_id, update_data)
        
        if not manager:
            raise HTTPException(status_code=404, detail="Менеджер не найден")
        
        return ManagerResponse(**manager.dict())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
