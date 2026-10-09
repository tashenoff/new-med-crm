"""
Treatment Plans router - HTTP endpoints for treatment plan operations
Uses TreatmentPlanService and StatisticsService for business logic
"""
from fastapi import APIRouter, HTTPException, Depends, status, Body
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
from services.accounting_ledger_service import (
    AccountingLedgerService, reject_ledger_writer, frontend_receipt, stable_row, plan_result,
    completion_command, is_ledger_plan,
)

# Router
treatment_plans_router = APIRouter(tags=["Treatment Plans"])


# Dependency to get services
def get_treatment_plan_service():
    return TreatmentPlanService(db)

def get_statistics_service():
    return StatisticsService(db)


@treatment_plans_router.post("/treatment-plans/{plan_id}/service-rows/{service_row_id}/receipts")
async def record_service_receipt(
    plan_id: str,
    service_row_id: str,
    command: dict = Body(...),
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR])),
):
    body = dict(command)
    if "service_row_id" in body and body.pop("service_row_id") != service_row_id:
        raise HTTPException(422, "Conflicting service_row_id")
    result = await AccountingLedgerService(db).record_ordinary_service(
        plan_id, service_row_id, "service_receipt", frontend_receipt(body), current_user.id)
    return plan_result(await db.treatment_plans.find_one({"id": plan_id}), result)


@treatment_plans_router.post("/treatment-plans/{plan_id}/service-rows/{service_row_id}/occurrences/{occurrence_id}/complete")
async def record_service_completion(
    plan_id: str,
    service_row_id: str,
    occurrence_id: str,
    command: dict = Body(...),
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR])),
):
    plan = await db.treatment_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(404, "Treatment plan not found")
    command, occurrence_id = completion_command(plan, service_row_id, occurrence_id, command)
    result = await AccountingLedgerService(db).record_ordinary_service(
        plan_id, service_row_id, "service_completion", command, current_user.id, occurrence_id)
    return plan_result(await db.treatment_plans.find_one({"id": plan_id}), result)


# ============================================================================
# Treatment Plan Statistics Endpoints (MUST be before parameterized routes!)
# ============================================================================


@treatment_plans_router.post("/treatment-plans/{plan_id}/service-rows/{service_row_id}/components/{component_id}/occurrences/{occurrence_id}/complete")
async def record_component_completion(
    plan_id: str,
    service_row_id: str,
    component_id: str,
    occurrence_id: str,
    command: dict = Body(...),
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR])),
):
    body = dict(command)
    for field, expected in (("service_row_id", service_row_id), ("component_id", component_id), ("occurrence_id", occurrence_id)):
        if field in body and body.pop(field) != expected:
            raise HTTPException(422, f"Conflicting {field}")
    result = await AccountingLedgerService(db).record_ordinary_service(
        plan_id, service_row_id, "component_completion", body, current_user.id, occurrence_id, component_id)
    return plan_result(await db.treatment_plans.find_one({"id": plan_id}), result)

@treatment_plans_router.get("/treatment-plans/statistics")
async def get_treatment_plan_statistics(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR])),
    service: StatisticsService = Depends(get_statistics_service)
):
    """Get treatment plan statistics"""
    return await service.get_treatment_plan_statistics(date_from, date_to)


@treatment_plans_router.get("/treatment-plans/statistics/patients")
async def get_patient_statistics(
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR]))
):
    """Get patient-specific treatment plan statistics"""
    # Получаем общее количество пациентов из коллекции patients
    total_patients_count = await db.patients.count_documents({})
    
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
            "total_patients": total_patients_count,
            "patients_with_unpaid": len([p for p in patient_stats if p["unpaid_plans"] > 0]),
            "patients_with_no_shows": len([p for p in patient_stats if p["no_show_plans"] > 0])
        }
    }


# ============================================================================
# Treatment Plan CRUD Endpoints
# ============================================================================

