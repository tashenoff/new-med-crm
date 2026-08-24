"""
Inventory service - business logic for warehouse inventory checks
"""
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from models.inventory import (
    Inventory, InventoryCreate, InventoryUpdate, 
    InventoryItem, InventoryStatus, MaterialNeedsAttention
)
from models.material import Material, WarehouseThreshold


class InventoryService:
    """Service for warehouse inventory operations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def get_next_number(self) -> int:
        """Получить следующий порядковый номер инвентаризации"""
        last_inventory = await self.db.inventories.find_one(
            sort=[("number", -1)]
        )
        if last_inventory:
            return last_inventory.get("number", 0) + 1
        return 1

    async def get_inventories(
        self, 
        warehouse: Optional[str] = None,
        status: Optional[str] = None
    ) -> List[Inventory]:
        """Получить список инвентаризаций с фильтрами"""
        filters = {}
        
        if warehouse and warehouse != "Любой склад":
            filters["warehouse_name"] = warehouse
        
        if status and status != "Все":
            filters["status"] = status

        cursor = self.db.inventories.find(filters)
        cursor = cursor.sort("inventory_date", -1)
        inventories = await cursor.to_list(None)
        return [Inventory(**inv) for inv in inventories]

    async def get_inventory(self, inventory_id: str) -> Inventory:
        """Получить инвентаризацию по ID"""
        inventory = await self.db.inventories.find_one({"id": inventory_id})
        if not inventory:
            raise HTTPException(status_code=404, detail="Инвентаризация не найдена")
        return Inventory(**inventory)

    async def create_inventory(
        self, 
        inventory_data: InventoryCreate,
        created_by: str,
        employee_name: str = None
    ) -> Inventory:
        """Создать новую инвентаризацию"""
        # Получить следующий номер
        number = await self.get_next_number()
        
        # Создать элементы инвентаризации с ID
        items = [
            InventoryItem(**item.model_dump())
            for item in inventory_data.items
        ]
        
        # Автозаполнение сотрудника из текущего пользователя, если не указано
        data_dict = inventory_data.model_dump(exclude={"items"})
        if not data_dict.get("employee") and employee_name:
            data_dict["employee"] = employee_name
        
        # Создать инвентаризацию
        inventory = Inventory(
            **data_dict,
            number=number,
            items=items,
            created_by=created_by
        )
        
        await self.db.inventories.insert_one(inventory.model_dump())
        return inventory

    async def update_inventory(
        self, 
        inventory_id: str, 
        inventory_update: InventoryUpdate
    ) -> Inventory:
        """Обновить инвентаризацию"""
        update_dict = inventory_update.model_dump(exclude_none=True)
        if not update_dict:
            raise HTTPException(status_code=400, detail="Нет полей для обновления")
        
        # Если обновляются элементы, создать с ID
        if "items" in update_dict:
            update_dict["items"] = [
                InventoryItem(**item).model_dump()
                for item in update_dict["items"]
            ]
        
        # Если статус меняется на "Заполнено", добавить дату заполнения
        if update_dict.get("status") == InventoryStatus.COMPLETED:
            update_dict["completion_date"] = datetime.utcnow()
            
            # Обновить остатки материалов на складе по фактическим данным инвентаризации
            if "items" in update_dict:
                for item in update_dict["items"]:
                    if item.get("actual_quantity") is not None:
                        material_id = item.get("material_id")
                        actual_qty = item["actual_quantity"]
                        
                        # Обновляем balance материала и фиксируем инвентаризационную корректировку
                        await self.db.materials.update_one(
                            {"id": material_id},
                            {"$set": {
                                "balance": actual_qty,
                                "inventory": actual_qty,
                                "updated_at": datetime.utcnow()
                            }}
                        )
        
        update_dict["updated_at"] = datetime.utcnow()

        result = await self.db.inventories.update_one(
            {"id": inventory_id},
            {"$set": update_dict}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Инвентаризация не найдена")

        inventory = await self.db.inventories.find_one({"id": inventory_id})
        return Inventory(**inventory)

    async def delete_inventory(self, inventory_id: str) -> dict:
        """Удалить инвентаризацию"""
        result = await self.db.inventories.delete_one({"id": inventory_id})

        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Инвентаризация не найдена")

        return {"message": "Инвентаризация удалена"}

    async def get_materials_needing_attention(self) -> List[MaterialNeedsAttention]:
        """Получить список материалов, требующих внимания (остаток ниже минимума)"""
        materials_cursor = self.db.materials.find({"is_active": True})
        materials = await materials_cursor.to_list(None)
        
        needs_attention = []
        
        for material_data in materials:
            material = Material(**material_data)
            
            # Если у материала не настроены склады — используем минимальный остаток 0,
            # но материал с нулевым остатком всё равно должен попасть в внимание
            warehouse_thresholds = material.warehouses or []
            if not warehouse_thresholds:
                warehouse_thresholds = [
                    WarehouseThreshold(warehouse_name="Без склада", min_stock=0.0)
                ]
            
            # Проверить каждый склад
            for warehouse in warehouse_thresholds:
                if material.balance <= warehouse.min_stock:
                    shortage = warehouse.min_stock - material.balance
                    
                    # Найти последнюю инвентаризацию для этого материала и склада
                    last_inv = await self.db.inventories.find_one(
                        {
                            "warehouse_name": warehouse.warehouse_name,
                            "items.material_id": material.id,
                            "status": InventoryStatus.COMPLETED
                        },
                        sort=[("inventory_date", -1)]
                    )
                    
                    last_inventory_date = last_inv.get("inventory_date") if last_inv else None
                    
                    needs_attention.append(
                        MaterialNeedsAttention(
                            material_id=material.id,
                            material_name=material.name,
                            warehouse_name=warehouse.warehouse_name,
                            current_stock=material.balance,
                            min_stock=warehouse.min_stock,
                            shortage=shortage,
                            unit=material.unit,
                            last_inventory_date=last_inventory_date
                        )
                    )
        
        # Сортировать по величине дефицита (от большего к меньшему)
        needs_attention.sort(key=lambda x: x.shortage, reverse=True)
        
        return needs_attention
