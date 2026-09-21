"""
Treatment plan service - business logic for treatment plan operations
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException
from datetime import datetime
from typing import List
import logging
from bson import ObjectId

from models.treatment_plan import TreatmentPlan, TreatmentPlanCreate, TreatmentPlanUpdate

logger = logging.getLogger(__name__)


class TreatmentPlanService:
    """Service for treatment plan-related business logic"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def create_treatment_plan(
        self,
        patient_id: str,
        plan_data: TreatmentPlanCreate,
        created_by: str,
        created_by_name: str
    ) -> TreatmentPlan:
        """Create a treatment plan for a patient"""
        # Check if patient exists (support both new patients with id and old patients with only _id)
        try:
            patient = await self.db.patients.find_one({
                "$or": [
                    {"id": patient_id},
                    {"_id": patient_id},
                    {"_id": ObjectId(patient_id)}
                ]
            })
        except:
            patient = await self.db.patients.find_one({"id": patient_id})
        
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Получаем имя врача если указан assigned_doctor_id
        doctor_name = None
        if plan_data.assigned_doctor_id:
            doctor = await self.db.doctors.find_one({"id": plan_data.assigned_doctor_id})
            if not doctor:
                # Пробуем найти по _id
                try:
                    doctor = await self.db.doctors.find_one({"_id": ObjectId(plan_data.assigned_doctor_id)})
                except:
                    pass
            if doctor:
                doctor_name = doctor.get("full_name", "Неизвестный врач")
        
        # Create treatment plan record
        treatment_plan = TreatmentPlan(
            patient_id=patient_id,
            title=plan_data.title,
            description=plan_data.description,
            services=plan_data.services,
            total_cost=plan_data.total_cost,
            status=plan_data.status,
            created_by=created_by,
            created_by_name=created_by_name,
            assigned_doctor_id=plan_data.assigned_doctor_id,
            doctor_name=doctor_name,  # Добавляем имя врача для отчётов
            notes=plan_data.notes,
            # Enhanced tracking fields
            payment_status=plan_data.payment_status,
            paid_amount=plan_data.paid_amount,
            payment_date=plan_data.payment_date,
            execution_status=plan_data.execution_status,
            started_at=plan_data.started_at,
            completed_at=plan_data.completed_at,
            appointment_ids=plan_data.appointment_ids
        )
        
        # Insert to database
        await self.db.treatment_plans.insert_one(treatment_plan.dict())
        
        logger.info(f"Treatment plan created: {treatment_plan.title} for patient {patient_id}")
        return treatment_plan
    
    async def get_patient_treatment_plans(self, patient_id: str) -> List[TreatmentPlan]:
        """Get all treatment plans for a patient"""
        # Check if patient exists (support both new patients with id and old patients with only _id)
        try:
            patient = await self.db.patients.find_one({
                "$or": [
                    {"id": patient_id},
                    {"_id": patient_id},
                    {"_id": ObjectId(patient_id)}
                ]
            })
        except:
            patient = await self.db.patients.find_one({"id": patient_id})
        
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        treatment_plans = await self.db.treatment_plans.find({"patient_id": patient_id}).sort("created_at", -1).to_list(100)
        
        # Получаем сумму депозитов из записей пациента
        deposit_amount = await self._get_patient_deposit_amount(patient_id)
        
        # Добавляем deposit_amount и deposit_balance к каждому плану
        plans = []
        for plan in treatment_plans:
            plan_obj = TreatmentPlan(**plan)
            # Добавляем депозит как атрибут
            plan_dict = plan_obj.dict()
            # extra_deposit - доплаты из кассы
            extra_deposit = plan.get('extra_deposit', 0) or 0
            total_deposit = deposit_amount + extra_deposit
            plan_dict['deposit_amount'] = total_deposit
            plan_dict['extra_deposit'] = extra_deposit
            # deposit_balance - остаток депозита (если не установлен, равен total_deposit)
            plan_dict['deposit_balance'] = plan.get('deposit_balance', total_deposit)
            plans.append(plan_dict)
        
        return plans
    
    async def _get_patient_deposit_amount(self, patient_id: str) -> float:
        """Получить сумму депозитов из записей пациента"""
        try:
            # Находим все записи пациента с депозитом
            appointments = await self.db.appointments.find({
                "patient_id": patient_id,
                "deposit": {"$gt": 0}
            }).to_list(100)
            
            # Суммируем все депозиты
            total_deposit = sum(apt.get("deposit", 0) or 0 for apt in appointments)
            
            logger.info(f"Сумма депозитов для пациента {patient_id}: {total_deposit}₸")
            return total_deposit
            
        except Exception as e:
            logger.error(f"Ошибка получения депозита для пациента {patient_id}: {str(e)}")
            return 0
    
    async def get_treatment_plan(self, plan_id: str) -> dict:
        """Get a specific treatment plan with deposit amount and balance"""
        treatment_plan = await self.db.treatment_plans.find_one({"id": plan_id})
        if not treatment_plan:
            raise HTTPException(status_code=404, detail="Treatment plan not found")
        
        # Получаем сумму депозитов из записей пациента
        patient_id = treatment_plan.get("patient_id")
        deposit_amount = await self._get_patient_deposit_amount(patient_id) if patient_id else 0
        
        # Преобразуем в объект и добавляем депозит
        plan_obj = TreatmentPlan(**treatment_plan)
        plan_dict = plan_obj.dict()
        
        # extra_deposit - доплаты из кассы
        extra_deposit = treatment_plan.get('extra_deposit', 0) or 0
        total_deposit = deposit_amount + extra_deposit
        
        plan_dict['deposit_amount'] = total_deposit
        plan_dict['extra_deposit'] = extra_deposit
        # deposit_balance - остаток депозита (если не установлен, равен total_deposit)
        plan_dict['deposit_balance'] = treatment_plan.get('deposit_balance', total_deposit)
        
        return plan_dict
    
    async def update_treatment_plan(
        self,
        plan_id: str,
        update_data: TreatmentPlanUpdate
    ) -> TreatmentPlan:
        """Update treatment plan"""
        treatment_plan = await self.db.treatment_plans.find_one({"id": plan_id})
        if not treatment_plan:
            raise HTTPException(status_code=404, detail="Treatment plan not found")
        
        # Update treatment plan
        update_dict = update_data.dict(exclude_unset=True)
        if update_dict:
            update_dict["updated_at"] = datetime.utcnow()
            await self.db.treatment_plans.update_one(
                {"id": plan_id},
                {"$set": update_dict}
            )
        
        # Return updated treatment plan
        updated_plan = await self.db.treatment_plans.find_one({"id": plan_id})
        
        # Автоматическая синхронизация с CRM при изменении статуса оплаты
        if "payment_status" in update_dict or "paid_amount" in update_dict:
            try:
                await self._sync_with_crm(updated_plan)
            except Exception as e:
                logger.error(f"Ошибка синхронизации с CRM для плана {plan_id}: {str(e)}")
                # Не прерываем выполнение, только логируем ошибку
        
        return TreatmentPlan(**updated_plan)
    
    async def delete_treatment_plan(self, plan_id: str) -> dict:
        """Delete a treatment plan"""
        treatment_plan = await self.db.treatment_plans.find_one({"id": plan_id})
        if not treatment_plan:
            raise HTTPException(status_code=404, detail="Treatment plan not found")
        
        # Delete from database
        await self.db.treatment_plans.delete_one({"id": plan_id})
        
        logger.info(f"Treatment plan deleted: {plan_id}")
        return {"message": "Treatment plan deleted successfully"}
    
    async def pay_complex_component(self, plan_id, service_id, component_service_id, payment_data=None):
        """Отметить оплаченной одну услугу комплекса (долю), пересчитать долю
        комплекса и статус плана. Доля услуги = прайс×кол-во×k×(1-скидка/100)."""
        plan = await self.db.treatment_plans.find_one({"id": plan_id})
        if not plan:
            raise HTTPException(status_code=404, detail="Treatment plan not found")

        service = next((s for s in plan.get("services", []) if s.get("service_id") == service_id), None)
        if not service or not service.get("is_complex"):
            raise HTTPException(status_code=404, detail="Комплексная услуга не найдена в плане")

        comps = service.get("components") or []
        comp = next((c for c in comps if c.get("service_id") == component_service_id), None)
        if not comp:
            raise HTTPException(status_code=404, detail="Услуга комплекса не найдена")

        sum_default = sum((c.get("price", 0) or 0) * (c.get("quantity", 1) or 1) for c in comps)
        # цена комплекса: price | price_per_unit | total_price/количество (в плане price может не быть)
        complex_price = float(service.get("price") or service.get("price_per_unit")
                              or ((service.get("total_price", 0) or 0) / (service.get("quantity") or 1))) or 0.0
        k = complex_price / sum_default if sum_default else 0.0
        default = (comp.get("price", 0) or 0) * (comp.get("quantity", 1) or 1)
        disc = comp.get("discount", 0) or 0
        share = default * k * (1 - disc / 100)

        comp["paid"] = True
        comp["paid_amount"] = round(share, 2)
        if payment_data and isinstance(payment_data, dict):
            if payment_data.get("payment_method_id"):
                comp["payment_method_id"] = payment_data["payment_method_id"]
            if payment_data.get("payment_method_name"):
                comp["payment_method_name"] = payment_data["payment_method_name"]

        paid_total = sum((c.get("paid_amount") or 0) for c in comps if c.get("paid"))
        service["paid_amount"] = round(paid_total, 2)
        service["payment_status"] = ("paid" if paid_total >= complex_price - 0.001
                                     else "partially_paid" if paid_total > 0 else "unpaid")

        # Пересчёт общей оплаты по плану (комплексы — по оплаченным долям)
        total_paid = 0.0
        for svc in plan.get("services", []):
            if svc.get("is_complex"):
                total_paid += svc.get("paid_amount") or 0
            elif svc.get("payment_status") == "paid":
                total_paid += svc.get("total_price", 0)
        plan["paid_amount"] = round(total_paid, 2)
        plan["total_cost"] = plan.get("total_cost") or sum(
            (svc.get("total_price") or 0) for svc in plan.get("services", [])
        )
        total_cost = plan["total_cost"] or 0
        if plan["paid_amount"] >= total_cost - 0.001:
            plan["payment_status"] = "paid"
            plan["payment_date"] = datetime.utcnow()
        elif plan["paid_amount"] > 0:
            plan["payment_status"] = "partially_paid"
        else:
            plan["payment_status"] = "unpaid"
        plan["updated_at"] = datetime.utcnow()

        await self.db.treatment_plans.update_one({"id": plan_id}, {"$set": plan})
        # убрать ObjectId, иначе FastAPI не сможет сериализовать ответ
        plan.pop("_id", None)
        return plan

    async def _sync_with_crm(self, plan: dict):
        """Синхронизация с CRM (внутренний метод)"""
        try:
            # Динамический импорт чтобы избежать циклических зависимостей
            from crm.services.integration_service import IntegrationService
            integration_service = IntegrationService(self.db)
            
            await integration_service.sync_treatment_plan_payment(
                treatment_plan_id=plan["id"],
                patient_id=plan["patient_id"],
                payment_status=plan["payment_status"],
                paid_amount=plan.get("paid_amount", 0.0),
                total_cost=plan.get("total_cost", 0.0),
                plan_title=plan["title"]
            )
            
            logger.info(f"Автоматическая синхронизация с CRM для плана {plan['id']} выполнена")
            
        except Exception as e:
            # Пробрасываем ошибку выше для обработки
            raise e
