from typing import List, Optional
from datetime import datetime
import json
import os
from bson import ObjectId
from models.consultation import ConsultationSheet, ConsultationSheetCreate, ConsultationSheetUpdate, ICD10Code
from database import get_database


class ConsultationService:
    def __init__(self):
        self.db = get_database()
        self.collection = self.db.consultation_sheets
        self.icd10_codes = self._load_icd10_codes()
    
    def _load_icd10_codes(self) -> List[ICD10Code]:
        """Загрузить справочник МКБ-10"""
        try:
            icd10_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'icd10_codes.json')
            with open(icd10_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return [ICD10Code(**item) for item in data]
        except Exception as e:
            print(f"Error loading ICD-10 codes: {e}")
            return []
    
    def search_icd10_codes(self, query: str) -> List[ICD10Code]:
        """Поиск кодов МКБ-10 по запросу"""
        query = query.lower()
        results = []
        
        for code in self.icd10_codes:
            if query in code.code.lower() or query in code.name.lower():
                results.append(code)
                if len(results) >= 20:  # Ограничение результатов
                    break
        
        return results
    
    def get_icd10_code(self, code: str) -> Optional[ICD10Code]:
        """Получить код МКБ-10 по коду"""
        for icd_code in self.icd10_codes:
            if icd_code.code == code:
                return icd_code
        return None
    
    async def _find_doctor_by_id(self, doctor_id: str):
        """Найти врача по ID (поддержка разных форматов идентификаторов)"""
        if not doctor_id:
            return None
        
        # Сначала ищем по полю id
        doctor = await self.db.doctors.find_one({"id": doctor_id})
        if doctor:
            return doctor
        
        # Затем ищем по _id как строке
        doctor = await self.db.doctors.find_one({"_id": doctor_id})
        if doctor:
            return doctor
        
        # Пробуем искать по _id как ObjectId
        try:
            doctor = await self.db.doctors.find_one({"_id": ObjectId(doctor_id)})
            if doctor:
                return doctor
        except:
            pass
        
        return None
    
    async def create_consultation_sheet(
        self, 
        data: ConsultationSheetCreate, 
        user_id: str, 
        user_name: str
    ) -> ConsultationSheet:
        """Создать консультационный лист"""
        # Получить имя врача (с поддержкой разных форматов ID)
        doctor = await self._find_doctor_by_id(data.doctor_id)
        doctor_name = doctor.get("full_name", "Неизвестный врач") if doctor else "Неизвестный врач"
        
        consultation_sheet = ConsultationSheet(
            patient_id=data.patient_id,
            doctor_id=data.doctor_id,
            doctor_name=doctor_name,
            complaints=data.complaints,
            anamnesis=data.anamnesis,
            examination=data.examination,
            icd10_codes=data.icd10_codes,
            diagnosis=data.diagnosis,
            recommendations=data.recommendations,
            treatment_services=data.treatment_services,
            treatment=data.treatment,
            notes=data.notes,
            created_by=user_id,
            created_by_name=user_name
        )
        
        sheet_dict = consultation_sheet.dict()
        await self.collection.insert_one(sheet_dict)
        
        # Автоматическое создание плана лечения если назначены услуги
        if data.treatment_services and len(data.treatment_services) > 0:
            await self._create_treatment_plan_from_consultation(
                consultation_sheet, 
                user_id, 
                user_name
            )
        
        return consultation_sheet
    
    async def get_consultation_sheet(self, sheet_id: str) -> Optional[ConsultationSheet]:
        """Получить консультационный лист по ID"""
        sheet_data = await self.collection.find_one({"id": sheet_id})
        if sheet_data:
            return ConsultationSheet(**sheet_data)
        return None
    
    async def get_patient_consultation_sheets(self, patient_id: str) -> List[ConsultationSheet]:
        """Получить все консультационные листы пациента"""
        sheets = []
        cursor = self.collection.find({"patient_id": patient_id}).sort("created_at", -1)
        async for sheet_data in cursor:
            sheets.append(ConsultationSheet(**sheet_data))
        return sheets
    
    async def update_consultation_sheet(
        self, 
        sheet_id: str, 
        data: ConsultationSheetUpdate,
        user_id: str = None,
        user_name: str = None
    ) -> Optional[ConsultationSheet]:
        """Обновить консультационный лист"""
        # Получаем текущий консультационный лист для сравнения
        existing_sheet = await self.get_consultation_sheet(sheet_id)
        if not existing_sheet:
            return None
        
        update_data = {k: v for k, v in data.dict().items() if v is not None}
        
        if update_data:
            update_data["updated_at"] = datetime.utcnow()
            
            # Если обновляется doctor_id, обновить и doctor_name (с поддержкой разных форматов ID)
            if "doctor_id" in update_data:
                doctor = await self._find_doctor_by_id(update_data["doctor_id"])
                if doctor:
                    update_data["doctor_name"] = doctor.get("full_name", "Неизвестный врач")
            
            await self.collection.update_one(
                {"id": sheet_id},
                {"$set": update_data}
            )
            
            # Если обновлены услуги, обновить план лечения
            if "treatment_services" in update_data and update_data["treatment_services"]:
                updated_sheet = await self.get_consultation_sheet(sheet_id)
                if updated_sheet:
                    await self._update_treatment_plan_from_consultation(
                        updated_sheet,
                        user_id or existing_sheet.created_by,
                        user_name or existing_sheet.created_by_name
                    )
        
        return await self.get_consultation_sheet(sheet_id)
    
    async def delete_consultation_sheet(self, sheet_id: str) -> bool:
        """Удалить консультационный лист"""
        result = await self.collection.delete_one({"id": sheet_id})
        return result.deleted_count > 0
    
    async def _create_treatment_plan_from_consultation(
        self,
        consultation: ConsultationSheet,
        user_id: str,
        user_name: str
    ):
        """Создать план лечения на основе консультации"""
        from models.treatment_plan import TreatmentPlan
        from datetime import datetime
        import uuid
        
        # Подготовить услуги для плана лечения
        services = []
        total_cost = 0.0
        
        for ts in consultation.treatment_services:
            service = {
                "service_id": ts.service_id,
                "service_name": ts.service_name,
                "quantity_total": ts.quantity,
                "quantity_completed": 0,
                "price_per_unit": ts.price_per_unit,
                "total_price": ts.total_price,
                "status": "pending",
                "payment_status": "unpaid"
            }
            
            # Копировать данные о курсе если есть
            if hasattr(ts, 'is_course') and ts.is_course:
                service["is_course"] = ts.is_course
                if hasattr(ts, 'quantity_total'):
                    service["quantity_total"] = ts.quantity_total
                if hasattr(ts, 'quantity_completed'):
                    service["quantity_completed"] = ts.quantity_completed
                if hasattr(ts, 'course_duration_days'):
                    service["course_duration_days"] = ts.course_duration_days
                if hasattr(ts, 'course_frequency_per_day'):
                    service["course_frequency_per_day"] = ts.course_frequency_per_day
                if hasattr(ts, 'sessions'):
                    service["sessions"] = ts.sessions
                if hasattr(ts, 'payment_type'):
                    service["payment_type"] = ts.payment_type
            else:
                service["is_course"] = False
            
            services.append(service)
            total_cost += ts.total_price
        
        # Создать план лечения
        treatment_plan = TreatmentPlan(
            id=str(uuid.uuid4()),
            patient_id=consultation.patient_id,
            title=f"План лечения от {consultation.consultation_date.strftime('%d.%m.%Y')}",
            description=f"Назначен врачом {consultation.doctor_name}",
            services=services,
            total_cost=total_cost,
            status="approved",
            created_by=user_id,
            created_by_name=user_name,
            assigned_doctor_id=consultation.doctor_id,
            notes=consultation.recommendations or "",
            payment_status="unpaid",
            paid_amount=0.0,
            payment_date=None,
            execution_status="pending",
            started_at=None,
            completed_at=None,
            appointment_ids=[],
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        # Сохранить в базу
        plan_dict = treatment_plan.dict()
        await self.db.treatment_plans.insert_one(plan_dict)
    
    async def _update_treatment_plan_from_consultation(
        self,
        consultation: ConsultationSheet,
        user_id: str,
        user_name: str
    ):
        """Обновить план лечения на основе консультации или создать новый"""
        from datetime import datetime
        import uuid
        
        # Ищем существующий план лечения для этого пациента, созданный из консультации
        # Ищем по дате консультации и пациенту
        existing_plan = await self.db.treatment_plans.find_one({
            "patient_id": consultation.patient_id,
            "assigned_doctor_id": consultation.doctor_id,
            "title": f"План лечения от {consultation.consultation_date.strftime('%d.%m.%Y')}"
        })
        
        # Подготовить услуги для плана лечения
        services = []
        total_cost = 0.0
        
        for ts in consultation.treatment_services:
            service = {
                "service_id": ts.service_id,
                "service_name": ts.service_name,
                "quantity_total": ts.quantity,
                "quantity_completed": 0,
                "price_per_unit": ts.price_per_unit,
                "total_price": ts.total_price,
                "status": "pending",
                "payment_status": "unpaid"
            }
            
            # Если услуга уже есть в существующем плане - сохранить её статус
            if existing_plan:
                for existing_service in existing_plan.get("services", []):
                    if existing_service.get("service_id") == ts.service_id:
                        service["quantity_completed"] = existing_service.get("quantity_completed", 0)
                        service["status"] = existing_service.get("status", "pending")
                        service["payment_status"] = existing_service.get("payment_status", "unpaid")
                        break
            
            # Копировать данные о курсе если есть
            if hasattr(ts, 'is_course') and ts.is_course:
                service["is_course"] = ts.is_course
                if hasattr(ts, 'quantity_total'):
                    service["quantity_total"] = ts.quantity_total
                if hasattr(ts, 'quantity_completed'):
                    service["quantity_completed"] = ts.quantity_completed
                if hasattr(ts, 'course_duration_days'):
                    service["course_duration_days"] = ts.course_duration_days
                if hasattr(ts, 'course_frequency_per_day'):
                    service["course_frequency_per_day"] = ts.course_frequency_per_day
                if hasattr(ts, 'sessions'):
                    service["sessions"] = ts.sessions
                if hasattr(ts, 'payment_type'):
                    service["payment_type"] = ts.payment_type
            else:
                service["is_course"] = False
            
            services.append(service)
            total_cost += ts.total_price
        
        if existing_plan:
            # Обновляем существующий план лечения
            await self.db.treatment_plans.update_one(
                {"id": existing_plan["id"]},
                {"$set": {
                    "services": services,
                    "total_cost": total_cost,
                    "notes": consultation.recommendations or "",
                    "updated_at": datetime.utcnow()
                }}
            )
        else:
            # Создаём новый план лечения
            from models.treatment_plan import TreatmentPlan
            
            treatment_plan = TreatmentPlan(
                id=str(uuid.uuid4()),
                patient_id=consultation.patient_id,
                title=f"План лечения от {consultation.consultation_date.strftime('%d.%m.%Y')}",
                description=f"Назначен врачом {consultation.doctor_name}",
                services=services,
                total_cost=total_cost,
                status="approved",
                created_by=user_id,
                created_by_name=user_name,
                assigned_doctor_id=consultation.doctor_id,
                notes=consultation.recommendations or "",
                payment_status="unpaid",
                paid_amount=0.0,
                payment_date=None,
                execution_status="pending",
                started_at=None,
                completed_at=None,
                appointment_ids=[],
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            
            plan_dict = treatment_plan.dict()
            await self.db.treatment_plans.insert_one(plan_dict)


consultation_service = ConsultationService()
