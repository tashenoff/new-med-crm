"""
CRM Module
==========

Модуль управления взаимоотношениями с клиентами (Customer Relationship Management)

Структура:
- models/: Модели данных CRM
- routes/: API маршруты
- services/: Бизнес-логика
- schemas/: Pydantic схемы для валидации
"""

from .routes import crm_router

__all__ = ["crm_router"]
