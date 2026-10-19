"""HTTP schedule creation with an in-memory DB only; run --noconftest -p no:cacheprovider."""
import importlib
import sys
from copy import deepcopy
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest


class Collection:
    def __init__(self, rows=()):
        self.rows = deepcopy(list(rows))

    async def find_one(self, query):
        return next((deepcopy(row) for row in self.rows if matches(row, query)), None)

    def find(self, query):
        return SimpleNamespace(to_list=AsyncMock(return_value=[deepcopy(row) for row in self.rows if matches(row, query)]))

    async def insert_one(self, row):
        self.rows.append(deepcopy(row))


def matches(row, query):
    for key, expected in query.items():
        if key == '$or':
            if not any(matches(row, branch) for branch in expected): return False
        elif isinstance(expected, dict):
            for operator, value in expected.items():
                actual = row.get(key)
                if not {'$lt': lambda: actual < value, '$lte': lambda: actual <= value,
                        '$gt': lambda: actual > value, '$gte': lambda: actual >= value}[operator](): return False
        elif row.get(key) != expected: return False
    return True


@pytest.fixture
def harness(monkeypatch):
    import motor.motor_asyncio
    import pymongo
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    def forbidden(*args, **kwargs): raise AssertionError('Real database access forbidden')
    monkeypatch.setattr(pymongo, 'MongoClient', forbidden)
    monkeypatch.setattr(motor.motor_asyncio, 'AsyncIOMotorClient', forbidden)
    database = ModuleType('database')
    database.db = SimpleNamespace(
        doctors=Collection([dict(id='doctor', is_active=True)]),
        rooms=Collection([dict(id='room', is_active=True), dict(id='inactive', is_active=False)]),
        doctor_schedules=Collection(), room_schedules=Collection())
    monkeypatch.setitem(sys.modules, 'database', database)
    # Load real permission dependencies afresh, isolated from prior auth stubs.
    monkeypatch.delitem(sys.modules, 'routers.auth', raising=False)
    monkeypatch.delitem(sys.modules, 'routers.doctors', raising=False)
    routes = importlib.import_module('routers.doctors')
    monkeypatch.setattr(routes, 'db', database.db)
    from models.auth import UserRole
    user = SimpleNamespace(role=UserRole.SUPER_ADMIN)
    app = FastAPI()
    app.include_router(routes.doctors_router, prefix='/api')
    app.dependency_overrides[routes.get_current_active_user] = lambda: user
    with TestClient(app) as client:
        yield SimpleNamespace(client=client, db=database.db, user=user, roles=UserRole)


def payload(**overrides):
    return dict(doctor_id='doctor', day_of_week=1, start_time='09:00', end_time='18:00', room_id='room', **overrides)


@pytest.mark.parametrize('endpoint', ['/api/doctors/doctor/schedule', '/api/doctors/schedule/with-room'])
@pytest.mark.parametrize('invalid', ['missing', None, '', '   '])
def test_room_required_before_any_write(harness, endpoint, invalid):
    data = payload()
    if invalid == 'missing': data.pop('room_id')
    else: data['room_id'] = invalid
    response = harness.client.post(endpoint, json=data)
    assert response.status_code == 422, response.text
    assert not harness.db.doctor_schedules.rows
    assert not harness.db.room_schedules.rows


@pytest.mark.parametrize('endpoint', ['/api/doctors/doctor/schedule', '/api/doctors/schedule/with-room'])
def test_valid_room_creates_both_schedules_and_preserves_url_doctor(harness, endpoint):
    data = payload()
    if endpoint.endswith('/doctor/schedule'): data['doctor_id'] = 'ignored-body-doctor'
    response = harness.client.post(endpoint, json=data)
    assert response.status_code == 200, response.text
    assert harness.db.doctor_schedules.rows[0]['doctor_id'] == 'doctor'
    assert harness.db.room_schedules.rows[0]['room_id'] == 'room'


@pytest.mark.parametrize('room', ['missing-room', 'inactive'])
def test_invalid_room_cannot_create_a_schedule(harness, room):
    data = payload(); data['room_id'] = room
    response = harness.client.post('/api/doctors/schedule/with-room', json=data)
    assert response.status_code == 404
    assert not harness.db.doctor_schedules.rows


def test_room_conflict_blocks_both_writes(harness):
    harness.db.room_schedules.rows.append(dict(room_id='room', doctor_id='other', day_of_week=1,
        start_time='10:00', end_time='11:00', is_active=True))
    response = harness.client.post('/api/doctors/schedule/with-room', json=payload())
    assert response.status_code == 400
    assert not harness.db.doctor_schedules.rows
    assert len(harness.db.room_schedules.rows) == 1


def test_existing_authorization_is_preserved(harness):
    harness.user.role = harness.roles.PATIENT
    response = harness.client.post('/api/doctors/schedule/with-room', json=payload())
    assert response.status_code == 403
    assert not harness.db.doctor_schedules.rows


def test_historical_roomless_records_and_partial_update_remain_valid():
    from models.doctor import DoctorSchedule, DoctorScheduleUpdate, DoctorScheduleBulkUpdate
    assert DoctorSchedule(doctor_id='old', day_of_week=1, start_time='09:00', end_time='18:00')
    assert DoctorScheduleUpdate(start_time='10:00').start_time == '10:00'
    assert DoctorScheduleBulkUpdate(schedule_ids=['old'], start_time='10:00').room_id is None
