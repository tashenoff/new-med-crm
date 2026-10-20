"""One protected GET. Real identity, grants and scoped data are deliberately unconfigured."""
from fastapi import APIRouter, HTTPException, Request, Response

from .access import authorize
from .contract import Envelope, PATH, ReportError, parse_period
from .service import aggregate


async def unconfigured_context(request):
    # A bearer-looking string is not authentication. No credential is parsed,
    # stored, logged or sent anywhere; only an audited future resolver may enable access.
    if not request.headers.get("authorization"):
        raise ReportError("AUTH_REQUIRED")
    raise ReportError("REPORTING_UNCONFIGURED")


async def unconfigured_source(scope, period):
    raise ReportError("REPORTING_UNCONFIGURED")


def create_router(resolve_context=unconfigured_context, read_snapshot=unconfigured_source):
    router = APIRouter(tags=["Read-only finance reporting"])

    @router.get(PATH, response_model=Envelope)
    async def finance_summary(request: Request, response: Response):
        response.headers["Cache-Control"] = "no-store"
        try:
            # Resolver must query current owner permissions/grant membership on EVERY call.
            # Never infer the caller from X-Agent-ID, clinic_id or a tool argument.
            scope = authorize(await resolve_context(request))
            pairs = request.query_params.multi_items()
            if len(pairs) != 2 or {key for key, _ in pairs} != {"date_from", "date_to"}:
                raise ReportError("INVALID_ARGUMENTS")
            period = parse_period(dict(pairs))
            snapshot = await read_snapshot(scope, period)
            return Envelope(scope=scope, report=aggregate(snapshot, scope, period))
        except ReportError as error:
            raise HTTPException(error.status, detail={"code": error.code, "complete": False}, headers={"Cache-Control": "no-store"}) from None
        except Exception:
            raise HTTPException(503, detail={"code": "SOURCE_UNAVAILABLE", "complete": False}, headers={"Cache-Control": "no-store"}) from None

    return router


router = create_router()
