"""
Service Quality Analysis Models Module

Модуль для хранения результатов AI-анализа качества обслуживания
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


class QualityRating(str, Enum):
    """Оценка качества обслуживания"""
    EXCELLENT = "excellent"      # 5 - Отлично
    GOOD = "good"               # 4 - Хорошо
    SATISFACTORY = "satisfactory"  # 3 - Удовлетворительно
    POOR = "poor"               # 2 - Плохо
    VERY_POOR = "very_poor"     # 1 - Очень плохо


class SentimentType(str, Enum):
    """Тональность сообщения"""
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


class QualityCategory(str, Enum):
    """Категории оценки"""
    RESPONSE_TIME = "response_time"       # Скорость ответа
    POLITENESS = "politeness"             # Вежливость
    HELPFULNESS = "helpfulness"           # Полезность
    PROFESSIONALISM = "professionalism"   # Профессионализм
    PROBLEM_RESOLUTION = "problem_resolution"  # Решение проблемы
    COMMUNICATION = "communication"       # Качество коммуникации


class QualityMetric(BaseModel):
    """Отдельная метрика качества"""
    category: QualityCategory
    score: int = Field(ge=1, le=5, description="Оценка от 1 до 5")
    comment: Optional[str] = None


class ServiceQualityAnalysis(BaseModel):
    """Результат анализа качества обслуживания"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    
    # Связи
    user_id: str = Field(..., description="ID оператора/сотрудника")
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    
    # Контекст диалога
    phone: str = Field(..., description="Телефон клиента")
    contact_name: Optional[str] = None
    channel_id: Optional[str] = None
    
    # Анализируемые сообщения
    messages_analyzed: int = Field(default=0, description="Количество проанализированных сообщений")
    message_ids: List[str] = Field(default_factory=list, description="ID проанализированных сообщений")
    conversation_snippet: Optional[str] = Field(None, description="Фрагмент диалога для контекста")
    
    # Результаты анализа
    overall_rating: QualityRating = Field(..., description="Общая оценка качества")
    overall_score: int = Field(ge=1, le=5, description="Числовая оценка от 1 до 5")
    metrics: List[QualityMetric] = Field(default_factory=list, description="Детальные метрики")
    
    # Тональность
    customer_sentiment: SentimentType = Field(default=SentimentType.NEUTRAL)
    operator_sentiment: SentimentType = Field(default=SentimentType.NEUTRAL)
    
    # AI комментарии
    ai_summary: Optional[str] = Field(None, description="Краткое резюме от AI")
    ai_recommendations: List[str] = Field(default_factory=list, description="Рекомендации по улучшению")
    ai_highlights: List[str] = Field(default_factory=list, description="Положительные моменты")
    ai_concerns: List[str] = Field(default_factory=list, description="Проблемные моменты")
    
    # Метаданные
    analyzed_at: datetime = Field(default_factory=datetime.utcnow)
    analysis_model: str = Field(default="", description="Модель AI использованная для анализа")
    analysis_duration_ms: Optional[int] = None
    
    # Период анализа
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None


class ServiceQualityAnalysisCreate(BaseModel):
    """Создание записи анализа"""
    user_id: str
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    phone: str
    contact_name: Optional[str] = None
    channel_id: Optional[str] = None
    messages_analyzed: int = 0
    message_ids: List[str] = []
    conversation_snippet: Optional[str] = None


class ServiceQualitySummary(BaseModel):
    """Сводка по качеству обслуживания для пользователя"""
    user_id: str
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    
    # Статистика
    total_analyses: int = 0
    average_score: float = 0.0
    rating_distribution: Dict[str, int] = Field(default_factory=dict)
    
    # По категориям
    category_averages: Dict[str, float] = Field(default_factory=dict)
    
    # Тренды
    trend: str = "stable"  # improving, declining, stable
    recent_analyses: List[ServiceQualityAnalysis] = Field(default_factory=list)
    
    # Период
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None


class QualityAnalysisFilter(BaseModel):
    """Фильтры для запроса анализов"""
    user_id: Optional[str] = None
    phone: Optional[str] = None
    rating: Optional[QualityRating] = None
    min_score: Optional[int] = None
    max_score: Optional[int] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    limit: int = Field(default=50, le=500)
    skip: int = Field(default=0, ge=0)
