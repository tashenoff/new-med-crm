from fastapi import APIRouter, Depends

from database import db
from dependencies import get_current_active_user
from models.auth import UserInDB
from models.insight import InsightsResponse
from services.insights_service import InsightsService

insights_router = APIRouter(prefix="/insights", tags=["Insights"])


@insights_router.get("/badges", response_model=InsightsResponse)
async def get_insight_badges(current_user: UserInDB = Depends(get_current_active_user)):
    """Возвращает бейджи тревожных сигналов под шапкой."""
    service = InsightsService(db)
    return await service.get_insights()
