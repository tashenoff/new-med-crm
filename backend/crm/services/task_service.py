"""
Task Service - Сервис для работы с задачами CRM
"""

import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from ..models.task import Task, TaskStatus, TaskType, TaskPriority
from ..schemas.task_schemas import TaskCreate, TaskUpdate, TaskSearchFilters


class TaskService:
    """Сервис для работы с задачами"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.crm_tasks
    
    async def create_task(self, task_data: TaskCreate, created_by: Optional[str] = None) -> Task:
        """Создать новую задачу"""
        task_dict = task_data.dict()
        task_dict["id"] = str(uuid.uuid4())
        task_dict["created_at"] = datetime.utcnow()
        task_dict["updated_at"] = datetime.utcnow()
        task_dict["created_by"] = created_by
        # Используем статус из входных данных или NEW по умолчанию
        if "status" not in task_dict or task_dict["status"] is None:
            task_dict["status"] = TaskStatus.NEW
        
        # Создаем объект Task для валидации
        task = Task(**task_dict)
        
        # Проверяем просрочена ли задача
        if task.is_overdue():
            task.status = TaskStatus.OVERDUE
        
        # Сохраняем в БД
        await self.collection.insert_one(task.dict())
        
        return task
    
    async def get_task_by_id(self, task_id: str) -> Optional[Task]:
        """Получить задачу по ID"""
        task_data = await self.collection.find_one({"id": task_id})
        if task_data:
            return Task(**task_data)
        return None
    
    async def update_task(self, task_id: str, update_data: TaskUpdate) -> Optional[Task]:
        """Обновить задачу"""
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        
        result = await self.collection.update_one(
            {"id": task_id},
            {"$set": update_dict}
        )
        
        if result.modified_count > 0:
            return await self.get_task_by_id(task_id)
        return None
    
    async def delete_task(self, task_id: str) -> bool:
        """Удалить задачу"""
        result = await self.collection.delete_one({"id": task_id})
        return result.deleted_count > 0
    
    async def get_tasks(
        self, 
        skip: int = 0, 
        limit: int = 50,
        filters: Optional[TaskSearchFilters] = None
    ) -> List[Task]:
        """Получить список задач с фильтрацией"""
        query = {}
        
        if filters:
            if filters.status:
                query["status"] = {"$in": filters.status}
            if filters.type:
                query["type"] = {"$in": filters.type}
            if filters.priority:
                query["priority"] = {"$in": filters.priority}
            if filters.assigned_to:
                query["assigned_to"] = filters.assigned_to
            if filters.created_by:
                query["created_by"] = filters.created_by
            if filters.lead_id:
                query["lead_id"] = filters.lead_id
            if filters.client_id:
                query["client_id"] = filters.client_id
            if filters.deal_id:
                query["deal_id"] = filters.deal_id
            if filters.doctor_id:
                query["doctor_id"] = filters.doctor_id
            
            # Фильтр по дате выполнения
            if filters.due_from or filters.due_to:
                date_filter = {}
                if filters.due_from:
                    date_filter["$gte"] = filters.due_from
                if filters.due_to:
                    date_filter["$lte"] = filters.due_to
                query["due_date"] = date_filter
            
            # Фильтр по дате создания
            if filters.created_from or filters.created_to:
                date_filter = {}
                if filters.created_from:
                    date_filter["$gte"] = filters.created_from
                if filters.created_to:
                    date_filter["$lte"] = filters.created_to
                query["created_at"] = date_filter
            
            # Поиск
            if filters.search:
                query["$or"] = [
                    {"title": {"$regex": filters.search, "$options": "i"}},
                    {"description": {"$regex": filters.search, "$options": "i"}},
                    {"comment": {"$regex": filters.search, "$options": "i"}}
                ]
            
            # Показывать только просроченные
            if filters.show_overdue:
                query["due_date"] = {"$lt": datetime.utcnow()}
                query["status"] = {"$nin": [TaskStatus.COMPLETED, TaskStatus.CANCELLED]}
            
            # Скрывать выполненные
            if not filters.show_completed:
                query["status"] = {"$ne": TaskStatus.COMPLETED}
        
        cursor = self.collection.find(query).sort("due_date", ASCENDING).skip(skip).limit(limit)
        tasks_data = await cursor.to_list(None)
        
        return [Task(**task_data) for task_data in tasks_data]
    
    async def count_tasks(self, filters: Optional[TaskSearchFilters] = None) -> int:
        """Подсчитать количество задач"""
        query = {}
        # Применяем фильтры (упрощенная версия)
        if filters:
            if filters.status:
                query["status"] = {"$in": filters.status}
            if filters.assigned_to:
                query["assigned_to"] = filters.assigned_to
        
        return await self.collection.count_documents(query)
    
    async def complete_task(self, task_id: str) -> Optional[Task]:
        """Отметить задачу как выполненную"""
        task = await self.get_task_by_id(task_id)
        if task:
            task.mark_completed()
            await self.collection.update_one(
                {"id": task_id},
                {"$set": task.dict()}
            )
            return task
        return None
    
    async def cancel_task(self, task_id: str) -> Optional[Task]:
        """Отменить задачу"""
        task = await self.get_task_by_id(task_id)
        if task:
            task.mark_cancelled()
            await self.collection.update_one(
                {"id": task_id},
                {"$set": task.dict()}
            )
            return task
        return None
    
    async def get_tasks_by_lead(self, lead_id: str) -> List[Task]:
        """Получить задачи по лиду"""
        cursor = self.collection.find({"lead_id": lead_id}).sort("due_date", ASCENDING)
        tasks_data = await cursor.to_list(None)
        return [Task(**task_data) for task_data in tasks_data]
    
    async def get_tasks_by_client(self, client_id: str) -> List[Task]:
        """Получить задачи по клиенту"""
        cursor = self.collection.find({"client_id": client_id}).sort("due_date", ASCENDING)
        tasks_data = await cursor.to_list(None)
        return [Task(**task_data) for task_data in tasks_data]
    
    async def get_overdue_tasks(self, assigned_to: Optional[str] = None) -> List[Task]:
        """Получить просроченные задачи"""
        query = {
            "due_date": {"$lt": datetime.utcnow()},
            "status": {"$nin": [TaskStatus.COMPLETED, TaskStatus.CANCELLED]}
        }
        
        if assigned_to:
            query["assigned_to"] = assigned_to
        
        cursor = self.collection.find(query).sort("due_date", ASCENDING)
        tasks_data = await cursor.to_list(None)
        return [Task(**task_data) for task_data in tasks_data]
    
    async def get_today_tasks(self, assigned_to: Optional[str] = None) -> List[Task]:
        """Получить задачи на сегодня"""
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = datetime.utcnow().replace(hour=23, minute=59, second=59, microsecond=999999)
        
        query = {
            "due_date": {"$gte": today_start, "$lte": today_end},
            "status": {"$ne": TaskStatus.COMPLETED}
        }
        
        if assigned_to:
            query["assigned_to"] = assigned_to
        
        cursor = self.collection.find(query).sort("due_date", ASCENDING)
        tasks_data = await cursor.to_list(None)
        return [Task(**task_data) for task_data in tasks_data]
    
    async def update_overdue_tasks(self) -> int:
        """Обновить статус просроченных задач"""
        result = await self.collection.update_many(
            {
                "due_date": {"$lt": datetime.utcnow()},
                "status": {"$nin": [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.OVERDUE]}
            },
            {"$set": {"status": TaskStatus.OVERDUE, "updated_at": datetime.utcnow()}}
        )
        return result.modified_count
