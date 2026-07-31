from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Optional
from bson import ObjectId
from datetime import datetime

from models.notification_rule import (
    NotificationRule,
    NotificationRuleCreate,
    NotificationRuleUpdate,
    NotificationTrigger,
    NotificationMethod,
    NotificationRecipient
)


class NotificationRuleService:
    """Сервис для управления правилами уведомлений"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.notification_rules
    
    async def create_rule(self, rule_data: NotificationRuleCreate) -> NotificationRule:
        """Создать новое правило уведомления"""
        rule_dict = rule_data.model_dump()
        rule_dict["created_at"] = datetime.now()
        rule_dict["updated_at"] = datetime.now()
        
        result = await self.collection.insert_one(rule_dict)
        rule_dict["_id"] = str(result.inserted_id)
        
        return NotificationRule(**rule_dict)
    
    async def get_all_rules(self) -> List[NotificationRule]:
        """Получить все правила уведомлений"""
        cursor = self.collection.find()
        rules = []
        
        async for rule_doc in cursor:
            rule_doc["_id"] = str(rule_doc["_id"])
            rules.append(NotificationRule(**rule_doc))
        
        return rules
    
    async def get_rule_by_id(self, rule_id: str) -> Optional[NotificationRule]:
        """Получить правило по ID"""
        rule_doc = await self.collection.find_one({"_id": ObjectId(rule_id)})
        
        if rule_doc:
            rule_doc["_id"] = str(rule_doc["_id"])
            return NotificationRule(**rule_doc)
        
        return None
    
    async def update_rule(self, rule_id: str, rule_update: NotificationRuleUpdate) -> Optional[NotificationRule]:
        """Обновить правило"""
        update_data = {k: v for k, v in rule_update.model_dump().items() if v is not None}
        
        if not update_data:
            return await self.get_rule_by_id(rule_id)
        
        update_data["updated_at"] = datetime.now()
        
        await self.collection.update_one(
            {"_id": ObjectId(rule_id)},
            {"$set": update_data}
        )
        
        return await self.get_rule_by_id(rule_id)
    
    async def delete_rule(self, rule_id: str) -> bool:
        """Удалить правило"""
        result = await self.collection.delete_one({"_id": ObjectId(rule_id)})
        return result.deleted_count > 0
    
    async def get_active_rules_by_trigger(
        self,
        trigger: NotificationTrigger,
        recipient: NotificationRecipient
    ) -> List[NotificationRule]:
        """Получить активные правила по триггеру и получателю"""
        cursor = self.collection.find({
            "status": True,
            "trigger": trigger.value,
            "recipient": recipient.value
        })
        
        rules = []
        async for rule_doc in cursor:
            rule_doc["_id"] = str(rule_doc["_id"])
            rules.append(NotificationRule(**rule_doc))
        
        return rules
    
    async def toggle_rule_status(self, rule_id: str) -> Optional[NotificationRule]:
        """Переключить статус правила (включено/выключено)"""
        rule = await self.get_rule_by_id(rule_id)
        
        if not rule:
            return None
        
        new_status = not rule.status
        
        await self.collection.update_one(
            {"_id": ObjectId(rule_id)},
            {"$set": {"status": new_status, "updated_at": datetime.now()}}
        )
        
        return await self.get_rule_by_id(rule_id)
