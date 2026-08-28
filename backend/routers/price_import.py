"""
Price Import Router - HTTP endpoints for importing service prices from Excel files
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query

from models.auth import UserInDB, UserRole
from routers.auth import get_current_active_user, require_role
from database import db
from services.price_import_service import PriceImportService


price_import_router = APIRouter(prefix="/price-import", tags=["Price Import"])


def get_import_service():
    return PriceImportService(db)


@price_import_router.post("/upload")
async def upload_price_file(
    file: UploadFile = File(...),
    update_existing: bool = Query(False, description="Обновлять существующие услуги"),
    skip_duplicates: bool = Query(True, description="Пропускать дубликаты"),
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])),
    service: PriceImportService = Depends(get_import_service)
):
    """
    Upload Excel file (.xls, .xlsx) with service prices.
    
    Категории из колонки 'Специальность' автоматически добавляются
    в справочник специальностей врачей (specialties).
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Файл не выбран")
    
    allowed_ext = ['.xls', '.xlsx']
    file_ext = '.' + file.filename.split('.')[-1].lower() if '.' in file.filename else ''
    
    if file_ext not in allowed_ext:
        raise HTTPException(status_code=400, detail=f"Разрешены: {', '.join(allowed_ext)}")
    
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Файл пустой")
    
    services, categories, parse_errors = service.parse_excel(content, file.filename)
    
    if parse_errors and not services:
        raise HTTPException(status_code=400, detail={"message": "Ошибка парсинга", "errors": parse_errors})
    
    category_stats = await service.ensure_categories_exist(categories)
    import_result = await service.import_services(services, update_existing, skip_duplicates)
    
    return {
        "success": True,
        "message": "Импорт завершен",
        "file_name": file.filename,
        "categories": {"found": len(categories), **category_stats},
        "services": {
            "total_in_file": len(services),
            "created": import_result['created'],
            "updated": import_result['updated'],
            "skipped": import_result['skipped']
        },
        "errors": {"parse": parse_errors, "import": import_result['errors']}
    }


