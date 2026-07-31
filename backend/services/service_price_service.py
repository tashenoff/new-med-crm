"""
Service price service - business logic for service price operations
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException
from datetime import datetime
from typing import List, Optional

from models.services import ServicePrice, ServicePriceCreate, ServicePriceUpdate


class ServicePriceService:
    """Service for service price-related business logic"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def get_service_prices(
        self, 
        category: Optional[str] = None, 
        active_only: bool = True,
        search: Optional[str] = None
    ) -> List[ServicePrice]:
        """Get all service prices from directory"""
        filters = {}
        if active_only:
            filters["is_active"] = True
        if category:
            filters["category"] = category
        if search:
            # Case-insensitive search in service name
            filters["service_name"] = {"$regex": search, "$options": "i"}
        
        prices = await self.db.service_prices.find(filters).sort("category", 1).sort("service_name", 1).to_list(None)
        return [ServicePrice(**price) for price in prices]
    
    async def create_service_price(self, service_price: ServicePriceCreate) -> ServicePrice:
        """Create new service price"""
        # Check if service with same name already exists
        existing = await self.db.service_prices.find_one({
            "service_name": service_price.service_name,
            "is_active": True
        })
        
        if existing:
            raise HTTPException(status_code=400, detail="Service with this name already exists")
        
        price_dict = service_price.dict()
        price_obj = ServicePrice(**price_dict)
        await self.db.service_prices.insert_one(price_obj.dict())
        return price_obj
    
    async def update_service_price(
        self, 
        price_id: str, 
        service_price_update: ServicePriceUpdate
    ) -> ServicePrice:
        """Update service price"""
        update_dict = {k: v for k, v in service_price_update.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        
        result = await self.db.service_prices.update_one(
            {"id": price_id}, 
            {"$set": update_dict}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Service price not found")
        
        updated_price = await self.db.service_prices.find_one({"id": price_id})
        return ServicePrice(**updated_price)
    
    async def delete_service_price(self, price_id: str) -> dict:
        """Delete (deactivate) service price"""
        result = await self.db.service_prices.update_one(
            {"id": price_id}, 
            {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Service price not found")
        
        return {"message": "Service price deleted successfully"}
    
    async def get_service_categories(self) -> dict:
        """Get all service categories"""
        categories = await self.db.service_prices.distinct("category", {"is_active": True, "category": {"$ne": None}})
        return {"categories": categories}
    
    async def get_lab_price_statistics(self) -> dict:
        """Get laboratory price statistics - total count and cost"""
        # Фильтр для лабораторных услуг (можно настроить категории)
        lab_categories = ["Лаборатория", "Анализы", "Лабораторные исследования"]
        
        # Получаем все активные лабораторные услуги
        filters = {
            "is_active": True,
            "category": {"$in": lab_categories}
        }
        
        lab_services = await self.db.service_prices.find(filters).to_list(None)
        
        # Если нет специфических категорий, берем все услуги
        if not lab_services:
            filters = {"is_active": True}
            lab_services = await self.db.service_prices.find(filters).to_list(None)
        
        # Вычисляем статистику
        total_count = len(lab_services)
        total_cost = sum(service.get("price", 0) for service in lab_services)
        
        # Группировка по категориям
        categories_stats = {}
        for service in lab_services:
            category = service.get("category", "Без категории")
            if category not in categories_stats:
                categories_stats[category] = {
                    "count": 0,
                    "total_cost": 0,
                    "services": []
                }
            categories_stats[category]["count"] += 1
            categories_stats[category]["total_cost"] += service.get("price", 0)
            categories_stats[category]["services"].append({
                "name": service.get("service_name"),
                "price": service.get("price", 0)
            })
        
        # Преобразуем услуги в простые dict без MongoDB ObjectId
        services_list = []
        for service in lab_services:
            services_list.append({
                "id": service.get("id"),
                "service_name": service.get("service_name"),
                "category": service.get("category"),
                "price": service.get("price", 0),
                "unit": service.get("unit", "процедура")
            })
        
        return {
            "total_count": total_count,
            "total_cost": total_cost,
            "categories": categories_stats,
            "services": services_list
        }
