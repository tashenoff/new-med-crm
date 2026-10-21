"""Production HTTP routers with synthetic storage/files, never a Mongo fixture."""
import copy

import httpx
import pytest

from clinic_boundary import CLINICAL_COLLECTIONS
from models.staff import ROLE_PERMISSIONS, StaffRole
from permission_staging_app import PASSWORD, account, configure


@pytest.fixture
def local_stage(monkeypatch, tmp_path):
    app, db, overrides = configure(monkeypatch, tmp_path)
    yield app, db, tmp_path
    app.dependency_overrides.clear()
    app.dependency_overrides.update(overrides)


async def login(client, identity):
    response = await client.post('/api/auth/login', json={'email': identity, 'password': PASSWORD})
    assert response.status_code == 200, response.text
    return response.json(), {'Authorization': 'Bearer ' + response.json()['access_token']}


async def test_http_explicit_roundtrip_legacy_transition_and_same_token(local_stage):
    app, db, _ = local_stage
    account(db, 'synthetic-root', 'super_admin')
    account(db, 'synthetic-marketer', 'marketer', permissions=['crm_view'])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://synthetic') as client:
        _, root = await login(client, 'synthetic-root')
        before, old_token = await login(client, 'synthetic-marketer')
        assert {'patients_view', 'statistics_view'} <= set(before['user']['permissions'])
        before_rows = copy.deepcopy(db.staff.rows)
        assert (await client.get('/api/staff/synthetic-marketer', headers=root)).json()['permission_mode'] == 'legacy'
        assert db.staff.rows == before_rows  # Opening the editor does not migrate.
        selected = ['crm_view', 'crm_edit']
        response = await client.put('/api/staff/synthetic-marketer', headers=root,
                                    json={'role': 'marketer', 'permission_mode': 'explicit', 'custom_permissions': selected})
        assert response.status_code == 200, response.text
        assert set(response.json()['permissions']) == set(selected)
        for collection in (db.staff, db.users):
            stored = await collection.find_one({'_id': 'synthetic-marketer'})
            assert stored['permission_mode'] == 'explicit' and set(stored['custom_permissions']) == set(selected)
        assert set((await client.get('/api/auth/me', headers=old_token)).json()['permissions']) == set(selected)
        assert (await client.get('/api/patients', headers=old_token)).status_code == 403
        assert (await client.get('/api/doctors/salary-report', headers=old_token)).status_code == 403
        assert (await client.post('/api/staff/', headers=old_token, json={})).status_code == 403
        reopened = (await client.get('/api/staff/synthetic-marketer', headers=root)).json()
        assert reopened['permission_mode'] == 'explicit' and set(reopened['custom_permissions']) == set(selected)
        assert (await client.put('/api/staff/synthetic-marketer', headers=root, json={'full_name': 'Synthetic renamed'})).status_code == 200
        assert set((await client.get('/api/auth/me', headers=old_token)).json()['permissions']) == set(selected)
        assert (await client.put('/api/staff/synthetic-marketer', headers=root, json={'custom_permissions': []})).status_code == 200
        assert (await client.get('/api/auth/me', headers=old_token)).json()['permissions'] == []
        created = await client.post('/api/staff/', headers=root, json={'login': 'synthetic-new', 'full_name': 'Synthetic new',
                                   'password': PASSWORD, 'role': 'marketer', 'custom_permissions': ['crm_view'], 'permission_mode': 'explicit'})
        assert created.status_code == 201, created.text
        assert created.json()['permissions'] == ['crm_view']
        absent = await client.post('/api/staff/', headers=root, json={'login': 'synthetic-empty', 'full_name': 'Synthetic empty',
                                  'password': PASSWORD, 'role': 'marketer'})
        assert absent.status_code == 201 and absent.json()['permissions'] == []


@pytest.mark.parametrize('role', list(StaffRole))
async def test_legacy_working_roles_keep_original_grants_and_login(local_stage, role):
    app, db, _ = local_stage
    account(db, 'synthetic-worker', role.value, permissions=['patients_export'])
    original = copy.deepcopy(db.staff.rows)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://synthetic') as client:
        result, headers = await login(client, 'synthetic-worker')
        expected = {p.value for p in ROLE_PERMISSIONS[role]} | {'patients_export'}
        assert set(result['user']['permissions']) == expected
        assert set((await client.get('/api/auth/me', headers=headers)).json()['permissions']) == expected
        assert 'payroll_view' not in expected
        assert (await client.get('/api/staff/synthetic-worker', headers=headers)).status_code == (
            200 if role in (StaffRole.ADMIN, StaffRole.SUPER_ADMIN) else 403)
    assert db.staff.rows == original


