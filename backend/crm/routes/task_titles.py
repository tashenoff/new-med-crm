from fastapi import APIRouter, Depends
from database import get_database
from ..schemas.task_schemas import TaskTitleInput, TaskTitleUpdate
from ..services.task_title_service import TaskTitleService
from ..task_permissions import read_titles, edit_titles

router = APIRouter(prefix='/task-titles', tags=['CRM Task Titles'])

@router.get('')
async def list_titles(active_only: bool = False, include_inactive: bool = True, user=Depends(read_titles), db=Depends(get_database)):
    return {'titles': await TaskTitleService(db).list(active_only=active_only or not include_inactive)}

@router.post('', status_code=201)
async def create_title(payload: TaskTitleInput, user=Depends(edit_titles), db=Depends(get_database)):
    return await TaskTitleService(db).create(payload)

@router.put('/{identifier}')
async def update_title(identifier: str, payload: TaskTitleUpdate, user=Depends(edit_titles), db=Depends(get_database)):
    return await TaskTitleService(db).update(identifier, payload)

@router.delete('/{identifier}')
async def archive_title(identifier: str, user=Depends(edit_titles), db=Depends(get_database)):
    return await TaskTitleService(db).update(identifier, TaskTitleUpdate(is_active=False))
