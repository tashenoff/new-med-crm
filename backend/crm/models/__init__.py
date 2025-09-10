"""CRM Models - Модели данных для CRM системы"""

from .lead import Lead
from .client import Client  
from .deal import Deal
from .manager import Manager
from .contact import Contact

__all__ = ["Lead", "Client", "Deal", "Manager", "Contact"]


