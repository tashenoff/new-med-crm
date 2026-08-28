"""
Services router - HTTP endpoints for service prices and services operations
Uses ServicePriceService for business logic
"""
from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
from datetime import datetime

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
# ============================================================================
# Reports Endpoints
# ============================================================================

@services_api_router.get("/reports/services-report")
async def get_services_report(
    year: Optional[int] = None,
    month: Optional[int] = None,
    category: Optional[str] = None,
    doctor_id: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_active_user),
):
    """
    Отчет по оказанным услугам.
    Агрегирует данные из планов лечения: название услуги, категория,
    цена, ожидаемый доход и фактически оплаченная сумма.

    Параметры:
    - year: год для фильтрации (например, 2026)
    - month: месяц для фильтрации (1-12). Если указан year, фильтр по месяцу применяется только в пределах года.
    - category: фильтр по категории/специальности (например, "Терапия")
    - doctor_id: фильтр по врачу (ID врача)
    """
    # Формируем фильтр по дате
    date_filter = {}
    if year is not None:
        start_date = datetime(year, 1, 1, 0, 0, 0)
        if month is not None:
            next_month = month + 1 if month < 12 else 1
            next_year = year if month < 12 else year + 1
            end_date = datetime(next_year, next_month, 1, 0, 0, 0)
        else:
            end_date = datetime(year + 1, 1, 1, 0, 0, 0)
        date_filter = {
            "created_at": {
                "$gte": start_date,
                "$lt": end_date
            }
        }

    # Фильтр по врачу
    if doctor_id:
        date_filter["assigned_doctor_id"] = doctor_id

    # Получаем планы лечения с фильтром
    treatment_plans = await db.treatment_plans.find(date_filter).to_list(10000)

    # Агрегируем по каждой услуге
    services_map = {}

    for plan in treatment_plans:
        plan_services = plan.get("services", [])
        if not plan_services:
            continue

        for svc in plan_services:
            svc_name = svc.get("service_name", "").strip()
            if not svc_name:
                continue

            svc_category = svc.get("category", "Без категории")

            # Фильтр по категории
            if category and svc_category.lower() != category.lower():
                continue

            unit_price = svc.get("price_per_unit", svc.get("price", 0))
            total_price = svc.get("total_price", 0)
            quantity = svc.get("quantity_total", svc.get("quantity", 1))

            if svc_name not in services_map:
                services_map[svc_name] = {
                    "service_name": svc_name,
                    "category": svc_category,
                    "price": float(unit_price),
                    "total_expected": 0,
                    "total_paid": 0,
                    "quantity_total": 0
                }

            services_map[svc_name]["total_expected"] += float(total_price)
            services_map[svc_name]["quantity_total"] += quantity

            if svc.get("payment_status") == "paid":
                services_map[svc_name]["total_paid"] += float(total_price)

    # Пропорциональное распределение paid_amount плана
    for plan in treatment_plans:
        plan_services = plan.get("services", [])
        plan_paid = float(plan.get("paid_amount", 0))
        plan_total = float(plan.get("total_cost", 0))

        if plan_paid > 0 and plan_total > 0 and plan_services:
            for svc in plan_services:
                svc_name = svc.get("service_name", "").strip()
                if not svc_name or svc_name not in services_map:
                    continue

                # Если фильтр по категории, проверяем что услуга в результатах
                if category and svc.get("category", "").lower() != category.lower():
                    continue

                svc_total = float(svc.get("total_price", 0))
                if svc_total > 0 and svc.get("payment_status") != "paid":
                    proportion = svc_total / plan_total
                    services_map[svc_name]["total_paid"] += plan_paid * proportion

    # Преобразуем в список и сортируем
    result = list(services_map.values())
    result.sort(key=lambda x: x["total_expected"], reverse=True)

    totals = {
        "total_expected": sum(r["total_expected"] for r in result),
        "total_paid": sum(r["total_paid"] for r in result),
        "total_outstanding": sum(r["total_expected"] for r in result) - sum(r["total_paid"] for r in result),
        "services_count": len(result)
    }

    return {
        "items": result,
        "totals": totals,
        "period": {
            "year": year,
            "month": month
        }
    }


