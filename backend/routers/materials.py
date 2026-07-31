"""
Materials router - CRUD for warehouse materials
"""
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from typing import List, Optional
from io import BytesIO

import pandas as pd

from models.material import Material, MaterialCreate, MaterialUpdate
from models.auth import UserInDB, UserRole
from routers.auth import get_current_active_user, require_role
from database import db
from services.material_service import MaterialService

materials_router = APIRouter(tags=["Materials"])


def get_material_service():
    return MaterialService(db)


@materials_router.get("/materials", response_model=List[Material])
async def list_materials(
    search: Optional[str] = None,
    status: str = "active",
    current_user: UserInDB = Depends(get_current_active_user),
    service: MaterialService = Depends(get_material_service)
):
    """Вернуть список материалов по статусу (active/deleted/all)"""
    return await service.get_materials(status=status, search=search)


@materials_router.post("/materials", response_model=Material)
async def create_material(
    material_data: MaterialCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])),
    service: MaterialService = Depends(get_material_service)
):
    """Создать новый материал"""
    return await service.create_material(material_data)


@materials_router.put("/materials/{material_id}", response_model=Material)
async def update_material(
    material_id: str,
    material_update: MaterialUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])),
    service: MaterialService = Depends(get_material_service)
):
    """Обновить материал"""
    return await service.update_material(material_id, material_update)


@materials_router.delete("/materials/{material_id}")
async def delete_material(
    material_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])),
    service: MaterialService = Depends(get_material_service)
):
    """Удалить материал (soft delete)"""
    return await service.delete_material(material_id, deleted_by=current_user.email)


@materials_router.post("/materials/{material_id}/restore", response_model=Material)
async def restore_material(
    material_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])),
    service: MaterialService = Depends(get_material_service)
):
    """Восстановить удалённый материал"""
    return await service.restore_material(material_id)


@materials_router.get("/materials/export")
async def export_materials(
    search: Optional[str] = None,
    status: str = "active",
    current_user: UserInDB = Depends(get_current_active_user),
    service: MaterialService = Depends(get_material_service)
):
    """Экспорт списка материалов в Excel"""
    materials = await service.get_materials(status=status, search=search)
    rows = []
    for material in materials:
        rows.append({
            "Название": material.name,
            "На начало периода": material.start_period,
            "Приход за период": material.incoming,
            "Расход за период": material.outgoing,
            "Инвентаризация": material.inventory,
            "Остаток": material.balance,
            "Единица измерения": material.unit,
            "Тип": material.material_type,
            "Штрих-код": material.barcode or "",
            "Склады": "; ".join(
                f"{wh.warehouse_name}:{wh.min_stock}" for wh in material.warehouses or []
            )
        })

    df = pd.DataFrame(rows)
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Materials")
    output.seek(0)

    headers = {
        "Content-Disposition": 'attachment; filename="materials.xlsx"'
    }
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers
    )
