"""Additional permission boundary installed after all application routers.

Role checks and ownership checks inside endpoints remain in force (AND).
Unknown API families are denied, including for administrators. Reporting/MCP
routers retain their separate grant/clinic validator unchanged.
"""
from fastapi import Depends, HTTPException, Request
from fastapi.routing import APIRoute
from fastapi.dependencies.utils import get_parameterless_sub_dependant
from starlette.routing import request_response
from routers.auth import get_current_active_user
from database import get_database
from clinic_boundary import assert_single_clinic

PUBLIC = {
    ('POST', '/api/auth/login'), ('POST', '/api/auth/register'),
    ('POST', '/api/public/patient-terms/lookup'),
    ('POST', '/api/public/patient-terms/accept'),
    ('POST', '/api/wazzup/webhook/messages'),
    ('GET', '/api/telephony/webhook/events'),
    ('POST', '/api/telephony/webhook/events'),
    ('POST', '/api/telephony/callbacks'),
}


def requirements(path, method, module=''):
    """Return AND requirements; None means deny; () authenticated self-service."""
    if path in ('/api/auth/me', '/api/auth/change-password'):
        return ()
    if path.startswith('/api/staff/') or path == '/api/staff':
        if method == 'DELETE':
            return ('staff_view', 'staff_delete')
        return ('staff_view',) if method in ('GET', 'HEAD') else ('staff_view', 'staff_edit')
    read = method in ('GET', 'HEAD')
    if path == '/api/doctors/salary-report':
        return ('payroll_view',)
    if path == '/api/lookups/doctors':
        return ('calendar_view|patients_view|doctors_view|crm_view|payroll_view',)
    if path.startswith('/api/crm/integration'):
        if 'client-hms-data' in path or 'last-appointment' in path:
            return ('crm_view', 'patients_view')
        return ('crm_view', 'finance_view') if read else ('crm_edit', 'patients_edit')
    if path.startswith('/api/crm/'):
        family = 'crm'
    elif path in ('/api/wazzup/messages/send', '/api/wazzup/messages/send-template', '/api/wazzup/messages/send-media'):
        return ('crm_view|broadcast_view', 'crm_edit|broadcast_edit')
    elif path.startswith(('/api/wazzup', '/api/telephony')):
        if '/appointments/' in path or 'save-to-patient' in path:
            return ('crm_edit', 'patients_edit')
        family = 'crm'
    elif path.startswith(('/api/materials', '/api/inventory', '/api/inventories')):
        family = 'warehouse'
    elif path.startswith('/api/loyalty'):
        if '/cashback/' in path:
            return ('loyalty_view', 'payroll_view') if read else ('loyalty_view', 'loyalty_edit', 'payroll_view')
        family = 'loyalty'
    elif path.startswith('/api/service-quality') or path.startswith('/api/feedback'):
        family = 'quality'
    elif path.startswith(('/api/settings', '/api/notification-rules', '/api/patient-terms')):
        return ('system_settings',)
    elif path.startswith('/api/doctors'):
        if '/statistics' in path:
            return ('statistics_view',)
        family = 'calendar' if '/schedule' in path or '/available/' in path else 'doctors'
    elif path.startswith(('/api/appointments', '/api/rooms', '/api/room-schedules')):
        family = 'calendar'
    elif path.startswith('/api/reports/'):
        return ('statistics_view',)
    elif path.startswith('/api/icd10'):
        family = 'patients'
    elif path.startswith(('/api/patients', '/api/treatment-plans', '/api/consultations', '/api/consultation-sheets', '/api/documents', '/api/uploads')):
        if not read and any(action in path for action in ('mark-paid', 'pay-remaining', 'add-deposit', 'settle-remaining', '/receipts')):
            return ('patients_view', 'finance_view', 'finance_edit')
        family = 'patients'
    elif path.startswith(('/api/service-prices', '/api/service-categories', '/api/services', '/api/specialties', '/api/payment-types', '/api/laboratories', '/api/price-import')):
        family = 'directory'
    elif path.startswith(('/api/insights', '/api/chat')):
        # Aggregated badges/AI can span all spaces and must not leak HMS data.
        return ('system_settings',)
    else:
        return None
    view = family + '_view'
    if path.startswith('/api/uploads/'):
        return ('patients_view', 'patients_export')
    if any(segment in path.split('/') for segment in ('export', 'download')):
        return (view, family + '_export')
    if read:
        return (view,)
    if method == 'DELETE':
        return (view, family + '_delete')
    return (view, family + '_edit')


def check_access(user, required):
    if required is None or not user.is_active or not all(set(clause.split('|')) & set(user.permissions) for clause in required):
        raise HTTPException(403, 'Permission denied')


def install_api_permissions(app):
    """Compile boundary as a dependency, so dependency overrides work in tests."""
    for route in app.routes:
        if not isinstance(route, APIRoute) or not route.path.startswith('/api/'):
            continue
        module = route.endpoint.__module__
        if module.startswith('reporting.'):
            continue  # Existing MCP/grant enforcement is intentionally untouched.
        protected_methods = set(route.methods) - {m for m, p in PUBLIC if p == route.path}
        if not protected_methods:
            continue

        def guard_factory(path, module):
            async def guard(request: Request, user=Depends(get_current_active_user), db=Depends(get_database)):
                if (request.method, path) in PUBLIC:
                    return
                check_access(user, requirements(path, request.method, module))
                await assert_single_clinic(db)
            return guard

        dependency = Depends(guard_factory(route.path, module))
        route.dependant.dependencies.insert(0, get_parameterless_sub_dependant(depends=dependency, path=route.path_format))
        route.app = request_response(route.get_route_handler())