@services_api_router.get("/reports/services-report/{service_name}/details")
async def get_service_detail_report(
    service_name: str,
    year: Optional[int] = None,
    month: Optional[int] = None,
    current_user: UserInDB = Depends(get_current_active_user),
):
    """
    Детальный отчет по конкретной услуге.
    Возвращает список пациентов, которые пользовались данной услугой,
    с информацией о кабинете, количестве планов лечения,
    сумме к оплате и оплаченной сумме.
    """
    from urllib.parse import unquote
    decoded_service_name = unquote(service_name).strip()

    # Формируем фильтр по дате
    date_filter = {}
    if year is not None:
        start_date = datetime(year, 1, 1, 0, 0, 0)
        if month is not None:
            next_month = month + 1 if month < 12 else 1
            next_year = year if month < 12 else year + 1
            end_date = datetime(next_year, next_month, 1, 0, 0, 0)
        else:
            end_date = datetime(year + 1, 1, 1, 0, 0, 0)
        date_filter = {
            "created_at": {
                "$gte": start_date,
                "$lt": end_date
            }
        }

    # Находим все планы лечения, содержащие данную услугу
    all_plans = await db.treatment_plans.find(date_filter).to_list(10000)

    # Фильтруем планы, содержащие нужную услугу
    matching_plans = []
    for plan in all_plans:
        plan_services = plan.get("services", [])
        if not plan_services:
            continue
        for svc in plan_services:
            svc_name = svc.get("service_name", "").strip()
            if svc_name.lower() == decoded_service_name.lower():
                matching_plans.append(plan)
                break

    if not matching_plans:
        return {
            "service_name": decoded_service_name,
            "patients": [],
            "totals": {
                "total_expected": 0,
                "total_paid": 0,
                "total_outstanding": 0,
                "patients_count": 0
            }
        }

    # Группируем по пациентам
    patients_map = {}  # patient_id -> { patient_name, rooms, plans_count, total_expected, total_paid, appointments }

    for plan in matching_plans:
        patient_id = plan.get("patient_id", "")
        if not patient_id:
            continue

        if patient_id not in patients_map:
            patients_map[patient_id] = {
                "patient_id": patient_id,
                "patient_name": "",
                "room_name": "Не указан",
                "plans_count": 0,
                "total_expected": 0.0,
                "total_paid": 0.0,
                "appointment_rooms": set()
            }

        patients_map[patient_id]["plans_count"] += 1

        # Суммируем только стоимость данной услуги в плане
        plan_services = plan.get("services", [])
        for svc in plan_services:
            svc_name = svc.get("service_name", "").strip()
            if svc_name.lower() == decoded_service_name.lower():
                svc_total = float(svc.get("total_price", svc.get("price", 0)))
                patients_map[patient_id]["total_expected"] += svc_total

        # Оплаченная сумма - пропорционально доли услуги в плане
        plan_paid = float(plan.get("paid_amount", 0))
        plan_total = float(plan.get("total_cost", 0))
        if plan_paid > 0 and plan_total > 0:
            for svc in plan_services:
                svc_name = svc.get("service_name", "").strip()
                if svc_name.lower() == decoded_service_name.lower():
                    svc_total = float(svc.get("total_price", svc.get("price", 0)))
                    if svc_total > 0:
                        proportion = svc_total / plan_total
                        patients_map[patient_id]["total_paid"] += plan_paid * proportion

        # Получаем информацию о кабинетах из связанных записей
        appointment_ids = plan.get("appointment_ids", [])
        if appointment_ids:
            appointments = await db.appointments.find(
                {"id": {"$in": appointment_ids}}
            ).to_list(100)
            for apt in appointments:
                room_id = apt.get("room_id")
                if room_id:
                    room = await db.rooms.find_one({"id": room_id})
                    if room and room.get("name"):
                        patients_map[patient_id]["appointment_rooms"].add(room["name"])

    # Получаем имена пациентов и собираем финальные данные
    result_patients = []
    for pid, pdata in patients_map.items():
        # Имя пациента
        patient_doc = await db.patients.find_one({"id": pid}, {"full_name": 1, "first_name": 1, "last_name": 1})
        if patient_doc:
            pdata["patient_name"] = patient_doc.get("full_name", "") or \
                f"{patient_doc.get('last_name', '')} {patient_doc.get('first_name', '')}".strip()
        if not pdata["patient_name"]:
            pdata["patient_name"] = "Неизвестный пациент"

        # Кабинет (берем первый из найденных или оставляем "Не указан")
        if pdata["appointment_rooms"]:
            pdata["room_name"] = ", ".join(sorted(pdata["appointment_rooms"]))
        del pdata["appointment_rooms"]  # Убираем служебное поле

        result_patients.append(pdata)

    # Сортируем по сумме ожидаемого дохода (убывание)
    result_patients.sort(key=lambda x: x["total_expected"], reverse=True)

    totals = {
        "total_expected": sum(p["total_expected"] for p in result_patients),
        "total_paid": sum(p["total_paid"] for p in result_patients),
        "total_outstanding": sum(p["total_expected"] for p in result_patients) - sum(p["total_paid"] for p in result_patients),
        "patients_count": len(result_patients)
    }

    return {
        "service_name": decoded_service_name,
        "patients": result_patients,
        "totals": totals
    }


@services_api_router.get("/reports/services-report/filters")
async def get_services_report_filters(
    current_user: UserInDB = Depends(get_current_active_user),
):
    """
    Возвращает доступные фильтры для отчета по оказанным услугам:
    - специальности (из справочника specialties)
    - список врачей
    """
    # Получаем специальности из справочника specialties
    specialties_docs = await db.specialties.find(
        {"is_active": True},
        {"name": 1}
    ).to_list(1000)
    categories = sorted([s["name"] for s in specialties_docs if s.get("name")], key=lambda x: x.lower())

    # Получаем всех активных врачей напрямую из коллекции doctors
    doctors_docs = await db.doctors.find(
        {"is_active": True},
        {"id": 1, "full_name": 1}
    ).to_list(1000)
    doctors = [
        {"id": doc.get("id") or str(doc.get("_id")), "name": doc.get("full_name", "Неизвестный врач")}
        for doc in doctors_docs if doc.get("id") or doc.get("_id")
    ]
    # Сортировка по имени
    doctors.sort(key=lambda x: x["name"].lower())

    return {
        "categories": categories,
        "doctors": doctors
    }
