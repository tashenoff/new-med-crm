"""
Lead Service - Сервис для работы с лидами
"""

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from ..models.lead import Lead, LeadStatus, LeadSource, LeadPriority
from ..schemas.lead_schemas import LeadCreate, LeadUpdate, LeadSearchFilters


class LeadService:
    """Сервис для работы с лидами"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.crm_leads
    
    async def create_lead(self, lead_data: LeadCreate, created_by: Optional[str] = None) -> Lead:
        """Создать нового лида"""
        lead_dict = lead_data.dict()
        lead_dict["id"] = str(uuid.uuid4())
        lead_dict["created_at"] = datetime.utcnow()
        lead_dict["updated_at"] = datetime.utcnow()
        lead_dict["created_by"] = created_by
        lead_dict["contact_attempts"] = 0
        lead_dict["status"] = LeadStatus.NEW
        
        # Создаем объект Lead для валидации
        lead = Lead(**lead_dict)
        
        # Сохраняем в БД
        await self.collection.insert_one(lead.dict())
        
        return lead
    
    async def get_lead_by_id(self, lead_id: str) -> Optional[Lead]:
        """Получить лида по ID"""
        lead_data = await self.collection.find_one({"id": lead_id})
        if lead_data:
            return Lead(**lead_data)
        return None
    
    async def update_lead(self, lead_id: str, update_data: LeadUpdate) -> Optional[Lead]:
        """Обновить лида"""
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        
        result = await self.collection.update_one(
            {"id": lead_id},
            {"$set": update_dict}
        )
        
        if result.modified_count > 0:
            return await self.get_lead_by_id(lead_id)
        return None
    
    async def delete_lead(self, lead_id: str) -> bool:
        """Удалить лида"""
        result = await self.collection.delete_one({"id": lead_id})
        return result.deleted_count > 0
    
    async def get_leads(
        self, 
        skip: int = 0, 
        limit: int = 50,
        filters: Optional[LeadSearchFilters] = None
    ) -> List[Lead]:
        """Получить список лидов с фильтрацией"""
        query = {}
        
        if filters:
            if filters.status:
                query["status"] = {"$in": filters.status}
            if filters.source:
                query["source"] = {"$in": filters.source}
            if filters.priority:
                query["priority"] = {"$in": filters.priority}
            if filters.assigned_manager_id:
                query["assigned_manager_id"] = filters.assigned_manager_id
            if filters.created_from or filters.created_to:
                date_filter = {}
                if filters.created_from:
                    date_filter["$gte"] = filters.created_from
                if filters.created_to:
                    date_filter["$lte"] = filters.created_to
                query["created_at"] = date_filter
            if filters.search:
                query["$or"] = [
                    {"first_name": {"$regex": filters.search, "$options": "i"}},
                    {"last_name": {"$regex": filters.search, "$options": "i"}},
                    {"phone": {"$regex": filters.search, "$options": "i"}},
                    {"email": {"$regex": filters.search, "$options": "i"}},
                    {"company": {"$regex": filters.search, "$options": "i"}}
                ]
        
        cursor = self.collection.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit)
        leads_data = await cursor.to_list(None)
        
        return [Lead(**lead_data) for lead_data in leads_data]
    
    async def count_leads(self, filters: Optional[LeadSearchFilters] = None) -> int:
        """Подсчитать количество лидов"""
        query = {}
        if filters:
            # Применяем те же фильтры, что и в get_leads
            # ... (упрощено для краткости)
            pass
        
        return await self.collection.count_documents(query)
    
    async def update_lead_status(
        self, 
        lead_id: str, 
        status: LeadStatus, 
        notes: Optional[str] = None,
        updated_by: Optional[str] = None
    ) -> Optional[Lead]:
        """Обновить статус лида"""
        update_data = {
            "status": status,
            "updated_at": datetime.utcnow()
        }
        
        if notes:
            # Добавляем заметку к существующим
            existing_lead = await self.get_lead_by_id(lead_id)
            if existing_lead:
                existing_notes = existing_lead.notes or ""
                timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
                new_note = f"[{timestamp}] Статус изменен на {status.value}: {notes}"
                update_data["notes"] = f"{existing_notes}\n{new_note}".strip()
        
        result = await self.collection.update_one(
            {"id": lead_id},
            {"$set": update_data}
        )
        
        if result.modified_count > 0:
            return await self.get_lead_by_id(lead_id)
        return None
    
    async def assign_manager(
        self, 
        lead_id: str, 
        manager_id: str,
        notes: Optional[str] = None
    ) -> Optional[Lead]:
        """Назначить менеджера на лида"""
        update_data = {
            "assigned_manager_id": manager_id,
            "updated_at": datetime.utcnow()
        }
        
        if notes:
            existing_lead = await self.get_lead_by_id(lead_id)
            if existing_lead:
                existing_notes = existing_lead.notes or ""
                timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
                new_note = f"[{timestamp}] Назначен менеджер: {notes}"
                update_data["notes"] = f"{existing_notes}\n{new_note}".strip()
        
        result = await self.collection.update_one(
            {"id": lead_id},
            {"$set": update_data}
        )
        
        if result.modified_count > 0:
            return await self.get_lead_by_id(lead_id)
        return None
    
    async def convert_to_client(
        self, 
        lead_id: str, 
        client_id: str,
        appointment_id: Optional[str] = None
    ) -> Optional[Lead]:
        """Конвертировать лида в клиента"""
        lead = await self.get_lead_by_id(lead_id)
        if not lead or not lead.can_convert_to_client():
            return None
        
        update_data = {
            "status": LeadStatus.CONVERTED,
            "converted_to_client_id": client_id,
            "updated_at": datetime.utcnow()
        }
        
        if appointment_id:
            update_data["converted_to_appointment_id"] = appointment_id
        
        result = await self.collection.update_one(
            {"id": lead_id},
            {"$set": update_data}
        )
        
        if result.modified_count > 0:
            return await self.get_lead_by_id(lead_id)
        return None
    
    async def get_leads_by_manager(self, manager_id: str) -> List[Lead]:
        """Получить лидов конкретного менеджера"""
        cursor = self.collection.find({"assigned_manager_id": manager_id}).sort("created_at", DESCENDING)
        leads_data = await cursor.to_list(None)
        return [Lead(**lead_data) for lead_data in leads_data]
    
    async def get_statistics(self) -> Dict[str, Any]:
        """Получить статистику по лидам"""
        # Основная статистика
        basic_pipeline = [
            {
                "$group": {
                    "_id": None,
                    "total_leads": {"$sum": 1},
                    "new_leads": {
                        "$sum": {"$cond": [{"$eq": ["$status", LeadStatus.NEW]}, 1, 0]}
                    },
                    "in_progress_leads": {
                        "$sum": {"$cond": [{"$eq": ["$status", LeadStatus.IN_PROGRESS]}, 1, 0]}
                    },
                    "converted_leads": {
                        "$sum": {"$cond": [{"$eq": ["$status", LeadStatus.CONVERTED]}, 1, 0]}
                    },
                    "rejected_leads": {
                        "$sum": {"$cond": [{"$eq": ["$status", LeadStatus.REJECTED]}, 1, 0]}
                    }
                }
            }
        ]
        
        # Статистика по источникам
        source_pipeline = [
            {
                "$group": {
                    "_id": "$source",
                    "count": {"$sum": 1}
                }
            }
        ]
        
        # Статистика по менеджерам
        manager_pipeline = [
            {
                "$group": {
                    "_id": "$assigned_manager_id",
                    "count": {"$sum": 1}
                }
            }
        ]
        
        # Выполняем все запросы
        basic_result = await self.collection.aggregate(basic_pipeline).to_list(None)
        source_result = await self.collection.aggregate(source_pipeline).to_list(None)
        manager_result = await self.collection.aggregate(manager_pipeline).to_list(None)
        
        if basic_result:
            stats = basic_result[0]
            total = stats.get("total_leads", 0)
            converted = stats.get("converted_leads", 0)
            conversion_rate = (converted / total * 100) if total > 0 else 0
            
            # Формируем статистику по источникам
            by_source = {}
            for item in source_result:
                source = item["_id"] if item["_id"] else "unknown"
                by_source[source] = item["count"]
            
            # Формируем статистику по менеджерам
            by_manager = {}
            for item in manager_result:
                manager_id = item["_id"] if item["_id"] else "unassigned"
                by_manager[manager_id] = item["count"]
            
            # Среднее время конвертации (заглушка, потребует более сложный запрос)
            avg_conversion_time = None  # TODO: Реализовать расчет времени конвертации
            
            return {
                "total_leads": total,
                "new_leads": stats.get("new_leads", 0),
                "in_progress_leads": stats.get("in_progress_leads", 0),
                "converted_leads": converted,
                "rejected_leads": stats.get("rejected_leads", 0),
                "conversion_rate": round(conversion_rate, 2),
                "avg_conversion_time": avg_conversion_time,
                "by_source": by_source,
                "by_manager": by_manager
            }
        
        return {
            "total_leads": 0,
            "new_leads": 0,
            "in_progress_leads": 0,
            "converted_leads": 0,
            "rejected_leads": 0,
            "conversion_rate": 0,
            "avg_conversion_time": None,
            "by_source": {},
            "by_manager": {}
        }

