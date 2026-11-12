"""Authenticated task API with independent read/create/edit grants."""
from typing import Optional, List, Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from database import get_database
from ..models.task import Task, TaskStatus, TaskType, TaskPriority
from ..schemas.task_schemas import TaskCreate, TaskUpdate, TaskSearchFilters
from ..services.task_service import TaskService
from ..task_permissions import view_tasks, create_tasks, edit_tasks, compose_tasks

router = APIRouter(prefix='/tasks', tags=['CRM Tasks'])

def get_task_service():
    return TaskService(get_database())

@router.get('/assignees')
async def assignees(user=Depends(compose_tasks), db=Depends(get_database)):
    return {'assignees': await TaskService(db).assignees()}

@router.post('', response_model=Task, status_code=201)
async def create_task(task_data: TaskCreate, current_user=Depends(create_tasks), db=Depends(get_database)):
    return await TaskService(db).create_task(task_data, created_by=current_user.id)

def filters_for(status=None, type=None, priority=None, **kwargs):
    try:
        return TaskSearchFilters(status=[TaskStatus(value) for value in status.split(',')] if status else None,
            type=[TaskType(value) for value in type.split(',')] if type else None,
            priority=[TaskPriority(value) for value in priority.split(',')] if priority else None, **kwargs)
    except ValueError:
        raise HTTPException(422, 'Некорректный фильтр задач')

@router.get('', response_model=List[Task])
async def get_tasks(skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = None, type: Optional[str] = None, priority: Optional[str] = None,
    assigned_to: Optional[str] = None, lead_id: Optional[str] = None, client_id: Optional[str] = None,
    chat_phone: Optional[str] = None, kind: Optional[Literal['task', 'note', 'comment']] = None,
    search: Optional[str] = Query(None, max_length=250), show_overdue: Optional[bool] = None,
    show_completed: bool = True, current_user=Depends(view_tasks), db=Depends(get_database)):
    filters = filters_for(status, type, priority, assigned_to=assigned_to, lead_id=lead_id,
        client_id=client_id, chat_phone=chat_phone, kind=kind, search=search,
        show_overdue=show_overdue, show_completed=show_completed)
    return await TaskService(db).get_tasks(skip=skip, limit=limit, filters=filters)

@router.get('/count')
async def count_tasks(status: Optional[str] = None, assigned_to: Optional[str] = None,
    current_user=Depends(view_tasks), db=Depends(get_database)):
    return {'count': await TaskService(db).count_tasks(filters_for(status=status, assigned_to=assigned_to))}

@router.get('/today', response_model=List[Task])
async def get_today_tasks(assigned_to: Optional[str] = None, current_user=Depends(view_tasks), db=Depends(get_database)):
    return await TaskService(db).get_today_tasks(assigned_to)

@router.get('/overdue', response_model=List[Task])
async def get_overdue_tasks(assigned_to: Optional[str] = None, current_user=Depends(view_tasks), db=Depends(get_database)):
    return await TaskService(db).get_overdue_tasks(assigned_to)

@router.get('/by-lead/{lead_id}', response_model=List[Task])
async def get_tasks_by_lead(lead_id: str, current_user=Depends(view_tasks), db=Depends(get_database)):
    return await TaskService(db).get_tasks_by_lead(lead_id)

@router.get('/by-client/{client_id}', response_model=List[Task])
async def get_tasks_by_client(client_id: str, current_user=Depends(view_tasks), db=Depends(get_database)):
    return await TaskService(db).get_tasks_by_client(client_id)

@router.post('/update-overdue')
async def update_overdue_tasks(current_user=Depends(edit_tasks), db=Depends(get_database)):
    return {'updated_count': await TaskService(db).update_overdue_tasks()}

def require_found(task):
    if task is None:
        raise HTTPException(404, 'Задача не найдена')
    return task

@router.get('/{task_id}', response_model=Task)
async def get_task(task_id: str, current_user=Depends(view_tasks), db=Depends(get_database)):
    return require_found(await TaskService(db).get_task_by_id(task_id))

@router.put('/{task_id}', response_model=Task)
async def update_task(task_id: str, update_data: TaskUpdate, current_user=Depends(edit_tasks), db=Depends(get_database)):
    return require_found(await TaskService(db).update_task(task_id, update_data))

@router.delete('/{task_id}')
async def delete_task(task_id: str, current_user=Depends(edit_tasks), db=Depends(get_database)):
    if not await TaskService(db).delete_task(task_id):
        raise HTTPException(404, 'Задача не найдена')
    return {'success': True}

@router.patch('/{task_id}/complete', response_model=Task)
@router.post('/{task_id}/complete', response_model=Task)
async def complete_task(task_id: str, current_user=Depends(edit_tasks), db=Depends(get_database)):
    return require_found(await TaskService(db).complete_task(task_id))

@router.patch('/{task_id}/cancel', response_model=Task)
@router.post('/{task_id}/cancel', response_model=Task)
async def cancel_task(task_id: str, current_user=Depends(edit_tasks), db=Depends(get_database)):
    return require_found(await TaskService(db).cancel_task(task_id))
