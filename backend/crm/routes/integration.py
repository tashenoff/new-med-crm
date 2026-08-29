"""
Integration Routes - API маршруты для интеграции CRM с HMS
"""

from fastapi import APIRouter, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from ..services.integration_service import IntegrationService
from ..dependencies import get_database

integration_router = APIRouter(prefix="/integration", tags=["Integration"])


def _get_doctor_specialty(doctor: dict) -> str:
    """Get doctor specialty string (handles both old `specialty: str` and new `specialties: List[str]`)."""
    if not doctor:
        return ""
    specialties = doctor.get("specialties", [])
    if isinstance(specialties, list) and len(specialties) > 0:
        return specialties[0]
    return doctor.get("specialty", "")


class TreatmentPlanSync(BaseModel):
    """Схема для синхронизации плана лечения"""
    treatment_plan_id: str
    patient_id: str
    payment_status: str
    paid_amount: float
    total_cost: float
    plan_title: str


@integration_router.post("/sync-treatment-plan")
async def sync_treatment_plan_payment(
    sync_data: TreatmentPlanSync,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Синхронизировать оплату плана лечения с CRM"""
    try:
        integration_service = IntegrationService(db)
        
        result = await integration_service.sync_treatment_plan_payment(
            treatment_plan_id=sync_data.treatment_plan_id,
            patient_id=sync_data.patient_id,
            payment_status=sync_data.payment_status,
            paid_amount=sync_data.paid_amount,
            total_cost=sync_data.total_cost,
            plan_title=sync_data.plan_title
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@integration_router.post("/sync-all-treatment-plans")
async def sync_all_treatment_plans(
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Синхронизировать все оплаченные планы лечения с CRM"""
    try:
        integration_service = IntegrationService(db)
        result = await integration_service.sync_all_paid_treatment_plans()
        return result
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@integration_router.get("/client-revenue/{client_id}")
async def get_client_revenue_from_hms(
    client_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить выручку клиента из HMS планов лечения"""
    try:
        integration_service = IntegrationService(db)
        
        # Найти клиента CRM
        crm_client = await integration_service.clients_collection.find_one({
            "id": client_id
        })
        
        if not crm_client:
            raise HTTPException(status_code=404, detail="Клиент CRM не найден")
        
        if not crm_client.get("hms_patient_id"):
            return {
                "client_id": client_id,
                "hms_patient_id": None,
                "total_revenue": 0.0,
                "paid_plans_count": 0,
                "plans": []
            }
        
        # Получить ВСЕ планы лечения для этого пациента (включая черновики)
        # ✅ ВКЛЮЧАЕМ черновики для консистентности с HMS статистикой
        treatment_plans = await db.treatment_plans.find({
            "patient_id": crm_client["hms_patient_id"]
        }).to_list(None)
        
        # Вычисляем суммы из планов лечения
        total_amount = sum(plan.get("total_cost", 0) for plan in treatment_plans)
        paid_amount = sum(plan.get("paid_amount", 0) for plan in treatment_plans)
        deposit_in_plans = sum(plan.get("deposit_amount", 0) for plan in treatment_plans)  # Депозит применённый к планам
        
        # ✅ НОВОЕ: Получаем депозиты из записей пациента (appointments)
        hms_patient_id = crm_client["hms_patient_id"]
        appointments_with_deposit = await db.appointments.find({
            "patient_id": hms_patient_id,
            "deposit": {"$gt": 0}  # Только записи с депозитом
        }).to_list(None)
        
        # Вычисляем общую сумму депозитов из записей
        deposit_from_appointments = 0
        for appointment in appointments_with_deposit:
            deposit_value = appointment.get("deposit", 0) or 0
            deposit_type = appointment.get("deposit_type")
            price = appointment.get("price", 0) or 0
            
            # Если депозит в процентах - вычисляем сумму
            if deposit_type == "percent" and price > 0:
                deposit_from_appointments += (price * deposit_value) / 100
            else:
                deposit_from_appointments += deposit_value
        
        # ✅ НОВОЕ: Проверяем также лид (crm_leads) для этого пациента
        # Ищем лид по телефону клиента или по hms_patient_id
        lead_deposit = 0
        client_phone = crm_client.get("phone")
        if client_phone:
            phone_normalized = client_phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
            lead = await db.crm_leads.find_one({
                "$or": [
                    {"phone": client_phone},
                    {"phone": phone_normalized},
                    {"phone": {"$regex": phone_normalized[-9:] if len(phone_normalized) >= 9 else phone_normalized}},
                    {"converted_to_client_id": hms_patient_id}
                ]
            })
            if lead:
                lead_deposit = lead.get("deposit_amount", 0) or 0
        
        # Берём максимальное значение из записей или лида (они должны быть синхронизированы, 
        # но на случай рассинхрона берём большее)
        total_deposit_from_sources = max(deposit_from_appointments, lead_deposit)
        
        # Остаток депозита = депозит из записей/лида - депозит применённый к планам
        # Если депозит из записей больше чем применённый - есть остаток
        deposit_balance = max(0, total_deposit_from_sources - deposit_in_plans)
        
        # Общая сумма депозита для отображения (максимум из всех источников)
        deposit_amount = max(deposit_in_plans, total_deposit_from_sources)
        
        total_paid_with_deposit = paid_amount + deposit_amount
        pending_amount = max(0, total_amount - total_paid_with_deposit)
        
        plans_info = [
            {
                "plan_id": plan["id"],
                "title": plan["title"],
                "total_cost": plan.get("total_cost", 0),
                "paid_amount": plan.get("paid_amount", 0),
                "deposit_amount": plan.get("deposit_amount", 0),  # Депозит плана
                "payment_status": plan.get("payment_status", "unpaid"),
                "status": plan.get("status", "draft"),
                "payment_date": plan.get("payment_date"),
                "created_at": plan["created_at"]
            }
            for plan in treatment_plans
        ]
        
        return {
            "client_id": client_id,
            "hms_patient_id": crm_client["hms_patient_id"],
            "total_amount": total_amount,
            "paid_amount": paid_amount,
            "deposit_amount": deposit_amount,  # Общая сумма депозитов
            "deposit_in_plans": deposit_in_plans,  # Депозит применённый к планам
            "deposit_from_appointments": total_deposit_from_sources,  # Депозит из записей/лида
            "deposit_balance": deposit_balance,  # ✅ НОВОЕ: Остаток депозита
            "pending_amount": pending_amount,
            "treatment_plans_count": len(treatment_plans),
            "plans": plans_info
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@integration_router.get("/hms-revenue-statistics")
async def get_hms_revenue_statistics(
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить общую статистику выручки из HMS для дашборда CRM"""
    try:
        # Получаем ВСЕ планы лечения из HMS (как в HMS статистике)
        # ✅ ВКЛЮЧАЕМ черновики, чтобы данные совпадали с HMS статистикой
        treatment_plans = await db.treatment_plans.find({}).to_list(None)
        
        # Вычисляем общую выручку
        total_amount = sum(plan.get("total_cost", 0) or 0 for plan in treatment_plans)
        total_paid = sum(plan.get("paid_amount", 0) or 0 for plan in treatment_plans)
        total_pending = total_amount - total_paid
        
        # Статистика по статусам оплаты
        payment_stats = {
            "paid": 0,
            "partially_paid": 0,
            "unpaid": 0,
            "overdue": 0
        }
        
        for plan in treatment_plans:
            payment_status = plan.get("payment_status", "unpaid")
            if payment_status in payment_stats:
                payment_stats[payment_status] += 1
        
        # Количество уникальных пациентов с планами лечения
        unique_patients = len(set(plan.get("patient_id") for plan in treatment_plans if plan.get("patient_id")))
        
        # Средняя выручка на пациента
        avg_revenue_per_patient = (total_paid / unique_patients) if unique_patients > 0 else 0
        
        return {
            "total_revenue": total_paid,
            "total_amount": total_amount,
            "pending_amount": total_pending,
            "total_plans": len(treatment_plans),
            "unique_patients": unique_patients,
            "avg_revenue_per_patient": avg_revenue_per_patient,
            "collection_rate": round((total_paid / total_amount * 100) if total_amount > 0 else 0, 1),
            "payment_statistics": payment_stats
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@integration_router.get("/sources-revenue-statistics")
async def get_sources_revenue_statistics(
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить статистику выручки по источникам CRM из HMS планов лечения"""
    try:
        # Получаем все источники CRM
        sources_collection = db.crm_sources
        all_sources = await sources_collection.find({}).to_list(None)
        
        sources_revenue = []
        
        for source in all_sources:
            source_id = source.get("id")
            source_name = source.get("name", "Неизвестный источник")
            
            # Находим все заявки от этого источника
            leads_collection = db.crm_leads
            source_leads = await leads_collection.find({
                "source_id": source_id
            }).to_list(None)
            
            # Находим клиентов, конвертированных из этих заявок
            leads_ids = [lead.get("id") for lead in source_leads]
            
            clients_collection = db.crm_clients
            converted_clients = await clients_collection.find({
                "source_lead_id": {"$in": leads_ids},  # ✅ ИСПРАВЛЕНО: правильное поле
                "is_hms_patient": True  # Только те, кто стал пациентом HMS
            }).to_list(None)
            
            # Получаем HMS patient_id для этих клиентов
            hms_patient_ids = [
                client.get("hms_patient_id") 
                for client in converted_clients 
                if client.get("hms_patient_id")
            ]
            
            if not hms_patient_ids:
                # Нет конвертированных пациентов
                sources_revenue.append({
                    "source_id": source_id,
                    "source_name": source_name,
                    "source_type": source.get("type", "unknown"),
                    "total_revenue": 0.0,
                    "total_amount": 0.0,
                    "pending_amount": 0.0,
                    "treatment_plans_count": 0,
                    "converted_patients_count": 0,
                    "leads_count": len(source_leads),
                    "conversion_rate": 0.0
                })
                continue
            
            # Получаем все планы лечения для этих пациентов
            treatment_plans = await db.treatment_plans.find({
                "patient_id": {"$in": hms_patient_ids}
            }).to_list(None)
            
            # Вычисляем выручку (ТОЛЬКО ОПЛАЧЕННУЮ как просил пользователь)
            total_amount = sum(plan.get("total_cost", 0) or 0 for plan in treatment_plans)
            total_paid = sum(plan.get("paid_amount", 0) or 0 for plan in treatment_plans)
            pending_amount = total_amount - total_paid
            
            conversion_rate = (len(converted_clients) / len(source_leads) * 100) if source_leads else 0
            
            sources_revenue.append({
                "source_id": source_id,
                "source_name": source_name,
                "source_type": source.get("type", "unknown"),
                "total_revenue": total_paid,  # ТОЛЬКО ОПЛАЧЕННАЯ выручка
                "total_amount": total_amount,
                "pending_amount": pending_amount,
                "treatment_plans_count": len(treatment_plans),
                "converted_patients_count": len(converted_clients),
                "leads_count": len(source_leads),
                "conversion_rate": round(conversion_rate, 1)
            })
        
        # Сортируем по выручке (убывание)
        sources_revenue.sort(key=lambda x: x["total_revenue"], reverse=True)
        
        # Общая статистика
        total_sources = len(all_sources)
        total_revenue_all = sum(s["total_revenue"] for s in sources_revenue)
        sources_with_revenue = len([s for s in sources_revenue if s["total_revenue"] > 0])
        
        return {
            "sources": sources_revenue,
            "summary": {
                "total_sources": total_sources,
                "sources_with_revenue": sources_with_revenue,
                "total_revenue": total_revenue_all,
                "avg_revenue_per_source": (total_revenue_all / sources_with_revenue) if sources_with_revenue > 0 else 0
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@integration_router.get("/client-last-appointment/{client_id}")
async def get_client_last_appointment(
    client_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить информацию о последнем приеме клиента"""
    try:
        # Получаем клиента
        clients_collection = db.crm_clients
        client = await clients_collection.find_one({"id": client_id})
        
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Если клиент не является пациентом HMS, возвращаем null
        if not client.get("is_hms_patient") or not client.get("hms_patient_id"):
            return {"last_appointment": None}
        
        # Получаем последний прием пациента в HMS
        hms_patient_id = client.get("hms_patient_id")
        appointments_collection = db.appointments
        
        # Ищем последний прием (любой статус, кроме отмененных)
        last_appointment = await appointments_collection.find_one(
            {
                "patient_id": hms_patient_id,
                "status": {"$nin": ["cancelled", "no_show"]}  # Исключаем только отмененные и неявки
            },
            sort=[("appointment_date", -1), ("appointment_time", -1)]  # Сортируем по убыванию даты
        )
        
        if last_appointment:
            # Получаем информацию о враче
            doctors_collection = db.doctors
            doctor = await doctors_collection.find_one({"id": last_appointment["doctor_id"]})
            
            appointment_info = {
                "date": last_appointment["appointment_date"],
                "time": last_appointment["appointment_time"],
                "doctor_name": doctor.get("full_name", "Неизвестный врач") if doctor else "Неизвестный врач",
                "doctor_specialty": _get_doctor_specialty(doctor),
                "reason": last_appointment.get("reason", ""),
                "status": last_appointment.get("status", ""),
                "deposit": last_appointment.get("deposit", 0),
                "deposit_type": last_appointment.get("deposit_type", ""),
                "price": last_appointment.get("price", 0)
            }
            
            return {"last_appointment": appointment_info}
        else:
            return {"last_appointment": None}
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@integration_router.get("/client-hms-data/{client_id}/appointments")
async def get_client_hms_appointments(
    client_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить все приемы клиента из HMS"""
    try:
        # Получаем клиента
        clients_collection = db.crm_clients
        client = await clients_collection.find_one({"id": client_id})
        
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Если клиент не является пациентом HMS, возвращаем пустой список
        if not client.get("is_hms_patient") or not client.get("hms_patient_id"):
            return []
        
        # Получаем все приемы пациента в HMS
        hms_patient_id = client.get("hms_patient_id")
        appointments_collection = db.appointments
        
        appointments = await appointments_collection.find({
            "patient_id": hms_patient_id
        }).sort([("appointment_date", -1), ("appointment_time", -1)]).to_list(None)
        
        # Обогащаем данными о врачах
        doctors_collection = db.doctors
        result_appointments = []
        
        for appointment in appointments:
            doctor = await doctors_collection.find_one({"id": appointment.get("doctor_id")})
            
            appointment_info = {
                "id": appointment.get("id"),
                "appointment_date": appointment.get("appointment_date"),
                "appointment_time": appointment.get("appointment_time"),
                "doctor_name": doctor.get("full_name", "Неизвестный врач") if doctor else "Неизвестный врач",
                "doctor_specialty": _get_doctor_specialty(doctor),
                "reason": appointment.get("reason", ""),
                "status": appointment.get("status", ""),
                "notes": appointment.get("notes", ""),
                "created_at": appointment.get("created_at")
            }
            result_appointments.append(appointment_info)
        
        return result_appointments
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@integration_router.get("/dashboard-statistics")
async def get_dashboard_statistics(
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить комплексную статистику для CRM дашборда"""
    try:
        from datetime import timedelta
        
        # Получаем текущую дату
        now = datetime.utcnow()
        
        # ===== СТАТИСТИКА ВЫРУЧКИ ПО МЕСЯЦАМ =====
        # Получаем все планы лечения
        treatment_plans = await db.treatment_plans.find({}).to_list(None)
        
        # Группируем по месяцам
        monthly_revenue = {}
        for plan in treatment_plans:
            created_at = plan.get("created_at")
            if created_at:
                if isinstance(created_at, str):
                    try:
                        created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    except:
                        continue
                month_key = created_at.strftime("%Y-%m")
                if month_key not in monthly_revenue:
                    monthly_revenue[month_key] = {"revenue": 0, "target": 0}
                monthly_revenue[month_key]["revenue"] += plan.get("paid_amount", 0) or 0
        
        # Форматируем для графика (последние 12 месяцев)
        revenue_data = []
        month_names = {
            "01": "Янв", "02": "Фев", "03": "Мар", "04": "Апр",
            "05": "Май", "06": "Июн", "07": "Июл", "08": "Авг",
            "09": "Сен", "10": "Окт", "11": "Ноя", "12": "Дек"
        }
        
        for i in range(11, -1, -1):
            month_date = now - timedelta(days=i*30)
            month_key = month_date.strftime("%Y-%m")
            month_num = month_date.strftime("%m")
            month_data = monthly_revenue.get(month_key, {"revenue": 0, "target": 0})
            revenue_data.append({
                "month": month_names.get(month_num, month_num),
                "revenue": month_data["revenue"],
                "target": 50000  # Можно сделать настраиваемым
            })
        
        # ===== НЕДАВНЯЯ АКТИВНОСТЬ =====
        recent_activity = []
        
        # Последние заявки
        leads_collection = db.crm_leads
        recent_leads = await leads_collection.find({}).sort("created_at", -1).limit(5).to_list(None)
        for lead in recent_leads:
            created_at = lead.get("created_at")
            time_ago = "недавно"
            if created_at:
                if isinstance(created_at, str):
                    try:
                        created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    except:
                        pass
                if isinstance(created_at, datetime):
                    diff = now - created_at.replace(tzinfo=None)
                    if diff.days > 0:
                        time_ago = f"{diff.days} дн. назад"
                    elif diff.seconds > 3600:
                        time_ago = f"{diff.seconds // 3600} ч. назад"
                    elif diff.seconds > 60:
                        time_ago = f"{diff.seconds // 60} мин. назад"
                    else:
                        time_ago = "только что"
            
            recent_activity.append({
                "id": lead.get("id"),
                "type": "lead",
                "action": f"Новая заявка от {lead.get('full_name', 'Неизвестно')}",
                "description": lead.get("service_interest", "Консультация"),
                "time": time_ago,
                "amount": lead.get("expected_revenue", 0)
            })
        
        # Последние сделки
        deals_collection = db.crm_deals
        recent_deals = await deals_collection.find({"status": "won"}).sort("closed_at", -1).limit(3).to_list(None)
        for deal in recent_deals:
            closed_at = deal.get("closed_at")
            time_ago = "недавно"
            if closed_at:
                if isinstance(closed_at, str):
                    try:
                        closed_at = datetime.fromisoformat(closed_at.replace("Z", "+00:00"))
                    except:
                        pass
                if isinstance(closed_at, datetime):
                    diff = now - closed_at.replace(tzinfo=None)
                    if diff.days > 0:
                        time_ago = f"{diff.days} дн. назад"
                    elif diff.seconds > 3600:
                        time_ago = f"{diff.seconds // 3600} ч. назад"
                    elif diff.seconds > 60:
                        time_ago = f"{diff.seconds // 60} мин. назад"
            
            recent_activity.append({
                "id": deal.get("id"),
                "type": "deal",
                "action": "Сделка закрыта",
                "description": deal.get("title", "Сделка"),
                "time": time_ago,
                "amount": deal.get("amount", 0)
            })
        
        # Последние клиенты
        clients_collection = db.crm_clients
        recent_clients = await clients_collection.find({}).sort("created_at", -1).limit(3).to_list(None)
        for client in recent_clients:
            created_at = client.get("created_at")
            time_ago = "недавно"
            if created_at:
                if isinstance(created_at, str):
                    try:
                        created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                    except:
                        pass
                if isinstance(created_at, datetime):
                    diff = now - created_at.replace(tzinfo=None)
                    if diff.days > 0:
                        time_ago = f"{diff.days} дн. назад"
                    elif diff.seconds > 3600:
                        time_ago = f"{diff.seconds // 3600} ч. назад"
                    elif diff.seconds > 60:
                        time_ago = f"{diff.seconds // 60} мин. назад"
            
            client_type = "VIP клиент" if client.get("segment") == "vip" else "Новый клиент"
            recent_activity.append({
                "id": client.get("id"),
                "type": "client",
                "action": client_type,
                "description": client.get("full_name", "Неизвестно"),
                "time": time_ago,
                "amount": client.get("total_spent", 0)
            })
        
        # Сортируем по времени (свежие первыми) и берем 10
        recent_activity = sorted(recent_activity, key=lambda x: x.get("time", ""), reverse=False)[:10]
        
        # ===== СТАТИСТИКА ПО МЕНЕДЖЕРАМ =====
        managers_collection = db.crm_managers
        managers_list = await managers_collection.find({"status": "active"}).to_list(None)
        
        managers_stats = []
        for manager in managers_list[:5]:  # Топ 5
            manager_id = manager.get("id")
            
            # Считаем сделки менеджера
            manager_deals = await deals_collection.count_documents({"manager_id": manager_id})
            won_deals = await deals_collection.count_documents({"manager_id": manager_id, "status": "won"})
            
            # Считаем выручку менеджера
            manager_revenue_cursor = deals_collection.aggregate([
                {"$match": {"manager_id": manager_id, "status": "won"}},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
            ])
            manager_revenue_result = await manager_revenue_cursor.to_list(None)
            manager_revenue = manager_revenue_result[0]["total"] if manager_revenue_result else 0
            
            conversion = round((won_deals / manager_deals * 100) if manager_deals > 0 else 0)
            
            managers_stats.append({
                "name": manager.get("full_name", f"Менеджер"),
                "deals": manager_deals,
                "revenue": manager_revenue,
                "conversion": conversion
            })
        
        # Сортируем по выручке
        managers_stats.sort(key=lambda x: x["revenue"], reverse=True)
        
        return {
            "revenue_data": revenue_data,
            "recent_activity": recent_activity,
            "managers_stats": managers_stats
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


@integration_router.get("/client-hms-data/{client_id}/treatment-plans")
async def get_client_hms_treatment_plans(
    client_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Получить все планы лечения клиента из HMS"""
    try:
        # Получаем клиента
        clients_collection = db.crm_clients
        client = await clients_collection.find_one({"id": client_id})
        
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Если клиент не является пациентом HMS, возвращаем пустой список
        if not client.get("is_hms_patient") or not client.get("hms_patient_id"):
            return []
        
        # Получаем все планы лечения пациента в HMS
        hms_patient_id = client.get("hms_patient_id")
        treatment_plans_collection = db.treatment_plans
        
        treatment_plans = await treatment_plans_collection.find({
            "patient_id": hms_patient_id
        }).sort([("created_at", -1)]).to_list(None)
        
        result_plans = []
        for plan in treatment_plans:
            plan_info = {
                "id": plan.get("id"),
                "plan_name": plan.get("title", "План лечения"),
                "description": plan.get("description", ""),
                "status": plan.get("status", "draft"),
                "payment_status": plan.get("payment_status", "unpaid"),
                "total_cost": plan.get("total_cost", 0),
                "paid_amount": plan.get("paid_amount", 0),
                "payment_date": plan.get("payment_date"),
                "created_at": plan.get("created_at"),
                "updated_at": plan.get("updated_at"),
                "services": plan.get("services", [])
            }
            result_plans.append(plan_info)
        
        return result_plans
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
