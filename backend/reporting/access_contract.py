"""FastAPI-free contract shared by the CRM route and external MCP client."""
from typing import Literal

from .contract import ClosedModel, Scope

ACCESS_PATH = "/api/reporting/access"
FINANCE_TOOL = "get_finance_summary"
BREAKDOWN_TOOL = "get_finance_breakdown"
AMOUNTS_DUE_TOOL = "get_amounts_due"
SERVICES_RENDERED_TOOL = "get_services_rendered"
PAYROLL_TOOL = "get_payroll_summary"
ALL_TOOLS = (FINANCE_TOOL, BREAKDOWN_TOOL, AMOUNTS_DUE_TOOL, SERVICES_RENDERED_TOOL, PAYROLL_TOOL)


class AccessEnvelope(ClosedModel):
    scope: Scope
    allowed_tools: tuple[Literal[
        "get_finance_summary",
        "get_finance_breakdown",
        "get_amounts_due",
        "get_services_rendered",
        "get_payroll_summary",
    ], ...]
