"""
Contacts Routes - API маршруты для работы с источниками контактов
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..services.contact_service import ContactService
from ..schemas.contact_schemas import ContactCreate, ContactUpdate, ContactResponse
from ..models.contact import ContactStatus, ContactType

from ..dependencies import get_database

contacts_router = APIRouter(prefix="/contacts", tags=["Contacts"])


@contacts_router.post("/", response_model=ContactResponse)
async def create_contact(
    contact_data: ContactCreate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Создать новый источник контактов"""
    try:
        contact_service = ContactService(db)
        contact = await contact_service.create_contact(contact_data)
        return ContactResponse(**contact.dict())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@contacts_router.get("/", response_model=List[ContactResponse])
@contacts_router.get("", response_model=List[ContactResponse])  # Дублирующий маршрут без слеша
async def get_contacts(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[ContactStatus] = Query(None),
    contact_type: Optional[ContactType] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить список источников контактов"""
    try:
        contact_service = ContactService(db)
        contacts = await contact_service.get_contacts(
            skip=skip, 
            limit=limit, 
            status=status, 
            contact_type=contact_type
        )
        return [ContactResponse(**contact.dict()) for contact in contacts]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@contacts_router.get("/{contact_id}", response_model=ContactResponse)
async def get_contact(
    contact_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить источник контактов по ID"""
    contact_service = ContactService(db)
    contact = await contact_service.get_contact_by_id(contact_id)
    
    if not contact:
        raise HTTPException(status_code=404, detail="Источник контактов не найден")
    
    return ContactResponse(**contact.dict())


@contacts_router.put("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: str,
    update_data: ContactUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Обновить источник контактов"""
    try:
        contact_service = ContactService(db)
        contact = await contact_service.update_contact(contact_id, update_data)
        
        if not contact:
            raise HTTPException(status_code=404, detail="Источник контактов не найден")
        
        return ContactResponse(**contact.dict())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
