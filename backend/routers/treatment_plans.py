"""
Treatment Plans router - HTTP endpoints for treatment plan operations
Uses TreatmentPlanService and StatisticsService for business logic
"""
from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Optional
from datetime import datetime

# Import treatment plan models
from models.treatment_plan import TreatmentPlan, TreatmentPlanCreate, TreatmentPlanUpdate

# Import auth dependencies
from models.auth import UserInDB, UserRole
from routers.auth import get_current_active_user, require_role
from database import db

# Import services
from services.treatment_plan_service import TreatmentPlanService
from services.statistics_service import StatisticsService

# Router
treatment_plans_router = APIRouter(tags=["Treatment Plans"])


# Dependency to get services
def get_treatment_plan_service():
    return TreatmentPlanService(db)

def get_statistics_service():
    return StatisticsService(db)


# ============================================================================
# Treatment Plan Statistics Endpoints (MUST be before parameterized routes!)
# ============================================================================

@treatment_plans_router.get("/treatment-plans/statistics")
async def get_treatment_plan_statistics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR])),
    service: StatisticsService = Depends(get_statistics_service)
):
    """Get treatment plan statistics"""
    return await service.get_treatment_plan_statistics(date_from, date_to)


@treatment_plans_router.get("/treatment-plans/statistics/patients")
async def get_patient_statistics(
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR]))
):
    """Get patient-specific treatment plan statistics"""
    # Aggregate patient statistics
    pipeline = [
        {
            "$group": {
                "_id": "$patient_id",
                "total_plans": {"$sum": 1},
                "completed_plans": {
                    "$sum": {"$cond": [{"$eq": ["$execution_status", "completed"]}, 1, 0]}
                },
                "no_show_plans": {
                    "$sum": {"$cond": [{"$eq": ["$execution_status", "no_show"]}, 1, 0]}
                },
                "total_cost": {"$sum": {"$ifNull": ["$total_cost", 0]}},
                "total_paid": {"$sum": {"$ifNull": ["$paid_amount", 0]}},
                "unpaid_plans": {
                    "$sum": {"$cond": [{"$eq": ["$payment_status", "unpaid"]}, 1, 0]}
                }
            }
        },
        {
            "$lookup": {
                "from": "patients",
                "localField": "_id",
                "foreignField": "id",
                "as": "patient"
            }
        },
        {"$unwind": "$patient"},
        {
            "$project": {
                "_id": 0,
                "patient_id": "$_id",
                "patient_name": "$patient.full_name",
                "patient_phone": "$patient.phone",
                "total_plans": 1,
                "completed_plans": 1,
                "no_show_plans": 1,
                "total_cost": 1,
                "total_paid": 1,
                "outstanding_amount": {
                    "$max": [0, {"$subtract": ["$total_cost", "$total_paid"]}]
                },
                "unpaid_plans": 1,
                "completion_rate": {
                    "$multiply": [
                        {"$cond": {
                            "if": {"$eq": ["$total_plans", 0]},
                            "then": 0,
                            "else": {"$divide": ["$completed_plans", "$total_plans"]}
                        }},
                        100
                    ]
                },
                "no_show_rate": {
                    "$multiply": [
                        {"$cond": {
                            "if": {"$eq": ["$total_plans", 0]},
                            "then": 0,
                            "else": {"$divide": ["$no_show_plans", "$total_plans"]}
                        }},
                        100
                    ]
                },
                "collection_rate": {
                    "$multiply": [
                        {"$cond": {
                            "if": {"$eq": ["$total_cost", 0]},
                            "then": 0,
                            "else": {"$divide": ["$total_paid", "$total_cost"]}
                        }},
                        100
                    ]
                }
            }
        },
        {"$sort": {"total_cost": -1}}
    ]
    
    patient_stats = await db.treatment_plans.aggregate(pipeline).to_list(None)
    
    return {
        "patient_statistics": patient_stats,
        "summary": {
            "total_patients": len(patient_stats),
            "patients_with_unpaid": len([p for p in patient_stats if p["unpaid_plans"] > 0]),
            "patients_with_no_shows": len([p for p in patient_stats if p["no_show_plans"] > 0]),
            "high_value_patients": len([p for p in patient_stats if p["total_cost"] > 50000])
        }
    }


