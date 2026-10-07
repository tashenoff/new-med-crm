from copy import deepcopy
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
import re
import sys

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from pymongo.errors import OperationFailure

from crm.schemas.kanban_schemas import ColumnName, ColumnOrder, ColumnMove
from crm.services.kanban_service import KanbanService, SYSTEM_COLUMNS, SETTINGS_ID
from crm.services.lead_service import LeadService
from crm.models.lead import LeadStatus


def matches(document, query):
    for key, value in query.items():
        if key == '$or':
            if not any(matches(document, clause) for clause in value):
                return False
        elif isinstance(value, dict):
            current = document.get(key)
            if '$in' in value and current not in value['$in']:
                return False
            if '$nin' in value and current in value['$nin']:
                return False
            if '$regex' in value and not re.search(value['$regex'], current or ''):
                return False
        elif document.get(key) != value:
            return False
    return True


class Collection:
    def __init__(self, documents=None):
        self.documents = deepcopy(documents or [])
        self.fail_update = False

    def find(self, query, **kwargs):
        return SimpleNamespace(to_list=AsyncMock(return_value=deepcopy([
            document for document in self.documents if matches(document, query)
        ])))

    async def find_one(self, query, **kwargs):
        return next((deepcopy(document) for document in self.documents if matches(document, query)), None)

    async def update_one(self, query, update, upsert=False, **kwargs):
        if self.fail_update:
            raise RuntimeError('injected write failure')
        document = next((document for document in self.documents if matches(document, query)), None)
        if document is None and upsert:
            document = dict(query)
            document.update(deepcopy(update.get('$setOnInsert', {})))
            self.documents.append(document)
        elif document is None:
            return SimpleNamespace(matched_count=0, modified_count=0)
        document.update(deepcopy(update.get('$set', {})))
        for key in update.get('$unset', {}):
            document.pop(key, None)
        for key, value in update.get('$inc', {}).items():
            document[key] = document.get(key, 0) + value
        return SimpleNamespace(matched_count=1, modified_count=1)


class Session:
    def __init__(self, database):
        self.database = database

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def with_transaction(self, callback, **kwargs):
        saved = {name: deepcopy(collection.documents) for name, collection in self.database.collections.items()}
        try:
            return await callback(self)
        except Exception:
            for name, documents in saved.items():
                self.database.collections[name].documents = documents
            raise


def database(*documents):
    result = SimpleNamespace(system_settings=Collection(), crm_leads=Collection(list(documents)))
    result.collections = {'system_settings': result.system_settings, 'crm_leads': result.crm_leads}
    result.client = SimpleNamespace(start_session=AsyncMock(side_effect=lambda: Session(result)))
    return result


def touch(identifier, day=0, **fields):
    return {**dict(id=identifier, first_name='Patient', phone='77011234567', source='phone',
                   status='new', created_at=datetime(2026, 1, 1) + timedelta(days=day),
                   updated_at=datetime(2026, 1, 1)), **fields}


async def test_shared_defaults_persist_once_and_exclude_legacy_statuses():
    db = database()
    first = await KanbanService(db).columns()
    assert [column['id'] for column in first] == list(SYSTEM_COLUMNS)
    assert [column['manual_move_allowed'] for column in first] == [True, False, False, False, False]
    assert await KanbanService(db).columns() == first
    assert len(db.system_settings.documents) == 1
    assert db.system_settings.documents[0]['_id'] == SETTINGS_ID


async def test_custom_create_rename_and_order_are_shared():
    db = database()
    service = KanbanService(db)
    custom = await service.create('  Follow up  ')
    assert custom['name'] == 'Follow up'
    assert custom['id'].startswith('custom_')
    assert (await KanbanService(db).columns())[-1]['id'] == custom['id']
    await service.rename(custom['id'], 'Callback')
    ids = [custom['id'], 'closed', 'new', 'converted', 'contacted', 'in_progress']
    assert [column['id'] for column in await service.reorder(ids)] == ids
    assert (await KanbanService(db).columns())[0]['name'] == 'Callback'


