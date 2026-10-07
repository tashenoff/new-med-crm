from typing import List

from fastapi import APIRouter, Depends
from models.auth import UserRole
from routers.auth import require_role

from ..dependencies import get_database
from ..schemas.kanban_schemas import ColumnName, ColumnOrder, ColumnMove, KanbanColumn, ColumnDeleted, ColumnMoved
from ..services.kanban_service import KanbanService


kanban_router = APIRouter(
    tags=['CRM Kanban'],
    dependencies=[Depends(require_role([role for role in UserRole if role != UserRole.PATIENT]))],
)


@kanban_router.get('/kanban/columns', response_model=List[KanbanColumn])
async def get_columns(db=Depends(get_database)):
    return await KanbanService(db).columns()


@kanban_router.post('/kanban/columns', response_model=KanbanColumn, status_code=201)
async def create_column(payload: ColumnName, db=Depends(get_database)):
    return await KanbanService(db).create(payload.name)


@kanban_router.put('/kanban/columns/order', response_model=List[KanbanColumn])
async def order_columns(payload: ColumnOrder, db=Depends(get_database)):
    return await KanbanService(db).reorder(payload.column_ids)


@kanban_router.patch('/kanban/columns/{column_id}', response_model=KanbanColumn)
async def rename_column(column_id: str, payload: ColumnName, db=Depends(get_database)):
    return await KanbanService(db).rename(column_id, payload.name)


@kanban_router.delete('/kanban/columns/{column_id}', response_model=ColumnDeleted)
async def delete_column(column_id: str, db=Depends(get_database)):
    return await KanbanService(db).delete(column_id)


@kanban_router.patch('/leads/{lead_id}/kanban-column', response_model=ColumnMoved)
async def move_card(lead_id: str, payload: ColumnMove, db=Depends(get_database)):
    return await KanbanService(db).move(lead_id, payload.column_id)
