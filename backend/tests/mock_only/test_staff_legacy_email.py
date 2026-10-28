"""Legacy contact data must not break permission edits or relax write guards.

All storage and authentication fixtures are synthetic and local to each test.
"""
import copy
from types import SimpleNamespace

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

import database
from api_permissions import install_api_permissions
from permission_staging_app import MemoryDB, account
from routers import auth, staff
from services.staff_service import StaffService


@pytest_asyncio.fixture
async def ctx(monkeypatch):
    db = MemoryDB()
    account(db, 'synthetic-admin', 'super_admin',
            permissions=['staff_view', 'staff_edit'], mode='explicit')
    account(db, 'synthetic-doctor', 'doctor',
            permissions=['patients_view'], mode='explicit')
    db.doctors.rows.append(dict(id='synthetic-doctor', full_name='Synthetic Doctor', is_active=True))
    monkeypatch.setattr(StaffService, '_hash_password', lambda *_: 'synthetic-hash')
    app = FastAPI(redirect_slashes=False)
    app.add_middleware(CORSMiddleware, allow_origins=['https://synthetic-ui.invalid'],
                       allow_methods=['*'], allow_headers=['*'])
    app.include_router(staff.router)
    install_api_permissions(app)
    for dependency in (database.get_database, auth.get_database, staff.get_database):
        app.dependency_overrides[dependency] = lambda: db
    token = auth.create_access_token({'sub': 'synthetic-admin', 'sub_type': 'user_id'})
    headers = {'Authorization': 'Bearer ' + token, 'Origin': 'https://synthetic-ui.invalid'}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                base_url='http://synthetic', headers=headers) as client:
        yield SimpleNamespace(db=db, client=client)


def set_target_email(db, value):
    for collection in (db.staff, db.users):
        collection.rows[-1]['email'] = value


@pytest.mark.parametrize('email', ['', '   ', 'not-an-email', 'legacy-login', None])
@pytest.mark.parametrize('users_only', [False, True])
async def test_legacy_email_can_be_read_and_permissions_replaced(ctx, email, users_only):
    set_target_email(ctx.db, email)
    if users_only:
        ctx.db.staff.rows.pop()
    before = copy.deepcopy({name: collection.rows for name, collection in ctx.db.collections.items() if collection.rows})
    fetched = await ctx.client.get('/api/staff/synthetic-doctor')
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()['email'] is None
    assert fetched.json()['permissions'] == ['patients_view']
    assert before == {name: collection.rows for name, collection in ctx.db.collections.items() if collection.rows}

    # Both replacement and explicit deny-all must survive reopening.
    for selected in (['patients_view', 'calendar_view'], []):
        saved = await ctx.client.put('/api/staff/synthetic-doctor', json={
            'permission_mode': 'explicit', 'custom_permissions': selected})
        assert saved.status_code == 200, saved.text
        assert saved.headers['access-control-allow-origin'] == 'https://synthetic-ui.invalid'
        assert saved.json()['email'] is None
        assert saved.json()['custom_permissions'] == selected
        assert set(saved.json()['permissions']) == set(selected)
        for collection in (ctx.db.staff, ctx.db.users):
            row = await collection.find_one({'_id': 'synthetic-doctor'})
            assert row['email'] == email, 'permission edit must preserve the stored address'
            assert row['custom_permissions'] == selected
            assert row['role'] == 'doctor'
        reopened = await ctx.client.get('/api/staff/synthetic-doctor')
        assert reopened.status_code == 200
        assert reopened.json()['custom_permissions'] == selected


async def test_staff_list_tolerates_legacy_email_without_rewriting_storage(ctx):
    set_target_email(ctx.db, 'legacy-login')
    response = await ctx.client.get('/api/staff/')
    assert response.status_code == 200, response.text
    target = next(row for row in response.json() if row['id'] == 'synthetic-doctor')
    assert target['email'] is None
    assert ctx.db.staff.rows[-1]['email'] == 'legacy-login'


async def test_valid_existing_email_remains_visible_and_unchanged(ctx):
    set_target_email(ctx.db, 'doctor@example.com')
    response = await ctx.client.get('/api/staff/synthetic-doctor')
    assert response.status_code == 200
    assert response.json()['email'] == 'doctor@example.com'
    assert ctx.db.staff.rows[-1]['email'] == 'doctor@example.com'