@treatment_plans_router.post("/patients/{patient_id}/treatment-plans", response_model=TreatmentPlan)
async def create_treatment_plan(
    patient_id: str,
    plan_data: TreatmentPlanCreate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR])),
    service: TreatmentPlanService = Depends(get_treatment_plan_service)
):
    """Create a treatment plan for a patient"""
    return await service.create_treatment_plan(
        patient_id=patient_id,
        plan_data=plan_data,
        created_by=current_user.id,
        created_by_name=current_user.full_name
    )


@treatment_plans_router.get("/patients/{patient_id}/treatment-plans")
async def get_patient_treatment_plans(
    patient_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR, UserRole.PATIENT])),
    service: TreatmentPlanService = Depends(get_treatment_plan_service)
):
    """Get all treatment plans for a patient (with deposit_amount from appointments)"""
    # Patients can only access their own treatment plans
    if current_user.role == UserRole.PATIENT and current_user.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return await service.get_patient_treatment_plans(patient_id)


@treatment_plans_router.get("/treatment-plans/{plan_id}")
async def get_treatment_plan(
    plan_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR, UserRole.PATIENT])),
    service: TreatmentPlanService = Depends(get_treatment_plan_service)
):
    """Get a specific treatment plan (with deposit_amount from patient appointments)"""
    treatment_plan = await service.get_treatment_plan(plan_id)
    
    # Patients can only access their own treatment plans
    if current_user.role == UserRole.PATIENT:
        patient_id = treatment_plan.get("patient_id")
        patient = await db.patients.find_one({"id": patient_id})
        if not patient or current_user.patient_id != patient_id:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return treatment_plan


@treatment_plans_router.put("/treatment-plans/{plan_id}", response_model=TreatmentPlan)
async def update_treatment_plan(
    plan_id: str,
    update_data: TreatmentPlanUpdate,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR])),
    service: TreatmentPlanService = Depends(get_treatment_plan_service)
):
    """Update treatment plan"""
    # Get current plan state before update
    old_plan = await service.get_treatment_plan(plan_id)
    old_payment_status = old_plan.get("payment_status") if isinstance(old_plan, dict) else old_plan.payment_status
    
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
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR])),
    service: TreatmentPlanService = Depends(get_treatment_plan_service)
):
    """Delete a treatment plan"""
    return await service.delete_treatment_plan(plan_id)


@treatment_plans_router.get("/treatment-plans/{plan_id}/consultation")
async def get_treatment_plan_consultation(
    plan_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR, UserRole.PATIENT])),
):
    """Получить данные консультационного листа, из которого создан план лечения"""
    import re
    from datetime import datetime
    
    # Получить план лечения
    plan = await db.treatment_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Treatment plan not found")
    
    # Проверить права доступа для пациентов
    if current_user.role == UserRole.PATIENT:
        patient_id = plan.get("patient_id")
        if current_user.patient_id != patient_id:
            raise HTTPException(status_code=403, detail="Access denied")
    
    consultation = None
    
    # Способ 1: Прямая ссылка на консультацию
    consultation_sheet_id = plan.get("consultation_sheet_id")
    if consultation_sheet_id:
        consultation = await db.consultation_sheets.find_one({"id": consultation_sheet_id})
    
    # Способ 2: Поиск по паттерну названия "План лечения от DD.MM.YYYY" и patient_id
    if not consultation:
        title = plan.get("title", "")
        patient_id = plan.get("patient_id")
        
        # Ищем дату в названии плана
        date_match = re.search(r'План лечения от (\d{2})\.(\d{2})\.(\d{4})', title)
        if date_match and patient_id:
            day, month, year = date_match.groups()
            try:
                plan_date = datetime(int(year), int(month), int(day))
                # Ищем консультацию в этот день для данного пациента
                start_of_day = plan_date.replace(hour=0, minute=0, second=0, microsecond=0)
                end_of_day = plan_date.replace(hour=23, minute=59, second=59, microsecond=999999)
                
                consultation = await db.consultation_sheets.find_one({
                    "patient_id": patient_id,
                    "consultation_date": {
                        "$gte": start_of_day,
                        "$lte": end_of_day
                    }
                })
                
                # Если нашли консультацию, обновим план со ссылкой на неё
                if consultation:
                    await db.treatment_plans.update_one(
                        {"id": plan_id},
                        {"$set": {"consultation_sheet_id": consultation["id"]}}
                    )
            except (ValueError, TypeError):
                pass
    
    # Способ 3: Поиск по assigned_doctor_id и patient_id (последняя консультация)
    if not consultation:
        patient_id = plan.get("patient_id")
        doctor_id = plan.get("assigned_doctor_id")
        if patient_id and doctor_id:
            consultation = await db.consultation_sheets.find_one(
                {"patient_id": patient_id, "doctor_id": doctor_id},
                sort=[("consultation_date", -1)]  # Последняя консультация
            )
    
    if not consultation:
        return None
    
    # Убрать MongoDB _id
    if "_id" in consultation:
        del consultation["_id"]
    
    return consultation


