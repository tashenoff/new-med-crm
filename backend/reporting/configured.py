"""Explicit bound-router construction, selected only by approved activation config."""
from .api import create_router
from .access_api import create_access_router
from .amounts_due import PATH as AMOUNTS_DUE_PATH
from .amounts_due_api import create_amounts_due_router
from .breakdown import PATH as BREAKDOWN_PATH
from .breakdown_api import create_breakdown_router
from .contract import PATH as FINANCE_PATH
from .live_access import LiveResolver
from .live_source import LiveReadAdapter
from .payroll import PATH as PAYROLL_PATH
from .payroll_api import create_payroll_router


def build_bound_routers(db, binding, grant_store):
    binding.verify(db)
    source = LiveReadAdapter(db, binding)
    finance = LiveResolver(db, binding, grant_store, FINANCE_PATH)
    breakdown = LiveResolver(db, binding, grant_store, BREAKDOWN_PATH)
    amounts_due = LiveResolver(db, binding, grant_store, AMOUNTS_DUE_PATH)
    payroll = LiveResolver(db, binding, grant_store, PAYROLL_PATH)
    return (
        create_router(finance, source.finance),
        create_breakdown_router(breakdown, source.finance),
        create_amounts_due_router(amounts_due, source.amounts_due),
        create_payroll_router(payroll, source.payroll),
        create_access_router(finance, breakdown, amounts_due, payroll),
    )
