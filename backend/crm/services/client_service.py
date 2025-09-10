"""
Client Service - Сервис для работы с клиентами
"""

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import DESCENDING
from ..models.client import Client, ClientStatus, ClientType
from ..schemas.client_schemas import ClientCreate, ClientUpdate


class ClientService:
    """Сервис для работы с клиентами"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.crm_clients
    
    async def create_client(self, client_data: ClientCreate, created_by: Optional[str] = None) -> Client:
        """Создать нового клиента"""
        client_dict = client_data.dict()
        client_dict["id"] = str(uuid.uuid4())
        client_dict["created_at"] = datetime.utcnow()
        client_dict["updated_at"] = datetime.utcnow()
        client_dict["created_by"] = created_by
        client_dict["status"] = ClientStatus.ACTIVE
        client_dict["total_revenue"] = 0.0
        client_dict["total_deals"] = 0
        
        # Создаем объект Client для валидации
        client = Client(**client_dict)
        
        # Сохраняем в БД
        await self.collection.insert_one(client.dict())
        
        return client
    
    async def get_client_by_id(self, client_id: str) -> Optional[Client]:
        """Получить клиента по ID"""
        client_data = await self.collection.find_one({"id": client_id})
        if client_data:
            return Client(**client_data)
        return None
    
    async def update_client(self, client_id: str, update_data: ClientUpdate) -> Optional[Client]:
        """Обновить клиента"""
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        
        result = await self.collection.update_one(
            {"id": client_id},
            {"$set": update_dict}
        )
        
        if result.modified_count > 0:
            return await self.get_client_by_id(client_id)
        return None
    
    async def delete_client(self, client_id: str) -> bool:
        """Удалить клиента"""
        result = await self.collection.delete_one({"id": client_id})
        return result.deleted_count > 0
    
    async def get_clients(
        self, 
        skip: int = 0, 
        limit: int = 50,
        status: Optional[ClientStatus] = None,
        manager_id: Optional[str] = None,
        search: Optional[str] = None
    ) -> List[Client]:
        """Получить список клиентов с фильтрацией"""
        query = {}
        
        if status:
            query["status"] = status
        if manager_id:
            query["assigned_manager_id"] = manager_id
        if search:
            query["$or"] = [
                {"first_name": {"$regex": search, "$options": "i"}},
                {"last_name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
                {"company": {"$regex": search, "$options": "i"}}
            ]
        
        cursor = self.collection.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit)
        clients_data = await cursor.to_list(None)
        
        return [Client(**client_data) for client_data in clients_data]
    
    async def count_clients(
        self,
        status: Optional[ClientStatus] = None,
        manager_id: Optional[str] = None,
        search: Optional[str] = None
    ) -> int:
        """Подсчитать количество клиентов"""
        query = {}
        if status:
            query["status"] = status
        if manager_id:
            query["assigned_manager_id"] = manager_id
        if search:
            query["$or"] = [
                {"first_name": {"$regex": search, "$options": "i"}},
                {"last_name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
                {"company": {"$regex": search, "$options": "i"}}
            ]
        
        return await self.collection.count_documents(query)
    
    async def link_to_hms_patient(self, client_id: str, patient_id: str) -> Optional[Client]:
        """Связать клиента с пациентом HMS"""
        result = await self.collection.update_one(
            {"id": client_id},
            {"$set": {"hms_patient_id": patient_id, "updated_at": datetime.utcnow()}}
        )
        
        if result.modified_count > 0:
            return await self.get_client_by_id(client_id)
        return None
    
    async def update_revenue(self, client_id: str, amount: float) -> Optional[Client]:
        """Обновить выручку клиента"""
        result = await self.collection.update_one(
            {"id": client_id},
            {
                "$inc": {"total_revenue": amount, "total_deals": 1},
                "$set": {"last_deal_date": datetime.utcnow(), "updated_at": datetime.utcnow()}
            }
        )
        
        if result.modified_count > 0:
            return await self.get_client_by_id(client_id)
        return None
    
    async def get_clients_by_manager(self, manager_id: str) -> List[Client]:
        """Получить клиентов конкретного менеджера"""
        cursor = self.collection.find({"assigned_manager_id": manager_id}).sort("created_at", DESCENDING)
        clients_data = await cursor.to_list(None)
        return [Client(**client_data) for client_data in clients_data]
    
    async def get_statistics(self) -> Dict[str, Any]:
        """Получить статистику по клиентам"""
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "total_clients": {"$sum": 1},
                    "active_clients": {
                        "$sum": {"$cond": [{"$eq": ["$status", ClientStatus.ACTIVE]}, 1, 0]}
                    },
                    "vip_clients": {
                        "$sum": {"$cond": [{"$eq": ["$status", ClientStatus.VIP]}, 1, 0]}
                    },
                    "total_revenue": {"$sum": "$total_revenue"},
                    "avg_revenue": {"$avg": "$total_revenue"}
                }
            }
        ]
        
        result = await self.collection.aggregate(pipeline).to_list(None)
        if result:
            stats = result[0]
            return {
                "total_clients": stats.get("total_clients", 0),
                "active_clients": stats.get("active_clients", 0),
                "vip_clients": stats.get("vip_clients", 0),
                "total_revenue": round(stats.get("total_revenue", 0), 2),
                "avg_revenue": round(stats.get("avg_revenue", 0), 2)
            }
        
        return {
            "total_clients": 0,
            "active_clients": 0,
            "vip_clients": 0,
            "total_revenue": 0,
            "avg_revenue": 0
        }
    
    async def get_detailed_statistics(self) -> Dict[str, Any]:
        """Получить детальную статистику по клиентам включая HMS конвертацию"""
        
        # Основная статистика
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "total_clients": {"$sum": 1},
                    "hms_patients": {
                        "$sum": {"$cond": [{"$eq": ["$is_hms_patient", True]}, 1, 0]}
                    },
                    "crm_only_clients": {
                        "$sum": {"$cond": [{"$ne": ["$is_hms_patient", True]}, 1, 0]}
                    },
                    "total_revenue": {"$sum": "$total_revenue"},
                }
            }
        ]
        
        result = await self.collection.aggregate(pipeline).to_list(None)
        
        if result and result[0]["total_clients"] > 0:
            stats = result[0]
            total_clients = stats["total_clients"]
            hms_patients = stats["hms_patients"]
            crm_only_clients = stats["crm_only_clients"]
            total_revenue = stats["total_revenue"]
            
            hms_conversion_rate = (hms_patients / total_clients * 100) if total_clients > 0 else 0
            avg_revenue_per_client = (total_revenue / total_clients) if total_clients > 0 else 0
            
        else:
            total_clients = hms_patients = crm_only_clients = 0
            total_revenue = hms_conversion_rate = avg_revenue_per_client = 0
        
        # Статистика по статусам
        status_pipeline = [
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        status_result = await self.collection.aggregate(status_pipeline).to_list(None)
        by_status = {item["_id"]: item["count"] for item in status_result}
        
        # Статистика по типам
        type_pipeline = [
            {"$group": {"_id": "$client_type", "count": {"$sum": 1}}}
        ]
        type_result = await self.collection.aggregate(type_pipeline).to_list(None)
        by_type = {item["_id"]: item["count"] for item in type_result}
        
        return {
            "total_clients": total_clients,
            "crm_only_clients": crm_only_clients,
            "hms_patients": hms_patients,
            "hms_conversion_rate": round(hms_conversion_rate, 1),
            "by_status": by_status,
            "by_type": by_type,
            "total_revenue": round(total_revenue, 2),
            "avg_revenue_per_client": round(avg_revenue_per_client, 2)
        }

