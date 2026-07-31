from typing import List, Optional
from datetime import datetime
import json
import os
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
    
    async def create_consultation_sheet(
        self, 
        data: ConsultationSheetCreate, 
        user_id: str, 
        user_name: str
    ) -> ConsultationSheet:
        """Создать консультационный лист"""
        # Получить имя врача
        doctor = await self.db.doctors.find_one({"id": data.doctor_id})
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
        data: ConsultationSheetUpdate
    ) -> Optional[ConsultationSheet]:
        """Обновить консультационный лист"""
        update_data = {k: v for k, v in data.dict().items() if v is not None}
        
        if update_data:
            update_data["updated_at"] = datetime.utcnow()
            
            # Если обновляется doctor_id, обновить и doctor_name
            if "doctor_id" in update_data:
                doctor = await self.db.doctors.find_one({"id": update_data["doctor_id"]})
                if doctor:
                    update_data["doctor_name"] = doctor.get("full_name", "Неизвестный врач")
            
            await self.collection.update_one(
                {"id": sheet_id},
                {"$set": update_data}
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


consultation_service = ConsultationService()
