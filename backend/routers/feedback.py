from fastapi import APIRouter, Depends
from typing import List

from database import get_database
from models.feedback import FeedbackSettings, PatientFeedback
from services.feedback_service import FeedbackService
from dependencies import get_current_user
from models.auth import User

router = APIRouter(prefix="/api/feedback", tags=["Feedback"])


@router.get("/settings", response_model=FeedbackSettings)
async def get_feedback_settings(
    current_user: User = Depends(get_current_user),
    db=Depends(get_database),
):
    """Получить настройки обратной связи (автодобавляет правило-запрос оценки)."""
    svc = FeedbackService(db)
    await svc.ensure_completed_rule()
    return await svc.get_settings()


@router.put("/settings", response_model=FeedbackSettings)
async def update_feedback_settings(
    patch: dict,
    current_user: User = Depends(get_current_user),
    db=Depends(get_database),
):
    """Обновить настройки обратной связи."""
    svc = FeedbackService(db)
    await svc.ensure_completed_rule()
    return await svc.update_settings(patch)


@router.get("", response_model=List[PatientFeedback])
async def list_feedback(
    current_user: User = Depends(get_current_user),
    db=Depends(get_database),
):
    """Список фидбеков пациентов (для вкладки)."""
    svc = FeedbackService(db)
    return await svc.list_feedback()