@pytest.mark.parametrize('identifier', list(SYSTEM_COLUMNS))
async def test_system_titles_and_removal_are_protected(identifier):
    service = KanbanService(database())
    for operation in (lambda: service.rename(identifier, 'Changed'), lambda: service.delete(identifier)):
        with pytest.raises(HTTPException) as error:
            await operation()
        assert error.value.status_code == 400


@pytest.mark.parametrize('name', ['', '  ', 'x' * 101, 'a\nb', 'a\x00b', 123, None])
def test_names_are_validated(name):
    with pytest.raises(ValidationError):
        ColumnName(name=name)


async def test_duplicate_names_and_reserved_system_names_are_rejected():
    service = KanbanService(database())
    await service.create('Callback')
    for name in [' callback ', SYSTEM_COLUMNS['new']]:
        with pytest.raises(HTTPException):
            await service.create(name)


@pytest.mark.parametrize('ids', [[], ['new'] * 5, list(SYSTEM_COLUMNS) + ['unknown'], list(SYSTEM_COLUMNS)[:-1]])
async def test_order_requires_every_current_id_exactly_once(ids):
    service = KanbanService(database())
    original = await service.columns()
    with pytest.raises(HTTPException):
        await service.reorder(ids)
    assert await service.columns() == original


async def test_move_targets_canonical_first_touch_and_leaves_history_unchanged():
    db = database(touch('first'), touch('duplicate', 1))
    service = KanbanService(db)
    custom = await service.create('Callback')
    duplicate = deepcopy(db.crm_leads.documents[1])
    result = await service.move('duplicate', custom['id'])
    assert result == {'lead_id': 'first', 'column_id': custom['id'], 'status': 'new'}
    assert db.crm_leads.documents[0]['kanban_column_id'] == custom['id']
    assert db.crm_leads.documents[1] == duplicate
    await service.move('duplicate', 'new')
    assert 'kanban_column_id' not in db.crm_leads.documents[0]


@pytest.mark.parametrize('status', ['contacted', 'in_progress', 'converted', 'closed', 'rejected', 'qualified', 'lost'])
async def test_nonmanual_sources_cannot_move_even_with_stale_custom_assignment(status):
    doc = touch('first')
    doc['status'] = status
    db = database(doc)
    service = KanbanService(db)
    custom = await service.create('Callback')
    db.crm_leads.documents[0]['kanban_column_id'] = custom['id']
    original = deepcopy(db.crm_leads.documents)
    with pytest.raises(HTTPException) as error:
        await service.move('first', 'new')
    assert error.value.status_code == 400
    assert db.crm_leads.documents == original


@pytest.mark.parametrize('target', ['contacted', 'in_progress', 'converted', 'closed', 'qualified', 'lost', 'rejected', 'missing'])
async def test_nonmanual_or_unknown_destinations_are_rejected(target):
    service = KanbanService(database(touch('first')))
    with pytest.raises(HTTPException):
        await service.move('first', target)


async def test_custom_to_custom_and_missing_lead():
    service = KanbanService(database(touch('first')))
    first = await service.create('First')
    second = await service.create('Second')
    await service.move('first', first['id'])
    assert (await service.move('first', second['id']))['column_id'] == second['id']
    with pytest.raises(HTTPException) as error:
        await service.move('missing', 'new')
    assert error.value.status_code == 404


async def test_delete_reports_card_count_and_atomically_returns_canonical_cards_to_new():
    db = database(touch('first'), touch('history', 1), touch('other', phone=None))
    service = KanbanService(db)
    custom = await service.create('Callback')
    await service.move('history', custom['id'])
    await service.move('other', custom['id'])
    assert (await service.columns())[-1]['affected_count'] == 2
    history = deepcopy(db.crm_leads.documents[1])
    assert await service.delete(custom['id']) == {'id': custom['id'], 'affected_count': 2}
    assert len(await service.columns()) == 5
    assert db.crm_leads.documents[1] == history
    assert all('kanban_column_id' not in doc for doc in db.crm_leads.documents)


async def test_delete_rolls_back_configuration_and_cards_on_failure():
    db = database(touch('first'))
    service = KanbanService(db)
    custom = await service.create('Callback')
    await service.move('first', custom['id'])
    original = deepcopy([db.system_settings.documents, db.crm_leads.documents])
    db.crm_leads.fail_update = True
    with pytest.raises(RuntimeError):
        await service.delete(custom['id'])
    assert [db.system_settings.documents, db.crm_leads.documents] == original


