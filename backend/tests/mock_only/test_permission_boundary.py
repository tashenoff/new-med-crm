"""Synthetic only: no Mongo client or external requests are used by these tests."""
import copy
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError

from api_permissions import install_api_permissions, requirements, check_access
from clinic_boundary import assert_single_clinic
from database import get_database
from models.auth import User, UserInDB
from models.staff import StaffMember, StaffMemberCreate, StaffMemberUpdate, Permission, ROLE_PERMISSIONS, StaffRole
from permission_policy import effective_permissions
from routers import auth, staff
from services.staff_service import StaffService


def user(permissions=(), role='marketer', id='synthetic'):
    return UserInDB(id=id, full_name='Synthetic', role=role, hashed_password='synthetic-hash', permissions=list(permissions))


class Collection:
    def __init__(self):
        self.rows = []

    async def find_one(self, query, *args):
        # Tests exercise staff/user identity lookups and clinic preflight only.
        for row in self.rows:
            def matches(key, value):
                if isinstance(value, dict):
                    return (('$exists' not in value or (key in row) == value['$exists'])
                            and ('$ne' not in value or row.get(key) != value['$ne']))
                return row.get(key) == value
            if all(matches(k, v) for k, v in query.items()):
                return copy.deepcopy(row)
        return None

    async def insert_one(self, row):
        self.rows.append(copy.deepcopy(row))
        return SimpleNamespace(inserted_id=row.get('_id'))

    async def update_one(self, query, update):
        for row in self.rows:
            if all(row.get(k) == v for k, v in query.items()):
                row.update(copy.deepcopy(update['$set']))
                return SimpleNamespace(modified_count=1, matched_count=1)
        return SimpleNamespace(modified_count=0, matched_count=0)


class DB:
    def __init__(self):
        self.collections = {}

    def __getitem__(self, key):
        return self.collections.setdefault(key, Collection())

    def __getattr__(self, key):
        return self[key]


@pytest.mark.parametrize('selected', [
    ['crm_view', 'crm_edit'], ['calendar_view', 'patients_view'],
    ['warehouse_view', 'warehouse_edit'], ['finance_view'],
    ['finance_view', 'payroll_view'], ['crm_view', 'warehouse_view'], [],
])
def test_explicit_spaces_never_inherit_role(selected):
    for role in StaffRole:
        member = StaffMember(full_name='Synthetic', role=role, custom_permissions=selected, permission_mode='explicit')
        assert sorted(p.value for p in member.get_permissions()) == sorted(selected)


def test_original_marketer_problem_and_legacy_compatibility():
    document = {'role': 'marketer', 'custom_permissions': ['crm_view']}
    assert {'patients_view', 'statistics_view'} <= set(effective_permissions(document))
    assert effective_permissions({**document, 'permission_mode': 'explicit'}) == ['crm_view']
    assert all(Permission.PAYROLL_VIEW not in keys for keys in ROLE_PERMISSIONS.values())
    assert Permission.CRM_EXPORT not in ROLE_PERMISSIONS[StaffRole.SUPER_ADMIN]


def test_empty_omitted_and_invalid_semantics():
    create = StaffMemberCreate(login='synthetic', full_name='Synthetic', password='only-test', role='marketer')
    assert create.permission_mode == 'explicit' and create.custom_permissions == []
    assert StaffMemberUpdate().model_dump(exclude_unset=True) == {}
    assert StaffMemberUpdate(custom_permissions=[]).model_dump(exclude_unset=True) == {'custom_permissions': []}
    for data in ({'custom_permissions': None}, {'permission_mode': 'legacy'}, {'custom_permissions': ['root']}, {'role': None}):
        with pytest.raises(ValidationError):
            StaffMemberUpdate(**data)
    assert effective_permissions({'role': 'bad', 'custom_permissions': []}) == []
    assert effective_permissions({'role': 'marketer', 'custom_permissions': None}) == []


