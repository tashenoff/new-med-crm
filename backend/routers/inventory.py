"""
Inventory router - API endpoints for warehouse inventory management
"""
from fastapi import APIRouter, Depends
from typing import List, Optional

from models.inventory import (
    Inventory, InventoryCreate, InventoryUpdate, MaterialNeedsAttention
)
from models.auth import UserInDB, UserRole
from routers.auth import get_current_active_user, require_role
from database import db
from services.inventory_service import InventoryService

inventory_router = APIRouter(tags=["Inventory"])


def get_inventory_service():
    return InventoryService(db)


@inventory_router.get("/inventories", response_model=List[Inventory])
async def list_inventories(
    warehouse: Optional[str] = None,
    status: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_active_user),
    service: InventoryService = Depends(get_inventory_service)
):
    """Получить список инвентаризаций с фильтрами"""
    return await service.get_inventories(warehouse=warehouse, status=status)


@inventory_router.get("/inventories/{inventory_id}", response_model=Inventory)
async def get_inventory(
    inventory_id: str,
    current_user: UserInDB = Depends(get_current_active_user),
    service: InventoryService = Depends(get_inventory_service)
):
    """Получить инвентаризацию по ID"""
    return await service.get_inventory(inventory_id)


@inventory_router.post("/inventories", response_model=Inventory)
async def create_inventory(
    inventory_data: InventoryCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR])),
    service: InventoryService = Depends(get_inventory_service)
):
    """Создать новую инвентаризацию"""
    return await service.create_inventory(
        inventory_data, 
        created_by=current_user.email
    )


@inventory_router.put("/inventories/{inventory_id}", response_model=Inventory)
async def update_inventory(
    inventory_id: str,
    inventory_update: InventoryUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR])),
    service: InventoryService = Depends(get_inventory_service)
):
    """Обновить инвентаризацию"""
    return await service.update_inventory(inventory_id, inventory_update)


@inventory_router.delete("/inventories/{inventory_id}")
async def delete_inventory(
    inventory_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])),
    service: InventoryService = Depends(get_inventory_service)
):
    """Удалить инвентаризацию"""
    return await service.delete_inventory(inventory_id)


@inventory_router.get("/materials/needs-attention", response_model=List[MaterialNeedsAttention])
async def get_materials_needing_attention(
    current_user: UserInDB = Depends(get_current_active_user),
    service: InventoryService = Depends(get_inventory_service)
):
    """Получить список материалов, требующих внимания (остаток ниже минимума)"""
    return await service.get_materials_needing_attention()