@pytest.mark.parametrize('status', [LeadStatus.CONTACTED, LeadStatus.IN_PROGRESS, LeadStatus.CONVERTED, LeadStatus.CLOSED])
async def test_system_status_event_overrides_custom_on_canonical_only(status):
    doc = touch('first', kanban_column_id='custom_old')
    db = database(doc, touch('history', 1))
    history = deepcopy(db.crm_leads.documents[1])
    result = await LeadService(db).update_lead_status('history', status)
    assert result.id == 'first'
    assert db.crm_leads.documents[0]['status'] == status
    assert 'kanban_column_id' not in db.crm_leads.documents[0]
    assert db.crm_leads.documents[1] == history


def test_payloads_reject_identity_or_system_metadata_changes():
    for schema, payload in [(ColumnName, {'name': 'Name', 'id': 'new'}),
                            (ColumnOrder, {'column_ids': ['new'], 'is_system': False}),
                            (ColumnMove, {'column_id': 'new', 'status': 'closed'})]:
        with pytest.raises(ValidationError):
            schema(**payload)


async def test_corrupt_stored_metadata_cannot_change_system_identity_or_titles():
    db = database()
    db.system_settings.documents = [{'_id': SETTINGS_ID, 'revision': 0,
        'order': ['closed', 'closed', 'lost', 'custom_ok', 'new'],
        'custom_columns': [{'id': 'new', 'name': 'Hacked'}, {'id': 'custom_bad', 'name': ''},
                           {'id': 'custom_ok', 'name': 'Callback'}]}]
    columns = await KanbanService(db).columns()
    assert len(columns) == 6
    assert next(column for column in columns if column['id'] == 'new')['name'] == SYSTEM_COLUMNS['new']
    assert set(column['id'] for column in columns) == set(SYSTEM_COLUMNS) | {'custom_ok'}


async def test_concurrent_config_change_retries_without_losing_other_columns():
    db = database()
    service = KanbanService(db)
    await service.columns()
    original_save = service.save
    calls = 0

    async def save(document, columns, session=None):
        nonlocal calls
        calls += 1
        if calls == 1:
            await KanbanService(db).create('Other staff column')
        return await original_save(document, columns, session)

    service.save = save
    await service.create('My column')
    assert calls == 2
    assert [column['name'] for column in (await service.columns())[-2:]] == ['Other staff column', 'My column']


async def test_transaction_support_error_is_explicit_and_does_not_mutate_cards():
    db = database(touch('first'))
    service = KanbanService(db)
    custom = await service.create('Callback')
    db.client.start_session.side_effect = OperationFailure('transactions not supported', code=20)
    original = deepcopy([db.system_settings.documents, db.crm_leads.documents])
    with pytest.raises(HTTPException) as error:
        await service.move('first', custom['id'])
    assert error.value.status_code == 503
    assert [db.system_settings.documents, db.crm_leads.documents] == original


@pytest.mark.parametrize('event, expected', [('confirmed', 'in_progress'), ('arrived', 'converted'),
                                         ('in_progress', 'converted'), ('completed', 'converted')])
async def test_appointment_events_clear_custom_on_first_touch_not_linked_history(event, expected):
    db = database(touch('first', kanban_column_id='custom_old'),
                  touch('history', 1, converted_to_client_id='client-a'))
    db.crm_clients = Collection([{'id': 'client-a', 'hms_patient_id': 'patient-a'}])
    history = deepcopy(db.crm_leads.documents[1])
    result = await LeadService(db).sync_lead_from_appointment_status('patient-a', event, 'appointment-a')
    assert result.id == 'first'
    assert db.crm_leads.documents[0]['status'] == expected
    assert 'kanban_column_id' not in db.crm_leads.documents[0]
    assert db.crm_leads.documents[1] == history


