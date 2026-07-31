"""
Laboratory service - business logic for laboratory operations
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException
from datetime import datetime
from typing import List, Optional

from models.laboratory import Laboratory, LaboratoryCreate, LaboratoryUpdate


class LaboratoryService:
    """Service for laboratory-related business logic"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def get_laboratories(self, active_only: bool = True) -> List[Laboratory]:
        """Get all laboratories"""
        filters = {}
        if active_only:
            filters["is_active"] = True
        
        laboratories = await self.db.laboratories.find(filters).sort("name", 1).to_list(None)
        return [Laboratory(**lab) for lab in laboratories]
    
    async def get_laboratory(self, laboratory_id: str) -> Laboratory:
        """Get laboratory by ID"""
        laboratory = await self.db.laboratories.find_one({"id": laboratory_id})
        if not laboratory:
            raise HTTPException(status_code=404, detail="Laboratory not found")
        return Laboratory(**laboratory)
    
    async def create_laboratory(self, laboratory: LaboratoryCreate) -> Laboratory:
        """Create new laboratory"""
        # Check if laboratory with same name already exists
        existing = await self.db.laboratories.find_one({
            "name": laboratory.name,
            "is_active": True
        })
        
        if existing:
            raise HTTPException(status_code=400, detail="Laboratory with this name already exists")
        
        lab_dict = laboratory.dict()
        lab_obj = Laboratory(**lab_dict)
        await self.db.laboratories.insert_one(lab_obj.dict())
        return lab_obj
    
    async def update_laboratory(
        self, 
        laboratory_id: str, 
        laboratory_update: LaboratoryUpdate
    ) -> Laboratory:
        """Update laboratory"""
        update_dict = {k: v for k, v in laboratory_update.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        
        result = await self.db.laboratories.update_one(
            {"id": laboratory_id}, 
            {"$set": update_dict}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Laboratory not found")
        
        updated_lab = await self.db.laboratories.find_one({"id": laboratory_id})
        return Laboratory(**updated_lab)
    
    async def delete_laboratory(self, laboratory_id: str) -> dict:
        """Delete (deactivate) laboratory"""
        result = await self.db.laboratories.update_one(
            {"id": laboratory_id}, 
            {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Laboratory not found")
        
        return {"message": "Laboratory deleted successfully"}
    
    async def get_laboratory_statistics(self, laboratory_id: Optional[str] = None) -> dict:
        """Get statistics for laboratories"""
        # Получаем все услуги из прайса, связанные с лабораториями
        filters = {"is_active": True}
        if laboratory_id:
            filters["laboratory_id"] = laboratory_id
        
        # Получаем услуги
        services = await self.db.service_prices.find(filters).to_list(None)
        
        # Группируем по лабораториям
        lab_stats = {}
        total_services = 0
        total_cost = 0
        
        for service in services:
            lab_id = service.get("laboratory_id", "unknown")
            if lab_id not in lab_stats:
                lab_stats[lab_id] = {
                    "service_count": 0,
                    "total_cost": 0,
                    "services": []
                }
            
            lab_stats[lab_id]["service_count"] += 1
            lab_stats[lab_id]["total_cost"] += service.get("price", 0)
            lab_stats[lab_id]["services"].append({
                "id": service.get("id"),
                "name": service.get("service_name"),
                "price": service.get("price", 0),
                "category": service.get("category")
            })
            
            total_services += 1
            total_cost += service.get("price", 0)
        
        # Получаем информацию о лабораториях
        laboratories_info = {}
        for lab_id in lab_stats.keys():
            if lab_id != "unknown":
                lab = await self.db.laboratories.find_one({"id": lab_id})
                if lab:
                    laboratories_info[lab_id] = {
                        "id": lab.get("id"),
                        "name": lab.get("name"),
                        "address": lab.get("address"),
                        "phone": lab.get("phone")
                    }
        
        return {
            "total_services": total_services,
            "total_cost": total_cost,
            "laboratories": lab_stats,
            "laboratories_info": laboratories_info
        }
