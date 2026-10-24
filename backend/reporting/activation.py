"""Choose one router set; optional invalid config must not break general CRM startup."""
from .api import router as closed_finance_router
from .amounts_due_api import router as closed_amounts_due_router
from .breakdown_api import router as closed_breakdown_router
from .binding_config import absolute_path, read_binding
from .configured import build_bound_routers
from .grant_store import JsonGrantStore
from .payroll_api import router as closed_payroll_router


def select_reporting_routers(db, environment):
    try:
        binding_path = environment.get("REPORTING_BINDING_FILE")
        grant_path = environment.get("REPORTING_GRANT_FILE")
        absolute_path(binding_path)
        absolute_path(grant_path)
        binding = read_binding(binding_path)
        return build_bound_routers(db, binding, JsonGrantStore(grant_path))
    except Exception:
        return (closed_finance_router, closed_breakdown_router, closed_amounts_due_router, closed_payroll_router)