async def test_paid_plans_clear_custom_on_first_touch_not_linked_history():
    db = database(touch('first', kanban_column_id='custom_old'),
                  touch('history', 1, converted_to_client_id='client-a'))
    db.crm_clients = Collection([{'id': 'client-a', 'hms_patient_id': 'patient-a'}])
    db.treatment_plans = Collection([{'patient_id': 'patient-a', 'payment_status': 'paid', 'paid_amount': 100}])
    history = deepcopy(db.crm_leads.documents[1])
    result = await LeadService(db).sync_lead_from_payment_status('patient-a')
    assert result.id == 'first'
    assert db.crm_leads.documents[0]['status'] == 'closed'
    assert 'kanban_column_id' not in db.crm_leads.documents[0]
    assert db.crm_leads.documents[1] == history


@pytest.mark.parametrize('status', ['qualified', 'rejected', 'lost'])
async def test_delete_never_alters_legacy_leads_or_duplicate_history(status):
    db = database(touch('first'), touch('legacy', phone=None, status=status))
    service = KanbanService(db)
    custom = await service.create('Callback')
    await service.move('first', custom['id'])
    legacy = deepcopy(db.crm_leads.documents[1])
    assert (await service.delete(custom['id']))['affected_count'] == 1
    assert db.crm_leads.documents[1] == legacy


@pytest.mark.parametrize('status', ['contacted', 'in_progress', 'converted', 'closed'])
async def test_legacy_manual_status_routes_cannot_bypass_event_destinations(status):
    from crm.routes import leads
    from crm.schemas.lead_schemas import LeadStatusUpdate, LeadUpdate

    db = database(touch('first'))
    original = deepcopy(db.crm_leads.documents)
    for operation in (lambda: leads.update_lead_status('first', LeadStatusUpdate(status=status), db),
                      lambda: leads.update_lead('first', LeadUpdate(status=status), db)):
        with pytest.raises(HTTPException) as error:
            await operation()
        assert error.value.status_code == 400
    assert db.crm_leads.documents == original


@pytest.mark.parametrize('status', ['in_progress', 'converted'])
async def test_repeated_appointment_event_clears_stale_custom_without_changing_status(status):
    db = database(touch('first', status=status, kanban_column_id='custom_old'),
                  touch('history', 1, converted_to_client_id='client-a'))
    db.crm_clients = Collection([{'id': 'client-a', 'hms_patient_id': 'patient-a'}])
    event = 'confirmed' if status == 'in_progress' else 'arrived'
    await LeadService(db).sync_lead_from_appointment_status('patient-a', event, 'appointment-a')
    assert db.crm_leads.documents[0]['status'] == status
    assert 'kanban_column_id' not in db.crm_leads.documents[0]


async def test_booking_status_update_clears_custom_and_targets_canonical():
    from crm.schemas.lead_schemas import LeadUpdate

    db = database(touch('first', kanban_column_id='custom_old'), touch('history', 1))
    history = deepcopy(db.crm_leads.documents[1])
    result = await LeadService(db).update_lead('history', LeadUpdate(status=LeadStatus.CONTACTED))
    assert result.id == 'first'
    assert db.crm_leads.documents[0]['status'] == 'contacted'
    assert 'kanban_column_id' not in db.crm_leads.documents[0]
    assert db.crm_leads.documents[1] == history


async def test_board_exposes_canonical_assignment_but_system_status_overrides_stale_assignment(monkeypatch):
    from crm.routes import leads
    from crm.schemas.lead_schemas import LeadResponse

    db = database(touch('first', kanban_column_id='custom_first'),
                  touch('history', 1, kanban_column_id='custom_history'),
                  touch('booked', phone=None, status='contacted', kanban_column_id='custom_stale'))

    async def response(lead, database, strict_identity=False):
        return LeadResponse(**lead.dict(), full_name=lead.full_name)

    monkeypatch.setattr(leads, 'lead_to_response', response)
    monkeypatch.setattr(leads, 'resolve_group_patients', AsyncMock(return_value=[None, None]))
    monkeypatch.setattr(leads, 'load_group_calls', AsyncMock(return_value=[[], []]))
    cards = await leads.get_kanban_leads(db)
    assert next(card for card in cards if card.id == 'first').kanban_column_id == 'custom_first'
    assert next(card for card in cards if card.id == 'booked').kanban_column_id is None


