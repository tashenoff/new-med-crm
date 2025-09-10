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
        
        # Вычисляем суммы
        total_amount = sum(plan.get("total_cost", 0) for plan in treatment_plans)
        paid_amount = sum(plan.get("paid_amount", 0) for plan in treatment_plans)
        pending_amount = total_amount - paid_amount
        
        plans_info = [
            {
                "plan_id": plan["id"],
                "title": plan["title"],
                "total_cost": plan.get("total_cost", 0),
                "paid_amount": plan.get("paid_amount", 0),
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
                "doctor_specialty": doctor.get("specialty", "") if doctor else "",
                "reason": last_appointment.get("reason", ""),
                "status": last_appointment.get("status", "")
            }
            
            return {"last_appointment": appointment_info}
        else:
            return {"last_appointment": None}
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