@pytest.mark.parametrize('collection', CLINICAL_COLLECTIONS)
@pytest.mark.parametrize('clinic_id,status', [('missing', 200), ('synthetic-clinic', 200), ('foreign-clinic', 403), (None, 403)])
async def test_clinic_preflight_all_known_collections(local_stage, collection, clinic_id, status):
    app, db, _ = local_stage
    account(db, 'synthetic-root', 'super_admin')
    row = {'_id': 'synthetic-probe'}
    if clinic_id != 'missing':
        row['clinic_id'] = clinic_id
    await db[collection].insert_one(row)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://synthetic') as client:
        _, headers = await login(client, 'synthetic-root')
        response = await client.get('/api/staff/synthetic-root', headers=headers)
        assert response.status_code == status, (collection, response.text)


@pytest.mark.parametrize('source', ['users', 'staff'])
@pytest.mark.parametrize('clinic_id,status', [('missing', 200), ('synthetic-clinic', 200), ('foreign-clinic', 403), (None, 403)])
async def test_account_clinic_hydration(local_stage, source, clinic_id, status):
    app, db, _ = local_stage
    account(db, 'synthetic-account', 'admin')
    if clinic_id != 'missing':
        db[source].rows[0]['clinic_id'] = clinic_id
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://synthetic') as client:
        response = await client.post('/api/auth/login', json={'email': 'synthetic-account', 'password': PASSWORD})
        assert response.status_code == status


async def test_authenticated_document_upload_download_and_legacy_export_compatibility(local_stage):
    app, db, directory = local_stage
    account(db, 'synthetic-editor', 'admin', mode='explicit', permissions=['patients_view', 'patients_edit', 'patients_export'])
    account(db, 'synthetic-viewer', 'admin', mode='explicit', permissions=['patients_view'])
    account(db, 'synthetic-crm', 'marketer', mode='explicit', permissions=['crm_view'])
    account(db, 'synthetic-legacy-admin', 'admin')
    account(db, 'synthetic-legacy-exporter', 'admin', permissions=['patients_export'])
    account(db, 'synthetic-own-patient', 'patient', mode='explicit', permissions=['patients_view', 'patients_export'])
    db.users.rows[-1]['patient_id'] = 'synthetic-patient'
    account(db, 'synthetic-other-patient', 'patient', mode='explicit', permissions=['patients_view', 'patients_export'])
    db.users.rows[-1]['patient_id'] = 'other-patient'
    await db.patients.insert_one({'id': 'synthetic-patient', 'full_name': 'Synthetic patient', 'phone': 'synthetic'})
    payload = b'SYNTHETIC DOCUMENT. NO PATIENT DATA.'
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://synthetic') as client:
        _, editor = await login(client, 'synthetic-editor')
        uploaded = await client.post('/api/patients/synthetic-patient/documents', headers=editor,
                                     files={'file': ('synthetic.txt', payload, 'text/plain')})
        assert uploaded.status_code == 200, uploaded.text
        filename = uploaded.json()['filename']
        assert (directory / filename).read_bytes() == payload
        path = '/api/uploads/' + filename
        result = await client.get(path, headers=editor)
        assert result.status_code == 200 and result.content == payload
        assert (await client.get(path)).status_code in (401, 403)
        assert (await client.get('/uploads/' + filename)).status_code == 404
        for identity, status in [('synthetic-viewer', 403), ('synthetic-crm', 403),
                                 ('synthetic-legacy-admin', 403), ('synthetic-legacy-exporter', 200),
                                 ('synthetic-own-patient', 200), ('synthetic-other-patient', 403)]:
            _, headers = await login(client, identity)
            assert (await client.get(path, headers=headers)).status_code == status, identity
        assert (await client.get('/api/uploads/unregistered.txt', headers=editor)).status_code == 404
        assert (await client.get('/api/uploads/..%5Csecret', headers=editor)).status_code == 404
