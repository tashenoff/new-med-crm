"""Explicit construction only. Not imported/mounted by server.py in this release."""
from .api import create_router
from .contract import PATH as FINANCE_PATH
from .live_access import LiveResolver
from .live_source import LiveReadAdapter
from .payroll import PATH as PAYROLL_PATH
from .payroll_api import create_payroll_router


def build_bound_routers(db, binding, grant_store):
    binding.verify(db)
    source = LiveReadAdapter(db, binding)
    return (
        create_router(LiveResolver(db, binding, grant_store, FINANCE_PATH), source.finance),
        create_payroll_router(LiveResolver(db, binding, grant_store, PAYROLL_PATH), source.payroll),
    )