async def test_create_persist_reopen_update_role_and_refresh_same_jwt():
    db = DB()
    service = StaffService(db)
    service._hash_password = lambda password: 'synthetic-hash'
    created = await service.create_staff_member(StaffMemberCreate(
        login='synthetic', full_name='Synthetic', password='only-test', role='marketer', custom_permissions=['crm_view']))
    assert created.permissions == ['crm_view']
    assert created.permission_mode == 'explicit'
    token = auth.create_access_token({'sub': created.id, 'sub_type': 'user_id'})
    credentials = HTTPAuthorizationCredentials(scheme='Bearer', credentials=token)
    before = await auth.get_current_user(credentials, db)
    assert before.permissions == ['crm_view']
    reopened = await service.get_staff_by_id(created.id)
    assert reopened.custom_permissions == ['crm_view']
    await service.update_staff_member(created.id, StaffMemberUpdate(full_name='New Synthetic'))
    assert (await service.get_staff_by_id(created.id)).permissions == ['crm_view']
    await service.update_staff_member(created.id, StaffMemberUpdate(role='admin'))
    assert (await auth.get_current_user(credentials, db)).permissions == ['crm_view']
    await service.update_staff_member(created.id, StaffMemberUpdate(custom_permissions=[]))
    assert (await auth.get_current_user(credentials, db)).permissions == []
    await service.update_staff_member(created.id, StaffMemberUpdate(custom_permissions=['warehouse_view']))
    after = await auth.get_current_user(credentials, db)
    assert after.permissions == ['warehouse_view']
    assert (await auth.read_users_me(after, db)).permissions == ['warehouse_view']
    # A lost staff projection must not resurrect role defaults from users.
    db.staff.rows.clear()
    assert (await auth.get_current_user(credentials, db)).permissions == ['warehouse_view']


async def test_legacy_role_only_save_freezes_previous_grants():
    db = DB()
    source = {'_id': 'legacy', 'full_name': 'Synthetic', 'role': 'marketer', 'custom_permissions': [], 'hashed_password': 'hash'}
    await db.staff.insert_one(source)
    await db.users.insert_one(source)
    updated = await StaffService(db).update_staff_member('legacy', StaffMemberUpdate(role='super_admin'))
    assert updated.permission_mode == 'explicit'
    assert set(updated.permissions) == set(ROLE_PERMISSIONS[StaffRole.MARKETER])


@pytest.mark.parametrize('permissions,allowed', [
    (['crm_view'], ['/api/crm/leads/']),
    (['patients_view'], ['/api/patients']),
    (['warehouse_view'], ['/api/materials']),
    (['finance_view'], []),
    (['finance_view', 'payroll_view'], ['/api/doctors/salary-report']),
    (['crm_view', 'warehouse_view'], ['/api/crm/leads/', '/api/materials']),
    ([], []),
])
async def test_direct_api_spaces_deny_by_default(permissions, allowed):
    app = FastAPI()
    paths = ['/api/crm/leads/', '/api/patients', '/api/materials', '/api/doctors/salary-report', '/api/future-space']
    async def response():
        return {'synthetic': True}
    for path in paths:
        app.add_api_route(path, response, methods=['GET'])
    install_api_permissions(app)
    app.dependency_overrides[auth.get_current_active_user] = lambda: user(permissions)
    app.dependency_overrides[get_database] = DB
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://synthetic') as client:
        for path in paths:
            result = await client.get(path)
            assert result.status_code == (200 if path in allowed else 403), (path, result.text)
        assert (await client.get('/api/doctors/salary-report')).status_code == (200 if 'payroll_view' in permissions else 403)


async def test_unprivileged_creation_and_self_escalation():
    app = FastAPI()
    app.include_router(staff.router)
    install_api_permissions(app)
    app.dependency_overrides[auth.get_current_active_user] = lambda: user(['crm_view'])
    app.dependency_overrides[get_database] = DB
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://synthetic') as client:
        assert (await client.post('/api/staff/', json={'role': 'super_admin'})).status_code == 403
        assert (await client.put('/api/staff/synthetic', json={'custom_permissions': ['staff_edit']})).status_code == 403
    actor = user(['staff_edit', 'staff_view'], role='admin')
    with pytest.raises(HTTPException):
        staff.validate_grant(actor, {'role': 'super_admin'})
    with pytest.raises(HTTPException):
        staff.validate_grant(actor, {'custom_permissions': ['payroll_view']})
    # Super admin has authority to deliberately grant payroll, without receiving it.
    staff.validate_grant(user(['staff_edit'], role='super_admin'), {'custom_permissions': ['payroll_view']})
    assert 'payroll_view' not in user(['staff_edit'], role='super_admin').permissions


