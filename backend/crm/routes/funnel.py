from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from models.auth import UserRole
from routers.auth import require_role

from ..dependencies import get_database
from ..services.funnel_report import load_report
from ..services.kanban_service import KanbanService, normalized_columns

funnel_router = APIRouter(prefix='/funnel', tags=['CRM funnel'],
                         dependencies=[Depends(require_role([role for role in UserRole if role != UserRole.PATIENT]))])


async def load_columns(db):
    configuration = await KanbanService(db).configuration()
    if not configuration or configuration.get('pending_operation'):
        raise HTTPException(409, 'Настройка этапов отсутствует или меняется. Откройте CRM/Сделки и повторите загрузку.')
    return normalized_columns(configuration)


def source_scope(synthetic_batch):
    return {'synthetic_batch_id': synthetic_batch} if synthetic_batch else {'synthetic_batch_id': {'$exists': False}}


async def source_methods(db, source_id, synthetic_batch):
    # Read only: SourceService.get_source_by_id also updates source statistics.
    source = await db.crm_sources.find_one({**source_scope(synthetic_batch), 'id': source_id},
                                           {'id': 1, 'channels': 1})
    if source is None:
        raise HTTPException(404, 'Источник недоступен')
    methods = source.get('channels') or []
    if not isinstance(methods, list):
        raise HTTPException(409, 'Проверьте настройку способов обращения у источника')
    ids = [item.get('id') for item in methods if isinstance(item, dict)]
    if (len(ids) != len(methods) or any(not isinstance(value, str) or not value for value in ids)
            or len(set(ids)) != len(ids) or any(not isinstance(item.get('name'), str) or not item['name'] for item in methods)):
        raise HTTPException(409, 'Проверьте настройку способов обращения у источника')
    # Archived methods remain selectable for historical reporting, with an explicit label in UI.
    return [{'id': item['id'], 'name': item['name'], 'active': item.get('active', True) is not False}
            for item in methods]


@funnel_router.get('/methods')
async def methods(source_id: str = Query(min_length=1, max_length=120),
                  synthetic_batch: Optional[str] = Query(default=None, min_length=1, max_length=120),
                  db=Depends(get_database)):
    return {'source_id': source_id, 'methods': await source_methods(db, source_id, synthetic_batch)}


@funnel_router.get('/report')
async def report(start: datetime, end: datetime, mode: str = 'history',
                 steps: List[str] = Query(default=[]), source_ids: Optional[List[str]] = Query(default=None), source_selection: str = 'all',
                 window_days: int = Query(default=30, ge=1, le=365),
                 channel_id: Optional[str] = Query(default=None, min_length=1, max_length=120),
                 synthetic_batch: Optional[str] = Query(default=None, min_length=1, max_length=120),
                 db=Depends(get_database)):
    if start.tzinfo is None or end.tzinfo is None or start >= end:
        raise HTTPException(422, 'Укажите корректный период с часовым поясом: начало включительно, конец исключительно')
    if mode not in ('history', 'snapshot'):
        raise HTTPException(422, 'Неизвестный режим отчёта')
    if source_selection not in ('all', 'selected'):
        raise HTTPException(422, 'Некорректная область источников')
    source_ids = (source_ids or []) if source_selection == 'selected' else None
    if channel_id is not None:
        if not source_ids or len(source_ids) != 1 or not source_ids[0].startswith('source:') or not source_ids[0][7:]:
            raise HTTPException(422, 'Для способа обращения выберите один источник')
        configured_methods = await source_methods(db, source_ids[0][7:], synthetic_batch)
        if channel_id not in {item['id'] for item in configured_methods}:
            raise HTTPException(422, 'Способ обращения не принадлежит выбранному источнику')
    columns = await load_columns(db)
    if mode == 'history' and (len(steps) < 2 or len(steps) > 30 or len(set(steps)) != len(steps) or any(not step or len(step) > 120 for step in steps)):
        raise HTTPException(422, 'Выберите от 2 до 30 разных текущих этапов в порядке прохождения')
    if source_ids is not None and (len(source_ids) > 100 or len(set(source_ids)) != len(source_ids)):
        raise HTTPException(422, 'Некорректный выбор источников')
    source_query = source_scope(synthetic_batch)
    sources = await db.crm_sources.find(source_query, {'id': 1, 'name': 1}).to_list(length=None)
    return await load_report(db, columns, sources, mode=mode, steps=steps, start=start, end=end,
                             window_days=window_days, source_ids=source_ids, channel_id=channel_id, synthetic_batch=synthetic_batch)


@funnel_router.get('/options')
async def options(synthetic_batch: Optional[str] = Query(default=None, min_length=1, max_length=120), db=Depends(get_database)):
    query = source_scope(synthetic_batch)
    sources = await db.crm_sources.find(query, {'id': 1, 'name': 1}).to_list(length=None)
    return {'columns': await load_columns(db),
            'sources': [{'key': 'source:' + source['id'], 'name': source['name']} for source in sources],
            'synthetic_batch': synthetic_batch}
