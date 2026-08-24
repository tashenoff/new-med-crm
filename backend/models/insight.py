from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field


class InsightBadgeAction(BaseModel):
    """Пояснение действия, которое можно предпринять по бейджу."""

    type: Optional[str] = None  # Может отсутствовать, если LLM не сгенерировала
    payload: Optional[Dict[str, Any]] = None  # Может отсутствовать, если LLM не сгенерировала payload


class InsightBadge(BaseModel):
    """Объект, показывающий конкретный сигнал тревоги или подсказку."""

    id: str
    title: str
    description: str
    level: Literal["critical", "high", "medium", "low"]
    color: str
    action: Optional[InsightBadgeAction] = None
    source: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None


class InsightsResponse(BaseModel):
    """Ответ от эндпоинта бейджей."""

    badges: list[InsightBadge]
    generated_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    source: str
