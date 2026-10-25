"""Additional permission boundary installed after all application routers.

Role checks and ownership checks inside endpoints remain in force (AND).
Unknown API families are denied, including for administrators. Reporting/MCP
routers retain their separate grant/clinic validator unchanged.
"""
import json
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
    if path.startswith('/api/crm/') and '/check-phone/' in path:
        return ('crm_view', 'patients_view')
    if path.startswith('/api/crm/') and path.endswith('/convert-to-hms'):
        return ('crm_view', 'crm_edit', 'patients_view', 'patients_edit')
    if path.startswith('/api/crm/') and path.endswith('/schedule-appointment'):
        return ('crm_view', 'crm_edit', 'patients_view', 'patients_edit', 'calendar_view', 'calendar_edit')
    if path.startswith('/api/crm/'):
        family = 'crm'
    elif path in ('/api/wazzup/messages/send', '/api/wazzup/messages/send-template', '/api/wazzup/messages/send-media'):
        return ('crm_view|broadcast_view', 'crm_edit|broadcast_edit')
    elif path.startswith(('/api/wazzup', '/api/telephony')):
        if '/appointments/' in path or 'save-to-patient' in path:
            return ('crm_view', 'crm_edit', 'patients_view', 'patients_edit')
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
        if path.rstrip('/') == '/api/doctors' and method == 'POST':
            return ('doctors_view', 'doctors_create')
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


def redact_crm_payload(value, user):
    """CRM records can contain joined HMS billing/demographics. Filter nested rows.

Own CRM contact names/phones, inquiry text, interested services and deal budgets
remain CRM data. Clinical identity/demographics and joined treatment billing do
not become available merely because they were copied into a CRM response.
"""
    hidden = set()
    if 'patients_view' not in user.permissions:
        hidden |= {'patient', 'patient_id', 'linked_patient_id', 'identity_patient_id', 'hms_patient_id',
                   'is_hms_patient', 'converted_to_appointment_id', 'converted_to_client_id',
                   'iin', 'birth_date', 'gender', 'appointments_count', 'records_count',
                   'hms_patients', 'hms_conversion_rate', 'treatment_plans', 'appointments',
                   'medical_history', 'diagnoses', 'diagnosis', 'last_appointment'}
    if 'finance_view' not in user.permissions:
        hidden |= {'treatment_plan_total', 'deposit_amount', 'extra_deposit', 'deposit_balance',
                   'patient_debt', 'total_revenue', 'avg_revenue', 'avg_revenue_per_client',
                   'revenue', 'total_paid', 'paid_amount'}
    if isinstance(value, list):
        return [redact_crm_payload(item, user) for item in value]
    if isinstance(value, dict):
        return {key: redact_crm_payload(item, user) for key, item in value.items() if key not in hidden}
    return value


async def check_cross_space_write(request, path, user):
    if request.method not in ('POST', 'PUT', 'PATCH') or not path.startswith('/api/crm/'):
        return
    if not path.endswith(('/convert', '/convert-to-hms', '/schedule-appointment')):
        return
    if path.endswith('/convert-to-hms'):
        if request.query_params.get('create_appointment', '').lower() in ('true', '1', 'yes', 'on', 't', 'y'):
            check_access(user, ('calendar_view', 'calendar_edit'))
        return
    try:
        body = await request.json()
    except (ValueError, TypeError):
        raise HTTPException(422, 'Invalid JSON') from None
    if not isinstance(body, dict):
        raise HTTPException(422, 'Object body required')
    if path.endswith('/convert') and body.get('create_hms_patient', True) is not False:
        check_access(user, ('patients_view', 'patients_edit'))
        if body.get('create_appointment'):
            check_access(user, ('calendar_view', 'calendar_edit'))


async def check_financial_side_effects(request, path, user, db):
    """Clinical/calendar writes cannot create receipts through editable snapshots.

    Unchanged legacy payment fields may round-trip without granting finance.
    Full-payment plans also mark procedures complete, so their receipts require
    clinical edit in addition to finance. This does not change ledger arithmetic.
    """
    if request.method not in ('POST', 'PUT', 'PATCH', 'DELETE'):
        return
    if path.startswith('/api/appointments'):
        # Receiving a booking deposit is part of calendar editing. The route's
        # normal calendar/ownership checks and immutable receipt guards apply.
        if request.method == 'DELETE':
            identity = request.path_params.get('appointment_id')
            previous = await db.appointments.find_one({'id': identity}) if identity else {}
            if previous and previous.get('deposit'):
                check_access(user, ('finance_view', 'finance_edit', 'patients_view', 'patients_edit'))
        return
    if not path.startswith('/api/treatment-plans'):
        return
    identity = request.path_params.get('plan_id')
    previous = await db.treatment_plans.find_one({'id': identity}) if identity else {}
    previous = previous or {}
    required = requirements(path, request.method)
    if required and 'finance_edit' in required:
        if previous.get('payment_completion_policy') == 'full_payment_v1':
            check_access(user, ('patients_edit',))
        return
    if request.method == 'DELETE':
        return
    if path.rstrip('/') not in ('/api/treatment-plans', '/api/treatment-plans/{plan_id}'):
        return
    body = await request.json()
    if not isinstance(body, dict):
        return
    payment_keys = {'payment_status', 'paid', 'is_paid', 'paid_amount', 'payment_date',
                    'paid_from_deposit', 'deposit_amount', 'deposit_balance', 'extra_deposit',
                    'discount_amount', 'discount_total', 'payment_method_id', 'payment_method_name'}

    def payment_changed(current, old):
        if isinstance(current, dict):
            old = old if isinstance(old, dict) else {}
            for key, value in current.items():
                before = old.get(key)
                if key in payment_keys:
                    # Defaults are not receipts; deleting a prior receipt is.
                    normalize = lambda item: None if item in (None, '', False, 0, 'unpaid') else item
                    if normalize(value) != normalize(before):
                        return True
                elif isinstance(value, (dict, list)) and payment_changed(value, before):
                    return True
        elif isinstance(current, list):
            old = old if isinstance(old, list) else []
            # Comparing rows by position is deliberately conservative for paid
            # legacy snapshots. Reordering them may require finance review.
            return any(payment_changed(value, old[index] if index < len(old) else None)
                       for index, value in enumerate(current)) or any(
                payment_changed(value, None) for value in old[len(current):])
        return False

    if payment_changed(body, previous):
        check_access(user, ('finance_view', 'finance_edit'))


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
                await check_cross_space_write(request, path, user)
                await assert_single_clinic(db)
                await check_financial_side_effects(request, path, user, db)
                request.state.permission_user = user
            return guard

        dependency = Depends(guard_factory(route.path, module))
        route.dependant.dependencies.insert(0, get_parameterless_sub_dependant(depends=dependency, path=route.path_format))
        def response_factory(route):
            original = route.get_route_handler()
            async def handler(request):
                response = await original(request)
                if route.path.startswith(('/api/crm/', '/api/wazzup/', '/api/telephony/')) and 'application/json' in response.headers.get('content-type', ''):
                    user = request.state.permission_user
                    payload = redact_crm_payload(json.loads(response.body), user)
                    response.body = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
                    response.headers['content-length'] = str(len(response.body))
                return response
            return handler
        route.app = request_response(response_factory(route))
