"""
Leads Routes - API маршруты для работы с лидами
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..services.lead_service import LeadService
from ..schemas.lead_schemas import (
    LeadCreate, LeadUpdate, LeadResponse, 
    LeadStatusUpdate, LeadAssignment, LeadConversion,
    LeadSearchFilters, LeadStatistics
)
from ..models.lead import LeadStatus, LeadSource, LeadPriority

from ..dependencies import get_database

leads_router = APIRouter(prefix="/leads", tags=["Leads"])


def lead_to_response(lead) -> LeadResponse:
    """Конвертирует модель Lead в LeadResponse"""
    lead_dict = lead.dict()
    lead_dict["full_name"] = lead.full_name
    return LeadResponse(**lead_dict)


@leads_router.post("/", response_model=LeadResponse)
async def create_lead(
    lead_data: LeadCreate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Создать нового лида"""
    try:
        lead_service = LeadService(db)
        lead = await lead_service.create_lead(lead_data)
        return lead_to_response(lead)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@leads_router.get("/", response_model=List[LeadResponse])
async def get_leads(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[List[LeadStatus]] = Query(None),
    source: Optional[List[LeadSource]] = Query(None),
    priority: Optional[List[LeadPriority]] = Query(None),
    manager_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить список лидов с фильтрацией"""
    try:
        lead_service = LeadService(db)
        
        filters = LeadSearchFilters(
            status=status,
            source=source,
            priority=priority,
            assigned_manager_id=manager_id,
            search=search
        )
        
        leads = await lead_service.get_leads(skip=skip, limit=limit, filters=filters)
        return [lead_to_response(lead) for lead in leads]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@leads_router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить лида по ID"""
    lead_service = LeadService(db)
    lead = await lead_service.get_lead_by_id(lead_id)
    
    if not lead:
        raise HTTPException(status_code=404, detail="Лид не найден")
    
    return lead_to_response(lead)


@leads_router.put("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: str,
    update_data: LeadUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Обновить лида"""
    try:
        lead_service = LeadService(db)
        lead = await lead_service.update_lead(lead_id, update_data)
        
        if not lead:
            raise HTTPException(status_code=404, detail="Лид не найден")
        
        return lead_to_response(lead)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@leads_router.delete("/{lead_id}")
async def delete_lead(
    lead_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Удалить лида"""
    lead_service = LeadService(db)
    success = await lead_service.delete_lead(lead_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Лид не найден")
    
    return {"message": "Лид успешно удален"}


@leads_router.patch("/{lead_id}/status", response_model=LeadResponse)
async def update_lead_status(
    lead_id: str,
    status_data: LeadStatusUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Обновить статус лида"""
    try:
        lead_service = LeadService(db)
        lead = await lead_service.update_lead_status(
            lead_id, 
            status_data.status, 
            status_data.notes
        )
        
        if not lead:
            raise HTTPException(status_code=404, detail="Лид не найден")
        
        return lead_to_response(lead)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@leads_router.patch("/{lead_id}/assign", response_model=LeadResponse)
async def assign_lead_to_manager(
    lead_id: str,
    assignment_data: LeadAssignment,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Назначить лида менеджеру"""
    try:
        lead_service = LeadService(db)
        lead = await lead_service.assign_manager(
            lead_id,
            assignment_data.manager_id,
            assignment_data.notes
        )
        
        if not lead:
            raise HTTPException(status_code=404, detail="Лид не найден")
        
        return lead_to_response(lead)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@leads_router.post("/{lead_id}/convert")
async def convert_lead_to_client(
    lead_id: str,
    conversion_data: LeadConversion,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Конвертировать лида в клиента или пациента"""
    try:
        from ..services.integration_service import IntegrationService
        
        integration_service = IntegrationService(db)
        
        if conversion_data.create_hms_patient:
            # Полная конвертация: лид → клиент → пациент
            appointment_data = None
            if conversion_data.create_appointment:
                appointment_data = {
                    "appointment_date": conversion_data.appointment_date,
                    "doctor_id": conversion_data.appointment_doctor_id,
                    "reason": "Запись из CRM",
                    "notes": conversion_data.notes or ""
                }
            
            result = await integration_service.convert_lead_to_patient(
                lead_id,
                conversion_data.create_hms_patient,
                conversion_data.create_appointment,
                appointment_data
            )
            
            return {
                "message": "Лид успешно конвертирован в клиента и пациента HMS",
                "client_id": result["client_id"],
                "patient_id": result["patient_id"],
                "appointment_id": result.get("appointment_id")
            }
        else:
            # Простая конвертация: лид → клиент CRM
            result = await integration_service.convert_lead_to_client(lead_id)
            
            return {
                "message": "Лид успешно конвертирован в клиента CRM",
                "client_id": result["client_id"]
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@leads_router.get("/manager/{manager_id}", response_model=List[LeadResponse])
async def get_leads_by_manager(
    manager_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить лидов конкретного менеджера"""
    try:
        lead_service = LeadService(db)
        leads = await lead_service.get_leads_by_manager(manager_id)
        return [lead_to_response(lead) for lead in leads]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@leads_router.get("/statistics/summary", response_model=LeadStatistics)
async def get_leads_statistics(
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить статистику по лидам"""
    try:
        lead_service = LeadService(db)
        stats = await lead_service.get_statistics()
        return LeadStatistics(**stats)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
