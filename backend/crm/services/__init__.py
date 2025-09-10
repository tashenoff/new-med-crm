"""CRM Services - Бизнес-логика CRM системы"""

from .lead_service import LeadService
from .client_service import ClientService
from .deal_service import DealService
from .manager_service import ManagerService
from .contact_service import ContactService
from .integration_service import IntegrationService

__all__ = [
    "LeadService", 
    "ClientService", 
    "DealService", 
    "ManagerService", 
    "ContactService",
    "IntegrationService"
]


