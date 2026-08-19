"""
System Settings Models Module

Модуль для хранения системных настроек приложения
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


class AIAnalysisType(str, Enum):
    """Типы AI анализа"""
    SERVICE_QUALITY = "service_quality"  # Анализ качества обслуживания
    SENTIMENT = "sentiment"              # Анализ тональности
    SUMMARY = "summary"                  # Краткое содержание


class SystemSettings(BaseModel):
    """Модель системных настроек"""
    id: str = Field(default="system_settings_main")
    
    # AI Анализ WhatsApp сообщений
    ai_whatsapp_analysis_enabled: bool = Field(default=False, description="Включен ли AI анализ WhatsApp сообщений")
    ai_analysis_types: list[AIAnalysisType] = Field(
        default=[AIAnalysisType.SERVICE_QUALITY],
        description="Типы анализа для выполнения"
    )
    ai_analyze_incoming: bool = Field(default=True, description="Анализировать входящие сообщения")
    ai_analyze_outgoing: bool = Field(default=True, description="Анализировать исходящие сообщения")
    ai_min_message_length: int = Field(default=10, description="Минимальная длина сообщения для анализа")
    ai_batch_analysis: bool = Field(default=True, description="Анализировать пакетами (диалоги) вместо отдельных сообщений")
    ai_batch_size: int = Field(default=10, description="Количество сообщений в пакете для анализа")
    
    # Настройки модели
    ai_model_temperature: float = Field(default=0.3, description="Temperature для AI модели (0-1)")
    
    # Пользовательские инструкции для AI анализа качества
    ai_custom_instructions: str = Field(
        default="",
        description="Дополнительные инструкции для AI при анализе качества коммуникаций"
    )
    ai_evaluation_criteria: Dict[str, Any] = Field(
        default_factory=lambda: {
            "response_time": {"enabled": True, "weight": 1.0, "description": "Скорость ответов оператора"},
            "politeness": {"enabled": True, "weight": 1.0, "description": "Вежливость и уважительность"},
            "helpfulness": {"enabled": True, "weight": 1.0, "description": "Полезность предоставленной информации"},
            "professionalism": {"enabled": True, "weight": 1.0, "description": "Профессионализм в общении"},
            "problem_resolution": {"enabled": True, "weight": 1.0, "description": "Эффективность решения вопроса клиента"},
            "communication": {"enabled": True, "weight": 1.0, "description": "Качество коммуникации в целом"}
        },
        description="Критерии оценки с весами"
    )
    ai_clinic_context: str = Field(
        default="",
        description="Контекст клиники для AI (специфика услуг, правила общения)"
    )
    
    # Метаданные
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[str] = None


class SystemSettingsUpdate(BaseModel):
    """Модель для обновления системных настроек"""
    ai_whatsapp_analysis_enabled: Optional[bool] = None
    ai_analysis_types: Optional[list[AIAnalysisType]] = None
    ai_analyze_incoming: Optional[bool] = None
    ai_analyze_outgoing: Optional[bool] = None
    ai_min_message_length: Optional[int] = None
    ai_batch_analysis: Optional[bool] = None
    ai_batch_size: Optional[int] = None
    ai_model_temperature: Optional[float] = None
    ai_custom_instructions: Optional[str] = None
    ai_evaluation_criteria: Optional[Dict[str, Any]] = None
    ai_clinic_context: Optional[str] = None


class SystemSettingsResponse(BaseModel):
    """Ответ с системными настройками"""
    id: str
    ai_whatsapp_analysis_enabled: bool
    ai_analysis_types: list[AIAnalysisType]
    ai_analyze_incoming: bool
    ai_analyze_outgoing: bool
    ai_min_message_length: int
    ai_batch_analysis: bool
    ai_batch_size: int
    ai_model_temperature: float
    ai_custom_instructions: str = ""
    ai_evaluation_criteria: Dict[str, Any] = {}
    ai_clinic_context: str = ""
    updated_at: datetime
    updated_by: Optional[str] = None