# ============================================================================
# Treatment Plan CRUD Endpoints
# ============================================================================

@treatment_plans_router.post("/patients/{patient_id}/treatment-plans", response_model=TreatmentPlan)
async def create_treatment_plan(
    patient_id: str,
    plan_data: TreatmentPlanCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR])),
    service: TreatmentPlanService = Depends(get_treatment_plan_service)
):
    """Create a treatment plan for a patient"""
    return await service.create_treatment_plan(
        patient_id=patient_id,
        plan_data=plan_data,
        created_by=current_user.id,
        created_by_name=current_user.full_name
    )


@treatment_plans_router.get("/patients/{patient_id}/treatment-plans", response_model=List[TreatmentPlan])
async def get_patient_treatment_plans(
    patient_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT])),
    service: TreatmentPlanService = Depends(get_treatment_plan_service)
):
    """Get all treatment plans for a patient"""
    # Patients can only access their own treatment plans
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return await service.get_patient_treatment_plans(patient_id)


@treatment_plans_router.get("/treatment-plans/{plan_id}", response_model=TreatmentPlan)
async def get_treatment_plan(
    plan_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT])),
    service: TreatmentPlanService = Depends(get_treatment_plan_service)
):
    """Get a specific treatment plan"""
    treatment_plan = await service.get_treatment_plan(plan_id)
    
    # Patients can only access their own treatment plans
    if current_user.role == UserRole.PATIENT:
        patient = await db.patients.find_one({"id": treatment_plan.patient_id})
        if not patient or current_user.patient_id != treatment_plan.patient_id:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return treatment_plan


@treatment_plans_router.put("/treatment-plans/{plan_id}", response_model=TreatmentPlan)
async def update_treatment_plan(
    plan_id: str,
    update_data: TreatmentPlanUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR])),
    service: TreatmentPlanService = Depends(get_treatment_plan_service)
):
    """Update treatment plan"""
    # Get current plan state before update
    old_plan = await service.get_treatment_plan(plan_id)
    old_payment_status = old_plan.payment_status
    
    # Update the plan
    updated_plan = await service.update_treatment_plan(plan_id, update_data)
    
    # Check if payment status changed to "paid" - award bonuses and cashback
    if update_data.payment_status == "paid" and old_payment_status != "paid":
        from services.loyalty_service import LoyaltyService
        
        loyalty_service = LoyaltyService(db)
        
        # Extract service IDs from the plan
        service_ids = [s.get("id") or s.get("service_id") for s in updated_plan.services if isinstance(s, dict)]
        
        # Process payment for loyalty rewards
        try:
            await loyalty_service.process_payment(
                payment_type="treatment_plan",
                payment_id=plan_id,
                patient_id=updated_plan.patient_id,
                amount=updated_plan.paid_amount or updated_plan.total_cost,
                doctor_id=updated_plan.assigned_doctor_id,  # Fixed: use assigned_doctor_id
                services=service_ids
            )
        except Exception as e:
            # Log error but don't fail the update
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to process loyalty rewards: {str(e)}")
    
    return updated_plan


@treatment_plans_router.delete("/treatment-plans/{plan_id}")
async def delete_treatment_plan(
    plan_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR])),
    service: TreatmentPlanService = Depends(get_treatment_plan_service)
):
    """Delete a treatment plan"""
    return await service.delete_treatment_plan(plan_id)