@treatment_plans_router.post("/treatment-plans/{plan_id}/services/{service_id}/mark-completed")
async def mark_service_procedure_completed(
    plan_id: str,
    service_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR])),
    command: Optional[dict] = Body(None),
):
    """Отметить выполнение одной процедуры услуги"""
    # Получить план лечения
    plan = await db.treatment_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Treatment plan not found")
    if isinstance(command, dict):
        body = dict(command)
        if "session_id" in body:
            return await AccountingLedgerService(db).complete_session(plan_id, service_id, body, current_user.id)
        row_id = stable_row(plan, service_id, body.get("service_row_id"))
        if "component_id" in body:
            return await record_component_completion(plan_id, row_id, body.get("component_id"),
                                                     body.get("occurrence_id"), body, current_user)
        occurrence_id = body.get("occurrence_id")
        body, occurrence_id = completion_command(plan, row_id, occurrence_id, body)
        result = await AccountingLedgerService(db).record_ordinary_service(
            plan_id, row_id, "service_completion", body, current_user.id, occurrence_id)
        return plan_result(await db.treatment_plans.find_one({"id": plan_id}), result)
    reject_ledger_writer(plan)
    if any(row.get("service_id") == service_id and row.get("service_row_id") for row in plan.get("services", [])):
        raise HTTPException(422, "Prospective completion requires operation_id and stable occurrence_id")
    
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
    result = await db.treatment_plans.update_one(
        {"id": plan_id, "accounting_events.0": {"$exists": False}},
        {"$set": {
            "services": plan["services"],
            "execution_status": plan["execution_status"],
            "started_at": plan.get("started_at"),
            "completed_at": plan.get("completed_at"),
            "updated_at": datetime.utcnow()
        }}
    )
    if not result.matched_count:
        raise HTTPException(409, "Concurrent ledger write; retry using a ledger completion command")
    
    # Вернуть обновленный план
    updated_plan = await db.treatment_plans.find_one({"id": plan_id})
    return TreatmentPlan(**updated_plan)


@treatment_plans_router.post("/treatment-plans/{plan_id}/service/{service_id}/complete")
async def complete_course_session(
    plan_id: str,
    service_id: str,
    session_data: dict,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR])),
):
    """Отметить выполнение одной сессии курсовой услуги"""
    # Получить план лечения
    plan = await db.treatment_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if session_data.get("operation_id") or session_data.get("session_id"):
        return await AccountingLedgerService(db).complete_session(plan_id, service_id, session_data, current_user.id)
    reject_ledger_writer(plan)
    if any(row.get("service_id") == service_id and row.get("service_row_id") for row in plan.get("services", [])):
        raise HTTPException(422, "Prospective course completion requires stable session_id and operation_id")
    
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
    result = await db.treatment_plans.update_one(
        {"id": plan_id, "accounting_events.0": {"$exists": False}},
        {"$set": {
            "services": plan["services"],
            "updated_at": datetime.utcnow()
        }}
    )
    if not result.matched_count:
        raise HTTPException(409, "Concurrent ledger write; retry with a stable session ledger completion command")
    
    # Вернуть обновленный план
    updated_plan = await db.treatment_plans.find_one({"id": plan_id})
    return TreatmentPlan(**updated_plan)


