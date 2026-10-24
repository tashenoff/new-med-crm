"""Local QA only: production routers/auth/services, strict in-memory storage.

No lifespan, provider clients, reporting grants or real Mongo operations run.
Run as a localhost-only uvicorn factory with --lifespan off.
"""
import copy
import os
import sys
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import bcrypt

PASSWORD = 'synthetic-local-staging'


def matches(row, query):
    for key, value in query.items():
        if key == '$or':
            if not any(matches(row, child) for child in value):
                return False
            continue
        actual = row.get(key)
        if isinstance(value, dict):
            for operator, expected in value.items():
                if operator == '$exists' and (key in row) != expected:
                    return False
                if operator == '$ne' and actual == expected:
                    return False
                if operator == '$nin' and actual in expected:
                    return False
                if operator not in ('$exists', '$ne', '$nin'):
                    raise AssertionError(f'Unsupported synthetic operator: {operator}')
        elif actual != value:
            return False
    return True


class Cursor:
    def __init__(self, rows):
        self.rows = copy.deepcopy(rows)

    def skip(self, count):
        self.rows = self.rows[count:]
        return self

    def limit(self, count):
        self.rows = self.rows[:count]
        return self

    async def to_list(self, length=None):
        return copy.deepcopy(self.rows if length is None else self.rows[:length])

    def __aiter__(self):
        async def iterate():
            for row in self.rows:
                yield copy.deepcopy(row)
        return iterate()


class Collection:
    def __init__(self):
        self.rows = []

    def find(self, query=None, projection=None):
        return Cursor([row for row in self.rows if matches(row, query or {})])

    async def find_one(self, query, projection=None):
        return next((copy.deepcopy(row) for row in self.rows if matches(row, query)), None)

    async def insert_one(self, row):
        self.rows.append(copy.deepcopy(row))
        return SimpleNamespace(inserted_id=row.get('_id'))

    async def update_one(self, query, update):
        assert set(update) <= {'$set', '$unset'}, 'Unsupported synthetic mutation'
        for row in self.rows:
            if matches(row, query):
                row.update(copy.deepcopy(update.get('$set', {})))
                for key in update.get('$unset', {}):
                    row.pop(key, None)
                return SimpleNamespace(matched_count=1, modified_count=1)
        return SimpleNamespace(matched_count=0, modified_count=0)


class MemoryDB:
    def __init__(self):
        self.collections = {}

    def __getitem__(self, name):
        return self.collections.setdefault(name, Collection())

    def __getattr__(self, name):
        return self[name]


def account(db, identity, role, *, permissions=None, mode=None, clinic_id=None):
    row = dict(_id=identity, login=identity, full_name='Synthetic ' + identity,
               role=role, is_active=True, hashed_password=bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(rounds=4)).decode(),
               created_at=datetime.utcnow(), updated_at=datetime.utcnow())
    if permissions is not None:
        row['custom_permissions'] = list(permissions)
    if mode is not None:
        row['permission_mode'] = mode
    if clinic_id is not None:
        row['clinic_id'] = clinic_id
    db.users.rows.append(copy.deepcopy(row))
    db.staff.rows.append(copy.deepcopy(row))
    return row


def configure(monkeypatch, upload_dir):
    monkeypatch.setenv('WAZZUP24_API_KEY', 'synthetic-no-provider-access')
    monkeypatch.setenv('APP_CLINIC_ID', 'synthetic-clinic')
    monkeypatch.setenv('MONGO_URL', 'mongodb://localhost:27017/permission_synthetic')
    monkeypatch.setenv('DB_NAME', 'permission_synthetic')
    import server
    import database
    from routers import auth, documents
    db = MemoryDB()
    # Replace imported DB references as well as dependencies. Any unsupported
    # operation fails in memory rather than connecting to a database.
    for name, module in list(sys.modules.items()):
        if module is not None and (name == 'server' or name == 'database' or name.startswith(('routers.', 'crm.', 'services.'))):
            if 'db' in vars(module):
                monkeypatch.setattr(module, 'db', db)
    monkeypatch.setattr(documents, 'UPLOAD_DIR', Path(upload_dir))
    app = server.app
    original = dict(app.dependency_overrides)
    app.dependency_overrides[database.get_database] = lambda: db
    app.dependency_overrides[auth.get_database] = lambda: db
    # Test owns restoration of the shared app override mapping.
    return app, db, original


def create_app():
    import pytest
    sandbox = os.environ.get('PERMISSION_STAGING_UPLOADS')
    if not sandbox:
        raise RuntimeError('A dedicated synthetic upload directory is required')
    root = Path(sandbox).resolve()
    if 'task-3' not in root.parts:
        raise RuntimeError('Synthetic uploads must stay within task-3')
    root.mkdir(parents=True, exist_ok=True)
    patch = pytest.MonkeyPatch()
    app, db, _ = configure(patch, root)
    account(db, 'synthetic-root', 'super_admin')
    account(db, 'synthetic-legacy-marketer', 'marketer', permissions=['crm_view'])
    app.state.synthetic_db = db
    return app
