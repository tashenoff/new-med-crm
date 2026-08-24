"""
Task Statuses Routes - API эндпоинты для управления статусами задач CRM
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime
from bson import ObjectId

from ..models.task_status import TaskStatusConfig, TaskStatusCreate, TaskStatusUpdate
from database import get_database


router = APIRouter(prefix="/task-statuses", tags=["CRM Task Statuses"])


def task_status_helper(status: dict) -> dict:
    """Преобразование документа MongoDB в словарь"""
    return {
        "id": str(status["_id"]),
        "name": status.get("name", ""),
        "code": status.get("code", ""),
        "description": status.get("description"),
        "color": status.get("color", "#6B7280"),
        "icon": status.get("icon"),
        "order": status.get("order", 0),
        "is_default": status.get("is_default", False),
        "is_completed": status.get("is_completed", False),
        "is_cancelled": status.get("is_cancelled", False),
        "is_system": status.get("is_system", False),
        "is_active": status.get("is_active", True),
        "created_at": status.get("created_at"),
        "updated_at": status.get("updated_at"),
        "created_by": status.get("created_by")
    }


# Системные статусы по умолчанию
DEFAULT_STATUSES = [
    {"name": "Новая", "code": "new", "description": "Новая задача", "color": "#3B82F6", "icon": "📋", "order": 1, "is_default": True, "is_system": True},
    {"name": "В работе", "code": "in_progress", "description": "Задача в процессе", "color": "#F59E0B", "icon": "⏳", "order": 2, "is_system": True},
    {"name": "Выполнена", "code": "completed", "description": "Задача выполнена", "color": "#10B981", "icon": "✅", "order": 3, "is_completed": True, "is_system": True},
    {"name": "Отменена", "code": "cancelled", "description": "Задача отменена", "color": "#EF4444", "icon": "❌", "order": 4, "is_cancelled": True, "is_system": True},
    {"name": "Просрочена", "code": "overdue", "description": "Просроченная задача", "color": "#DC2626", "icon": "⚠️", "order": 5, "is_system": True}
]


@router.get("")
async def get_task_statuses(active_only: bool = Query(False), db=Depends(get_database)):
    """Получение списка всех статусов задач"""
    try:
        collection = db.crm_task_statuses
        count = await collection.count_documents({})
        
        if count == 0:
            for status_data in DEFAULT_STATUSES:
                status_data["created_at"] = datetime.utcnow()
                status_data["updated_at"] = datetime.utcnow()
                status_data["is_active"] = True
                await collection.insert_one(status_data.copy())
        
        query = {"is_active": True} if active_only else {}
        cursor = collection.find(query).sort("order", 1)
        statuses = [task_status_helper(s) async for s in cursor]
        
        return {"statuses": statuses, "total": len(statuses)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{status_id}")
async def get_task_status(status_id: str, db=Depends(get_database)):
    """Получение статуса по ID"""
    try:
        status = await db.crm_task_statuses.find_one({"_id": ObjectId(status_id)})
        if not status:
            raise HTTPException(status_code=404, detail="Статус не найден")
        return task_status_helper(status)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_task_status(status_data: TaskStatusCreate, db=Depends(get_database)):
    """Создание нового статуса задачи"""
    try:
        collection = db.crm_task_statuses
        
        if await collection.find_one({"code": status_data.code}):
            raise HTTPException(status_code=400, detail="Статус с таким кодом уже существует")
        
        status_dict = status_data.model_dump()
        status_dict["created_at"] = datetime.utcnow()
        status_dict["updated_at"] = datetime.utcnow()
        status_dict["is_system"] = False
        status_dict["is_active"] = True
        
        if status_dict.get("is_default"):
            await collection.update_many({"is_default": True}, {"$set": {"is_default": False}})
        
        result = await collection.insert_one(status_dict)
        created_status = await collection.find_one({"_id": result.inserted_id})
        return task_status_helper(created_status)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{status_id}")
async def update_task_status(status_id: str, status_data: TaskStatusUpdate, db=Depends(get_database)):
    """Обновление статуса задачи"""
    try:
        collection = db.crm_task_statuses
        existing = await collection.find_one({"_id": ObjectId(status_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Статус не найден")
        
        update_dict = {k: v for k, v in status_data.model_dump().items() if v is not None}
        if not update_dict:
            raise HTTPException(status_code=400, detail="Нет данных для обновления")
        
        if "code" in update_dict and update_dict["code"] != existing.get("code"):
            if await collection.find_one({"code": update_dict["code"], "_id": {"$ne": ObjectId(status_id)}}):
                raise HTTPException(status_code=400, detail="Статус с таким кодом уже существует")
        
        if update_dict.get("is_default"):
            await collection.update_many({"is_default": True, "_id": {"$ne": ObjectId(status_id)}}, {"$set": {"is_default": False}})
        
        update_dict["updated_at"] = datetime.utcnow()
        await collection.update_one({"_id": ObjectId(status_id)}, {"$set": update_dict})
        
        updated = await collection.find_one({"_id": ObjectId(status_id)})
        return task_status_helper(updated)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{status_id}")
async def delete_task_status(status_id: str, db=Depends(get_database)):
    """Удаление статуса задачи"""
    try:
        collection = db.crm_task_statuses
        existing = await collection.find_one({"_id": ObjectId(status_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Статус не найден")
        
        if existing.get("is_system"):
            raise HTTPException(status_code=400, detail="Нельзя удалить системный статус")
        
        tasks_count = await db.crm_tasks.count_documents({"status": existing.get("code")})
        if tasks_count > 0:
            raise HTTPException(status_code=400, detail=f"Статус используется в {tasks_count} задачах")
        
        await collection.delete_one({"_id": ObjectId(status_id)})
        return {"success": True, "message": "Статус удалён"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reorder")
async def reorder_task_statuses(orders: List[dict], db=Depends(get_database)):
    """Изменение порядка статусов"""
    try:
        for item in orders:
            await db.crm_task_statuses.update_one(
                {"_id": ObjectId(item["id"])},
                {"$set": {"order": item["order"], "updated_at": datetime.utcnow()}}
            )
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