@treatment_plans_router.post("/treatment-plans/{plan_id}/complex-services/{service_id}/pay-remaining")
async def pay_complex_remaining(
    plan_id: str,
    service_id: str,
    payment_data: Optional[dict] = Body(None),
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR])),
    service: TreatmentPlanService = Depends(get_treatment_plan_service),
):
    """Оплатить остаток комплексной услуги (все неоплаченные доли)."""
    return await service.pay_complex_remaining(plan_id, service_id, payment_data)


@treatment_plans_router.post("/treatment-plans/{plan_id}/complex-services/{service_id}/components/{component_service_id}/mark-paid")
async def mark_complex_component_paid(
    plan_id: str,
    service_id: str,
    component_service_id: str,
    payment_data: Optional[dict] = Body(None),
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR])),
    service: TreatmentPlanService = Depends(get_treatment_plan_service),
):
    """Отметить оплаченной одну услугу (долю) комплексной услуги в плане."""
    if isinstance(payment_data, dict) and payment_data.get("operation_id"):
        return await AccountingLedgerService(db).record_component_receipt(
            plan_id, service_id, component_service_id, payment_data, current_user.id)
    plan = await db.treatment_plans.find_one({"id": plan_id})
    if plan and is_ledger_plan(plan):
        return await AccountingLedgerService(db).settle_patient_deposit_row(
            plan_id, service_id, payment_data, current_user.id, component_service_id=component_service_id)
    return await service.pay_complex_component(plan_id, service_id, component_service_id, payment_data)


@treatment_plans_router.post("/treatment-plans/{plan_id}/services/{service_id}/mark-paid")
async def mark_service_paid(
    plan_id: str,
    service_id: str,
    payment_data: Optional[dict] = Body(None),
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR])),
):
    """Отметить услугу как оплаченную"""
    # Получить план лечения
    plan = await db.treatment_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Treatment plan not found")

    if isinstance(payment_data, dict) and "operation_id" in payment_data:
        command = dict(payment_data)
        row_id = stable_row(plan, service_id, command.pop("service_row_id", None))
        result = await AccountingLedgerService(db).record_ordinary_service(
            plan_id, row_id, "service_receipt", frontend_receipt(command), current_user.id)
        return plan_result(await db.treatment_plans.find_one({"id": plan_id}), result)
    if any(event.get("kind") == "patient_deposit_received" for event in plan.get("accounting_events", [])):
        return await AccountingLedgerService(db).settle_patient_deposit_row(plan_id, service_id, payment_data, current_user.id)
    reject_ledger_writer(plan)
    if any(row.get("service_id") == service_id and row.get("service_row_id") for row in plan.get("services", [])):
        raise HTTPException(422, "Prospective service receipts require operation_id UUID, service_row_id, actual amount_kzt, total discount_amount_kzt, payment_source and payment_method")
    from copy import deepcopy
    snapshot = {key: deepcopy(plan.get(key)) for key in ("services", "deposit_balance", "updated_at")}
    
    patient_id = plan.get("patient_id")
    
    # Получить текущий депозит пациента
    deposit_amount = 0
    if patient_id:
        appointments = await db.appointments.find({
            "patient_id": patient_id,
            "deposit": {"$gt": 0}
        }).to_list(100)
        deposit_amount = sum(apt.get("deposit", 0) or 0 for apt in appointments)
    
    # Получить текущий баланс депозита (сколько осталось)
    deposit_balance = plan.get("deposit_balance")
    if deposit_balance is None:
        # Если баланс не установлен, инициализируем его полной суммой депозита
        deposit_balance = deposit_amount
    
    # Найти услугу в плане
    service_found = False
    service_price = 0
    for service in plan.get("services", []):
        if service.get("service_id") == service_id:
            service_found = True
            
            # Установить статус оплаты услуги
            if service.get("is_complex"):
                raise HTTPException(status_code=400, detail="Use complex component payment endpoints")
            service["payment_status"] = "paid"
            total_price = service.get("total_price", 0)
            # скидка при оплате: если передан amount — платим его (меньше цены)
            svc_amount = total_price
            if payment_data and isinstance(payment_data, dict):
                amt = payment_data.get("amount")
                if amt is not None and isinstance(amt, (int, float)) and not isinstance(amt, bool) and 0 <= amt < total_price:
                    svc_amount = float(amt)
                    service["discount_amount"] = round(total_price - svc_amount, 2)
            service["paid_amount"] = round(svc_amount, 2)
            service_price = svc_amount
            
            # Сохранить способ оплаты если передан
            if payment_data and isinstance(payment_data, dict):
                if payment_data.get("payment_method_id"):
                    service["payment_method_id"] = payment_data["payment_method_id"]
                if payment_data.get("payment_method_name"):
                    service["payment_method_name"] = payment_data["payment_method_name"]
            
            # Списать из депозита если есть баланс
            if deposit_balance > 0:
                amount_from_deposit = min(deposit_balance, service_price)
                deposit_balance -= amount_from_deposit
                service["paid_from_deposit"] = amount_from_deposit
            break
    
    if not service_found:
        raise HTTPException(status_code=404, detail="Service not found in treatment plan")
    
    from services.treatment_plan_service import recalculate_plan_payment
    recalculate_plan_payment(plan)
    
    # Сохранить изменения с обновленным балансом депозита
    result = await TreatmentPlanService(db).persist_payment_update(
        {"id": plan_id, **snapshot},
        {
            "services": plan["services"],
            "payment_status": plan["payment_status"],
            "paid_amount": plan["paid_amount"],
            "payment_date": plan.get("payment_date"),
            "deposit_balance": deposit_balance,
            "updated_at": datetime.utcnow()
        }
    )
    if not result.matched_count:
        raise HTTPException(status_code=409, detail="Concurrent plan update; retry payment")
    
    # Вернуть обновленный план с deposit_amount и deposit_balance
    updated_plan = await db.treatment_plans.find_one({"id": plan_id})
    plan_dict = TreatmentPlan(**updated_plan).dict()
    
    # Получить deposit_amount из записей пациента
    total_deposit = 0
    if patient_id:
        appointments = await db.appointments.find({
            "patient_id": patient_id,
            "deposit": {"$gt": 0}
        }).to_list(100)
        total_deposit = sum(apt.get("deposit", 0) or 0 for apt in appointments)
    
    plan_dict['deposit_amount'] = total_deposit
    plan_dict['deposit_balance'] = updated_plan.get('deposit_balance', total_deposit)
    return plan_dict


