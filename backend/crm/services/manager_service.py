"""
Manager Service - Сервис для работы с менеджерами
"""

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import DESCENDING
from ..models.manager import Manager, ManagerStatus, ManagerRole
from ..schemas.manager_schemas import ManagerCreate, ManagerUpdate


class ManagerService:
    """Сервис для работы с менеджерами"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.crm_managers
    
    async def create_manager(self, manager_data: ManagerCreate, created_by: Optional[str] = None) -> Manager:
        """Создать нового менеджера"""
        manager_dict = manager_data.dict()
        manager_dict["id"] = str(uuid.uuid4())
        manager_dict["created_at"] = datetime.utcnow()
        manager_dict["updated_at"] = datetime.utcnow()
        manager_dict["status"] = ManagerStatus.ACTIVE
        manager_dict["current_leads_count"] = 0
        manager_dict["current_clients_count"] = 0
        manager_dict["current_deals_count"] = 0
        manager_dict["monthly_revenue"] = 0.0
        manager_dict["monthly_deals_closed"] = 0
        manager_dict["monthly_leads_converted"] = 0
        
        manager = Manager(**manager_dict)
        await self.collection.insert_one(manager.dict())
        return manager
    
    async def get_manager_by_id(self, manager_id: str) -> Optional[Manager]:
        """Получить менеджера по ID"""
        manager_data = await self.collection.find_one({"id": manager_id})
        if manager_data:
            return Manager(**manager_data)
        return None
    
    async def update_manager(self, manager_id: str, update_data: ManagerUpdate) -> Optional[Manager]:
        """Обновить менеджера"""
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        
        result = await self.collection.update_one(
            {"id": manager_id},
            {"$set": update_dict}
        )
        
        if result.modified_count > 0:
            return await self.get_manager_by_id(manager_id)
        return None
    
    async def get_managers(
        self, 
        skip: int = 0, 
        limit: int = 50,
        status: Optional[ManagerStatus] = None,
        role: Optional[ManagerRole] = None,
        department: Optional[str] = None
    ) -> List[Manager]:
        """Получить список менеджеров"""
        query = {}
        if status:
            query["status"] = status
        if role:
            query["role"] = role
        if department:
            query["department"] = department
        
        cursor = self.collection.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit)
        managers_data = await cursor.to_list(None)
        return [Manager(**manager_data) for manager_data in managers_data]
    
    async def get_available_managers(self, specialization: Optional[str] = None) -> List[Manager]:
        """Получить доступных менеджеров для назначения"""
        query = {
            "status": ManagerStatus.ACTIVE,
            "$expr": {"$lt": ["$current_leads_count", "$max_leads"]}
        }
        
        if specialization:
            query["specializations"] = {"$in": [specialization]}
        
        cursor = self.collection.find(query).sort("current_leads_count", 1)  # По возрастанию загрузки
        managers_data = await cursor.to_list(None)
        return [Manager(**manager_data) for manager_data in managers_data]
    
    async def update_statistics(
        self, 
        manager_id: str, 
        leads_count: int,
        clients_count: int, 
        deals_count: int
    ) -> Optional[Manager]:
        """Обновить статистику менеджера"""
        result = await self.collection.update_one(
            {"id": manager_id},
            {
                "$set": {
                    "current_leads_count": leads_count,
                    "current_clients_count": clients_count,
                    "current_deals_count": deals_count,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        if result.modified_count > 0:
            return await self.get_manager_by_id(manager_id)
        return None
    
    async def add_monthly_revenue(self, manager_id: str, amount: float) -> Optional[Manager]:
        """Добавить к месячной выручке менеджера"""
        result = await self.collection.update_one(
            {"id": manager_id},
            {
                "$inc": {"monthly_revenue": amount, "monthly_deals_closed": 1},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        
        if result.modified_count > 0:
            return await self.get_manager_by_id(manager_id)
        return None


