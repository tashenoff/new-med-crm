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


async def lead_to_response(lead, db: AsyncIOMotorDatabase) -> LeadResponse:
    """Конвертирует модель Lead в LeadResponse с получением суммы плана лечения"""
    lead_dict = lead.dict()
    lead_dict["full_name"] = lead.full_name
    lead_dict["treatment_plan_total"] = 0
    lead_dict["manager_name"] = None
    lead_dict["deposit_balance"] = None
    
    # Получаем сумму из планов лечения
    patient_id = None
    
    # Сначала пробуем по converted_to_client_id
    if lead.converted_to_client_id:
        patient_id = lead.converted_to_client_id
    else:
        # Если нет converted_to_client_id, ищем пациента по телефону
        if lead.phone:
            # Нормализуем телефон для поиска
            phone_normalized = lead.phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
            
            # Ищем пациента по телефону
            patient = await db.patients.find_one({
                "$or": [
                    {"phone": lead.phone},
                    {"phone": phone_normalized},
                    {"phone": {"$regex": phone_normalized[-10:], "$options": "i"}}  # Последние 10 цифр
                ]
            })
            
            if patient:
                patient_id = patient.get("id")
    
    # Если нашли patient_id, получаем планы лечения
    if patient_id:
        # Получаем все планы лечения для этого пациента
        treatment_plans = await db.treatment_plans.find({"patient_id": patient_id}).to_list(None)
        
        if treatment_plans:
            # Суммируем total_cost из всех планов лечения
            total = sum(plan.get("total_cost", 0) or 0 for plan in treatment_plans)
            lead_dict["treatment_plan_total"] = total
            
            # Вычисляем остаток депозита если план оплачен
            deposit_amount = lead.deposit_amount or 0
            if deposit_amount > 0:
                # Проверяем, есть ли оплаченные планы
                total_cost_paid_plans = 0
                all_plans_paid = True
                
                for plan in treatment_plans:
                    payment_status = plan.get("payment_status", "unpaid")
                    if payment_status == "paid":
                        total_cost_paid_plans += plan.get("total_cost", 0) or 0
                    else:
                        all_plans_paid = False
                
                # Если хотя бы один план оплачен, показываем остаток депозита
                if total_cost_paid_plans > 0:
                    # Остаток = депозит - стоимость оплаченных планов (но не меньше 0)
                    deposit_balance = max(0, deposit_amount - total_cost_paid_plans)
                    lead_dict["deposit_balance"] = deposit_balance
    
    # Получаем имя менеджера если назначен
    if lead.assigned_manager_id:
        # Ищем в коллекции users
        manager = await db.users.find_one({"id": lead.assigned_manager_id})
        if manager:
            lead_dict["manager_name"] = manager.get("full_name") or manager.get("username")
        else:
            # Ищем в коллекции staff
            staff = await db.staff.find_one({"id": lead.assigned_manager_id})
            if staff:
                lead_dict["manager_name"] = staff.get("full_name") or staff.get("name")
    
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
        return await lead_to_response(lead, db)
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
        # Асинхронно получаем данные для каждого лида
        responses = []
        for lead in leads:
            response = await lead_to_response(lead, db)
            responses.append(response)
        return responses
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
    
    return await lead_to_response(lead, db)


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
        
        return await lead_to_response(lead, db)
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
        
        return await lead_to_response(lead, db)
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
        
        return await lead_to_response(lead, db)
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
        responses = []
        for lead in leads:
            response = await lead_to_response(lead, db)
            responses.append(response)
        return responses
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


