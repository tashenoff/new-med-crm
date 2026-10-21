"""Export the registered API policy without starting lifespan or reading MongoDB.

Run from repo root with backend on PYTHONPATH and synthetic environment only.
"""
import csv
import json
from collections import Counter
from pathlib import Path

from fastapi.routing import APIRoute
from api_permissions import PUBLIC, requirements
from models.staff import Permission
from server import app

AUTH = {'get_current_user', 'get_current_active_user', 'role_checker', 'require_staff_permission'}


def dependency_names(dependency):
    return {getattr(dependency.call, '__name__', type(dependency.call).__name__)} | set().union(*(dependency_names(child) for child in dependency.dependencies))


rows = []
missing_auth = Counter()
for route in app.routes:
    if not isinstance(route, APIRoute):
        continue
    module = route.endpoint.__module__
    previous = [d for d in route.dependant.dependencies if getattr(d.call, '__name__', None) != 'guard']
    dependencies = sorted(set().union(*(dependency_names(d) for d in previous)))
    for method in sorted(route.methods):
        public = (method, route.path) in PUBLIC or route.path == '/'
        mcp = module.startswith('reporting.')
        selected = requirements(route.path, method, module)
        conditional = ''
        if route.path.startswith('/api/crm/') and method == 'POST':
            if route.path.endswith('/convert'):
                conditional = 'patients_view & patients_edit unless create_hms_patient=false; calendar_view & calendar_edit if create_appointment'
            elif route.path.endswith('/convert-to-hms'):
                conditional = 'calendar_view & calendar_edit if create_appointment query is true'
            elif route.path.endswith('/schedule-appointment'):
                conditional = 'finance_view & finance_edit if deposit is supplied'
        if route.path.startswith('/api/appointments') and method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            conditional = 'finance_view & finance_edit & patients_view & patients_edit for creating/changing/deleting a nonzero deposit source (may auto-complete funded treatment)'
        if route.path.startswith('/api/treatment-plans') and method in ('POST', 'PUT', 'PATCH'):
            conditional = ('finance_view & finance_edit if general snapshot changes payment fields; '
                           'patients_edit additionally for finance commands on full_payment_v1 auto-completion plans')
        if not public and not mcp and not set(dependencies) & AUTH:
            missing_auth[module] += 1
        rows.append({
            'method': method, 'path': route.path, 'module': module,
            'permissions': 'PUBLIC' if public else 'EXISTING_MCP_GRANT' if mcp
                else 'DENY' if selected is None else ' & '.join(selected) or 'AUTHENTICATED_SELF',
            'existing_dependencies': ', '.join(dependencies),
            'conditional_requirements': conditional,
            'response_filter': 'HMS metadata requires patients_view; joined billing requires finance_view'
                if not public and route.path.startswith(('/api/crm/', '/api/wazzup/', '/api/telephony/')) else '',
        })
destination = Path(__file__).resolve().parents[1] / 'docs/permissions'
destination.mkdir(parents=True, exist_ok=True)
with (destination / 'api-inventory.csv').open('w', newline='', encoding='utf-8-sig') as stream:
    writer = csv.DictWriter(stream, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
summary = {
    'operations': len(rows), 'permission_keys': [p.value for p in Permission],
    'without_original_auth_dependency': dict(missing_auth),
    'without_original_auth_total': sum(missing_auth.values()),
    'note': 'Counts exclude public callbacks, reporting and the new central guard; pre-existing role guards remain AND constraints. New lookups have direct auth.',
}
(destination / 'inventory-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
