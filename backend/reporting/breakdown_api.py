"""Separate finance.breakdown.read scope; reuses finance snapshot reads."""
from fastapi import APIRouter, HTTPException, Request, Response

from .access import authorize
from .api import unconfigured_context, unconfigured_source
from .contract import ReportError, parse_period
from .breakdown import PATH, PERMISSION, SCOPE, FinanceBreakdownEnvelope, breakdown


def create_breakdown_router(resolve_context=unconfigured_context, read_snapshot=unconfigured_source):
    router = APIRouter(tags=["Read-only finance breakdown reporting"])

    @router.get(PATH, response_model=FinanceBreakdownEnvelope)
    async def finance_breakdown(request: Request, response: Response):
        response.headers["Cache-Control"] = "no-store"
        try:
            scope = authorize(await resolve_context(request), required_scope=SCOPE, required_permission=PERMISSION)
            pairs = request.query_params.multi_items()
            if len(pairs) != 2 or {key for key, _ in pairs} != {"date_from", "date_to"}:
                raise ReportError("INVALID_ARGUMENTS")
            period = parse_period(dict(pairs))
            return FinanceBreakdownEnvelope(scope=scope, report=breakdown(await read_snapshot(scope, period), scope, period))
        except ReportError as error:
            raise HTTPException(error.status, detail={"code": error.code, "complete": False}, headers={"Cache-Control": "no-store"}) from None
        except Exception:
            raise HTTPException(503, detail={"code": "SOURCE_UNAVAILABLE", "complete": False}, headers={"Cache-Control": "no-store"}) from None

    return router


router = create_breakdown_router()
