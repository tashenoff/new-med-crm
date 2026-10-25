"""Real auth/router/service round trips; synthetic in-memory storage only."""
import copy

import httpx
import pytest

from compensation import COMPENSATION_FIELDS
from permission_staging_app import PASSWORD, account, configure


@pytest.fixture
def stage(monkeypatch, tmp_path):
    app, db, overrides = configure(monkeypatch, tmp_path)
    yield app, db
    app.dependency_overrides.clear()
    app.dependency_overrides.update(overrides)


async def login(client, identity):
    response = await client.post('/api/auth/login', json={'email': identity, 'password': PASSWORD})
    assert response.status_code == 200, response.text
    return {'Authorization': 'Bearer ' + response.json()['access_token']}


@pytest.mark.parametrize('role', ['admin', 'super_admin'])
async def test_basic_creation_is_independent_of_payroll_and_edit(stage, role):
    app, db = stage
    account(db, 'creator', role, mode='explicit', permissions=['doctors_view', 'doctors_create'])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://synthetic') as client:
        headers = await login(client, 'creator')
        response = await client.post('/api/doctors', headers=headers, json={
            'full_name': 'Synthetic doctor', 'specialties': ['Therapy'], 'phone': '+77012345678'})
        assert response.status_code == 200, response.text
        result = response.json()
        assert result['full_name'] == 'Synthetic doctor'
        assert not set(result) & COMPENSATION_FIELDS
        assert db.doctors.rows[0]['consultation_compensation_mode'] is None
        reopened = await client.get('/api/doctors/' + result['id'], headers=headers)
        assert reopened.status_code == 200
        assert not set(reopened.json()) & COMPENSATION_FIELDS
        assert (await client.put('/api/doctors/' + result['id'], headers=headers,
                                 json={'full_name': 'Denied'})).status_code == 403
        assert (await client.get('/api/doctors/salary-report', headers=headers)).status_code == 403


@pytest.mark.parametrize('permissions', [[], ['payroll_view'], ['doctors_create'],
    ['doctors_view'], ['doctors_view', 'doctors_edit'], ['doctors_view', 'doctors_edit', 'payroll_view']])
async def test_creation_requires_its_own_permission(stage, permissions):
    app, db = stage
    account(db, 'limited', 'super_admin', mode='explicit', permissions=permissions)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://synthetic') as client:
        response = await client.post('/api/doctors', headers=await login(client, 'limited'),
                                     json={'full_name': 'Denied'})
        assert response.status_code == 403, response.text
        assert db.doctors.rows == []


@pytest.mark.parametrize('settings', [
    {'consultation_compensation_mode': 'none'},
    {'consultation_compensation_mode': 'inherit', 'payment_value': 25},
    {'consultation_compensation_mode': 'none', 'services': [{'service_id': 's', 'commission_type': 'fixed', 'commission_value': 2000}]},
])
async def test_creation_grant_cannot_write_hidden_compensation(stage, settings):
    app, db = stage
    account(db, 'creator', 'admin', mode='explicit', permissions=['doctors_view', 'doctors_create'])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://synthetic') as client:
        response = await client.post('/api/doctors', headers=await login(client, 'creator'),
                                     json={'full_name': 'Denied', **settings})
        assert response.status_code == 403, response.text
        assert db.doctors.rows == []


async def test_payroll_creation_and_basic_edit_preserve_rates(stage):
    app, db = stage
    account(db, 'payroll-creator', 'super_admin', mode='explicit',
            permissions=['doctors_view', 'doctors_create', 'payroll_view'])
    account(db, 'editor', 'admin', mode='explicit', permissions=['doctors_view', 'doctors_edit'])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://synthetic') as client:
        response = await client.post('/api/doctors', headers=await login(client, 'payroll-creator'), json={
            'full_name': 'Synthetic salaried doctor', 'payment_type': 'hybrid', 'payment_value': 2000,
            'hybrid_percentage_value': 15, 'consultation_compensation_mode': 'inherit'})
        assert response.status_code == 200, response.text
        assert response.json()['payment_value'] == 2000
        doctor_id = response.json()['id']
        original = copy.deepcopy(db.doctors.rows[0])
        editor = await login(client, 'editor')
        changed = await client.put('/api/doctors/' + doctor_id, headers=editor, json={'full_name': 'Renamed'})
        assert changed.status_code == 200, changed.text
        assert not set(changed.json()) & COMPENSATION_FIELDS
        assert all(db.doctors.rows[0][key] == original[key] for key in COMPENSATION_FIELDS)
        rejected = await client.put('/api/doctors/' + doctor_id, headers=editor,
                                   json={'payment_value': 99, 'consultation_compensation_mode': 'inherit'})
        assert rejected.status_code == 403
        assert db.doctors.rows[0]['payment_value'] == 2000


async def test_creation_checkbox_persists_and_revokes_on_existing_token(stage):
    app, db = stage
    account(db, 'root', 'super_admin')
    account(db, 'worker', 'admin', mode='explicit', permissions=['doctors_view'])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://synthetic') as client:
        root = await login(client, 'root')
        worker = await login(client, 'worker')
        for selected, expected in [(['doctors_view', 'doctors_create'], 200), (['doctors_view'], 403)]:
            saved = await client.put('/api/staff/worker', headers=root,
                                      json={'permission_mode': 'explicit', 'custom_permissions': selected})
            assert saved.status_code == 200, saved.text
            assert set(saved.json()['permissions']) == set(selected)
            reopened = await client.get('/api/staff/worker', headers=root)
            assert set(reopened.json()['custom_permissions']) == set(selected)
            assert set((await client.get('/api/auth/me', headers=worker)).json()['permissions']) == set(selected)
            response = await client.post('/api/doctors', headers=worker, json={'full_name': 'Synthetic roundtrip'})
            assert response.status_code == expected, response.text
        assert len(db.doctors.rows) == 1