async def test_alternate_management_paths_protect_senior_accounts():
    actor = user(['staff_view', 'staff_edit', 'staff_delete'], role='admin')
    service = SimpleNamespace(get_staff_by_id=AsyncMock(return_value=SimpleNamespace(
        role=StaffRole.SUPER_ADMIN, permissions=['staff_view', 'staff_edit', 'system_settings'])))
    with pytest.raises(HTTPException):
        await staff.validate_target(actor, 'senior', service)
    service.get_staff_by_id.return_value = SimpleNamespace(role=StaffRole.ADMIN, permissions=['payroll_view'])
    with pytest.raises(HTTPException):
        await staff.validate_target(actor, 'senior', service)
    with pytest.raises(HTTPException):
        await staff.validate_target(actor, actor.id, service)
    assert await staff.validate_target(user(['staff_view', 'staff_edit'], role='super_admin'), 'senior', service)


async def test_foreign_document_quarantine_does_not_reject_unlabelled_clinic(monkeypatch):
    monkeypatch.setenv('APP_CLINIC_ID', 'synthetic-A')
    db = DB()
    await db.patients.insert_one({'_id': 'legacy-single-clinic'})
    await db.doctors.insert_one({'_id': 'local', 'clinic_id': 'synthetic-A'})
    await assert_single_clinic(db)


async def test_admin_login_and_explicit_payroll_not_restored(monkeypatch):
    db = DB()
    await db.users.insert_one({'_id': 'recovery', 'login': 'synthetic-root', 'full_name': 'Synthetic', 'role': 'super_admin', 'hashed_password': 'test'})
    monkeypatch.setattr(auth, 'verify_password', lambda *args: True)
    result = await auth.login(auth.UserLogin(email='synthetic-root', password='test'), db)
    assert result['access_token']
    assert 'staff_edit' in result['user'].permissions
    assert 'payroll_view' not in result['user'].permissions


async def test_clinic_account_mismatch_and_mixed_database_denied(monkeypatch):
    monkeypatch.setenv('APP_CLINIC_ID', 'synthetic-clinic-A')
    db = DB()
    with pytest.raises(HTTPException) as error:
        await auth.hydrate_access({'id': 'foreign', 'role': 'admin', 'clinic_id': 'synthetic-clinic-B'}, db)
    assert error.value.status_code == 403
    await db.patients.insert_one({'_id': 'foreign-patient', 'clinic_id': 'synthetic-clinic-B'})
    with pytest.raises(HTTPException) as error:
        await assert_single_clinic(db)
    assert error.value.status_code == 403


def test_clinical_integration_requires_both_spaces_and_payroll_redaction():
    with pytest.raises(HTTPException):
        check_access(user(['crm_view']), requirements('/api/crm/integration/client-hms-data/{client_id}/appointments', 'GET'))
    from routers.doctors import doctor_response
    data = {'id': 'synthetic', 'full_name': 'Synthetic', 'payment_value': 75, 'services': [{'fixed': 200}], 'consultation_payment_value': 90}
    public = json.loads(doctor_response(data, user(['doctors_view'])).body)
    assert public == {'id': 'synthetic', 'full_name': 'Synthetic'}
    assert doctor_response(data, user(['payroll_view'])) == data


async def test_websocket_rechecks_revocation_before_broadcast():
    from services.websocket_manager import WebSocketManager
    from events import CRMCardCreated
    from datetime import datetime
    socket = SimpleNamespace(send_json=AsyncMock(), close=AsyncMock())
    # A hashable synthetic socket.
    class Socket:
        send_json = socket.send_json
        close = socket.close
    ws = Socket()
    manager = WebSocketManager()
    current = {'allow': True}
    async def authorize(event):
        return current['allow']
    await manager.connect(ws, authorize=authorize)
    current['allow'] = False
    await manager.broadcast(CRMCardCreated(event_id='test', timestamp=datetime.utcnow(), card_id='test', title='Synthetic'))
    assert ws.send_json.await_count == 1  # Only connection.ready, no data event.
    assert manager.connection_count == 0
