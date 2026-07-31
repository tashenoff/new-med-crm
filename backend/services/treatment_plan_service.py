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
        return [TreatmentPlan(**plan) for plan in treatment_plans]
    
    async def get_treatment_plan(self, plan_id: str) -> TreatmentPlan:
        """Get a specific treatment plan"""
        treatment_plan = await self.db.treatment_plans.find_one({"id": plan_id})
        if not treatment_plan:
            raise HTTPException(status_code=404, detail="Treatment plan not found")
        
        return TreatmentPlan(**treatment_plan)
    
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
