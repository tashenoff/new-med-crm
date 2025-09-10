"""CRM Routes - API маршруты для CRM системы"""

from fastapi import APIRouter
from .leads import leads_router
from .clients import clients_router
from .deals import deals_router
from .managers import managers_router
from .contacts import contacts_router
from .sources import sources_router
from .integration import integration_router

# Основной роутер CRM
crm_router = APIRouter(tags=["CRM"])

# Подключаем роутеры модулей
crm_router.include_router(leads_router)
crm_router.include_router(clients_router)
crm_router.include_router(deals_router)
crm_router.include_router(managers_router)
crm_router.include_router(contacts_router)
crm_router.include_router(sources_router)
crm_router.include_router(integration_router)

__all__ = ["crm_router"]

