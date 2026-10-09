"""
Treatment plan service - business logic for treatment plan operations
"""
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException
from datetime import datetime
from typing import List
import logging
from bson import ObjectId
from copy import deepcopy
from math import isfinite

from models.treatment_plan import TreatmentPlan, TreatmentPlanCreate, TreatmentPlanUpdate
from services.service_price_service import validate_component_snapshot
from services.accounting_ledger_service import (
    assign_ledger_identities, preserve_ledger_identities, reject_ledger_writer, advance_balance, patient_deposit_balance, is_ledger_plan,
)

logger = logging.getLogger(__name__)


def _round_shares(raw_shares):
    """Округлить доли до целых ₸ так, чтобы сумма совпадала с round(сумма raw).
    Остаток относится на услугу с самой большой долей (без плавающих чисел)."""
    if not raw_shares:
        return []
    floors = [int(x) for x in raw_shares]
    deficit = int(round(sum(raw_shares))) - sum(floors)
    if deficit:
        largest = max(range(len(floors)), key=lambda i: raw_shares[i])
        floors[largest] += deficit
    return floors


def recalculate_plan_payment(plan):
    paid_total = 0.0
    for row in plan.get("services", []):
        if row.get("is_complex"):
            paid_total += sum((comp.get("paid_amount") or 0)
                              for comp in row.get("components", []) if comp.get("paid"))
        elif row.get("payment_type") == "per_session" and row.get("sessions"):
            for session in row["sessions"]:
                if session.get("paid"):
                    paid_total += session.get("paid_amount", row.get("price_per_unit", 0)) or 0
        elif row.get("payment_status") in ("paid", "partially_paid"):
            paid_total += row.get("paid_amount", row.get("total_price", 0)) or 0
    plan["paid_amount"] = round(paid_total, 2)
    total_cost = plan.get("total_cost") or sum(row.get("total_price", 0) or 0
                                              for row in plan.get("services", []))
    plan["total_cost"] = total_cost
    if paid_total >= total_cost - 0.001:
        plan["payment_status"] = "paid"
        plan["payment_date"] = plan.get("payment_date") or datetime.utcnow()
    else:
        plan["payment_status"] = "partially_paid" if paid_total > 0 else "unpaid"
        plan["payment_date"] = None


def _allocate_receipt(shares, amount):
    balances = [int(round(share * 100)) for share in shares]
    discount = sum(balances) - int(round(amount * 100))
    while discount > 0:
        active = [index for index, balance in enumerate(balances) if balance > 0]
        quotient, remainder = divmod(discount, len(active))
        for position, index in enumerate(active):
            deduction = min(balances[index], quotient + (position < remainder))
            balances[index] -= deduction
            discount -= deduction
    return [balance / 100 for balance in balances]