@pytest.mark.parametrize('invalid', ['', 'not-an-email', 'broken@'])
async def test_new_or_changed_invalid_email_is_still_422_and_writes_nothing(ctx, invalid):
    set_target_email(ctx.db, 'legacy-login')
    before = copy.deepcopy({name: collection.rows for name, collection in ctx.db.collections.items() if collection.rows})
    responses = [
        await ctx.client.post('/api/staff/', json={
            'login': 'synthetic-new', 'full_name': 'Synthetic New', 'password': 'synthetic-only',
            'role': 'marketer', 'email': invalid}),
        await ctx.client.put('/api/staff/synthetic-doctor', json={
            'email': invalid, 'custom_permissions': ['patients_view', 'calendar_view']})]
    assert [response.status_code for response in responses] == [422, 422]
    assert all(any(error['loc'][-1] == 'email' for error in response.json()['detail'])
               for response in responses)
    assert before == {name: collection.rows for name, collection in ctx.db.collections.items() if collection.rows}


async def test_valid_new_and_changed_email_remain_strictly_supported(ctx):
    set_target_email(ctx.db, 'legacy-login')
    updated = await ctx.client.put('/api/staff/synthetic-doctor', json={'email': 'corrected@example.com'})
    assert updated.status_code == 200, updated.text
    assert updated.json()['email'] == 'corrected@example.com'
    for collection in (ctx.db.staff, ctx.db.users):
        assert (await collection.find_one({'_id': 'synthetic-doctor'}))['email'] == 'corrected@example.com'
    created = await ctx.client.post('/api/staff/', json={
        'login': 'synthetic-new', 'full_name': 'Synthetic New', 'password': 'synthetic-only',
        'role': 'marketer', 'email': 'new@example.com'})
    assert created.status_code == 201, created.text
    assert created.json()['email'] == 'new@example.com'


@pytest.mark.parametrize('reason', ['missing_edit', 'higher_target', 'unowned_grant', 'self_access'])
async def test_legacy_email_does_not_weaken_403_guards(ctx, reason):
    set_target_email(ctx.db, 'legacy-login')
    for collection in (ctx.db.staff, ctx.db.users):
        collection.rows[0].update(role='admin', custom_permissions=['staff_view', 'staff_edit', 'patients_view'])
    target = 'synthetic-doctor'
    selected = ['patients_view']
    if reason == 'missing_edit':
        for collection in (ctx.db.staff, ctx.db.users):
            collection.rows[0]['custom_permissions'] = ['staff_view', 'patients_view']
    elif reason == 'higher_target':
        ctx.db.staff.rows[-1]['role'] = 'super_admin'
    elif reason == 'unowned_grant':
        selected.append('payroll_view')
    else:
        target = 'synthetic-admin'
    before = copy.deepcopy({name: collection.rows for name, collection in ctx.db.collections.items() if collection.rows})
    response = await ctx.client.put('/api/staff/' + target, json={
        'permission_mode': 'explicit', 'custom_permissions': selected})
    assert response.status_code == 403, response.text
    assert response.headers['access-control-allow-origin'] == 'https://synthetic-ui.invalid'
    assert before == {name: collection.rows for name, collection in ctx.db.collections.items() if collection.rows}


@pytest.mark.parametrize('payload', [{'custom_permissions': ['unknown-permission']},
                                     {'custom_permissions': None}, {'permission_mode': None}])
async def test_legacy_email_does_not_weaken_422_access_validation(ctx, payload):
    set_target_email(ctx.db, 'legacy-login')
    response = await ctx.client.put('/api/staff/synthetic-doctor', json=payload)
    assert response.status_code == 422
    assert ctx.db.staff.rows[-1]['custom_permissions'] == ['patients_view']


async def test_other_corrupt_fields_are_not_silently_repaired(ctx):
    from pydantic import ValidationError
    set_target_email(ctx.db, 'legacy-login')
    ctx.db.staff.rows[-1]['custom_permissions'] = None
    with pytest.raises(ValidationError):
        await StaffService(ctx.db).get_staff_by_id('synthetic-doctor')
