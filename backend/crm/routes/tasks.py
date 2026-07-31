"""
Tasks Router - Маршруты для работы с задачами CRM
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from datetime import datetime

from ..models.task import Task, TaskStatus, TaskType, TaskPriority
from ..schemas.task_schemas import TaskCreate, TaskUpdate, TaskSearchFilters
from ..services.task_service import TaskService
from dependencies import get_current_user
from models.auth import User
from database import get_database


router = APIRouter(prefix="/api/crm/tasks", tags=["CRM Tasks"])


async def get_task_service() -> TaskService:
    """Получить сервис задач"""
    db = await get_database()
    return TaskService(db)


@router.post("", response_model=Task)
async def create_task(
    task_data: TaskCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Создать новую задачу
    """
    try:
        task_service = await get_task_service()
        task = await task_service.create_task(task_data, created_by=current_user.username)
        return task
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка создания задачи: {str(e)}")


@router.get("", response_model=List[Task])
async def get_tasks(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None, description="Фильтр по статусу (через запятую)"),
    type: Optional[str] = Query(None, description="Фильтр по типу (через запятую)"),
    priority: Optional[str] = Query(None, description="Фильтр по приоритету (через запятую)"),
    assigned_to: Optional[str] = Query(None, description="Фильтр по ответственному"),
    lead_id: Optional[str] = Query(None, description="Фильтр по лиду"),
    client_id: Optional[str] = Query(None, description="Фильтр по клиенту"),
    search: Optional[str] = Query(None, description="Поиск по названию и описанию"),
    show_overdue: Optional[bool] = Query(None, description="Показать только просроченные"),
    show_completed: Optional[bool] = Query(True, description="Показать выполненные"),
    current_user: User = Depends(get_current_user)
):
    """
    Получить список задач с фильтрацией
    """
    try:
        task_service = await get_task_service()
        
        # Формируем фильтры
        filters = TaskSearchFilters(
            status=[TaskStatus(s) for s in status.split(",")] if status else None,
            type=[TaskType(t) for t in type.split(",")] if type else None,
            priority=[TaskPriority(p) for p in priority.split(",")] if priority else None,
            assigned_to=assigned_to,
            lead_id=lead_id,
            client_id=client_id,
            search=search,
            show_overdue=show_overdue,
            show_completed=show_completed
        )
        
        tasks = await task_service.get_tasks(skip=skip, limit=limit, filters=filters)
        return tasks
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения задач: {str(e)}")


@router.get("/count")
async def count_tasks(
    status: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user)
):
    """
    Подсчитать количество задач
    """
    try:
        task_service = await get_task_service()
        
        filters = None
        if status or assigned_to:
            filters = TaskSearchFilters(
                status=[TaskStatus(s) for s in status.split(",")] if status else None,
                assigned_to=assigned_to
            )
        
        count = await task_service.count_tasks(filters=filters)
        return {"count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка подсчета задач: {str(e)}")


@router.get("/today", response_model=List[Task])
async def get_today_tasks(
    assigned_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user)
):
    """
    Получить задачи на сегодня
    """
    try:
        task_service = await get_task_service()
        tasks = await task_service.get_today_tasks(assigned_to=assigned_to)
        return tasks
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения задач: {str(e)}")


@router.get("/overdue", response_model=List[Task])
async def get_overdue_tasks(
    assigned_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user)
):
    """
    Получить просроченные задачи
    """
    try:
        task_service = await get_task_service()
        tasks = await task_service.get_overdue_tasks(assigned_to=assigned_to)
        return tasks
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения задач: {str(e)}")


@router.get("/by-lead/{lead_id}", response_model=List[Task])
async def get_tasks_by_lead(
    lead_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Получить задачи по лиду
    """
    try:
        task_service = await get_task_service()
        tasks = await task_service.get_tasks_by_lead(lead_id)
        return tasks
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения задач: {str(e)}")


@router.get("/by-client/{client_id}", response_model=List[Task])
async def get_tasks_by_client(
    client_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Получить задачи по клиенту
    """
    try:
        task_service = await get_task_service()
        tasks = await task_service.get_tasks_by_client(client_id)
        return tasks
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения задач: {str(e)}")


@router.get("/{task_id}", response_model=Task)
async def get_task(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Получить задачу по ID
    """
    try:
        task_service = await get_task_service()
        task = await task_service.get_task_by_id(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Задача не найдена")
        return task
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка получения задачи: {str(e)}")


@router.put("/{task_id}", response_model=Task)
async def update_task(
    task_id: str,
    update_data: TaskUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    Обновить задачу
    """
    try:
        task_service = await get_task_service()
        task = await task_service.update_task(task_id, update_data)
        if not task:
            raise HTTPException(status_code=404, detail="Задача не найдена")
        return task
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка обновления задачи: {str(e)}")


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Удалить задачу
    """
    try:
        task_service = await get_task_service()
        success = await task_service.delete_task(task_id)
        if not success:
            raise HTTPException(status_code=404, detail="Задача не найдена")
        return {"success": True, "message": "Задача удалена"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка удаления задачи: {str(e)}")


@router.post("/{task_id}/complete", response_model=Task)
async def complete_task(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Отметить задачу как выполненную
    """
    try:
        task_service = await get_task_service()
        task = await task_service.complete_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Задача не найдена")
        return task
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка завершения задачи: {str(e)}")


@router.post("/{task_id}/cancel", response_model=Task)
async def cancel_task(
    task_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Отменить задачу
    """
    try:
        task_service = await get_task_service()
        task = await task_service.cancel_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Задача не найдена")
        return task
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка отмены задачи: {str(e)}")


@router.post("/update-overdue")
async def update_overdue_tasks(
    current_user: User = Depends(get_current_user)
):
    """
    Обновить статус просроченных задач (служебный endpoint)
    """
    try:
        task_service = await get_task_service()
        count = await task_service.update_overdue_tasks()
        return {"updated_count": count, "message": f"Обновлено {count} просроченных задач"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка обновления: {str(e)}")
