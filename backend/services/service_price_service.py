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

        # Complex service ("комплексная услуга"): validate the composition against
        # the directory, then mark the price as a package.
        if service_price.service_type == "complex" or service_price.components:
            await self._validate_components(service_price.components)
            price_dict["service_type"] = "complex"

        price_obj = ServicePrice(**price_dict)
        await self.db.service_prices.insert_one(price_obj.dict())
        return price_obj

    async def _validate_components(self, components, exclude_id=None):
        """Validate every component of a complex against the directory.

        Raises fastapi.HTTPException(400) if a component is missing, disabled,
        is itself a complex, or (when exclude_id is given) references the
        complex being edited.
        """
        for comp in components:
            cid = comp.service_id
            if exclude_id and cid == exclude_id:
                raise HTTPException(status_code=400, detail="Комплекс не может включать сам себя")
            doc = await self.db.service_prices.find_one({"id": cid})
            if not doc:
                raise HTTPException(status_code=400, detail="В составе комплекса есть несуществующая услуга")
            if not doc.get("is_active", True):
                raise HTTPException(status_code=400, detail="В составе комплекса есть отключённая услуга")
            if doc.get("service_type") == "complex":
                raise HTTPException(status_code=400, detail="В составе комплекса не может быть другой комплекс")
    
    async def update_service_price(
        self, 
        price_id: str, 
        service_price_update: ServicePriceUpdate
    ) -> ServicePrice:
        """Update service price"""
        update_dict = {k: v for k, v in service_price_update.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()

        # Complex composition validation on update: components (if provided) must be
        # resolvable, active, non-complex, and must not reference this very price.
        if service_price_update.components is not None and service_price_update.components:
            await self._validate_components(service_price_update.components, exclude_id=price_id)

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
    
    async def get_complex_summary(self, complex_price, components):
        """Retail sum of a complex's components from LIVE directory prices,
        plus the economy (sum - package price). Derived from data, not hardcoded."""
        total = 0.0
        for comp in components:
            doc = await self.db.service_prices.find_one({"id": comp.service_id})
            if not doc:
                continue
            unit = doc.get("price", 0) or 0
            total += float(unit) * comp.quantity
        package_price = float(complex_price)
        return {
            "sum_components": round(total, 2),
            "complex_price": package_price,
            "economy": round(total - package_price, 2),
        }

    async def build_complex_plan_line(self, complex_id, quantity=1):
        """Build the SINGLE treatment-plan line for a complex service.

        The complex lands in a plan as one row (price -> total_price); the
        composition is embedded inside the line so salary/print/display can use
        it without re-querying. Rejects non-complex services."""
        doc = await self.db.service_prices.find_one({"id": complex_id})
        if not doc or doc.get("service_type") != "complex":
            raise HTTPException(status_code=400, detail="Комплексная услуга не найдена")
        qty = quantity or 1
        price = float(doc.get("price", 0) or 0)
        components = doc.get("components") or []
        return {
            "service_id": doc["id"],
            "service_name": doc.get("service_name"),
            "category": doc.get("category"),
            "price": price,
            "quantity": qty,
            "total_price": round(price * qty, 2),
            "is_complex": True,
            "components": [dict(c) for c in components],
        }

    async def get_specialists_for_service(self, service_id):
        """Doctors who can perform a service: either list the service among their
        provided services, or match the service's category by specialty.
        Used to suggest a specialist for a complex component."""
        service = await self.db.service_prices.find_one({"id": service_id})
        if not service:
            return []
        category = (service.get("category") or "").lower()
        doctors = await self.db.doctors.find({"is_active": True}).to_list(None)
        result = []
        for doc in doctors:
            services = doc.get("services") or []
            ids = [s.get("service_id") if isinstance(s, dict) else s for s in services]
            specs = doc.get("specialties") or ([doc["specialty"]] if doc.get("specialty") else [])
            by_service = service_id in ids
            by_specialty = bool(category and any((sp or "").lower() == category for sp in specs))
            if by_service or by_specialty:
                result.append({"id": doc.get("id"), "full_name": doc.get("full_name")})
        return result

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