# ============================================================================
# Add deposit payment to treatment plan
# ============================================================================

from pydantic import BaseModel

class AddDepositPayment(BaseModel):
    amount: float
    payment_method: Optional[str] = "cash"
    note: Optional[str] = None

@treatment_plans_router.post("/treatment-plans/{plan_id}/add-deposit")
async def add_deposit_to_plan(
    plan_id: str,
    payment: dict = Body(...),
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Add a deposit payment to cover the debt in treatment plan"""
    # Get the plan
    if isinstance(payment, dict):
        return await AccountingLedgerService(db).record_plan_advance(plan_id, payment, current_user.id)
    plan = await db.treatment_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Treatment plan not found")
    reject_ledger_writer(plan)
    
    patient_id = plan.get("patient_id")
    
    # Get current deposit amount from appointments
    current_deposit = 0
    if patient_id:
        appointments = await db.appointments.find({
            "patient_id": patient_id,
            "deposit": {"$gt": 0}
        }).to_list(100)
        current_deposit = sum(apt.get("deposit", 0) or 0 for apt in appointments)
    
    # Get the extra_deposit already in the plan (if any)
    extra_deposit = plan.get("extra_deposit", 0)
    
    # Add the new payment to extra_deposit
    new_extra_deposit = extra_deposit + payment.amount
    
    # Update the plan with the new extra deposit
    result = await TreatmentPlanService(db).persist_payment_update(
        {"id": plan_id},
        {
            "extra_deposit": new_extra_deposit,
            "updated_at": datetime.utcnow()
        }
    )
    if not result.matched_count:
        raise HTTPException(status_code=409, detail="Concurrent plan update; retry payment")
    
    # Log the payment
    payment_log = {
        "plan_id": plan_id,
        "patient_id": patient_id,
        "amount": payment.amount,
        "payment_method": payment.payment_method,
        "note": payment.note,
        "paid_by": current_user.full_name,
        "paid_by_id": current_user.id,
        "paid_at": datetime.utcnow(),
        "type": "deposit_topup"
    }
    await db.payment_logs.insert_one(payment_log)
    
    print(f"Доплата {payment.amount}_tng добавлена к плану {plan_id}")
    
    # Return updated plan with new deposit info
    updated_plan = await db.treatment_plans.find_one({"id": plan_id})
    plan_dict = TreatmentPlan(**updated_plan).dict()
    
    total_deposit = current_deposit + new_extra_deposit
    plan_dict['deposit_amount'] = total_deposit
    plan_dict['deposit_balance'] = total_deposit - plan.get("total_cost", 0)
    plan_dict['extra_deposit'] = new_extra_deposit
    
    return {
        "success": True,
        "message": f"Доплата {payment.amount}₸ успешно добавлена",
        "plan": plan_dict
    }


@treatment_plans_router.post("/treatment-plans/{plan_id}/services/{service_id}/sessions/{session_id}/mark-paid")
async def mark_session_paid(
    plan_id: str,
    service_id: str,
    session_id: str,
    current_user: UserInDB = Depends(require_role([UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DOCTOR])),
    command: Optional[dict] = Body(None),
):
    """Отметить одну сессию курсовой услуги как оплаченную"""
    # Получить план лечения
    plan = await db.treatment_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Treatment plan not found")
    if is_ledger_plan(plan) and (command is None or isinstance(command, dict) and not command.get("operation_id")):
        return await AccountingLedgerService(db).settle_patient_deposit_row(
            plan_id, service_id, command, current_user.id, session_id=session_id)
    if isinstance(command, dict):
        return await AccountingLedgerService(db).record_session(
            plan_id, service_id, session_id, command, current_user.id)
    reject_ledger_writer(plan)
    if any(row.get("service_id") == service_id and row.get("service_row_id") for row in plan.get("services", [])):
        raise HTTPException(422, "Prospective sessions require stable session_id and receipt command")
    try:
        session_index = int(session_id)
    except (ValueError, TypeError):
        raise HTTPException(422, "Legacy session path requires an integer index") from None

    from copy import deepcopy
    snapshot = {key: deepcopy(plan.get(key)) for key in ("services", "deposit_balance", "updated_at")}
    
    patient_id = plan.get("patient_id")
    
    # Найти услугу в плане
    service_found = False
    for service in plan.get("services", []):
        if service.get("service_id") == service_id:
            service_found = True
            
            # Проверить, что это курс с поэтапной оплатой
            if service.get("is_complex"):
                raise HTTPException(status_code=400, detail="Use complex component payment endpoints")
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
    
    from services.treatment_plan_service import recalculate_plan_payment
    recalculate_plan_payment(plan)
    
    # Сохранить изменения
    result = await TreatmentPlanService(db).persist_payment_update(
        {"id": plan_id, **snapshot},
        {
            "services": plan["services"],
            "payment_status": plan["payment_status"],
            "paid_amount": plan["paid_amount"],
            "payment_date": plan.get("payment_date"),
            "updated_at": datetime.utcnow()
        }
    )
    if not result.matched_count:
        raise HTTPException(status_code=409, detail="Concurrent plan update; retry payment")
    
    # Вернуть обновленный план с deposit_amount и deposit_balance
    updated_plan = await db.treatment_plans.find_one({"id": plan_id})
    plan_dict = TreatmentPlan(**updated_plan).dict()
    
    # Получить deposit_amount из записей пациента
    total_deposit = 0
    if patient_id:
        appointments = await db.appointments.find({
            "patient_id": patient_id,
            "deposit": {"$gt": 0}
        }).to_list(100)
        total_deposit = sum(apt.get("deposit", 0) or 0 for apt in appointments)
    
    plan_dict['deposit_amount'] = total_deposit
    plan_dict['deposit_balance'] = updated_plan.get('deposit_balance', total_deposit)
    return plan_dict
