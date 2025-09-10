"""
Contact Service - Сервис для работы с источниками контактов
"""

import uuid
from datetime import datetime
from typing import Optional, List
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import DESCENDING
from ..models.contact import Contact, ContactStatus, ContactType
from ..schemas.contact_schemas import ContactCreate, ContactUpdate


class ContactService:
    """Сервис для работы с источниками контактов"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.crm_contacts
    
    async def create_contact(self, contact_data: ContactCreate, created_by: Optional[str] = None) -> Contact:
        """Создать новый источник контактов"""
        contact_dict = contact_data.dict()
        contact_dict["id"] = str(uuid.uuid4())
        contact_dict["created_at"] = datetime.utcnow()
        contact_dict["updated_at"] = datetime.utcnow()
        contact_dict["created_by"] = created_by
        contact_dict["status"] = ContactStatus.ACTIVE
        contact_dict["total_spent"] = 0.0
        contact_dict["total_leads"] = 0
        contact_dict["converted_leads"] = 0
        contact_dict["total_revenue"] = 0.0
        contact_dict["monthly_leads"] = 0
        contact_dict["monthly_conversions"] = 0
        contact_dict["monthly_revenue"] = 0.0
        contact_dict["avg_lead_value"] = 0.0
        contact_dict["avg_deal_size"] = 0.0
        
        contact = Contact(**contact_dict)
        await self.collection.insert_one(contact.dict())
        return contact
    
    async def get_contact_by_id(self, contact_id: str) -> Optional[Contact]:
        """Получить источник по ID"""
        contact_data = await self.collection.find_one({"id": contact_id})
        if contact_data:
            return Contact(**contact_data)
        return None
    
    async def update_contact(self, contact_id: str, update_data: ContactUpdate) -> Optional[Contact]:
        """Обновить источник контактов"""
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        
        result = await self.collection.update_one(
            {"id": contact_id},
            {"$set": update_dict}
        )
        
        if result.modified_count > 0:
            return await self.get_contact_by_id(contact_id)
        return None
    
    async def get_contacts(
        self, 
        skip: int = 0, 
        limit: int = 50,
        status: Optional[ContactStatus] = None,
        contact_type: Optional[ContactType] = None
    ) -> List[Contact]:
        """Получить список источников контактов"""
        query = {}
        if status:
            query["status"] = status
        if contact_type:
            query["type"] = contact_type
        
        cursor = self.collection.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit)
        contacts_data = await cursor.to_list(None)
        return [Contact(**contact_data) for contact_data in contacts_data]
    
    async def add_lead_statistics(
        self, 
        contact_id: str, 
        converted: bool = False, 
        revenue: float = 0.0
    ) -> Optional[Contact]:
        """Добавить статистику по лиду"""
        contact = await self.get_contact_by_id(contact_id)
        if not contact:
            return None
        
        contact.add_lead_statistics(converted, revenue)
        
        result = await self.collection.update_one(
            {"id": contact_id},
            {"$set": contact.dict()}
        )
        
        if result.modified_count > 0:
            return contact
        return None
    
    async def add_cost(self, contact_id: str, amount: float) -> Optional[Contact]:
        """Добавить затраты на источник"""
        result = await self.collection.update_one(
            {"id": contact_id},
            {
                "$inc": {"total_spent": amount},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        
        if result.modified_count > 0:
            return await self.get_contact_by_id(contact_id)
        return None