@pytest.fixture
def http_client():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from crm.routes import crm_router
    from crm.dependencies import get_database
    from routers.auth import get_current_active_user

    db = database(touch('first'), touch('history', 1))
    app = FastAPI()
    app.include_router(crm_router, prefix='/api/crm')
    app.dependency_overrides[get_database] = lambda: db
    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(id='staff-a', role='doctor')
    with TestClient(app) as client:
        yield client, db, app


def test_http_contract_routes_shapes_shared_config_and_delete_confirmation(http_client):
    client, db, app = http_client
    from routers.auth import get_current_active_user

    prefix = '/api/crm/kanban/columns'
    response = client.get(prefix)
    assert response.status_code == 200
    assert set(response.json()[0]) == {'id', 'name', 'is_system', 'manual_move_allowed', 'affected_count'}
    created = client.post(prefix, json={'name': 'Callback'})
    assert created.status_code == 201
    identifier = created.json()['id']
    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(id='staff-b', role='admin')
    assert client.get(prefix).json()[-1]['id'] == identifier
    assert client.patch(f'{prefix}/{identifier}', json={'name': 'Follow up'}).json()['name'] == 'Follow up'
    ids = [identifier, *SYSTEM_COLUMNS]
    ordered = client.put(f'{prefix}/order', json={'column_ids': ids})
    assert ordered.status_code == 200
    assert [column['id'] for column in ordered.json()] == ids
    moved = client.patch('/api/crm/leads/history/kanban-column', json={'column_id': identifier})
    assert moved.status_code == 200
    assert moved.json() == {'lead_id': 'first', 'column_id': identifier, 'status': 'new'}
    assert client.get(prefix).json()[0]['affected_count'] == 1
    deleted = client.delete(f'{prefix}/{identifier}')
    assert deleted.status_code == 200
    assert deleted.json() == {'id': identifier, 'affected_count': 1}
    assert 'kanban_column_id' not in db.crm_leads.documents[0]


@pytest.mark.parametrize('method, path, payload', [
    ('post', '/api/crm/kanban/columns', {'name': ' '}),
    ('patch', '/api/crm/kanban/columns/new', {'name': 'Change'}),
    ('delete', '/api/crm/kanban/columns/closed', None),
    ('put', '/api/crm/kanban/columns/order', {'column_ids': ['new']}),
    ('patch', '/api/crm/leads/first/kanban-column', {'column_id': 'closed'}),
    ('patch', '/api/crm/leads/first/kanban-column', {'column_id': 'new', 'status': 'closed'}),
])
def test_http_rejects_invalid_changes(http_client, method, path, payload):
    client, db, app = http_client
    original = deepcopy(db.crm_leads.documents)
    response = client.request(method, path, json=payload)
    assert response.status_code in (400, 422)
    assert db.crm_leads.documents == original


@pytest.mark.parametrize('method, path, payload', [
    ('get', '/api/crm/kanban/columns', None),
    ('post', '/api/crm/kanban/columns', {'name': 'Name'}),
    ('patch', '/api/crm/kanban/columns/custom_missing', {'name': 'Name'}),
    ('put', '/api/crm/kanban/columns/order', {'column_ids': []}),
    ('delete', '/api/crm/kanban/columns/custom_missing', None),
    ('patch', '/api/crm/leads/first/kanban-column', {'column_id': 'new'}),
])
def test_new_routes_require_authentication(http_client, method, path, payload):
    from routers.auth import get_current_active_user

    client, db, app = http_client
    app.dependency_overrides.pop(get_current_active_user)
    response = client.request(method, path, json=payload)
    assert response.status_code == 403
    assert db.system_settings.documents == []


@pytest.mark.parametrize('method, path', [('patch', '/api/crm/leads/history/status'),
                                       ('put', '/api/crm/leads/history')])
def test_legacy_routes_move_to_unparsed_on_canonical_only(http_client, method, path, monkeypatch):
    from crm.routes import leads
    from crm.schemas.lead_schemas import LeadResponse

    async def response(lead, database, strict_identity=False):
        return LeadResponse(**lead.dict(), full_name=lead.full_name)

    monkeypatch.setattr(leads, 'lead_to_response', response)
    client, db, app = http_client
    created = client.post('/api/crm/kanban/columns', json={'name': 'Callback'}).json()
    client.patch('/api/crm/leads/history/kanban-column', json={'column_id': created['id']})
    original = deepcopy(db.crm_leads.documents[1])
    response = client.request(method, path, json={'status': 'new'})
    assert response.status_code == 200
    assert response.json()['id'] == 'first'
    assert 'kanban_column_id' not in db.crm_leads.documents[0]
    assert db.crm_leads.documents[1] == original


