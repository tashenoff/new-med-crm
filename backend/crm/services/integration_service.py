"""
Integration Service - Сервис интеграции CRM с HMS
"""

import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from .lead_service import LeadService
from .client_service import ClientService
from ..models.lead import LeadStatus


class IntegrationService:
    """Сервис интеграции CRM с HMS"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.lead_service = LeadService(db)
        self.client_service = ClientService(db)
        
        # Коллекции HMS
        self.patients_collection = db.patients
        self.appointments_collection = db.appointments
        
        # Коллекции CRM
        self.clients_collection = db.crm_clients
        self.deals_collection = db.crm_deals
    
    async def convert_lead_to_client(
        self, 
        lead_id: str
    ) -> Dict[str, Any]:
        """Конвертировать лида в клиента CRM (без HMS)"""
        
        # Получаем лида
        lead = await self.lead_service.get_lead_by_id(lead_id)
        if not lead or not lead.can_convert_to_client():
            raise ValueError("Лид не может быть конвертирован")
        
        # Создаем клиента в CRM
        from ..schemas.client_schemas import ClientCreate
        client_data = ClientCreate(
            first_name=lead.first_name,
            last_name=lead.last_name,
            middle_name=lead.middle_name,
            phone=lead.phone,
            email=lead.email,
            assigned_manager_id=lead.assigned_manager_id,
            source_lead_id=lead_id,
            company=lead.company,
            position=lead.position
        )
        
        client = await self.client_service.create_client(client_data)
        
        # Обновляем лида как конвертированного
        await self.lead_service.convert_to_client(lead_id, client.id)
        
        return {
            "client_id": client.id,
            "message": "Лид успешно конвертирован в клиента"
        }

    async def convert_lead_to_patient(
        self, 
        lead_id: str,
        create_hms_patient: bool = True,
        create_appointment: bool = False,
        appointment_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Конвертировать лида в пациента HMS"""
        
        # Получаем лида
        lead = await self.lead_service.get_lead_by_id(lead_id)
        if not lead or not lead.can_convert_to_client():
            raise ValueError("Лид не может быть конвертирован")
        
        # Создаем клиента в CRM
        from ..schemas.client_schemas import ClientCreate
        client_data = ClientCreate(
            first_name=lead.first_name,
            last_name=lead.last_name,
            middle_name=lead.middle_name,
            phone=lead.phone,
            email=lead.email,
            assigned_manager_id=lead.assigned_manager_id,
            source_lead_id=lead_id,
            company=lead.company,
            position=lead.position
        )
        
        client = await self.client_service.create_client(client_data)
        
        patient_id = None
        # Создаем пациента в HMS только если запрошено
        if create_hms_patient:
            patient_data = {
                "id": str(uuid.uuid4()),
                "full_name": lead.full_name,
                "first_name": lead.first_name,
                "last_name": lead.last_name,
                "middle_name": lead.middle_name,
                "phone": lead.phone,
                "email": lead.email or "",
                "iin": "",  # Пустой, можно заполнить позже
                "birth_date": None,
                "gender": "",
                "source": "crm_conversion",
                "referrer": f"CRM Lead {lead_id}",
                "notes": f"Конвертирован из лида {lead_id}. {lead.description or ''}",
                "crm_client_id": client.id,  # Ссылка на CRM клиента
                "revenue": 0,
                "debt": 0,
                "overpayment": 0,
                "appointments_count": 0,
                "records_count": 0,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            # Сохраняем пациента в HMS
            await self.patients_collection.insert_one(patient_data)
            patient_id = patient_data["id"]
            
            # Связываем клиента с пациентом
            await self.client_service.link_to_hms_patient(client.id, patient_id)
        
        result = {
            "client_id": client.id,
            "patient_id": patient_id,
            "appointment_id": None
        }
        
        # Создаем запись если нужно
        if create_appointment and appointment_data:
            appointment_data.update({
                "id": str(uuid.uuid4()),
                "patient_id": patient_data["id"],
                "status": "scheduled",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "notes": f"Создано из CRM лида {lead_id}"
            })
            
            await self.appointments_collection.insert_one(appointment_data)
            result["appointment_id"] = appointment_data["id"]
        
        # Обновляем лида как конвертированного
        await self.lead_service.convert_to_client(
            lead_id, 
            client.id, 
            result.get("appointment_id")
        )
        
        return result
    
    async def create_lead_from_hms_patient(self, patient_id: str) -> Optional[str]:
        """Создать лида из пациента HMS (обратная интеграция)"""
        
        # Получаем пациента
        patient = await self.patients_collection.find_one({"id": patient_id})
        if not patient:
            return None
        
        # Проверяем, нет ли уже клиента с таким patient_id
        existing_client = await self.client_service.collection.find_one({"hms_patient_id": patient_id})
        if existing_client:
            return None  # Уже есть связь
        
        # Создаем лида
        from ..schemas.lead_schemas import LeadCreate
        from ..models.lead import LeadSource
        
        # Парсим полное имя
        full_name = patient.get("full_name", "")
        name_parts = full_name.split()
        first_name = name_parts[1] if len(name_parts) > 1 else ""
        last_name = name_parts[0] if name_parts else ""
        middle_name = name_parts[2] if len(name_parts) > 2 else None
        
        lead_data = LeadCreate(
            first_name=first_name,
            last_name=last_name,
            middle_name=middle_name,
            phone=patient.get("phone", ""),
            email=patient.get("email"),
            source=LeadSource.WEBSITE,  # Можно настроить по source пациента
            description=f"Импортировано из HMS пациента {patient_id}. {patient.get('notes', '')}"
        )
        
        lead = await self.lead_service.create_lead(lead_data, created_by="hms_integration")
        
        return lead.id
    
    async def sync_client_revenue_from_hms(self, client_id: str) -> Optional[float]:
        """Синхронизировать выручку клиента из HMS"""
        
        client = await self.client_service.get_client_by_id(client_id)
        if not client or not client.hms_patient_id:
            return None
        
        # Получаем пациента из HMS
        patient = await self.patients_collection.find_one({"id": client.hms_patient_id})
        if not patient:
            return None
        
        hms_revenue = patient.get("revenue", 0)
        
        # Обновляем выручку клиента если она отличается
        if client.total_revenue != hms_revenue:
            difference = hms_revenue - client.total_revenue
            await self.client_service.update_revenue(client_id, difference)
            return hms_revenue
        
        return client.total_revenue
    
    async def get_integration_statistics(self) -> Dict[str, Any]:
        """Получить статистику интеграции"""
        
        # Клиенты связанные с HMS
        linked_clients = await self.client_service.collection.count_documents({
            "hms_patient_id": {"$ne": None}
        })
        
        # Лиды конвертированные в пациентов
        converted_leads = await self.lead_service.collection.count_documents({
            "status": LeadStatus.CONVERTED,
            "converted_to_client_id": {"$ne": None}
        })
        
        # Общее количество клиентов и лидов
        total_clients = await self.client_service.collection.count_documents({})
        total_leads = await self.lead_service.collection.count_documents({})
        
        integration_rate = (linked_clients / total_clients * 100) if total_clients > 0 else 0
        
        return {
            "total_clients": total_clients,
            "total_leads": total_leads,
            "linked_clients": linked_clients,
            "converted_leads": converted_leads,
            "integration_rate": round(integration_rate, 2)
        }
    
    async def convert_client_to_hms_patient(
        self, 
        client_id: str,
        create_appointment: bool = False,
        appointment_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Конвертировать клиента CRM в пациента HMS"""
        
        # Получаем клиента
        client = await self.client_service.get_client_by_id(client_id)
        if not client:
            raise ValueError("Клиент не найден")
        
        if client.is_hms_patient:
            raise ValueError("Клиент уже конвертирован в пациента HMS")
        
        # Создаем пациента в HMS
        patient_data = {
            "id": str(uuid.uuid4()),
            "full_name": client.full_name,
            "first_name": client.first_name,
            "last_name": client.last_name,
            "middle_name": client.middle_name,
            "phone": client.phone,
            "email": client.email,
            "birth_date": client.birth_date.isoformat() if client.birth_date else None,
            "gender": client.gender,
            "address": client.address,
            "city": client.city,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "source": "crm_conversion",
            "crm_client_id": client_id,
            "notes": f"Конвертирован из CRM клиента {client_id}"
        }
        
        # Сохраняем пациента в HMS
        await self.patients_collection.insert_one(patient_data)
        
        # Обновляем клиента - устанавливаем связь с HMS
        await self.client_service.collection.update_one(
            {"id": client_id},
            {
                "$set": {
                    "hms_patient_id": patient_data["id"],
                    "is_hms_patient": True,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        result = {
            "client_id": client_id,
            "patient_id": patient_data["id"],
            "appointment_id": None
        }
        
        # Создаем запись если нужно
        if create_appointment and appointment_data:
            appointment_data.update({
                "id": str(uuid.uuid4()),
                "patient_id": patient_data["id"],
                "status": "scheduled",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "notes": f"Создано из CRM клиента {client_id}"
            })
            
            await self.appointments_collection.insert_one(appointment_data)
            result["appointment_id"] = appointment_data["id"]
        
        return result
    
    async def sync_treatment_plan_payment(
        self,
        treatment_plan_id: str,
        patient_id: str,
        payment_status: str,
        paid_amount: float,
        total_cost: float,
        plan_title: str
    ) -> Dict[str, Any]:
        """Синхронизировать оплату плана лечения с CRM сделкой"""
        
        # Найти клиента CRM по HMS patient_id
        crm_client = await self.clients_collection.find_one({
            "hms_patient_id": patient_id
        })
        
        if not crm_client:
            # Если клиент не найден, это означает что пациент не был конвертирован из CRM
            return {
                "message": "Пациент не связан с CRM клиентом",
                "synced": False
            }
        
        # Проверить, существует ли уже сделка для этого плана лечения
        existing_deal = await self.deals_collection.find_one({
            "hms_treatment_plan_id": treatment_plan_id
        })
        
        if payment_status == "paid":
            # Используем paid_amount если он > 0, иначе total_cost
            actual_amount = paid_amount if paid_amount > 0 else total_cost
            # Создать или обновить сделку
            deal_data = {
                "title": f"План лечения: {plan_title}",
                "description": f"Автоматически создана из HMS плана лечения",
                "client_id": crm_client["id"],
                "amount": actual_amount,
                "status": "won",  # Поскольку план уже оплачен
                "stage": "closed",
                "priority": "medium",
                "hms_treatment_plan_id": treatment_plan_id,
                "hms_patient_id": patient_id,
                "tags": ["hms_integration", "treatment_plan"],
                "notes": f"Синхронизировано из HMS. Полная стоимость плана: {total_cost}₸, оплачено: {paid_amount}₸, сумма сделки: {actual_amount}₸"
            }
            
            if existing_deal:
                # Обновить существующую сделку только если сумма изменилась
                old_amount = existing_deal.get("amount", 0)
                amount_difference = paid_amount - old_amount
                
                deal_data["updated_at"] = datetime.utcnow()
                await self.deals_collection.update_one(
                    {"id": existing_deal["id"]},
                    {"$set": deal_data}
                )
                deal_id = existing_deal["id"]
                action = "updated"
                
                # Пересчитать выручку клиента
                await self.recalculate_client_revenue(crm_client["id"])
            else:
                # Создать новую сделку
                from ..models.deal import Deal
                deal_data["id"] = str(uuid.uuid4())
                deal_data["created_at"] = datetime.utcnow()
                deal_data["updated_at"] = datetime.utcnow()
                deal_data["won_at"] = datetime.utcnow()
                
                await self.deals_collection.insert_one(deal_data)
                deal_id = deal_data["id"]
                action = "created"
                
                # Пересчитать выручку клиента
                await self.recalculate_client_revenue(crm_client["id"])
            
            return {
                "message": f"Сделка {action} успешно",
                "deal_id": deal_id,
                "client_id": crm_client["id"],
                "amount": actual_amount,
                "synced": True,
                "action": action
            }
        
        elif existing_deal and payment_status in ["unpaid", "cancelled"]:
            # Если план отменен или не оплачен, удалить сделку
            await self.deals_collection.delete_one({"id": existing_deal["id"]})
            
            # Пересчитать выручку клиента после удаления сделки
            await self.recalculate_client_revenue(crm_client["id"])
            
            return {
                "message": "Сделка удалена из-за отмены/неоплаты плана",
                "deal_id": existing_deal["id"],
                "client_id": crm_client["id"],
                "synced": True,
                "action": "deleted"
            }
        
        return {
            "message": "Нет изменений для синхронизации",
            "synced": False
        }
    
    async def recalculate_client_revenue(self, client_id: str):
        """Пересчитать выручку клиента на основе всех его сделок"""
        # Получить все сделки клиента
        deals = await self.deals_collection.find({
            "client_id": client_id,
            "status": "won"  # Только выигранные сделки
        }).to_list(None)
        
        # Посчитать общую выручку
        total_revenue = sum(deal.get("amount", 0) for deal in deals)
        total_deals = len(deals)
        
        # Найти последнюю сделку
        last_deal_date = None
        if deals:
            last_deal = max(deals, key=lambda d: d.get("won_at") or d.get("created_at", datetime.min))
            last_deal_date = last_deal.get("won_at") or last_deal.get("created_at")
        
        # Обновить клиента
        await self.clients_collection.update_one(
            {"id": client_id},
            {
                "$set": {
                    "total_revenue": total_revenue,
                    "total_deals": total_deals,
                    "last_deal_date": last_deal_date,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        return total_revenue
    
    async def sync_all_paid_treatment_plans(self) -> Dict[str, Any]:
        """Синхронизировать все оплаченные планы лечения с CRM"""
        # Получить все оплаченные планы лечения из HMS
        treatment_plans = await self.db.treatment_plans.find({
            "payment_status": "paid"
            # Убрали проверку paid_amount > 0, так как может быть total_cost вместо paid_amount
        }).to_list(None)
        
        synced_count = 0
        errors = []
        
        for plan in treatment_plans:
            try:
                result = await self.sync_treatment_plan_payment(
                    treatment_plan_id=plan["id"],
                    patient_id=plan["patient_id"],
                    payment_status=plan["payment_status"],
                    paid_amount=plan["paid_amount"],
                    total_cost=plan["total_cost"],
                    plan_title=plan["title"]
                )
                
                if result.get("synced"):
                    synced_count += 1
                    
            except Exception as e:
                errors.append(f"План {plan['id']}: {str(e)}")
        
        return {
            "message": f"Синхронизировано {synced_count} планов лечения",
            "synced_count": synced_count,
            "total_plans": len(treatment_plans),
            "errors": errors
        }

