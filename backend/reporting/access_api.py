"""Protected metadata probe for remote MCP discovery; never reads report records."""
from fastapi import APIRouter, HTTPException, Request, Response

from .access import authorize
from .access_contract import (
    ACCESS_PATH, ALL_TOOLS, AMOUNTS_DUE_TOOL, AccessEnvelope, BREAKDOWN_TOOL, FINANCE_TOOL, PAYROLL_TOOL,
)
from .amounts_due import SCOPE as AMOUNTS_DUE_SCOPE
from .breakdown import SCOPE as BREAKDOWN_SCOPE
from .contract import ReportError, SCOPE
from .payroll import PERMISSION, SCOPE as PAYROLL_SCOPE


def create_access_router(finance_resolver, breakdown_resolver, amounts_due_resolver, payroll_resolver):
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
                (BREAKDOWN_TOOL, breakdown_resolver, BREAKDOWN_SCOPE, "finance_view"),
                (AMOUNTS_DUE_TOOL, amounts_due_resolver, AMOUNTS_DUE_SCOPE, "finance_view"),
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
            ordered = tuple(tool for tool in ALL_TOOLS if tool in allowed)
            return AccessEnvelope(scope=resolved, allowed_tools=ordered)
        except ReportError as error:
            raise HTTPException(error.status, detail={"code": error.code, "complete": False},
                                headers={"Cache-Control": "no-store"}) from None
        except Exception:
            raise HTTPException(503, detail={"code": "SOURCE_UNAVAILABLE", "complete": False},
                                headers={"Cache-Control": "no-store"}) from None

    return router
