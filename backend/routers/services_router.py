"""
Services router - HTTP endpoints for service prices and services operations
Uses ServicePriceService for business logic
"""
from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional

# Import service models
from models.services import (
    ServicePrice,
    ServicePriceCreate,
    ServicePriceUpdate,
    Service,
    ServiceCreate
)

# Import auth dependencies
from models.auth import UserInDB, UserRole
from routers.auth import get_current_active_user, require_role
from database import db

# Import service
from services.service_price_service import ServicePriceService

# Router
services_api_router = APIRouter(tags=["Services"])


# Dependency to get service
def get_service_price_service():
    return ServicePriceService(db)


# ============================================================================
# Service Prices Endpoints
# ============================================================================

@services_api_router.get("/service-prices", response_model=List[ServicePrice])
async def get_service_prices(
    category: Optional[str] = None,
    active_only: bool = True,
    search: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_active_user),
    service: ServicePriceService = Depends(get_service_price_service)
):
    """Get all service prices from directory"""
    return await service.get_service_prices(category, active_only, search)


@services_api_router.get("/service-prices/statistics/lab")
async def get_lab_price_statistics(
    current_user: UserInDB = Depends(get_current_active_user),
    service: ServicePriceService = Depends(get_service_price_service)
):
    """Get laboratory service price statistics - total count and cost"""
    return await service.get_lab_price_statistics()


@services_api_router.post("/service-prices", response_model=ServicePrice)
async def create_service_price(
    service_price: ServicePriceCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])),
    price_service: ServicePriceService = Depends(get_service_price_service)
):
    """Create new service price"""
    return await price_service.create_service_price(service_price)


@services_api_router.put("/service-prices/{price_id}", response_model=ServicePrice)
async def update_service_price(
    price_id: str,
    service_price_update: ServicePriceUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])),
    service: ServicePriceService = Depends(get_service_price_service)
):
    """Update service price"""
    return await service.update_service_price(price_id, service_price_update)


@services_api_router.delete("/service-prices/{price_id}")
async def delete_service_price(
    price_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])),
    service: ServicePriceService = Depends(get_service_price_service)
):
    """Delete (deactivate) service price"""
    return await service.delete_service_price(price_id)


# ============================================================================
# Services Endpoints
# ============================================================================

@services_api_router.get("/services", response_model=List[Service])
async def get_services(
    category: Optional[str] = None,
    search: Optional[str] = None,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Get all services, optionally filtered by category and search query"""
    query = {}
    if category:
        query["category"] = category
    
    if search:
        # Case-insensitive search in service name
        query["name"] = {"$regex": search, "$options": "i"}
    
    services = await db.services.find(query).sort("category", 1).sort("name", 1).to_list(1000)
    return [Service(**service_item) for service_item in services]





@services_api_router.post("/services", response_model=Service)
async def create_service(
    service_data: ServiceCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """Create a new service (admin only)"""
    service_obj = Service(**service_data.dict())
    await db.services.insert_one(service_obj.dict())
    return service_obj


@services_api_router.post("/services/initialize")
async def initialize_default_services(
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """Initialize default services (admin only)"""
    existing_count = await db.services.count_documents({})
    if existing_count > 0:
        return {"message": f"Services already exist ({existing_count} services found)"}
    
    default_services = [
        # Стоматология
        {"name": "14C-уреазный дыхательный тест на определение Хеликобактер пилори (Helicobacter pylori)", "category": "Стоматолог", "price": 9960.0},
        {"name": "17-OH Прогестерон (17-ОП)", "category": "Стоматолог", "price": 4200.0},
        {"name": "Лечение кариеса", "category": "Стоматолог", "price": 15000.0},
        {"name": "Удаление зуба", "category": "Стоматолог", "price": 8000.0},
        {"name": "Установка пломбы", "category": "Стоматолог", "price": 12000.0},
        {"name": "Чистка зубов", "category": "Стоматолог", "price": 6000.0},
        # Гинекология
        {"name": "Консультация гинеколога", "category": "Гинекология", "price": 5000.0},
        {"name": "УЗИ органов малого таза", "category": "Гинекология", "price": 7000.0},
        # Ортодонт
        {"name": "Установка брекетов", "category": "Ортодонт", "price": 150000.0},
        {"name": "Коррекция прикуса", "category": "Ортодонт", "price": 25000.0},
        # Дерматовенеролог
        {"name": "Консультация дерматолога", "category": "Дерматовенеролог", "price": 4500.0},
        {"name": "Удаление новообразований", "category": "Дерматовенеролог", "price": 8000.0},
        # Медикаменты
        {"name": "Антибиотики", "category": "Медикаменты", "price": 2500.0},
        {"name": "Обезболивающие", "category": "Медикаменты", "price": 1200.0},
    ]
    
    services = [Service(**service_data) for service_data in default_services]
    await db.services.insert_many([service_obj.dict() for service_obj in services])
    
    return {"message": f"Successfully initialized {len(services)} default services"}
