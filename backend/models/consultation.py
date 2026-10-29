from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from datetime import datetime
import uuid
from decimal import Decimal, ROUND_HALF_UP


class ICD10Code(BaseModel):
    """МКБ-10 код"""
    code: str
    name: str


class TreatmentService(BaseModel):
    """Назначенная услуга из прайса"""
    service_id: str
    service_name: str
    category: Optional[str] = None  # Категория услуги (из specialties/прайса) для отчётов
    quantity: int = 1
    price_per_unit: float
    total_price: float
    unit: Optional[str] = None
    teeth_numbers: Optional[List[str]] = None
    discount: float = Field(default=0, ge=0, le=100, allow_inf_nan=False)
    
    # Поля для курсовых услуг
    is_course: bool = False  # Это курс или разовая услуга
    quantity_total: Optional[int] = None  # Всего процедур в курсе (например, 14 уколов)
    quantity_completed: int = 0  # Выполнено процедур
    course_duration_days: Optional[int] = None  # Длительность курса в днях (например, 7)
    course_frequency_per_day: Optional[int] = None  # Сколько раз в день (например, 2)
    sessions: List[dict] = []  # История выполнения [{date, time, completed, performed_by}]
    payment_type: str = "single"  # single (оплата сразу за курс) или per_session (за каждую процедуру)

    # Комплексная услуга: одна строка плана со встроенным составом
    is_complex: bool = False
    components: Optional[list] = []

    @model_validator(mode='after')
    def synchronize_teeth(self):
        if self.unit != 'зуб':
            return self
        valid = {f'{quadrant}{number}' for quadrant in range(1, 5) for number in range(1, 9)}
        teeth = self.teeth_numbers or []
        if not teeth or len(teeth) != len(set(teeth)) or any(tooth not in valid for tooth in teeth):
            raise ValueError('Select unique valid tooth numbers for a tooth service')
        if self.is_course:
            raise ValueError('Tooth services use selected teeth, not course sessions')
        price = Decimal(str(self.price_per_unit))
        if not price.is_finite() or price < 0:
            raise ValueError('Tooth service price must be finite and non-negative')
        self.quantity = len(teeth)
        self.total_price = float((price * len(teeth) * (1 - Decimal(str(self.discount)) / 100)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))
        return self


class ConsultationSheet(BaseModel):
    """Консультационный лист пациента"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    doctor_id: str
    doctor_name: str
    consultation_date: datetime = Field(default_factory=datetime.utcnow)
    complaints: Optional[str] = None  # Жалобы
    anamnesis: Optional[str] = None  # Анамнез
    anamnesis_morbi: Optional[str] = None  # Анамнез заболевания
    anamnesis_vitae: Optional[str] = None  # Анамнез жизни
    local_status: Optional[str] = None  # Локальный статус
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
    anamnesis_morbi: Optional[str] = None
    anamnesis_vitae: Optional[str] = None
    local_status: Optional[str] = None
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
    anamnesis_morbi: Optional[str] = None
    anamnesis_vitae: Optional[str] = None
    local_status: Optional[str] = None
    examination: Optional[str] = None
    icd10_codes: Optional[List[ICD10Code]] = None
    diagnosis: Optional[str] = None
    recommendations: Optional[str] = None
    treatment_services: Optional[List[TreatmentService]] = None
    treatment: Optional[str] = None
    notes: Optional[str] = None
