from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid


class ICD10Code(BaseModel):
    """МКБ-10 код"""
    code: str
    name: str


class TreatmentService(BaseModel):
    """Назначенная услуга из прайса"""
    service_id: str
    service_name: str
    quantity: int = 1
    price_per_unit: float
    total_price: float
    
    # Поля для курсовых услуг
    is_course: bool = False  # Это курс или разовая услуга
    quantity_total: Optional[int] = None  # Всего процедур в курсе (например, 14 уколов)
    quantity_completed: int = 0  # Выполнено процедур
    course_duration_days: Optional[int] = None  # Длительность курса в днях (например, 7)
    course_frequency_per_day: Optional[int] = None  # Сколько раз в день (например, 2)
    sessions: List[dict] = []  # История выполнения [{date, time, completed, performed_by}]
    payment_type: str = "single"  # single (оплата сразу за курс) или per_session (за каждую процедуру)


class ConsultationSheet(BaseModel):
    """Консультационный лист пациента"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    doctor_id: str
    doctor_name: str
    consultation_date: datetime = Field(default_factory=datetime.utcnow)
    complaints: Optional[str] = None  # Жалобы
    anamnesis: Optional[str] = None  # Анамнез
    examination: Optional[str] = None  # Объективный осмотр
    icd10_codes: List[ICD10Code] = []  # МКБ-10 коды
    diagnosis: Optional[str] = None  # Диагноз
    recommendations: Optional[str] = None  # Текстовые рекомендации для пациента
    treatment_services: List[TreatmentService] = []  # Назначенные услуги из прайса
    treatment: Optional[str] = None  # Назначенное лечение (старое поле, оставлено для совместимости)
    notes: Optional[str] = None  # Дополнительные заметки
    created_by: str  # User ID who created
    created_by_name: str  # Name of the user who created
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


class ConsultationSheetCreate(BaseModel):
    """Schema for creating consultation sheet"""
    patient_id: str
    doctor_id: str
    complaints: Optional[str] = None
    anamnesis: Optional[str] = None
    examination: Optional[str] = None
    icd10_codes: List[ICD10Code] = []
    diagnosis: Optional[str] = None
    recommendations: Optional[str] = None
    treatment_services: List[TreatmentService] = []
    treatment: Optional[str] = None
    notes: Optional[str] = None


class ConsultationSheetUpdate(BaseModel):
    """Schema for updating consultation sheet"""
    doctor_id: Optional[str] = None
    complaints: Optional[str] = None
    anamnesis: Optional[str] = None
    examination: Optional[str] = None
    icd10_codes: Optional[List[ICD10Code]] = None
    diagnosis: Optional[str] = None
    recommendations: Optional[str] = None
    treatment_services: Optional[List[TreatmentService]] = None
    treatment: Optional[str] = None
    notes: Optional[str] = None
