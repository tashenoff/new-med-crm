"""
Sources Routes - API маршруты для работы с источниками обращений
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..services.source_service import SourceService
from ..schemas.source_schemas import SourceCreate, SourceUpdate, SourceResponse, SourceStatistics
from ..models.source import SourceStatus, SourceType, Source
from ..models.source_dimensions import SourceExpense
from ..services.source_expenses import append_expense, expense_summary
from ..services.source_attribution import detection_status
from models.auth import UserRole
from routers.auth import require_role

from ..dependencies import get_database

def source_to_response(source: Source) -> SourceResponse:
    """Преобразует модель источника в схему ответа"""
    source_dict = source.dict()
    # Добавляем вычисляемые поля
    source_dict["roi"] = source.roi
    source_dict["total_cost"] = source.total_cost
    source_dict["avg_monthly_leads"] = source.avg_monthly_leads
    return SourceResponse(**source_dict)

sources_router = APIRouter(prefix="/sources", tags=["Sources"])


@sources_router.get('/configuration/catalog', response_model=List[SourceResponse], dependencies=[Depends(require_role([role for role in UserRole if role != UserRole.PATIENT]))])
async def configuration_catalog(db=Depends(get_database)):
    documents = await db.crm_sources.find({'synthetic_batch_id': {'$exists': False}}).to_list(length=None)
    return [source_to_response(Source(**SourceService._normalize_source_doc(row))) for row in documents]


@sources_router.get('/detection/status', dependencies=[Depends(require_role([role for role in UserRole if role != UserRole.PATIENT]))])
async def get_detection_status(db=Depends(get_database)):
    sources = await db.crm_sources.find({'synthetic_batch_id': {'$exists': False}},
                                       {'id': 1, 'status': 1, 'channels': 1, 'campaigns': 1}).to_list(length=None)
    mappings = await db.crm_inbound_source_mappings.find({}).to_list(length=None)
    return detection_status(sources, mappings)


@sources_router.post('/{source_id}/expenses', dependencies=[Depends(require_role([role for role in UserRole if role != UserRole.PATIENT]))])
async def add_expense(source_id: str, payload: SourceExpense,
                      user=Depends(require_role([role for role in UserRole if role != UserRole.PATIENT])),
                      db=Depends(get_database)):
    return await append_expense(db, source_id, payload, user.id)


@sources_router.get('/{source_id}/expenses', dependencies=[Depends(require_role([role for role in UserRole if role != UserRole.PATIENT]))])
async def get_expenses(source_id: str, db=Depends(get_database)):
    return await expense_summary(db, source_id)


@sources_router.post("/", response_model=SourceResponse)
async def create_source(
    source_data: SourceCreate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Создать новый источник"""
    try:
        source_service = SourceService(db)
        source = await source_service.create_source(source_data)
        return source_to_response(source)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@sources_router.get("/", response_model=List[SourceResponse])
async def get_sources(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[SourceStatus] = Query(None),
    source_type: Optional[SourceType] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить список источников"""
    try:
        source_service = SourceService(db)
        sources = await source_service.get_sources(
            skip=skip, 
            limit=limit, 
            status=status, 
            source_type=source_type, 
            search=search
        )
        return [source_to_response(source) for source in sources]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@sources_router.get("/{source_id}", response_model=SourceResponse)
async def get_source(
    source_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить источник по ID"""
    source_service = SourceService(db)
    source = await source_service.get_source_by_id(source_id)
    
    if not source:
        raise HTTPException(status_code=404, detail="Источник не найден")
    
    return source_to_response(source)


@sources_router.put("/{source_id}", response_model=SourceResponse)
async def update_source(
    source_id: str,
    update_data: SourceUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Обновить источник"""
    try:
        source_service = SourceService(db)
        source = await source_service.update_source(source_id, update_data)
        
        if not source:
            raise HTTPException(status_code=404, detail="Источник не найден")
        
        return source_to_response(source)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@sources_router.delete("/{source_id}")
async def delete_source(
    source_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Удалить источник"""
    try:
        source_service = SourceService(db)
        deleted = await source_service.delete_source(source_id)
        
        if not deleted:
            raise HTTPException(status_code=404, detail="Источник не найден")
        
        return {"message": "Источник успешно удален"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@sources_router.get("/statistics/summary", response_model=SourceStatistics)
async def get_sources_statistics(
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить статистику по источникам"""
    try:
        source_service = SourceService(db)
        stats = await source_service.get_statistics()
        return SourceStatistics(**stats)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@sources_router.post("/update-statistics")
async def update_sources_statistics(
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Обновить статистику для всех источников"""
    try:
        source_service = SourceService(db)
        await source_service.update_all_statistics()
        return {"message": "Статистика источников обновлена"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

