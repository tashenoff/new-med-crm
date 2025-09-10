"""
Source Service - Сервис для работы с источниками обращений
"""

import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import DESCENDING
from ..models.source import Source, SourceStatus, SourceType
from ..schemas.source_schemas import SourceCreate, SourceUpdate


class SourceService:
    """Сервис для работы с источниками"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.crm_sources
        self.leads_collection = db.crm_leads
    
    async def create_source(self, source_data: SourceCreate, created_by: Optional[str] = None) -> Source:
        """Создать новый источник"""
        source_dict = source_data.dict()
        source_dict["id"] = str(uuid.uuid4())
        source_dict["created_at"] = datetime.utcnow()
        source_dict["updated_at"] = datetime.utcnow()
        source_dict["created_by"] = created_by
        source_dict["status"] = SourceStatus.ACTIVE
        
        # Инициализируем статистику
        source_dict["leads_count"] = 0
        source_dict["leads_this_month"] = 0
        source_dict["conversion_count"] = 0
        source_dict["conversion_rate"] = 0.0
        
        # Создаем объект Source для валидации
        source = Source(**source_dict)
        
        # Сохраняем в БД
        await self.collection.insert_one(source.dict())
        
        return source
    
    async def get_source_by_id(self, source_id: str) -> Optional[Source]:
        """Получить источник по ID"""
        source_data = await self.collection.find_one({"id": source_id})
        if source_data:
            # Обновляем статистику перед возвратом
            await self._update_source_statistics(source_id)
            source_data = await self.collection.find_one({"id": source_id})
            return Source(**source_data)
        return None
    
    async def update_source(self, source_id: str, update_data: SourceUpdate) -> Optional[Source]:
        """Обновить источник"""
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        
        result = await self.collection.update_one(
            {"id": source_id},
            {"$set": update_dict}
        )
        
        if result.modified_count > 0:
            return await self.get_source_by_id(source_id)
        return None
    
    async def delete_source(self, source_id: str) -> bool:
        """Удалить источник"""
        result = await self.collection.delete_one({"id": source_id})
        return result.deleted_count > 0
    
    async def get_sources(
        self, 
        skip: int = 0, 
        limit: int = 50,
        status: Optional[SourceStatus] = None,
        source_type: Optional[SourceType] = None,
        search: Optional[str] = None
    ) -> List[Source]:
        """Получить список источников с фильтрацией"""
        query = {}
        
        if status:
            query["status"] = status
        if source_type:
            query["type"] = source_type
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}},
                {"url": {"$regex": search, "$options": "i"}}
            ]
        
        cursor = self.collection.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit)
        sources_data = await cursor.to_list(None)
        
        # Обновляем статистику для всех источников
        sources = []
        for source_data in sources_data:
            await self._update_source_statistics(source_data["id"])
            updated_source_data = await self.collection.find_one({"id": source_data["id"]})
            sources.append(Source(**updated_source_data))
        
        return sources
    
    async def count_sources(
        self,
        status: Optional[SourceStatus] = None,
        source_type: Optional[SourceType] = None,
        search: Optional[str] = None
    ) -> int:
        """Подсчитать количество источников"""
        query = {}
        if status:
            query["status"] = status
        if source_type:
            query["type"] = source_type
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}},
                {"url": {"$regex": search, "$options": "i"}}
            ]
        
        return await self.collection.count_documents(query)
    
    async def get_statistics(self) -> Dict[str, Any]:
        """Получить статистику по источникам"""
        # Обновляем статистику для всех источников
        sources = await self.get_sources(limit=1000)
        
        if not sources:
            return {
                "total_sources": 0,
                "active_sources": 0,
                "inactive_sources": 0,
                "total_leads": 0,
                "total_conversions": 0,
                "avg_conversion_rate": 0.0,
                "total_cost": 0.0,
                "avg_cost_per_lead": 0.0,
                "by_type": {},
                "top_sources": []
            }
        
        # Основная статистика
        total_sources = len(sources)
        active_sources = len([s for s in sources if s.status == SourceStatus.ACTIVE])
        inactive_sources = total_sources - active_sources
        
        total_leads = sum(s.leads_count for s in sources)
        total_conversions = sum(s.conversion_count for s in sources)
        total_cost = sum(s.total_cost for s in sources)
        
        avg_conversion_rate = (total_conversions / total_leads * 100) if total_leads > 0 else 0.0
        avg_cost_per_lead = (total_cost / total_leads) if total_leads > 0 else 0.0
        
        # Статистика по типам
        by_type = {}
        for source in sources:
            source_type = source.type
            if source_type not in by_type:
                by_type[source_type] = 0
            by_type[source_type] += 1
        
        # Топ источников по конверсии
        top_sources = sorted(sources, key=lambda s: s.conversion_rate, reverse=True)[:5]
        top_sources_data = [
            {
                "id": s.id,
                "name": s.name,
                "type": s.type,
                "conversion_rate": s.conversion_rate,
                "leads_count": s.leads_count
            }
            for s in top_sources
        ]
        
        return {
            "total_sources": total_sources,
            "active_sources": active_sources,
            "inactive_sources": inactive_sources,
            "total_leads": total_leads,
            "total_conversions": total_conversions,
            "avg_conversion_rate": round(avg_conversion_rate, 1),
            "total_cost": round(total_cost, 2),
            "avg_cost_per_lead": round(avg_cost_per_lead, 2),
            "by_type": by_type,
            "top_sources": top_sources_data
        }
    
    async def _update_source_statistics(self, source_id: str):
        """Обновить статистику источника на основе заявок"""
        # Подсчет общего количества заявок (используем source_id вместо source)
        total_leads = await self.leads_collection.count_documents({"source_id": source_id})
        
        # Подсчет заявок за текущий месяц
        month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        leads_this_month = await self.leads_collection.count_documents({
            "source_id": source_id,
            "created_at": {"$gte": month_start}
        })
        
        # Подсчет конверсий (заявки со статусом "converted")
        conversions = await self.leads_collection.count_documents({
            "source_id": source_id,
            "status": "converted"
        })
        
        # Расчет процента конверсии
        conversion_rate = (conversions / total_leads * 100) if total_leads > 0 else 0.0
        
        # Обновляем источник
        await self.collection.update_one(
            {"id": source_id},
            {
                "$set": {
                    "leads_count": total_leads,
                    "leads_this_month": leads_this_month,
                    "conversion_count": conversions,
                    "conversion_rate": round(conversion_rate, 1),
                    "updated_at": datetime.utcnow()
                }
            }
        )
    
    async def update_all_statistics(self):
        """Обновить статистику для всех источников"""
        sources = await self.collection.find({}).to_list(None)
        for source in sources:
            await self._update_source_statistics(source["id"])

