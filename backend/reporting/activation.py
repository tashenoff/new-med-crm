"""Choose one router set; optional invalid config must not break general CRM startup."""
from .api import router as closed_finance_router
from .binding_config import absolute_path, read_binding
from .configured import build_bound_routers
from .grant_store import JsonGrantStore
from .grok_oauth import OAuthFileStore, STATE_NAME
from .payroll_api import router as closed_payroll_router


def select_reporting_routers(db, environment):
    try:
        binding_path = environment.get("REPORTING_BINDING_FILE")
        grant_path = environment.get("REPORTING_GRANT_FILE")
        # Validate both paths before opening any optional configuration.
        absolute_path(binding_path)
        absolute_path(grant_path)
        binding = read_binding(binding_path)
        oauth_path = absolute_path(binding_path).parent / "grok-oauth" / STATE_NAME
        return build_bound_routers(db, binding, JsonGrantStore(grant_path), oauth_store=OAuthFileStore(oauth_path))
    except Exception:
        # Do not log config values or exception text. Existing routes remain closed.
        return closed_finance_router, closed_payroll_router