@leads_router.post("/{lead_id}/schedule-appointment")
async def schedule_appointment_from_lead(
    lead_id: str,
    appointment_data: dict,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Назначить прием прямо из заявки"""
    import uuid
    from datetime import datetime
    
    try:
        lead_service = LeadService(db)
        lead = await lead_service.get_lead_by_id(lead_id)
        
        if not lead:
            raise HTTPException(status_code=404, detail="Лид не найден")
        
        # Работаем напрямую с базой данных
        patients_collection = db["patients"]
        appointments_collection = db["appointments"]
        
        # Создаем или находим пациента
        patient_id = None
        patient_data = None
        
        if lead.converted_to_client_id:
            # Если лид уже конвертирован, ищем пациента
            patient_data = await patients_collection.find_one({"id": lead.converted_to_client_id})
            if patient_data:
                patient_id = patient_data.get("id")
        
        # Если пациент не найден по converted_to_client_id, ищем по ИИН
        if not patient_id and hasattr(lead, 'iin') and lead.iin:
            # Ищем пациента с таким ИИН
            patient_data = await patients_collection.find_one({"iin": lead.iin})
            if patient_data:
                patient_id = patient_data.get("id")
                # Обновляем лид с найденным пациентом
                from ..schemas.lead_schemas import LeadUpdate
                await lead_service.update_lead(lead_id, LeadUpdate(
                    converted_to_client_id=patient_id
                ))
        
        if not patient_id:
            # Создаем нового пациента из данных лида только если не нашли по телефону
            patient_id = str(uuid.uuid4())
            full_name = f"{lead.first_name or ''} {lead.last_name or ''}".strip()
            if not full_name:
                full_name = "Пациент из CRM"
            
            new_patient = {
                "id": patient_id,
                "full_name": full_name,
                "first_name": lead.first_name,
                "last_name": lead.last_name,
                "middle_name": lead.middle_name,
                "phone": lead.phone or "",
                "email": lead.email,
                "source": "crm_conversion",
                "notes": f"Создан из заявки CRM. {lead.description or ''}",
                "crm_client_id": lead_id,
                "revenue": 0.0,
                "debt": 0.0,
                "overpayment": 0.0,
                "appointments_count": 0,
                "records_count": 0,
                "bonus_balance": 0.0,
                "total_bonus_earned": 0.0,
                "total_bonus_spent": 0.0,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            await patients_collection.insert_one(new_patient)
            
            # Обновляем лид как конвертированный
            from ..schemas.lead_schemas import LeadUpdate
            await lead_service.update_lead(lead_id, LeadUpdate(
                converted_to_client_id=patient_id,
                status=LeadStatus.CONTACTED
            ))
        
        # Создаем запись на прием
        appointment_id = str(uuid.uuid4())
        appointment_date_str = appointment_data.get('appointment_date')
        
        # Парсим дату
        if appointment_date_str:
            try:
                appointment_date = datetime.fromisoformat(appointment_date_str.replace('Z', '+00:00'))
            except:
                appointment_date = datetime.strptime(appointment_date_str, '%Y-%m-%d')
        else:
            appointment_date = datetime.utcnow()
        
        # Получаем данные депозита
        deposit = appointment_data.get('deposit')
        deposit_type = appointment_data.get('deposit_type')
        price = appointment_data.get('price', 0)
        
        # Преобразуем значения депозита в числа
        if deposit:
            try:
                deposit = float(deposit)
            except (ValueError, TypeError):
                deposit = None
        if price:
            try:
                price = float(price)
            except (ValueError, TypeError):
                price = 0
        
        new_appointment = {
            "id": appointment_id,
            "patient_id": patient_id,
            "doctor_id": appointment_data.get('doctor_id'),
            "appointment_date": appointment_date.strftime('%Y-%m-%d'),
            "appointment_time": appointment_data.get('appointment_time', '10:00'),
            "end_time": appointment_data.get('end_time', '10:30'),
            "room_id": appointment_data.get('room_id'),
            "status": "confirmed",
            "reason": appointment_data.get('service', 'Консультация'),
            "notes": appointment_data.get('notes', f"Запись из CRM. Заявка: {lead.full_name}"),
            "price": price,
            "deposit": deposit,
            "deposit_type": deposit_type,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        await appointments_collection.insert_one(new_appointment)
        
        # Вычисляем фактическую сумму депозита и обновляем лид
        if deposit and deposit > 0:
            deposit_amount = deposit
            if deposit_type == 'percent' and price:
                deposit_amount = (price * deposit) / 100
            
            # Обновляем лид с данными о депозите
            await db.crm_leads.update_one(
                {"id": lead_id},
                {"$set": {
                    "deposit_amount": deposit_amount,
                    "deposit_type": deposit_type,
                    "appointment_price": price,
                    "converted_to_appointment_id": appointment_id,
                    "updated_at": datetime.utcnow()
                }}
            )
            print(f"✅ Лид {lead_id} обновлен с депозитом {deposit_amount}₸")
        
        # Обновляем статус лида
        await lead_service.update_lead_status(lead_id, LeadStatus.CONTACTED, "Запись на прием создана")
        
        return {
            "message": "Прием успешно назначен",
            "patient_id": patient_id,
            "appointment_id": appointment_id,
            "appointment_date": appointment_date.strftime('%Y-%m-%d')
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@leads_router.get("/{lead_id}/tasks")
async def get_lead_tasks(
    lead_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить задачи для конкретной заявки"""
    try:
        from ..services.task_service import TaskService
        
        task_service = TaskService(db)
        tasks = await task_service.get_tasks_by_lead(lead_id)
        
        return {
            "lead_id": lead_id,
            "tasks": [task.dict() for task in tasks]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
