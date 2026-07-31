"""
Material service - business logic for warehouse materials
"""
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from models.material import Material, MaterialCreate, MaterialUpdate


class MaterialService:
    """Service for warehouse material operations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def get_materials(self, status: str = "active", search: Optional[str] = None) -> List[Material]:
        filters = {}
        if status == "active":
            filters["is_active"] = True
        elif status == "deleted":
            filters["is_active"] = False

        if search:
            filters["name"] = {"$regex": search, "$options": "i"}

        cursor = self.db.materials.find(filters)
        cursor = cursor.sort("name", 1)
        materials = await cursor.to_list(None)
        return [Material(**material) for material in materials]

    async def get_material(self, material_id: str) -> Material:
        material = await self.db.materials.find_one({"id": material_id, "is_active": True})
        if not material:
            raise HTTPException(status_code=404, detail="Материал не найден")
        return Material(**material)

    async def create_material(self, material_data: MaterialCreate) -> Material:
        existing = await self.db.materials.find_one({
            "name": {"$regex": f"^{material_data.name}$", "$options": "i"},
            "is_active": True
        })
        if existing:
            raise HTTPException(status_code=400, detail="Материал с таким именем уже существует")

        material = Material(**material_data.model_dump())
        await self.db.materials.insert_one(material.model_dump())
        return material

    async def update_material(self, material_id: str, material_update: MaterialUpdate) -> Material:
        update_dict = material_update.model_dump(exclude_none=True)
        if not update_dict:
            raise HTTPException(status_code=400, detail="Нет полей для обновления")
        update_dict["updated_at"] = datetime.utcnow()

        result = await self.db.materials.update_one(
            {"id": material_id},
            {"$set": update_dict}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Материал не найден")

        material = await self.db.materials.find_one({"id": material_id})
        return Material(**material)

    async def delete_material(self, material_id: str, deleted_by: Optional[str] = None) -> dict:
        update_values = {
            "is_active": False,
            "updated_at": datetime.utcnow(),
            "deleted_at": datetime.utcnow(),
            "deleted_by": deleted_by
        }
        result = await self.db.materials.update_one(
            {"id": material_id},
            {"$set": update_values}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Материал не найден")

        return {"message": "Материал удалён"}

    async def restore_material(self, material_id: str) -> Material:
        result = await self.db.materials.update_one(
            {"id": material_id, "is_active": False},
            {"$set": {
                "is_active": True,
                "updated_at": datetime.utcnow(),
                "deleted_at": None,
                "deleted_by": None
            }}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Материал не найден или уже восстановлен")

        material = await self.db.materials.find_one({"id": material_id})
        return Material(**material)
