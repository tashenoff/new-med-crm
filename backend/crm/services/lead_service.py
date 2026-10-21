"""
Lead Service - Сервис для работы с лидами
"""

import uuid
import logging
from datetime import datetime, timezone
from events import CRMCardCreated, event_bus
from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from ..models.lead import Lead, LeadStatus, LeadSource, LeadPriority
from ..schemas.lead_schemas import LeadCreate, LeadUpdate, LeadSearchFilters
from ..models.task import Task, TaskType, TaskPriority, TaskStatus
from ..schemas.task_schemas import TaskCreate
from .funnel_journal import FunnelLeadCollection
from .lead_identity import group_lead_touches, patient_link


class LeadService:
    """Сервис для работы с лидами"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = FunnelLeadCollection(db, cause='lead_service')
    
    async def create_lead(self, lead_data: LeadCreate, created_by: Optional[str] = None) -> Lead:
        """Создать нового лида"""
        lead_dict = lead_data.dict()
        lead_dict["id"] = str(uuid.uuid4())
        lead_dict["created_at"] = datetime.utcnow()
        lead_dict["updated_at"] = datetime.utcnow()
        lead_dict["created_by"] = created_by
        lead_dict["contact_attempts"] = 0
        lead_dict["status"] = LeadStatus.NEW
        
        # Создаем объект Lead для валидации
        lead = Lead(**lead_dict)
        
        # Сохраняем в БД
        await self.collection.insert_one(lead.dict())

        # Persistence is authoritative; notification delivery cannot undo it.
        try:
            await event_bus.publish(CRMCardCreated(
                event_id=f"crm.card.created:lead:{lead.id}",
                card_id=lead.id,
                title=lead.full_name,
                timestamp=lead.created_at.replace(tzinfo=timezone.utc),
            ))
        except Exception:
            logging.getLogger(__name__).exception("Could not emit crm.card.created for %s", lead.id)
        
        # Автоматически создаем задачу для нового лида в статусе "Неразобранное"
        if lead.status == LeadStatus.NEW:
            await self._create_initial_task(lead, created_by)
        
        return lead
    
    async def get_lead_by_id(self, lead_id: str) -> Optional[Lead]:
        """Получить лида по ID"""
        lead_data = await self.collection.find_one({"id": lead_id})
        if lead_data:
            return Lead(**lead_data)
        return None

    async def get_kanban_groups(self):
        documents = await self.collection.find({}).to_list(length=None)
        return group_lead_touches(documents)

    async def canonical_document(self, lead_id):
        for group in await self.get_kanban_groups():
            if any(touch.get("id") == lead_id for touch in group):
                return group[0]
        return None
    
    async def get_active_lead_by_phone(self, phone: str) -> Optional[Lead]:
        """Получить активного лида по номеру телефона
        
        Активный лид = лид в статусе new, contacted или in_progress
        Это предотвращает создание дубликатов в рамках одного обращения
        """
        # Очищаем номер от пробелов и спецсимволов для поиска
        clean_phone = phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        
        lead_data = await self.collection.find_one({
            "phone": {"$regex": clean_phone},
            "status": {"$in": [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.IN_PROGRESS]}
        })
        
        if lead_data:
            return Lead(**lead_data)
        return None
    
    async def update_lead(self, lead_id: str, update_data: LeadUpdate) -> Optional[Lead]:
        """Обновить лида"""
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        update = {"$set": update_dict}
        if "status" in update_dict:
            canonical = await self.canonical_document(lead_id)
            if canonical is None:
                return None
            lead_id = canonical["id"]
            update["$unset"] = {"kanban_column_id": ""}
        
        result = await self.collection.update_one(
            {"id": lead_id},
            update
        )
        
        if result.modified_count > 0:
            return await self.get_lead_by_id(lead_id)
        return None
    
    async def delete_lead(self, lead_id: str) -> bool:
        """Удалить лида"""
        result = await self.collection.delete_one({"id": lead_id})
        return result.deleted_count > 0
    
    async def get_leads(
        self, 
        skip: int = 0, 
        limit: int = 50,
        filters: Optional[LeadSearchFilters] = None
    ) -> List[Lead]:
        """Получить список лидов с фильтрацией"""
        query = {}
        
        if filters:
            if filters.status:
                query["status"] = {"$in": filters.status}
            if filters.source:
                query["source"] = {"$in": filters.source}
            if filters.priority:
                query["priority"] = {"$in": filters.priority}
            if filters.assigned_manager_id:
                query["assigned_manager_id"] = filters.assigned_manager_id
            if filters.created_from or filters.created_to:
                date_filter = {}
                if filters.created_from:
                    date_filter["$gte"] = filters.created_from
                if filters.created_to:
                    date_filter["$lte"] = filters.created_to
                query["created_at"] = date_filter
            if filters.search:
                query["$or"] = [
                    {"first_name": {"$regex": filters.search, "$options": "i"}},
                    {"last_name": {"$regex": filters.search, "$options": "i"}},
                    {"phone": {"$regex": filters.search, "$options": "i"}},
                    {"email": {"$regex": filters.search, "$options": "i"}},
                    {"company": {"$regex": filters.search, "$options": "i"}}
                ]
        
        cursor = self.collection.find(query).sort("created_at", DESCENDING).skip(skip).limit(limit)
        leads_data = await cursor.to_list(None)
        
        return [Lead(**lead_data) for lead_data in leads_data]
    
    async def count_leads(self, filters: Optional[LeadSearchFilters] = None) -> int:
        """Подсчитать количество лидов"""
        query = {}
        if filters:
            # Применяем те же фильтры, что и в get_leads
            # ... (упрощено для краткости)
            pass
        
        return await self.collection.count_documents(query)
    
    async def update_lead_status(
        self, 
        lead_id: str, 
        status: LeadStatus, 
        notes: Optional[str] = None,
        updated_by: Optional[str] = None
    ) -> Optional[Lead]:
        """Обновить статус лида"""
        canonical = await self.canonical_document(lead_id)
        if canonical is None:
            return None
        lead_id = canonical["id"]
        update_data = {
            "status": status,
            "updated_at": datetime.utcnow()
        }
        
        if notes:
            # Добавляем заметку к существующим
            existing_lead = await self.get_lead_by_id(lead_id)
            if existing_lead:
                existing_notes = existing_lead.notes or ""
                timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
                new_note = f"[{timestamp}] Статус изменен на {status.value}: {notes}"
                update_data["notes"] = f"{existing_notes}\n{new_note}".strip()
        
        result = await self.collection.update_one(
            {"id": lead_id},
            {"$set": update_data, "$unset": {"kanban_column_id": ""}}
        )
        
        if result.modified_count > 0:
            return await self.get_lead_by_id(lead_id)
        return None
    
    async def assign_manager(
        self, 
        lead_id: str, 
        manager_id: str,
        notes: Optional[str] = None
    ) -> Optional[Lead]:
        """Назначить менеджера на лида"""
        update_data = {
            "assigned_manager_id": manager_id,
            "updated_at": datetime.utcnow()
        }
        
        if notes:
            existing_lead = await self.get_lead_by_id(lead_id)
            if existing_lead:
                existing_notes = existing_lead.notes or ""
                timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
                new_note = f"[{timestamp}] Назначен менеджер: {notes}"
                update_data["notes"] = f"{existing_notes}\n{new_note}".strip()
        
        result = await self.collection.update_one(
            {"id": lead_id},
            {"$set": update_data}
        )
        
        if result.modified_count > 0:
            return await self.get_lead_by_id(lead_id)
        return None
    
    async def convert_to_client(
        self, 
        lead_id: str, 
        client_id: str,
        appointment_id: Optional[str] = None
    ) -> Optional[Lead]:
        """Конвертировать лида в клиента"""
        canonical = await self.canonical_document(lead_id)
        if canonical is None:
            return None
        lead_id = canonical["id"]
        lead = await self.get_lead_by_id(lead_id)
        if not lead or not lead.can_convert_to_client():
            return None
        
        update_data = {
            "status": LeadStatus.CONVERTED,
            "converted_to_client_id": client_id,
            "updated_at": datetime.utcnow()
        }
        
        if appointment_id:
            update_data["converted_to_appointment_id"] = appointment_id
        
        result = await self.collection.update_one(
            {"id": lead_id},
            {"$set": update_data, "$unset": {"kanban_column_id": ""}}
        )
        
        if result.modified_count > 0:
            return await self.get_lead_by_id(lead_id)
        return None
    
    async def get_leads_by_manager(self, manager_id: str) -> List[Lead]:
        """Получить лидов конкретного менеджера"""
        cursor = self.collection.find({"assigned_manager_id": manager_id}).sort("created_at", DESCENDING)
        leads_data = await cursor.to_list(None)
        return [Lead(**lead_data) for lead_data in leads_data]
    
    async def get_statistics(self) -> Dict[str, Any]:
        """Получить статистику по лидам"""
        # Основная статистика
        basic_pipeline = [
            {
                "$group": {
                    "_id": None,
                    "total_leads": {"$sum": 1},
                    "new_leads": {
                        "$sum": {"$cond": [{"$eq": ["$status", LeadStatus.NEW]}, 1, 0]}
                    },
                    "in_progress_leads": {
                        "$sum": {"$cond": [{"$eq": ["$status", LeadStatus.IN_PROGRESS]}, 1, 0]}
                    },
                    "converted_leads": {
                        "$sum": {"$cond": [{"$eq": ["$status", LeadStatus.CONVERTED]}, 1, 0]}
                    },
                    "rejected_leads": {
                        "$sum": {"$cond": [{"$eq": ["$status", LeadStatus.REJECTED]}, 1, 0]}
                    }
                }
            }
        ]
        
        # Статистика по источникам
        source_pipeline = [
            {
                "$group": {
                    "_id": "$source",
                    "count": {"$sum": 1}
                }
            }
        ]
        
        # Статистика по менеджерам
        manager_pipeline = [
            {
                "$group": {
                    "_id": "$assigned_manager_id",
                    "count": {"$sum": 1}
                }
            }
        ]
        
        # Выполняем все запросы
        basic_result = await self.collection.aggregate(basic_pipeline).to_list(None)
        source_result = await self.collection.aggregate(source_pipeline).to_list(None)
        manager_result = await self.collection.aggregate(manager_pipeline).to_list(None)
        
        if basic_result:
            stats = basic_result[0]
            total = stats.get("total_leads", 0)
            converted = stats.get("converted_leads", 0)
            conversion_rate = (converted / total * 100) if total > 0 else 0
            
            # Формируем статистику по источникам
            by_source = {}
            for item in source_result:
                source = item["_id"] if item["_id"] else "unknown"
                by_source[source] = item["count"]
            
            # Формируем статистику по менеджерам
            by_manager = {}
            for item in manager_result:
                manager_id = item["_id"] if item["_id"] else "unassigned"
                by_manager[manager_id] = item["count"]
            
            # Среднее время конвертации (заглушка, потребует более сложный запрос)
            avg_conversion_time = None  # TODO: Реализовать расчет времени конвертации
            
            return {
                "total_leads": total,
                "new_leads": stats.get("new_leads", 0),
                "in_progress_leads": stats.get("in_progress_leads", 0),
                "converted_leads": converted,
                "rejected_leads": stats.get("rejected_leads", 0),
                "conversion_rate": round(conversion_rate, 2),
                "avg_conversion_time": avg_conversion_time,
                "by_source": by_source,
                "by_manager": by_manager
            }
        
        return {
            "total_leads": 0,
            "new_leads": 0,
            "in_progress_leads": 0,
            "converted_leads": 0,
            "rejected_leads": 0,
            "conversion_rate": 0,
            "avg_conversion_time": None,
            "by_source": {},
            "by_manager": {}
        }
    
    async def _create_initial_task(self, lead: Lead, created_by: Optional[str] = None):
        """Создать автоматическую задачу для нового лида"""
        from .task_service import TaskService
        
        task_service = TaskService(self.db)
        
        # Вычисляем срок выполнения задачи (через 24 часа)
        from datetime import timedelta
        due_date = datetime.utcnow() + timedelta(hours=24)
        
        task_data = TaskCreate(
            title=f"Связаться с {lead.full_name}",
            description=f"Обработать новую заявку из источника: {lead.source}. Телефон: {lead.phone}",
            type=TaskType.CALL,
            priority=TaskPriority.HIGH if lead.priority == "urgent" else TaskPriority.MEDIUM,
            lead_id=lead.id,
            assigned_to=lead.assigned_manager_id,
            due_date=due_date
        )
        
        await task_service.create_task(task_data, created_by=created_by)
    
    async def sync_lead_from_appointment_status(
        self,
        patient_id: str,
        appointment_status: str,
        appointment_id: Optional[str] = None
    ) -> Optional[Lead]:
        """
        Синхронизация статуса лида на основе статуса записи на прием.
        
        Логика:
        - confirmed (подтверждено) -> in_progress (ЗАПИСЬ ПОДТВЕРЖДЕНА)
        - arrived / in_progress (пациент пришел / на приеме) -> converted (ПАЦИЕНТ ПРИШЁЛ)
        """
        # Only explicit appointment associations can mutate a CRM deal. A
        # patient's other deals or a close phone match are not this visit.
        if not appointment_id:
            return None
        appointment = await self.db.appointments.find_one({"id": appointment_id, "patient_id": patient_id})
        if not appointment:
            return None
        candidates = await self.collection.find({"converted_to_appointment_id": appointment_id}).to_list(None)
        identities = {patient_id}
        client = await self.db.crm_clients.find_one({"hms_patient_id": patient_id})
        if client:
            identities.add(client.get("id"))
        canonical = {}
        for candidate in candidates:
            if candidate.get("converted_to_client_id") and candidate["converted_to_client_id"] not in identities:
                return None
            document = await self.canonical_document(candidate["id"])
            if document:
                canonical[document["id"]] = document
        if len(canonical) != 1:
            return None
        lead = next(iter(canonical.values()))

        # Определяем новый статус на основе статуса записи
        new_status = None
        status_note = ""
        
        if appointment_status == "confirmed":
            # Запись подтверждена -> in_progress
            if lead.get("status") in [LeadStatus.NEW.value, LeadStatus.CONTACTED.value, LeadStatus.IN_PROGRESS.value]:
                new_status = LeadStatus.IN_PROGRESS.value
                status_note = "Запись на прием подтверждена"
        
        elif appointment_status in ["arrived", "in_progress", "completed"]:
            # Пациент пришел -> converted
            if lead.get("status") in [LeadStatus.NEW.value, LeadStatus.CONTACTED.value, LeadStatus.IN_PROGRESS.value, LeadStatus.CONVERTED.value]:
                new_status = LeadStatus.CONVERTED.value
                status_note = f"Пациент на приеме (статус: {appointment_status})"
        
        if new_status and (new_status != lead.get("status") or lead.get("kanban_column_id")):
            update_data = {
                "status": new_status,
                "updated_at": datetime.utcnow()
            }
            
            # Добавляем заметку
            existing_notes = lead.get("notes") or ""
            timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
            new_note = f"[{timestamp}] Автоматическое обновление: {status_note}"
            update_data["notes"] = f"{existing_notes}\n{new_note}".strip()
            
            result = await self.collection.update_one(
                {"id": lead["id"]},
                {"$set": update_data, "$unset": {"kanban_column_id": ""}}
            )
            
            if result.modified_count > 0:
                print(f"Статус лида {lead['id']} обновлен: {lead.get('status')} -> {new_status}")
                return await self.get_lead_by_id(lead["id"])
        
        return None
    
    async def sync_lead_from_payment_status(
        self,
        patient_id: str
    ) -> Optional[Lead]:
        """
        Синхронизация статуса лида на основе оплаты планов лечения.
        
        Логика:
        - Если ВСЕ планы лечения пациента полностью оплачены -> closed (ОПЛАЧЕНО)
        """
        # Проверяем все планы лечения этого пациента
        treatment_plans = await self.db.treatment_plans.find({
            "patient_id": patient_id
        }).to_list(None)
        
        if not treatment_plans:
            print(f"Планы лечения не найдены для пациента {patient_id}")
            return None
        
        # Проверяем, все ли планы оплачены
        all_paid = True
        for plan in treatment_plans:
            payment_status = plan.get("payment_status", "unpaid")
            if payment_status != "paid":
                all_paid = False
                break
        
        if not all_paid:
            print(f"Не все планы лечения оплачены для пациента {patient_id}")
            return None
        
        client = await self.db.crm_clients.find_one({"hms_patient_id": patient_id})
        identities = {patient_id}
        if client and client.get("id"):
            identities.add(client["id"])
        groups = [group for group in await self.get_kanban_groups()
                  if any(patient_link(touch) in identities for touch in group)]
        if len(groups) != 1:
            print(f"Однозначная CRM-карточка не найдена для пациента {patient_id}")
            return None

        lead = groups[0][0]
        if lead.get("status") in ("closed", "rejected", "qualified", "lost"):
            return None

        # Обновляем статус на CLOSED (ОПЛАЧЕНО)
        update_data = {
            "status": LeadStatus.CLOSED.value,
            "updated_at": datetime.utcnow()
        }
        
        # Добавляем заметку
        existing_notes = lead.get("notes") or ""
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
        total_paid = sum(plan.get("paid_amount", 0) or 0 for plan in treatment_plans)
        new_note = f"[{timestamp}] Автоматическое обновление: Все планы лечения оплачены. Общая сумма: {total_paid}₸"
        update_data["notes"] = f"{existing_notes}\n{new_note}".strip()
        
        result = await self.collection.update_one(
            {"id": lead["id"]},
            {"$set": update_data, "$unset": {"kanban_column_id": ""}}
        )
        
        if result.modified_count > 0:
            print(f"Статус лида {lead['id']} обновлен на CLOSED (ОПЛАЧЕНО)")
            return await self.get_lead_by_id(lead["id"])
        
        return None
    
    async def find_lead_by_phone(self, phone: str) -> Optional[Lead]:
        """Найти лида по номеру телефона"""
        clean_phone = phone.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        
        lead_data = await self.collection.find_one({
            "phone": {"$regex": clean_phone}
        })
        
        if lead_data:
            return Lead(**lead_data)
        return None
