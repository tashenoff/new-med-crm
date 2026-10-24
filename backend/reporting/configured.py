"""Explicit bound-router construction, selected only by approved activation config."""
from .api import create_router
from .access_api import create_access_router
from .amounts_due import PATH as AMOUNTS_DUE_PATH
from .amounts_due_api import create_amounts_due_router
from .services_rendered import PATH as SERVICES_RENDERED_PATH
from .services_rendered_api import create_services_rendered_router
from .breakdown import PATH as BREAKDOWN_PATH
from .breakdown_api import create_breakdown_router
from .contract import PATH as FINANCE_PATH
from .live_access import LiveResolver
from .grok_oauth import CLIENT_ID, GrokResolver, PrincipalResolver
from .live_source import LiveReadAdapter
from .payroll import PATH as PAYROLL_PATH
from .payroll_api import create_payroll_router


def build_bound_routers(db, binding, grant_store, *, oauth_store=None):
    binding.verify(db)
    source = LiveReadAdapter(db, binding)
    finance = LiveResolver(db, binding, grant_store, FINANCE_PATH)
    breakdown = LiveResolver(db, binding, grant_store, BREAKDOWN_PATH)
    amounts_due = LiveResolver(db, binding, grant_store, AMOUNTS_DUE_PATH)
    services_rendered = LiveResolver(db, binding, grant_store, SERVICES_RENDERED_PATH)
    payroll = LiveResolver(db, binding, grant_store, PAYROLL_PATH)
    if oauth_store is not None:
        finance = PrincipalResolver(finance, GrokResolver(db, binding, oauth_store, FINANCE_PATH))
        breakdown = PrincipalResolver(breakdown, GrokResolver(db, binding, oauth_store, BREAKDOWN_PATH))
        amounts_due = PrincipalResolver(amounts_due, GrokResolver(db, binding, oauth_store, AMOUNTS_DUE_PATH))
        services_rendered = PrincipalResolver(services_rendered, GrokResolver(db, binding, oauth_store, SERVICES_RENDERED_PATH))
        payroll = PrincipalResolver(payroll, GrokResolver(db, binding, oauth_store, PAYROLL_PATH))
    grok_source = LiveReadAdapter(db, binding, principal_id=CLIENT_ID) if oauth_store is not None else None

    async def finance_source(scope, period):
        adapter = grok_source if scope.agent_id == CLIENT_ID and grok_source is not None else source
        return await adapter.finance(scope, period)

    async def breakdown_source(scope, period):
        adapter = grok_source if scope.agent_id == CLIENT_ID and grok_source is not None else source
        return await adapter.finance(scope, period)

    async def amounts_due_source(scope, period):
        adapter = grok_source if scope.agent_id == CLIENT_ID and grok_source is not None else source
        return await adapter.amounts_due(scope, period)

    async def services_rendered_source(scope, period):
        adapter = grok_source if scope.agent_id == CLIENT_ID and grok_source is not None else source
        return await adapter.services_rendered(scope, period)

    async def payroll_source(scope, period):
        adapter = grok_source if scope.agent_id == CLIENT_ID and grok_source is not None else source
        return await adapter.payroll(scope, period)

    routers = (
        create_router(finance, finance_source),
        create_breakdown_router(breakdown, breakdown_source),
        create_amounts_due_router(amounts_due, amounts_due_source),
        create_services_rendered_router(services_rendered, services_rendered_source),
        create_payroll_router(payroll, payroll_source),
        create_access_router(finance, breakdown, amounts_due, services_rendered, payroll),
    )
    if oauth_store is not None:
        from .oauth_server import create_oauth_router
        routers += (create_oauth_router(db, binding, oauth_store),)
    return routers