class TreatmentPlanService:
    """Service for treatment plan-related business logic"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def _prepare_new_complex_row(self, row):
        from services.service_price_service import ServicePriceService
        for item in [row, *(row.get("components") or [])]:
            if (item.get("paid") or item.get("payment_status") not in (None, "unpaid")
                    or any(item.get(key) for key in ("paid_amount", "paid_from_deposit", "discount_amount", "discount_total"))):
                raise HTTPException(status_code=400, detail="Use complex component payment endpoints")
        row["components"] = await ServicePriceService(self.db)._validate_components(
            row.get("components") or [], exclude_id=row.get("service_id"))
    
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
        services = deepcopy(plan_data.services)
        for row in services:
            if row.get("is_complex"):
                if plan_data.payment_status != "unpaid" or plan_data.paid_amount:
                    raise HTTPException(status_code=400, detail="Use complex component payment endpoints")
                await self._prepare_new_complex_row(row)
        assign_ledger_identities(services)
        treatment_plan = TreatmentPlan(
            patient_id=patient_id,
            title=plan_data.title,
            description=plan_data.description,
            services=services,
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
        if treatment_plan.payment_status != "unpaid" or treatment_plan.paid_amount:
            await self.sync_persisted_payment(treatment_plan.id)
        
        # Replay actual appointment receipts in FIFO order; immutable assignments
        # across all plans prevent creation/retry from spending a receipt twice.
        from routers.appointments import apply_deposit_to_treatment_plans, appointment_deposit_kzt
        appointments = await self.db.appointments.find({
            "patient_id": patient_id, "deposit": {"$gt": 0}
        }).sort([("created_at", 1), ("id", 1)]).to_list(None)
        for appointment in appointments:
            appointment_id = appointment.get("id") or str(appointment.get("_id", ""))
            if not appointment_id:
                raise HTTPException(409, "Appointment deposit requires immutable appointment identity")
            await apply_deposit_to_treatment_plans(patient_id, float(appointment_deposit_kzt(appointment)), appointment_id, self.db)
        if appointments:
            treatment_plan = TreatmentPlan(**await self.db.treatment_plans.find_one({"id": treatment_plan.id}))

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
        deposit_amount = await self._get_patient_deposit_amount(patient_id) if any(not is_ledger_plan(plan) for plan in treatment_plans) else 0
        
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
            plan_dict['advance_balance_kzt'] = float(advance_balance(plan.get('accounting_events', []), plan['id']))
            if is_ledger_plan(plan):
                plan_dict['deposit_balance'] = float(patient_deposit_balance(plan.get('accounting_events', []), plan['id']))
                plan_dict['deposit_amount'] = sum(event['amount_kzt'] for event in plan.get('accounting_events', []) if event.get('kind') == 'patient_deposit_received')
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
        deposit_amount = await self._get_patient_deposit_amount(patient_id) if patient_id and not is_ledger_plan(treatment_plan) else 0
        
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
        plan_dict['advance_balance_kzt'] = float(advance_balance(treatment_plan.get('accounting_events', []), plan_id))
        
        if is_ledger_plan(treatment_plan):
            plan_dict['deposit_balance'] = float(patient_deposit_balance(treatment_plan.get('accounting_events', []), plan_id))
            plan_dict['deposit_amount'] = sum(event['amount_kzt'] for event in treatment_plan.get('accounting_events', []) if event.get('kind') == 'patient_deposit_received')
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
        reject_ledger_writer(treatment_plan)
        update_dict = update_data.dict(exclude_unset=True)
        if any(row.get("is_complex") for row in treatment_plan.get("services", [])):
            if any(key in update_dict and update_dict[key] != treatment_plan.get(key)
                   for key in ("payment_status", "paid_amount", "payment_date")):
                raise HTTPException(status_code=400, detail="Use complex component payment endpoints")
        if "services" in update_dict:
            preserve_ledger_identities(treatment_plan.get("services", []), update_dict["services"])
            payment_fields = ("payment_status", "paid", "paid_amount", "discount_amount",
                              "discount_total", "paid_from_deposit", "payment_method_id", "payment_method_name")
            for previous in treatment_plan.get("services", []):
                if not previous.get("is_complex"):
                    continue
                current = next((row for row in update_dict["services"]
                                if row.get("service_id") == previous.get("service_id")), None)
                settled = any(component.get("paid") for component in previous.get("components", []))
                if current is None and not settled:
                    continue
                if current is None or not current.get("is_complex"):
                    raise HTTPException(status_code=400, detail="Cannot remove paid complex service")
                previous_components = {component["service_id"]: component for component in previous.get("components", [])}
                current_components = {component["service_id"]: component for component in current.get("components", [])}
                if any(previous.get(key) != current.get(key) for key in payment_fields):
                    raise HTTPException(status_code=400, detail="Cannot edit complex payment state")
                for identity, component in previous_components.items():
                    updated = current_components.get(identity, {})
                    if any(component.get(key) != updated.get(key) for key in payment_fields):
                        raise HTTPException(status_code=400, detail="Cannot edit complex component receipts")
                if settled and (previous_components.keys() != current_components.keys() or any(
                        component.get(key) != current_components.get(identity, {}).get(key)
                        for identity, component in previous_components.items()
                        for key in ("price", "quantity", "discount")) or any(
                        previous.get(key) != current.get(key) for key in
                        ("price", "price_per_unit", "quantity", "quantity_total", "total_price"))):
                    raise HTTPException(status_code=400, detail="Cannot reprice paid complex service")
            existing_complex_ids = {row.get("service_id") for row in treatment_plan.get("services", [])
                                    if row.get("is_complex")}
            for row in update_dict["services"]:
                if row.get("is_complex") and row.get("service_id") not in existing_complex_ids:
                    await self._prepare_new_complex_row(row)
        if update_dict:
            update_dict["updated_at"] = datetime.utcnow()
            query = {"id": plan_id, "services": treatment_plan.get("services"),
                     "accounting_events.0": {"$exists": False}}
            if {"payment_status", "paid_amount", "payment_date", "services", "total_cost"}.intersection(update_dict):
                result = await self.persist_payment_update(query, update_dict)
            else:
                result = await self.db.treatment_plans.update_one(query, {"$set": update_dict})
            if not result.matched_count:
                raise HTTPException(status_code=409, detail="Concurrent plan update; retry edit")
        
        # Return updated treatment plan
        updated_plan = await self.db.treatment_plans.find_one({"id": plan_id})
        
        return TreatmentPlan(**updated_plan)
    
    async def delete_treatment_plan(self, plan_id: str) -> dict:
        """Delete a treatment plan"""
        treatment_plan = await self.db.treatment_plans.find_one({"id": plan_id})
        if not treatment_plan:
            raise HTTPException(status_code=404, detail="Treatment plan not found")
        
        # Delete from database
        reject_ledger_writer(treatment_plan)
        result = await self.db.treatment_plans.delete_one({"id": plan_id, "accounting_events.0": {"$exists": False}})
        if not result.deleted_count:
            raise HTTPException(409, "Concurrent ledger write; plan deletion is locked")
        
        logger.info(f"Treatment plan deleted: {plan_id}")
        return {"message": "Treatment plan deleted successfully"}
    
    async def pay_complex_component(self, plan_id, service_id, component_service_id, payment_data=None):
        return await self._pay_complex(plan_id, service_id, component_service_id, payment_data)

    async def _pay_complex(self, plan_id, service_id, component_service_id, payment_data=None, attempt=0):
        plan = await self.db.treatment_plans.find_one({"id": plan_id})
        if not plan:
            raise HTTPException(status_code=404, detail="Treatment plan not found")
        reject_ledger_writer(plan)
        if any(row.get("service_id") == service_id and row.get("service_row_id") for row in plan.get("services", [])):
            raise HTTPException(422, "Prospective complex payments require individual stable component ledger commands")
        snapshot = {key: deepcopy(plan.get(key)) for key in
                    ("services", "paid_amount", "total_cost", "deposit_balance", "updated_at")}
        service = next((s for s in plan.get("services", []) if s.get("service_id") == service_id), None)
        if not service or not service.get("is_complex"):
            raise HTTPException(status_code=404, detail="Комплексная услуга не найдена в плане")

        comps = service.get("components") or []
        validate_component_snapshot(comps)
        if component_service_id is None:
            targets = [index for index, component in enumerate(comps) if not component.get("paid")]
        else:
            index = next((index for index, component in enumerate(comps)
                          if component.get("service_id") == component_service_id), None)
            if index is None:
                raise HTTPException(status_code=404, detail="Услуга комплекса не найдена")
            targets = [] if comps[index].get("paid") else [index]
        if not targets:
            plan.pop("_id", None)
            return plan

        sum_default = sum((c.get("price", 0) or 0) * (c.get("quantity", 1) or 1) for c in comps)
        complex_price = float(service.get("total_price") or
                              (service.get("price") or service.get("price_per_unit") or 0) *
                              (service.get("quantity") or service.get("quantity_total") or 1))
        k = complex_price / sum_default if sum_default else 0.0
        share_scale = 1 if complex_price.is_integer() else 100
        raw_shares = [
            (c.get("price", 0) or 0) * (c.get("quantity", 1) or 1) * k * (1 - ((c.get("discount", 0) or 0) / 100))
            for c in comps
        ]
        rounded = [share / share_scale for share in _round_shares([
            share * share_scale for share in raw_shares])]
        nominal_shares = [share / share_scale for share in _round_shares([
            (component.get("price", 0) or 0) * (component.get("quantity", 1) or 1) * k * share_scale
            for component in comps
        ])]

        shares = [min(rounded[index], nominal_shares[index]) for index in targets]
        received = sum(shares)
        if payment_data and isinstance(payment_data, dict):
            amount = payment_data.get("amount")
            if amount is not None:
                if (not isinstance(amount, (int, float)) or isinstance(amount, bool)
                        or not isfinite(amount) or amount < 0 or amount > received):
                    raise HTTPException(status_code=400, detail="Invalid payment amount for remaining shares")
                received = amount
        allocations = _allocate_receipt(shares, received)
        deposit_balance = plan.get("deposit_balance")
        if deposit_balance is None:
            appointments = await self.db.appointments.find({
                "patient_id": plan.get("patient_id"), "deposit": {"$gt": 0}
            }).to_list(None)
            deposit_balance = sum(appointment.get("deposit", 0) or 0 for appointment in appointments)
            deposit_balance += plan.get("extra_deposit", 0) or 0
        for index, paid_value in zip(targets, allocations):
            comp = comps[index]
            comp["paid"] = True
            comp["paid_amount"] = paid_value
            comp["discount_amount"] = round(nominal_shares[index] - paid_value, 2)
            comp["paid_from_deposit"] = round(min(max(0, deposit_balance), paid_value), 2)
            deposit_balance = round(deposit_balance - comp["paid_from_deposit"], 2)
            if isinstance(payment_data, dict):
                for key in ("payment_method_id", "payment_method_name"):
                    if payment_data.get(key):
                        comp[key] = payment_data[key]
        plan["deposit_balance"] = deposit_balance
        service["paid_from_deposit"] = round(sum(component.get("paid_from_deposit", 0) or 0
                                                for component in comps), 2)
        paid_total = sum((c.get("paid_amount") or 0) for c in comps if c.get("paid"))
        disc_total = sum((c.get("discount_amount") or 0) for c in comps if c.get("paid"))
        service["paid_amount"] = round(paid_total, 2)
        service["discount_total"] = round(disc_total, 2)
        service["payment_status"] = ("paid" if (paid_total + disc_total) >= complex_price - 0.001
                                     else "partially_paid" if paid_total > 0 else "unpaid")

        recalculate_plan_payment(plan)
        plan["updated_at"] = datetime.utcnow()

        plan.pop("_id", None)
        plan.pop("accounting_events", None)
        result = await self.persist_payment_update({"id": plan_id, **snapshot}, plan)
        if not result.matched_count:
            if attempt >= 7:
                raise HTTPException(status_code=409, detail="Concurrent plan update; retry payment")
            return await self._pay_complex(
                plan_id, service_id, component_service_id, payment_data, attempt + 1)
        return plan

    async def pay_complex_remaining(self, plan_id, service_id, payment_data=None):
        return await self._pay_complex(plan_id, service_id, None, payment_data)

    async def persist_payment_update(self, query: dict, fields: dict):
        """Synchronize CRM only after a successful treatment-plan write."""
        try:
            plan = await self.db.treatment_plans.find_one({"id": query["id"]})
        except Exception:
            logger.warning("Payment guard read failed; atomic no-events condition remains mandatory", exc_info=True)
            plan = None
        if plan:
            reject_ledger_writer(plan)
        if "accounting_events" in fields:
            raise HTTPException(409, "Generic writers cannot replace accounting_events")
        query = {**query, "accounting_events.0": {"$exists": False}}
        result = await self.db.treatment_plans.update_one(query, {"$set": fields})
        if result.matched_count:
            await self.sync_persisted_payment(query["id"])
        return result

    async def sync_persisted_payment(self, plan_id: str):
        """Read persisted payment state before invoking the shared CRM hook."""
        try:
            plan = await self.db.treatment_plans.find_one({"id": plan_id})
            if plan:
                await self._sync_with_crm(plan)
        except Exception:
            logger.exception("Post-payment CRM synchronization failed for plan %s", plan_id)

    async def _sync_with_crm(self, plan: dict):
        """Synchronize deal accounting and the patient's canonical CRM card."""
        try:
            from crm.services.integration_service import IntegrationService
            integration_service = IntegrationService(self.db)
            
            await integration_service.sync_treatment_plan_payment(
                treatment_plan_id=plan["id"],
                patient_id=plan["patient_id"],
                payment_status=plan["payment_status"],
                paid_amount=plan.get("paid_amount", 0.0),
                total_cost=plan.get("total_cost", 0.0),
                plan_title=plan.get("title", "")
            )
            
            logger.info(f"Автоматическая синхронизация с CRM для плана {plan['id']} выполнена")
            
        except Exception:
            logger.exception("CRM deal synchronization failed for plan %s", plan["id"])

        try:
            from crm.services.lead_service import LeadService
            await LeadService(self.db).sync_lead_from_payment_status(patient_id=plan["patient_id"])
        except Exception:
            logger.exception("CRM card synchronization failed for plan %s", plan["id"])
