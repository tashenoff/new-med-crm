"""Protected metadata probe for remote MCP discovery; never reads report records."""
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, Response

from .access import authorize
from .contract import ClosedModel, ReportError, Scope, SCOPE
from .payroll import PERMISSION, SCOPE as PAYROLL_SCOPE

ACCESS_PATH = "/api/reporting/access"
FINANCE_TOOL, PAYROLL_TOOL = "get_finance_summary", "get_payroll_summary"


class AccessEnvelope(ClosedModel):
    scope: Scope
    allowed_tools: tuple[Literal["get_finance_summary", "get_payroll_summary"], ...]


def create_access_router(finance_resolver, payroll_resolver):
    router = APIRouter(tags=["Read-only reporting access"])

    @router.get(ACCESS_PATH, response_model=AccessEnvelope)
    async def access(request: Request, response: Response):
        response.headers["Cache-Control"] = "no-store"
        try:
            if request.query_params:
                raise ReportError("INVALID_ARGUMENTS")
            allowed, resolved, errors = [], None, []
            for tool, resolver, required, permission in (
                (FINANCE_TOOL, finance_resolver, SCOPE, "finance_view"),
                (PAYROLL_TOOL, payroll_resolver, PAYROLL_SCOPE, PERMISSION),
            ):
                try:
                    scope = authorize(await resolver(request), required_scope=required, required_permission=permission)
                    if resolved is not None and scope != resolved:
                        raise ReportError("FORBIDDEN")
                    resolved = scope
                    allowed.append(tool)
                except ReportError as error:
                    if error.code not in {"AUTH_REQUIRED", "FORBIDDEN"}:
                        raise
                    errors.append(error.code)
            if not allowed:
                raise ReportError("AUTH_REQUIRED" if "AUTH_REQUIRED" in errors else "FORBIDDEN")
            return AccessEnvelope(scope=resolved, allowed_tools=tuple(allowed))
        except ReportError as error:
            raise HTTPException(error.status, detail={"code": error.code, "complete": False},
                                headers={"Cache-Control": "no-store"}) from None
        except Exception:
            raise HTTPException(503, detail={"code": "SOURCE_UNAVAILABLE", "complete": False},
                                headers={"Cache-Control": "no-store"}) from None

    return router
