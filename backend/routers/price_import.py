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
    Categories from 'Специальность' column will be auto-created.
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
    
    # Check existing categories
    existing_cats = []
    new_cats = []
    for cat in categories:
        exists = await db.service_categories.find_one({"name": cat, "is_active": True})
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
            {"name": "Специальность", "description": "Категория (создается автоматически)"},
            {"name": "Код", "description": "Код услуги"},
            {"name": "Скидка", "description": "Разрешена/Запрещена"},
            {"name": "Начисление", "description": "Тип оплаты"},
            {"name": "Статус", "description": "Доступен/Недоступен"}
        ],
        "notes": [
            "Цены могут содержать пробелы и ₸ (очищаются автоматически)",
            "Категории из 'Специальность' создаются в справочнике автоматически"
        ]
    }
