"""FastAPI-free contract shared by the CRM route and external MCP client."""
from typing import Literal

from .contract import ClosedModel, Scope

ACCESS_PATH = "/api/reporting/access"
FINANCE_TOOL, PAYROLL_TOOL = "get_finance_summary", "get_payroll_summary"


class AccessEnvelope(ClosedModel):
    scope: Scope
    allowed_tools: tuple[Literal["get_finance_summary", "get_payroll_summary"], ...]