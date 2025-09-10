"""
Deals API Routes - Маршруты для работы со сделками
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..dependencies import get_database
from ..services.deal_service import DealService
from ..schemas.deal_schemas import DealCreate, DealUpdate, DealResponse
from ..models.deal import DealStatus, DealStage, DealPriority

deals_router = APIRouter(prefix="/deals", tags=["Deals"])

@deals_router.post("/", response_model=DealResponse)
async def create_deal(
    deal_data: DealCreate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Создать новую сделку"""
    try:
        deal_service = DealService(db)
        deal = await deal_service.create_deal(deal_data.dict())
        return deal
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@deals_router.get("/", response_model=List[DealResponse])
async def get_deals(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[List[DealStatus]] = Query(None),
    stage: Optional[List[DealStage]] = Query(None),
    priority: Optional[List[DealPriority]] = Query(None),
    manager_id: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить список сделок с фильтрацией"""
    try:
        deal_service = DealService(db)
        deals = await deal_service.get_deals(
            skip=skip,
            limit=limit,
            status=status,
            stage=stage,
            priority=priority,
            manager_id=manager_id,
            client_id=client_id,
            search=search
        )
        return deals
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@deals_router.get("/{deal_id}", response_model=DealResponse)
async def get_deal(
    deal_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить сделку по ID"""
    try:
        deal_service = DealService(db)
        deal = await deal_service.get_deal_by_id(deal_id)
        if not deal:
            raise HTTPException(status_code=404, detail="Сделка не найдена")
        return deal
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@deals_router.put("/{deal_id}", response_model=DealResponse)
async def update_deal(
    deal_id: str,
    deal_data: DealUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Обновить сделку"""
    try:
        deal_service = DealService(db)
        deal = await deal_service.update_deal(deal_id, deal_data.dict(exclude_unset=True))
        if not deal:
            raise HTTPException(status_code=404, detail="Сделка не найдена")
        return deal
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@deals_router.delete("/{deal_id}")
async def delete_deal(
    deal_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Удалить сделку"""
    try:
        deal_service = DealService(db)
        result = await deal_service.delete_deal(deal_id)
        if not result:
            raise HTTPException(status_code=404, detail="Сделка не найдена")
        return {"message": "Сделка успешно удалена"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@deals_router.post("/{deal_id}/win")
async def win_deal(
    deal_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Пометить сделку как выигранную"""
    try:
        deal_service = DealService(db)
        deal = await deal_service.get_deal_by_id(deal_id)
        if not deal:
            raise HTTPException(status_code=404, detail="Сделка не найдена")
        
        # Обновляем статус
        updated_deal = await deal_service.update_deal(deal_id, {
            "status": DealStatus.WON,
            "stage": DealStage.CLOSED
        })
        
        return updated_deal
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@deals_router.post("/{deal_id}/lose")
async def lose_deal(
    deal_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Пометить сделку как проигранную"""
    try:
        deal_service = DealService(db)
        deal = await deal_service.get_deal_by_id(deal_id)
        if not deal:
            raise HTTPException(status_code=404, detail="Сделка не найдена")
        
        # Обновляем статус
        updated_deal = await deal_service.update_deal(deal_id, {
            "status": DealStatus.LOST,
            "stage": DealStage.CLOSED
        })
        
        return updated_deal
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@deals_router.get("/statistics/summary")
async def get_deals_statistics(
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить статистику по сделкам"""
    try:
        deal_service = DealService(db)
        stats = await deal_service.get_statistics()
        return stats
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
