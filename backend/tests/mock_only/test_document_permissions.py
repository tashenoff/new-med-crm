"""Real document router/service and permission boundary; no Mongo or network.

Run with --noconftest. Uploads contain synthetic bytes and live in tmp_path only.
"""
import copy
import importlib
import socket
import sys
from types import ModuleType, SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_):
        return self

    async def to_list(self, limit):
        return copy.deepcopy(self.rows[:limit])


class Collection:
    def __init__(self):
        self.rows = []

    @staticmethod
    def matches(row, query):
        for key, value in query.items():
            if key == '$or':
                if not any(Collection.matches(row, part) for part in value):
                    return False
            elif isinstance(value, dict):
                if '$exists' in value and (key in row) != value['$exists']:
                    return False
                if '$ne' in value and row.get(key) == value['$ne']:
                    return False
            elif row.get(key) != value:
                return False
        return True

    async def find_one(self, query, *_):
        return next((copy.deepcopy(row) for row in self.rows if self.matches(row, query)), None)

    def find(self, query):
        return Cursor([row for row in self.rows if self.matches(row, query)])

    async def insert_one(self, row):
        self.rows.append(copy.deepcopy(row))

    async def update_one(self, query, update):
        for row in self.rows:
            if self.matches(row, query):
                row.update(copy.deepcopy(update['$set']))

    async def delete_one(self, query):
        self.rows = [row for row in self.rows if not self.matches(row, query)]


class DB:
    def __init__(self):
        self.collections = {}

    def __getitem__(self, key):
        return self.collections.setdefault(key, Collection())

    def __getattr__(self, key):
        return self[key]


@pytest.fixture
def stage(monkeypatch, tmp_path):
    import motor.motor_asyncio
    import pymongo

    def forbidden(*_, **__):
        raise AssertionError('Real database/network forbidden in document regression')

    monkeypatch.setattr(pymongo, 'MongoClient', forbidden)
    monkeypatch.setattr(motor.motor_asyncio, 'AsyncIOMotorClient', forbidden)
    monkeypatch.setattr(socket, 'create_connection', forbidden)
    db = DB()
    database = ModuleType('database')
    database.db = db
    database.get_database = lambda: db
    monkeypatch.setitem(sys.modules, 'database', database)
    routes = importlib.import_module('routers.documents')
    auth = importlib.import_module('routers.auth')
    api = importlib.import_module('api_permissions')
    models = importlib.import_module('models.auth')
    # Modules may be cached across cases. Override both services and download DB.
    monkeypatch.setattr(routes, 'db', db)
    monkeypatch.setattr(routes, 'UPLOAD_DIR', tmp_path)
    db.patients.rows = [{'id': 'synthetic-patient'}]
    service = routes.DocumentService(db, tmp_path)
    app = FastAPI()
    app.include_router(routes.documents_router, prefix='/api')
    api.install_api_permissions(app)
    async def get_db():
        return db
    app.dependency_overrides[api.get_database] = get_db
    app.dependency_overrides[routes.get_document_service] = lambda: service
    def set_user(role='super_admin', permissions=(), active=True, patient_id=None):
        user = models.UserInDB(id='synthetic-user', full_name='Synthetic user', role=role,
                              hashed_password='synthetic', permissions=list(permissions),
                              is_active=active, patient_id=patient_id)
        app.dependency_overrides[auth.get_current_active_user] = lambda: user
        return user
    set_user()
    return SimpleNamespace(app=app, db=db, set_user=set_user, uploads=tmp_path, auth=auth)


async def upload(client):
    return await client.post('/api/patients/synthetic-patient/documents',
                             files={'file': ('synthetic.txt', b'synthetic document only', 'text/plain')},
                             data={'description': 'Synthetic document'})


@pytest.mark.parametrize('role', ['super_admin', 'admin', 'doctor'])
async def test_upload_list_update_download_and_delete(stage, role):
    stage.set_user(role, ['patients_view', 'patients_edit', 'patients_export', 'patients_delete'])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(stage.app), base_url='http://synthetic') as client:
        created = await upload(client)
        assert created.status_code == 200, created.text
        document = created.json()
        assert document['original_filename'] == 'synthetic.txt'
        assert document['uploaded_by'] == 'synthetic-user'
        assert document['file_size'] == len(b'synthetic document only')
        listed = await client.get('/api/patients/synthetic-patient/documents')
        assert listed.status_code == 200, listed.text
        assert [row['id'] for row in listed.json()] == [document['id']]
        changed = await client.put('/api/documents/' + document['id'], json={'description':'Changed synthetic'})
        assert changed.status_code == 200, changed.text
        assert changed.json()['description'] == 'Changed synthetic'
        downloaded = await client.get('/api/uploads/' + document['filename'])
        assert downloaded.status_code == 200, downloaded.text
        assert downloaded.content == b'synthetic document only'
        deleted = await client.delete('/api/documents/' + document['id'])
        assert deleted.status_code == 200, deleted.text
        assert stage.db.documents.rows == []
        assert list(stage.uploads.iterdir()) == []


@pytest.mark.parametrize('role,permissions,active', [
    ('admin', [], True), ('doctor', ['patients_view'], True),
    ('admin', ['patients_edit'], True), ('super_admin', [], False),
    ('marketer', ['crm_view', 'crm_edit'], True),
    ('patient', ['patients_view', 'patients_edit'], True),
])
async def test_upload_denials_have_no_persistence(stage, role, permissions, active):
    stage.set_user(role, permissions, active)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(stage.app), base_url='http://synthetic') as client:
        denied = await upload(client)
        assert denied.status_code == 403, denied.text
        assert stage.db.documents.rows == []
        assert list(stage.uploads.iterdir()) == []


async def test_delete_and_download_keep_separate_grants(stage):
    stage.set_user('admin', ['patients_view', 'patients_edit'])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(stage.app), base_url='http://synthetic') as client:
        created = (await upload(client)).json()
        assert (await client.delete('/api/documents/' + created['id'])).status_code == 403
        assert (await client.get('/api/uploads/' + created['filename'])).status_code == 403
        assert len(stage.db.documents.rows) == 1
        assert (stage.uploads / created['filename']).exists()


async def test_active_super_admin_uses_canonical_access_without_stored_grants(stage):
    stage.set_user('super_admin', [])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(stage.app), base_url='http://synthetic') as client:
        assert (await upload(client)).status_code == 200
        assert (await client.get('/api/patients/synthetic-patient/documents')).status_code == 200


async def test_patient_ownership_and_unauthenticated_access_remain_blocked(stage):
    stage.set_user('patient', ['patients_view'], patient_id='another-patient')
    async with httpx.AsyncClient(transport=httpx.ASGITransport(stage.app), base_url='http://synthetic') as client:
        assert (await client.get('/api/patients/synthetic-patient/documents')).status_code == 403
        stage.app.dependency_overrides.pop(stage.auth.get_current_active_user)
        assert (await upload(client)).status_code in (401, 403)
        assert stage.db.documents.rows == []
