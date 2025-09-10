"""
Deal Service - Сервис для работы со сделками
"""

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import DESCENDING
from ..models.deal import Deal, DealStatus, DealStage, DealPriority
from ..schemas.deal_schemas import DealCreate, DealUpdate


class DealService:
    """Сервис для работы со сделками"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.crm_deals
    
    async def create_deal(self, deal_data: DealCreate, created_by: Optional[str] = None) -> Deal:
        """Создать новую сделку"""
        deal_dict = deal_data.dict()
        deal_dict["id"] = str(uuid.uuid4())
        deal_dict["created_at"] = datetime.utcnow()
        deal_dict["updated_at"] = datetime.utcnow()
        deal_dict["created_by"] = created_by
        deal_dict["status"] = DealStatus.ACTIVE
        deal_dict["activities_count"] = 0
        
        deal = Deal(**deal_dict)
        await self.collection.insert_one(deal.dict())
        return deal
    
    async def get_deal_by_id(self, deal_id: str) -> Optional[Deal]:
        """Получить сделку по ID"""
        deal_data = await self.collection.find_one({"id": deal_id})
        if deal_data:
            return Deal(**deal_data)
        return None
    
    async def update_deal(self, deal_id: str, update_data: DealUpdate) -> Optional[Deal]:
        """Обновить сделку"""
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        
        result = await self.collection.update_one(
            {"id": deal_id},
            {"$set": update_dict}
        )
        
        if result.modified_count > 0:
            return await self.get_deal_by_id(deal_id)
        return None
    
    async def get_deals(
        self, 
        skip: int = 0, 
        limit: int = 50,
        status: Optional[DealStatus] = None,
        stage: Optional[DealStage] = None,
        priority: Optional[DealPriority] = None,
        manager_id: Optional[str] = None,
        client_id: Optional[str] = None,
        search: Optional[str] = None
    ) -> List[Deal]:
        """Получить список сделок"""
        query = {}
        if status:
            query["status"] = status
        if stage:
            query["stage"] = stage
        if priority:
            query["priority"] = priority
        if manager_id:
            query["assigned_manager_id"] = manager_id
        if client_id:
            query["client_id"] = client_id
        if search:
            query["$or"] = [
                {"title": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}}
            ]
        
        cursor = self.collection.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit)
        deals_data = await cursor.to_list(None)
        return [Deal(**deal_data) for deal_data in deals_data]
    
    async def close_deal_as_won(self, deal_id: str, amount: Optional[float] = None) -> Optional[Deal]:
        """Закрыть сделку как выигранную"""
        deal = await self.get_deal_by_id(deal_id)
        if not deal:
            return None
        
        deal.close_as_won(amount)
        
        result = await self.collection.update_one(
            {"id": deal_id},
            {"$set": deal.dict()}
        )
        
        if result.modified_count > 0:
            return deal
        return None
    
    async def get_statistics(self) -> Dict[str, Any]:
        """Получить статистику по сделкам"""
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "total_deals": {"$sum": 1},
                    "active_deals": {
                        "$sum": {"$cond": [{"$eq": ["$status", DealStatus.ACTIVE]}, 1, 0]}
                    },
                    "won_deals": {
                        "$sum": {"$cond": [{"$eq": ["$status", DealStatus.WON]}, 1, 0]}
                    },
                    "total_amount": {"$sum": "$amount"},
                    "won_amount": {
                        "$sum": {"$cond": [{"$eq": ["$status", DealStatus.WON]}, "$amount", 0]}
                    }
                }
            }
        ]
        
        result = await self.collection.aggregate(pipeline).to_list(None)
        if result:
            stats = result[0]
            total = stats.get("total_deals", 0)
            won = stats.get("won_deals", 0)
            win_rate = (won / total * 100) if total > 0 else 0
            
            return {
                "total_deals": total,
                "active_deals": stats.get("active_deals", 0),
                "won_deals": won,
                "total_amount": stats.get("total_amount", 0),
                "won_amount": stats.get("won_amount", 0),
                "win_rate": round(win_rate, 2)
            }
        
        return {
            "total_deals": 0,
            "active_deals": 0,
            "won_deals": 0,
            "total_amount": 0,
            "won_amount": 0,
            "win_rate": 0
        }


