"""CRM Schemas - Pydantic схемы для валидации данных CRM"""

from .lead_schemas import LeadCreate, LeadUpdate, LeadResponse
from .client_schemas import ClientCreate, ClientUpdate, ClientResponse
from .deal_schemas import DealCreate, DealUpdate, DealResponse
from .manager_schemas import ManagerCreate, ManagerUpdate, ManagerResponse
from .contact_schemas import ContactCreate, ContactUpdate, ContactResponse

__all__ = [
    "LeadCreate", "LeadUpdate", "LeadResponse",
    "ClientCreate", "ClientUpdate", "ClientResponse", 
    "DealCreate", "DealUpdate", "DealResponse",
    "ManagerCreate", "ManagerUpdate", "ManagerResponse",
    "ContactCreate", "ContactUpdate", "ContactResponse"
]