async def test_order_payload_cannot_omit_a_concurrently_added_custom_column():
    service = KanbanService(database())
    await service.create('Other staff column')
    with pytest.raises(HTTPException) as error:
        await service.reorder(list(SYSTEM_COLUMNS))
    assert error.value.status_code == 400


async def test_counts_use_canonical_cards_and_system_status_wins_over_stale_assignment():
    db = database(touch('first', status='contacted', kanban_column_id='custom_stale'),
                  touch('history', 1), touch('other', phone=None, status='closed'))
    columns = await KanbanService(db).columns()
    counts = {column['id']: column['affected_count'] for column in columns}
    assert counts == dict(new=0, contacted=1, in_progress=0, converted=0, closed=1)


@pytest.mark.parametrize('method, path', [('patch', '/api/crm/leads/history/status'),
                                       ('put', '/api/crm/leads/history')])
def test_legacy_routes_cannot_manually_pull_event_driven_cards_to_unparsed(http_client, method, path):
    client, db, app = http_client
    db.crm_leads.documents[0]['status'] = 'closed'
    original = deepcopy(db.crm_leads.documents)
    response = client.request(method, path, json={'status': 'new'})
    assert response.status_code == 400
    assert db.crm_leads.documents == original


async def test_calendar_booking_clears_custom_on_canonical_and_keeps_duplicate_history(monkeypatch):
    from routers import appointments
    from models.appointment import AppointmentCreate

    db = database(touch('history', 1), touch('first', kanban_column_id='custom_old'))
    db.patients = Collection([{'id': 'patient-a', 'phone': '77011234567', 'full_name': 'Patient'}])
    db.doctors = Collection([{'id': 'doctor-a', 'is_active': True}])
    db.appointments = Collection()
    db.appointments.insert_one = AsyncMock()
    db.room_schedules = Collection()
    monkeypatch.setattr(appointments, 'check_doctor_availability', AsyncMock(return_value=(True, 'Available')))
    sender = SimpleNamespace(send_appointment_created_notification=AsyncMock())
    monkeypatch.setitem(sys.modules, 'services.notification_sender', SimpleNamespace(NotificationSender=lambda db: sender))
    history = deepcopy(db.crm_leads.documents[0])
    result = await appointments.create_appointment(AppointmentCreate(
        patient_id='patient-a', doctor_id='doctor-a', appointment_date='2026-10-08', appointment_time='10:00',
    ), SimpleNamespace(role='admin'), db)
    assert result.patient_id == 'patient-a'
    assert db.crm_leads.documents[1]['status'] == 'contacted'
    assert db.crm_leads.documents[1]['converted_to_appointment_id'] == result.id
    assert 'kanban_column_id' not in db.crm_leads.documents[1]
    assert db.crm_leads.documents[0] == history


def test_patient_account_cannot_edit_shared_staff_configuration(http_client):
    from routers.auth import get_current_active_user

    client, db, app = http_client
    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(id='patient-a', role='patient')
    for method, path, payload in [
        ('get', '/api/crm/kanban/columns', None),
        ('post', '/api/crm/kanban/columns', {'name': 'Callback'}),
        ('patch', '/api/crm/leads/first/kanban-column', {'column_id': 'new'}),
    ]:
        assert client.request(method, path, json=payload).status_code == 403
    assert db.system_settings.documents == []


@pytest.mark.parametrize('role', ['super_admin', 'admin', 'doctor', 'marketer', 'administrator'])
def test_all_clinic_staff_roles_access_the_same_defaults(http_client, role):
    from routers.auth import get_current_active_user

    client, db, app = http_client
    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(id=role, role=role)
    response = client.get('/api/crm/kanban/columns')
    assert response.status_code == 200
    assert [column['id'] for column in response.json()] == list(SYSTEM_COLUMNS)