@price_import_router.post("/preview")
async def preview_price_file(
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN])),
    service: PriceImportService = Depends(get_import_service)
):
    """Preview Excel file without importing"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Файл не выбран")
    
    allowed_ext = ['.xls', '.xlsx']
    file_ext = '.' + file.filename.split('.')[-1].lower() if '.' in file.filename else ''
    
    if file_ext not in allowed_ext:
        raise HTTPException(status_code=400, detail=f"Разрешены: {', '.join(allowed_ext)}")
    
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Файл пустой")
    
    services, categories, parse_errors = service.parse_excel(content, file.filename)
    
    # Check existing categories (now checking specialties collection)
    existing_cats = []
    new_cats = []
    for cat in categories:
        exists = await db.specialties.find_one({"name": cat, "is_active": True})
        (existing_cats if exists else new_cats).append(cat)
    
    # Check duplicates
    duplicates = []
    new_services = []
    for svc in services:
        exists = await db.service_prices.find_one({"service_name": svc['service_name'], "is_active": True})
        (duplicates if exists else new_services).append(svc['service_name'])
    
    return {
        "success": True,
        "file_name": file.filename,
        "total_services": len(services),
        "categories": {"total": len(categories), "existing": existing_cats, "new": new_cats},
        "services_preview": {
            "new_count": len(new_services),
            "duplicate_count": len(duplicates),
            "sample": services[:20]
        },
        "parse_errors": parse_errors
    }


@price_import_router.get("/template-info")
async def get_template_info(current_user: UserInDB = Depends(get_current_active_user)):
    """Get expected file format information"""
    return {
        "supported_formats": [".xls", ".xlsx"],
        "required_columns": [
            {"name": "Название", "aliases": ["Name", "Наименование"], "required": True},
            {"name": "Цена", "aliases": ["Price", "Стоимость"], "required": True}
        ],
        "optional_columns": [
            {"name": "Специальность", "description": "Категория → добавляется в справочник специальностей врачей"},
            {"name": "Код", "description": "Код услуги"},
            {"name": "Скидка", "description": "Разрешена/Запрещена"},
            {"name": "Начисление", "description": "Тип оплаты"},
            {"name": "Статус", "description": "Доступен/Недоступен"}
        ],
        "notes": [
            "Цены могут содержать пробелы и ₸ (очищаются автоматически)",
            "Категории из колонки 'Специальность' автоматически добавляются в справочник специальностей врачей"
        ]
    }


@price_import_router.delete("/clear-all")
async def clear_all_prices(
    clear_categories: bool = Query(True, description="Также очистить service_categories"),
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """
    Полная очистка прайса (service_prices) и опционально категорий (service_categories).
    Специальности (specialties) НЕ удаляются - они могут использоваться врачами.
    """
    # Удаляем все записи из service_prices
    prices_result = await db.service_prices.delete_many({})
    prices_deleted = prices_result.deleted_count
    
    categories_deleted = 0
    if clear_categories:
        # Удаляем все записи из service_categories (старый справочник)
        categories_result = await db.service_categories.delete_many({})
        categories_deleted = categories_result.deleted_count
    
    return {
        "success": True,
        "message": "Прайс очищен",
        "deleted": {
            "service_prices": prices_deleted,
            "service_categories": categories_deleted if clear_categories else "не удалялись"
        },
        "note": "Специальности врачей (specialties) не затронуты"
    }


@price_import_router.get("/stats")
async def get_import_stats(
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Получить статистику по прайсу и справочникам"""
    prices_count = await db.service_prices.count_documents({"is_active": True})
    prices_total = await db.service_prices.count_documents({})
    
    categories_count = await db.service_categories.count_documents({"is_active": True})
    specialties_count = await db.specialties.count_documents({"is_active": True})
    
    # Уникальные категории в прайсе
    price_categories = await db.service_prices.distinct("category", {"is_active": True, "category": {"$ne": None}})
    
    return {
        "service_prices": {
            "active": prices_count,
            "total": prices_total,
            "unique_categories": len(price_categories),
            "categories_list": sorted(price_categories)
        },
        "service_categories": {
            "active": categories_count,
            "note": "Старый справочник категорий (может быть не синхронизирован)"
        },
        "specialties": {
            "active": specialties_count,
            "note": "Справочник специальностей врачей (используется для отчётов)"
        }
    }


@price_import_router.delete("/clear-specialties")
async def clear_specialties(
    only_imported: bool = Query(True, description="Удалить только импортированные из прайса"),
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN]))
):
    """
    Очистка специальностей врачей (specialties).
    По умолчанию удаляет только те, что были импортированы из прайса.
    """
    if only_imported:
        # Удаляем только специальности с описанием "Импортировано из прайса"
        result = await db.specialties.delete_many({
            "description": "Импортировано из прайса"
        })
    else:
        # Удаляем все специальности
        result = await db.specialties.delete_many({})
    
    return {
        "success": True,
        "message": "Специальности удалены",
        "deleted": result.deleted_count,
        "mode": "только импортированные" if only_imported else "все"
    }


@price_import_router.delete("/reset-all")
async def reset_all_data(
    confirm: bool = Query(..., description="Подтвердите удаление: confirm=true"),
    current_user: UserInDB = Depends(require_role([UserRole.SUPER_ADMIN]))
):
    """
    ⚠️ ПОЛНЫЙ СБРОС: удаляет прайс, категории и специальности.
    Требует роль SUPER_ADMIN и подтверждение confirm=true.
    """
    if not confirm:
        raise HTTPException(status_code=400, detail="Добавьте confirm=true для подтверждения")
    
    prices_result = await db.service_prices.delete_many({})
    categories_result = await db.service_categories.delete_many({})
    specialties_result = await db.specialties.delete_many({})
    
    return {
        "success": True,
        "message": "Полный сброс выполнен",
        "deleted": {
            "service_prices": prices_result.deleted_count,
            "service_categories": categories_result.deleted_count,
            "specialties": specialties_result.deleted_count
        },
        "warning": "Все данные удалены. Специальности врачей тоже удалены!"
    }
