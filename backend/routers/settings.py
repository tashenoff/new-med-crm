"""
Settings router - управление настройками системы и сброс данных
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from database import db
from routers.auth import get_current_active_user
from models.auth import UserInDB

router = APIRouter(prefix="/api/settings", tags=["settings"])

class ResetDataRequest(BaseModel):
    collections: List[str]  # Список коллекций для очистки
    confirm: bool = False

class ResetDataResponse(BaseModel):
    success: bool
    message: str
    deleted_counts: dict

# Доступные для очистки коллекции
ALLOWED_COLLECTIONS = [
    "appointments",
    "patients", 
    "treatment_plans",
    "consultations",
    "payments",
    "invoices",
    "documents",
    "insights",
    "notifications",
    "leads",
    "tasks",
    "materials",
    "inventory_operations",
    "doctors",
    "users",
    "rooms",
    "staff",
    "doctor_schedules",
    "room_schedules"
]

# Коллекции, требующие специальной обработки
SPECIAL_COLLECTIONS = ["doctors", "users"]

@router.get("/available-collections")
async def get_available_collections(current_user: UserInDB = Depends(get_current_active_user)):
    """Получить список коллекций, доступных для очистки"""
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Только администраторы могут управлять данными")
    
    collection_info = {
        "appointments": "Записи на приём",
        "patients": "Пациенты",
        "treatment_plans": "Планы лечения",
        "consultations": "Консультации",
        "payments": "Платежи",
        "invoices": "Счета",
        "documents": "Документы",
        "insights": "Инсайты",
        "notifications": "Уведомления",
        "leads": "Лиды (CRM)",
        "tasks": "Задачи (CRM)",
        "materials": "Материалы склада",
        "inventory_operations": "Операции склада",
        "doctors": "Врачи",
        "users": "Пользователи (кроме super_admin)",
        "rooms": "Кабинеты",
        "staff": "Сотрудники (персонал)",
        "doctor_schedules": "Расписание врачей",
        "room_schedules": "Расписание кабинетов"
    }
    
    return {
        "collections": [
            {"key": key, "label": label}
            for key, label in collection_info.items()
        ]
    }

@router.post("/reset-data", response_model=ResetDataResponse)
async def reset_data(
    request: ResetDataRequest,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Сбросить (очистить) выбранные коллекции данных"""
    
    # Проверка прав доступа
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Только администраторы могут сбрасывать данные")
    
    # Проверка подтверждения
    if not request.confirm:
        raise HTTPException(status_code=400, detail="Требуется подтверждение операции")
    
    # Проверка коллекций
    invalid_collections = [c for c in request.collections if c not in ALLOWED_COLLECTIONS]
    if invalid_collections:
        raise HTTPException(
            status_code=400, 
            detail=f"Недопустимые коллекции: {', '.join(invalid_collections)}"
        )
    
    if not request.collections:
        raise HTTPException(status_code=400, detail="Не выбраны коллекции для очистки")
    
    deleted_counts = {}
    
    try:
        for collection_name in request.collections:
            collection = db[collection_name]
            
            # Специальная обработка для коллекции users - сохраняем super_admin
            if collection_name == "users":
                result = await collection.delete_many({"role": {"$ne": "super_admin"}})
            else:
                result = await collection.delete_many({})
            
            deleted_counts[collection_name] = result.deleted_count
        
        # Логируем операцию сброса
        await db["audit_log"].insert_one({
            "action": "data_reset",
            "collections": request.collections,
            "deleted_counts": deleted_counts,
            "user_id": str(current_user.id),
            "user_email": current_user.email,
            "user_name": current_user.full_name,
            "timestamp": datetime.utcnow()
        })
        
        return ResetDataResponse(
            success=True,
            message=f"Успешно очищено {len(request.collections)} коллекций",
            deleted_counts=deleted_counts
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка при сбросе данных: {str(e)}")

@router.delete("/reset-all")
async def reset_all_data(
    confirm: bool = False,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Сбросить ВСЕ данные (кроме пользователей и базовых справочников)"""
    
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Только super_admin может сбросить все данные")
    
    if not confirm:
        raise HTTPException(status_code=400, detail="Требуется подтверждение: confirm=true")
    
    deleted_counts = {}
    
    try:
        for collection_name in ALLOWED_COLLECTIONS:
            collection = db[collection_name]
            
            # Специальная обработка для коллекции users - сохраняем super_admin
            if collection_name == "users":
                result = await collection.delete_many({"role": {"$ne": "super_admin"}})
            else:
                result = await collection.delete_many({})
            
            deleted_counts[collection_name] = result.deleted_count
        
        # Логируем полный сброс
        await db["audit_log"].insert_one({
            "action": "full_data_reset",
            "collections": ALLOWED_COLLECTIONS,
            "deleted_counts": deleted_counts,
            "user_id": str(current_user.id),
            "user_email": current_user.email,
            "user_name": current_user.full_name,
            "timestamp": datetime.utcnow()
        })
        
        return {
            "success": True,
            "message": "Все данные успешно сброшены",
            "deleted_counts": deleted_counts
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка при полном сбросе данных: {str(e)}")
