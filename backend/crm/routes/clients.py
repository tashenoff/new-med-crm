"""
Clients Routes - API маршруты для работы с клиентами
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..services.client_service import ClientService
from ..schemas.client_schemas import ClientCreate, ClientUpdate, ClientResponse, ClientStatistics
from ..models.client import ClientStatus, Client

from ..dependencies import get_database

def client_to_response(client: Client) -> ClientResponse:
    """Преобразует модель клиента в схему ответа"""
    client_dict = client.dict()
    # Добавляем вычисляемые поля
    client_dict["full_name"] = client.full_name
    client_dict["display_name"] = client.display_name
    return ClientResponse(**client_dict)

clients_router = APIRouter(prefix="/clients", tags=["Clients"])


@clients_router.post("/", response_model=ClientResponse)
async def create_client(
    client_data: ClientCreate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Создать нового клиента"""
    try:
        client_service = ClientService(db)
        client = await client_service.create_client(client_data)
        return client_to_response(client)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@clients_router.get("/", response_model=List[ClientResponse])
async def get_clients(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[ClientStatus] = Query(None),
    manager_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить список клиентов"""
    try:
        client_service = ClientService(db)
        clients = await client_service.get_clients(
            skip=skip, 
            limit=limit, 
            status=status, 
            manager_id=manager_id, 
            search=search
        )
        return [client_to_response(client) for client in clients]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@clients_router.get("/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить клиента по ID"""
    client_service = ClientService(db)
    client = await client_service.get_client_by_id(client_id)
    
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    
    return client_to_response(client)


@clients_router.put("/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: str,
    update_data: ClientUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Обновить клиента"""
    try:
        client_service = ClientService(db)
        client = await client_service.update_client(client_id, update_data)
        
        if not client:
            raise HTTPException(status_code=404, detail="Клиент не найден")
        
        return client_to_response(client)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@clients_router.get("/statistics/summary")
async def get_clients_statistics(
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить базовую статистику по клиентам"""
    try:
        client_service = ClientService(db)
        stats = await client_service.get_statistics()
        return stats
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@clients_router.get("/statistics/detailed", response_model=ClientStatistics)
async def get_detailed_clients_statistics(
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить детальную статистику по клиентам включая HMS конвертацию"""
    try:
        client_service = ClientService(db)
        stats = await client_service.get_detailed_statistics()
        return ClientStatistics(**stats)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@clients_router.post("/{client_id}/convert-to-hms")
async def convert_client_to_hms_patient(
    client_id: str,
    create_appointment: bool = Query(False, description="Создать запись на прием"),
    appointment_date: Optional[str] = Query(None, description="Дата записи (YYYY-MM-DD HH:MM)"),
    appointment_doctor_id: Optional[str] = Query(None, description="ID врача"),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Конвертировать клиента в пациента HMS"""
    try:
        from ..services.integration_service import IntegrationService
        
        integration_service = IntegrationService(db)
        
        # Подготавливаем данные записи если нужно
        appointment_data = None
        if create_appointment:
            appointment_data = {
                "appointment_date": appointment_date,
                "doctor_id": appointment_doctor_id,
                "reason": "Запись из CRM",
                "notes": ""
            }
        
        result = await integration_service.convert_client_to_hms_patient(
            client_id,
            create_appointment,
            appointment_data
        )
        
        return {
            "message": "Клиент успешно конвертирован в пациента HMS",
            "client_id": result["client_id"],
            "patient_id": result["patient_id"],
            "appointment_id": result.get("appointment_id")
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
