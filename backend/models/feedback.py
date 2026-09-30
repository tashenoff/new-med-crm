from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class FeedbackStatus(str, Enum):
    """Состояния опроса обратной связи"""
    PENDING_SCORE = "pending_score"    # ждём оценку пациента
    PENDING_REASON = "pending_reason"  # ждём описание причины (плохой балл)
    GOOD = "good"                      # хорошая оценка, отправлена ссылка на отзыв
    BAD = "bad"                        # плохая оценка, причина сохранена


class PatientFeedback(BaseModel):
    """Запись обратной связи пациента (оценка + причина)."""
    id: Optional[str] = Field(None, alias="_id")
    patient_id: str
    patient_name: str
    patient_phone: str
    appointment_id: str
    doctor_name: str = ""
    score: Optional[int] = None  # оценка 1-10
    reason: Optional[str] = None  # причина (при плохом балле)
    status: FeedbackStatus = FeedbackStatus.PENDING_SCORE
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True


class FeedbackSettings(BaseModel):
    """Настройки модуля обратной связи (не хардкод — редактируются в Рассылке)."""
    enabled: bool = True
    good_score_min: int = Field(8, ge=1, le=10, description="Порог «хорошая оценка»")
    review_link: str = "https://2gis.kz/astana/geo/70000001055140151"
    good_message: str = (
        "Спасибо за вашу оценку {score} из 10! Будем рады, если оставите подробный отзыв о посещении: {link}"
    )
    ask_reason_message: str = (
        "Жаль, что приём не оправдал ожиданий (оценка {score} из 10). "
        "Пожалуйста, опишите причины и что можно улучшить — мы обязательно учтём ваше мнение."
    )