@treatment_plans_router.post("/treatment-plans/{plan_id}/services/{service_id}/mark-completed")
async def mark_service_procedure_completed(
    plan_id: str,
    service_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR])),
):
    """Отметить выполнение одной процедуры услуги"""
    # Получить план лечения
    plan = await db.treatment_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Treatment plan not found")
    
    # Найти услугу в плане
    service_found = False
    for service in plan.get("services", []):
        if service.get("service_id") == service_id:
            service_found = True
            quantity_total = service.get("quantity_total", 1)
            quantity_completed = service.get("quantity_completed", 0)
            
            # Увеличить количество выполненных процедур
            if quantity_completed < quantity_total:
                new_completed = quantity_completed + 1
                service["quantity_completed"] = new_completed
                
                # Обновить статус услуги
                if new_completed >= quantity_total:
                    service["status"] = "completed"
                elif new_completed > 0:
                    service["status"] = "in_progress"
            break
    
    if not service_found:
        raise HTTPException(status_code=404, detail="Service not found in treatment plan")
    
    # Проверить, завершены ли все услуги
    all_completed = all(
        s.get("quantity_completed", 0) >= s.get("quantity_total", 1)
        for s in plan.get("services", [])
    )
    
    # Обновить статус плана
    if all_completed:
        plan["execution_status"] = "completed"
        plan["completed_at"] = datetime.utcnow()
    elif any(s.get("quantity_completed", 0) > 0 for s in plan.get("services", [])):
        plan["execution_status"] = "in_progress"
        if not plan.get("started_at"):
            plan["started_at"] = datetime.utcnow()
    
    # Сохранить изменения
    await db.treatment_plans.update_one(
        {"id": plan_id},
        {"$set": {
            "services": plan["services"],
            "execution_status": plan["execution_status"],
            "started_at": plan.get("started_at"),
            "completed_at": plan.get("completed_at"),
            "updated_at": datetime.utcnow()
        }}
    )
    
    # Вернуть обновленный план
    updated_plan = await db.treatment_plans.find_one({"id": plan_id})
    return TreatmentPlan(**updated_plan)


@treatment_plans_router.post("/treatment-plans/{plan_id}/service/{service_id}/complete")
async def complete_course_session(
    plan_id: str,
    service_id: str,
    session_data: dict,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR])),
):
    """Отметить выполнение одной сессии курсовой услуги"""
    # Получить план лечения
    plan = await db.treatment_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Найти услугу
    service_found = False
    for service in plan.get("services", []):
        if service.get("service_id") == service_id and service.get("is_course"):
            service_found = True
            
            # Добавить сессию в историю
            if "sessions" not in service:
                service["sessions"] = []
            
            service["sessions"].append({
                "date": session_data.get("date"),
                "time": session_data.get("time"),
                "completed": True,
                "performed_by": current_user.full_name,
                "performed_by_id": current_user.id
            })
            
            # Обновить счетчик выполненных процедур
            service["quantity_completed"] = len([s for s in service["sessions"] if s.get("completed")])
            break
    
    if not service_found:
        raise HTTPException(status_code=404, detail="Course service not found")
    
    # Сохранить изменения
    await db.treatment_plans.update_one(
        {"id": plan_id},
        {"$set": {
            "services": plan["services"],
            "updated_at": datetime.utcnow()
        }}
    )
    
    # Вернуть обновленный план
    updated_plan = await db.treatment_plans.find_one({"id": plan_id})
    return TreatmentPlan(**updated_plan)


@treatment_plans_router.post("/treatment-plans/{plan_id}/services/{service_id}/mark-paid")
async def mark_service_paid(
    plan_id: str,
    service_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR])),
):
    """Отметить услугу как оплаченную"""
    # Получить план лечения
    plan = await db.treatment_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Treatment plan not found")
    
    # Найти услугу в плане
    service_found = False
    service_price = 0
    for service in plan.get("services", []):
        if service.get("service_id") == service_id:
            service_found = True
            
            # Установить статус оплаты услуги
            service["payment_status"] = "paid"
            service_price = service.get("total_price", 0)
            break
    
    if not service_found:
        raise HTTPException(status_code=404, detail="Service not found in treatment plan")
    
    # Пересчитать общую сумму оплаченных услуг
    paid_services_total = sum(
        s.get("total_price", 0)
        for s in plan.get("services", [])
        if s.get("payment_status") == "paid"
    )
    
    # Обновить общий статус оплаты плана
    total_cost = plan.get("total_cost", 0)
    if paid_services_total >= total_cost:
        plan["payment_status"] = "paid"
        plan["paid_amount"] = paid_services_total
        plan["payment_date"] = datetime.utcnow()
    elif paid_services_total > 0:
        plan["payment_status"] = "partially_paid"
        plan["paid_amount"] = paid_services_total
    else:
        plan["payment_status"] = "unpaid"
        plan["paid_amount"] = 0
    
    # Сохранить изменения
    await db.treatment_plans.update_one(
        {"id": plan_id},
        {"$set": {
            "services": plan["services"],
            "payment_status": plan["payment_status"],
            "paid_amount": plan["paid_amount"],
            "payment_date": plan.get("payment_date"),
            "updated_at": datetime.utcnow()
        }}
    )
    
    # Вернуть обновленный план
    updated_plan = await db.treatment_plans.find_one({"id": plan_id})
    return TreatmentPlan(**updated_plan)


@treatment_plans_router.post("/treatment-plans/{plan_id}/services/{service_id}/sessions/{session_index}/mark-paid")
async def mark_session_paid(
    plan_id: str,
    service_id: str,
    session_index: int,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.DOCTOR])),
):
    """Отметить одну сессию курсовой услуги как оплаченную"""
    # Получить план лечения
    plan = await db.treatment_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Treatment plan not found")
    
    # Найти услугу в плане
    service_found = False
    for service in plan.get("services", []):
        if service.get("service_id") == service_id:
            service_found = True
            
            # Проверить, что это курс с поэтапной оплатой
            if not service.get("is_course") or service.get("payment_type") != "per_session":
                raise HTTPException(status_code=400, detail="Service is not a per-session course")
            
            # Инициализировать массив сессий если нет
            if "sessions" not in service or not isinstance(service["sessions"], list):
                service["sessions"] = []
            
            # Создать сессии если их еще нет
            quantity_total = service.get("quantity_total", 1)
            while len(service["sessions"]) < quantity_total:
                service["sessions"].append({
                    "date": None,
                    "time": None,
                    "completed": False,
                    "paid": False,
                    "performed_by": None,
                    "performed_by_id": None
                })
            
            # Проверить индекс
            if session_index >= len(service["sessions"]):
                raise HTTPException(status_code=400, detail="Invalid session index")
            
            # Отметить сессию как оплаченную
            service["sessions"][session_index]["paid"] = True
            service["sessions"][session_index]["paid_at"] = datetime.utcnow().isoformat()
            service["sessions"][session_index]["paid_by"] = current_user.full_name
            service["sessions"][session_index]["paid_by_id"] = current_user.id
            
            break
    
    if not service_found:
        raise HTTPException(status_code=404, detail="Service not found in treatment plan")
    
    # Пересчитать оплату
    total_paid_amount = 0
    for svc in plan.get("services", []):
        if svc.get("payment_type") == "per_session" and svc.get("sessions"):
            # Для поэтапной оплаты считаем оплаченные сессии
            paid_sessions_count = len([s for s in svc["sessions"] if s.get("paid")])
            session_price = svc.get("price_per_unit", 0)
            total_paid_amount += paid_sessions_count * session_price
        elif svc.get("payment_status") == "paid":
            # Для единовременной оплаты
            total_paid_amount += svc.get("total_price", 0)
    
    # Обновить общий статус оплаты плана
    total_cost = plan.get("total_cost", 0)
    if total_paid_amount >= total_cost:
        plan["payment_status"] = "paid"
        plan["paid_amount"] = total_paid_amount
        plan["payment_date"] = datetime.utcnow()
    elif total_paid_amount > 0:
        plan["payment_status"] = "partially_paid"
        plan["paid_amount"] = total_paid_amount
    else:
        plan["payment_status"] = "unpaid"
        plan["paid_amount"] = 0
    
    # Сохранить изменения
    await db.treatment_plans.update_one(
        {"id": plan_id},
        {"$set": {
            "services": plan["services"],
            "payment_status": plan["payment_status"],
            "paid_amount": plan["paid_amount"],
            "payment_date": plan.get("payment_date"),
            "updated_at": datetime.utcnow()
        }}
    )
    
    # Вернуть обновленный план
    updated_plan = await db.treatment_plans.find_one({"id": plan_id})
    return TreatmentPlan(**updated_plan)
