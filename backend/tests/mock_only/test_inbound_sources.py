"""Use --noconftest. No MongoDB clients, sockets, provider calls or real records."""
import asyncio
from copy import deepcopy
import importlib
from pathlib import Path
import re
import socket
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI, HTTPException, Request
from httpx import ASGITransport, AsyncClient
from pymongo.errors import DuplicateKeyError


DID = '+77011234567'
CALLER = '+77017654321'


def matches(document, query):
    for key, expected in query.items():
        actual = document.get(key)
        if key == '$or':
            if not any(matches(document, condition) for condition in expected): return False
        elif isinstance(expected, dict):
            if '$exists' in expected and (key in document) != expected['$exists']: return False
            if '$in' in expected and actual not in expected['$in']: return False
            if '$ne' in expected and actual == expected['$ne']: return False
            if '$regex' in expected and not re.search(expected['$regex'], actual or ''): return False
        elif actual != expected: return False
    return True


class Cursor:
    def __init__(self, records): self.records = deepcopy(records)
    def sort(self, key, direction):
        self.records.sort(key=lambda row: row.get(key, ''), reverse=direction < 0)
        return self
    def limit(self, count): self.records = self.records[:count]; return self
    async def to_list(self, length=None): return deepcopy(self.records if length is None else self.records[:length])
    def __aiter__(self): self.iterator = iter(self.records); return self
    async def __anext__(self):
        try: return next(self.iterator)
        except StopIteration: raise StopAsyncIteration


class Collection:
    def __init__(self, documents=()): self.documents = deepcopy(list(documents))
    def find(self, query, *args): return Cursor([row for row in self.documents if matches(row, query)])
    async def find_one(self, query, *args):
        return deepcopy(next((row for row in self.documents if matches(row, query)), None))
    async def insert_one(self, document):
        if '_id' in document and any(row.get('_id') == document['_id'] for row in self.documents):
            raise DuplicateKeyError('duplicate _id')
        document = deepcopy(document)
        document.setdefault('_id', 'memory-' + str(len(self.documents)))
        self.documents.append(document)
        return SimpleNamespace(inserted_id=document['_id'])
    async def update_one(self, query, update, **kwargs):
        row = next((row for row in self.documents if matches(row, query)), None)
        if row is None: return SimpleNamespace(matched_count=0, modified_count=0)
        row.update(deepcopy(update.get('$set', {})))
        return SimpleNamespace(matched_count=1, modified_count=1)
    async def delete_one(self, query):
        row = next((row for row in self.documents if matches(row, query)), None)
        if row is None: return SimpleNamespace(deleted_count=0)
        self.documents.remove(row)
        return SimpleNamespace(deleted_count=1)
    async def count_documents(self, query):
        return sum(matches(document, query) for document in self.documents)


class Database:
    def __init__(self):
        self.collections = {}
        self.crm_sources = Collection([
            dict(id='source-a', name='2GIS', type='advertising', status='active'),
            dict(id='source-b', name='Сайт', type='website', status='active'),
            dict(id='inactive', name='Закрытый', type='other', status='inactive')
        ])
    def __getattr__(self, name): return self.collections.setdefault(name, Collection())


@pytest.fixture
def fixture(monkeypatch):
    import motor.motor_asyncio
    import pymongo
    def forbidden(*args, **kwargs): raise AssertionError('Database/network access forbidden')
    monkeypatch.setattr(pymongo, 'MongoClient', forbidden)
    monkeypatch.setattr(motor.motor_asyncio, 'AsyncIOMotorClient', forbidden)
    monkeypatch.setattr(socket, 'create_connection', forbidden)
    root = Path(__file__).parents[2]
    monkeypatch.syspath_prepend(str(root))
    for name in ['crm', 'crm.routes', 'crm.services', 'routers', 'models', 'services']:
        package = ModuleType(name)
        package.__path__ = [str(root.joinpath(*name.split('.')))]
        monkeypatch.setitem(sys.modules, name, package)
    db = Database()
    database = ModuleType('database')
    database.db = db
    database.get_database = lambda: db
    monkeypatch.setitem(sys.modules, 'database', database)
    dependencies = ModuleType('crm.dependencies')
    dependencies.get_database = database.get_database
    monkeypatch.setitem(sys.modules, 'crm.dependencies', dependencies)
    app_dependencies = ModuleType('dependencies')
    app_dependencies.get_current_user = lambda: SimpleNamespace(id='staff', role='admin')
    monkeypatch.setitem(sys.modules, 'dependencies', app_dependencies)
    for name in ['routers.telephony', 'crm.routes.inbound_sources']:
        monkeypatch.delitem(sys.modules, name, raising=False)
    mappings = importlib.import_module('crm.services.inbound_source_service')
    routes = importlib.import_module('crm.routes.inbound_sources')
    auth = importlib.import_module('routers.auth')
    telephony = importlib.import_module('routers.telephony')
    lead_service = importlib.import_module('crm.services.lead_service')
    monkeypatch.setattr(lead_service.LeadService, '_create_initial_task', AsyncMock())
    monkeypatch.setattr(telephony, '_download_call_record', AsyncMock(return_value=(None, None)))
    app = FastAPI()
    app.include_router(routes.inbound_sources_router, prefix='/api/crm')
    app.include_router(telephony.router)
    async def current_user(request: Request):
        role = request.headers.get('authorization', '').removeprefix('Bearer ')
        if not role: raise HTTPException(401, 'Authentication required')
        return SimpleNamespace(id='test-user', role=role, is_active=role != 'inactive', password_expires_at=None)
    app.dependency_overrides[auth.get_current_user] = current_user
    return SimpleNamespace(db=db, mappings=mappings, service=mappings.InboundSourceService(db), app=app, telephony=telephony)


def run(coroutine): return asyncio.run(coroutine)


@pytest.mark.parametrize('raw,expected', [
    ('+7 (701) 123-45-67', DID), ('+44 20 7946 0123', '+442079460123'),
    ('+1 (415) 555-2671', '+14155552671')
])
def test_international_normalization(fixture, raw, expected):
    assert fixture.mappings.international_number(raw) == expected


@pytest.mark.parametrize('raw', ['87011234567', '7011234567', '77011234567', '+999123456789', '+0001234567',
    '+120012301', '+7 701 1234567 ext 4', '+7/7011234567', '+７７０１１２３４５６７', 77011234567, None])
def test_no_country_guessing_and_invalid_numbers(fixture, raw):
    with pytest.raises(ValueError): fixture.mappings.international_number(raw)


def test_provider_did_only_accepts_valid_international_country_code(fixture):
    assert fixture.mappings.international_number('77011234567', provider=True) == DID
    with pytest.raises(ValueError): fixture.mappings.international_number('87011234567', provider=True)


def test_mapping_duplicates_and_database_isolation(fixture):
    async def scenario():
        await fixture.service.create('+7 (701) 123-45-67', 'source-a', 'admin')
        with pytest.raises(HTTPException) as error:
            await fixture.service.create(DID, 'source-b', 'admin')
        assert error.value.status_code == 409
        other = fixture.mappings.InboundSourceService(Database())
        await other.create(DID, 'source-b', 'admin')
        assert (await fixture.service.attribution('77011234567'))['source_id'] == 'source-a'
        assert (await other.attribution(DID))['source_id'] == 'source-b'
        assert (await fixture.service.attribution('+14155552671'))['source_id'] is None
    run(scenario())


def test_mapping_http_validation_crud_and_permissions(fixture):
    async def scenario():
        async with AsyncClient(transport=ASGITransport(app=fixture.app), base_url='http://mock') as client:
            url = '/api/crm/inbound-source-mappings'
            body = {'phone_number': '+7 (701) 123-45-67', 'source_id': 'source-a'}
            assert (await client.get(url)).status_code == 401
            for role in ['patient', 'doctor', 'marketer', 'administrator']:
                response = await client.post(url, json=body, headers={'Authorization': f'Bearer {role}'})
                assert response.status_code == 403
            assert (await client.get(url, headers={'Authorization':'Bearer patient'})).status_code == 403
            assert (await client.get(url, headers={'Authorization':'Bearer inactive'})).status_code == 400
            headers = {'Authorization':'Bearer admin'}
            for bad in [dict(body, phone_number='87011234567'), dict(body, source_id='missing'),
                        dict(body, source_id='inactive'), dict(body, name='Second catalog')]:
                assert (await client.post(url, json=bad, headers=headers)).status_code == 422
            response = await client.post(url, json=body, headers=headers)
            assert response.status_code == 201 and response.json()['phone_number'] == DID
            assert (await client.post(url, json=dict(body, phone_number=DID), headers=headers)).status_code == 409
            assert (await client.post(url + '/validate', json=body, headers=headers)).status_code == 409
            assert (await client.get(url, headers={'Authorization':'Bearer doctor'})).json() == [dict(phone_number=DID, source_id='source-a')]
            assert (await client.put(url + '/invalid', json={'source_id':'source-b'}, headers=headers)).status_code == 422
            response = await client.put(url + '/%2B77011234567', json={'source_id':'source-b'}, headers={'Authorization':'Bearer super_admin'})
            assert response.status_code == 200 and response.json()['source_id'] == 'source-b'
            assert (await client.delete(url + '/%2B77011234567', headers=headers)).status_code == 204
            assert (await client.get(url, headers=headers)).json() == []
    run(scenario())


async def webhook(fixture, event='NOTIFY_START', call_id='call-1', **extra):
    payload = dict(event=event, pbx_call_id=call_id, caller_id=CALLER, called_did=DID, **extra)
    async with AsyncClient(transport=ASGITransport(app=fixture.app), base_url='http://mock') as client:
        response = await client.post('/api/telephony/webhook/events', json=payload)
        assert response.status_code == 200, response.text
    return fixture.db.telephony_calls.documents


def test_did_not_caller_creates_attributed_lead_and_persistent_call_snapshot(fixture):
    async def scenario():
        await fixture.service.create(DID, 'source-a', 'admin')
        await fixture.service.create(CALLER, 'source-b', 'admin')
        await webhook(fixture)
        call = fixture.db.telephony_calls.documents[0]
        lead = fixture.db.crm_leads.documents[0]
        assert call['phone_number'] == CALLER and call['called_did'] == DID
        assert call['source_id'] == lead['source_id'] == 'source-a'
        assert call['source_name'] == '2GIS' and lead['source'] == 'advertising'
        assert call['lead_id'] == lead['id']
        assert call['raw_payload']['caller_id'] == CALLER
    run(scenario())


def test_replay_after_mapping_change_and_closed_lead_preserves_history(fixture):
    async def scenario():
        await fixture.service.create(DID, 'source-a', 'admin')
        await webhook(fixture)
        before = deepcopy(fixture.db.crm_leads.documents)
        fixture.db.crm_leads.documents[0]['status'] = 'closed'
        await fixture.service.update(DID, 'source-b', 'admin')
        await webhook(fixture, 'NOTIFY_END', disposition='answered', duration=45)
        assert len(fixture.db.telephony_calls.documents) == len(fixture.db.crm_leads.documents) == 1
        events = fixture.db.crm_leads.documents[0]["_funnel_events"]
        assert len(events) == 1 and events[0]["kind"] == "created"
        assert events[0]["source_id"] == "source-a"
        call = fixture.db.telephony_calls.documents[0]
        assert call['source_id'] == 'source-a' and call['source_name'] == '2GIS'
        assert fixture.db.crm_leads.documents[0]['source_id'] == before[0]['source_id']
        await webhook(fixture, call_id='new-call')
        assert fixture.db.telephony_calls.documents[-1]['source_id'] == 'source-b'
        assert fixture.db.crm_leads.documents[0]['source_id'] == 'source-a'
    run(scenario())


def test_existing_patient_call_does_not_rewrite_first_source(fixture):
    async def scenario():
        fixture.db.patients.documents.append(dict(id='patient', phone=CALLER, full_name='Existing'))
        fixture.db.crm_leads.documents.append(dict(id='first', source_id='manual', source='referral', status='converted', phone=CALLER))
        before = deepcopy(fixture.db.crm_leads.documents)
        await fixture.service.create(DID, 'source-a', 'admin')
        await webhook(fixture)
        assert fixture.db.crm_leads.documents == before
        call = fixture.db.telephony_calls.documents[0]
        assert call['source_id'] == 'source-a' and call['patient_id'] == 'patient' and call['lead_id'] is None
    run(scenario())


def test_phone_adapter_independent_of_source_type_captures_channel_campaign_once(fixture):
    async def scenario():
        source = fixture.db.crm_sources.documents[1]
        source['channels'] = [dict(id='called-site', name='Звонок на сайте', adapter='phone', active=True),
                              dict(id='another', name='Другой номер', adapter='phone', active=True)]
        source['campaigns'] = [dict(id='promotion', name='Кампания', active=True, channel_id=None, signals={})]
        await fixture.service.create(DID, 'source-b', 'admin', 'called-site', 'promotion')
        await webhook(fixture)
        lead = deepcopy(fixture.db.crm_leads.documents[0])
        call = fixture.db.telephony_calls.documents[0]
        assert lead['source'] == 'website' and lead['source_id'] == 'source-b'
        assert lead['channel_id'] == call['channel_id'] == 'called-site'
        assert lead['campaign_id'] == call['campaign_id'] == 'promotion'
        assert lead['_funnel_events'][0]['channel_id'] == 'called-site'
        await fixture.service.update(DID, 'source-b', 'admin', 'another')
        await webhook(fixture, 'NOTIFY_END')
        assert fixture.db.crm_leads.documents[0]['channel_id'] == lead['channel_id']
        assert fixture.db.telephony_calls.documents[0]['campaign_id'] == 'promotion'
        source['channels'][1]['active'] = False
        assert (await fixture.service.attribution(DID)).get('channel_id') is None
    run(scenario())


def test_existing_active_manual_lead_and_unknown_did_are_not_overwritten(fixture):
    async def scenario():
        from datetime import datetime
        fixture.db.crm_leads.documents.append(dict(id='manual', source_id='source-b', source='website', status='new',
            phone=CALLER, first_name='Manual', created_at=datetime(2026, 1, 1), updated_at=datetime(2026, 1, 1)))
        before = deepcopy(fixture.db.crm_leads.documents)
        await fixture.service.create(DID, 'source-a', 'admin')
        await webhook(fixture)
        assert fixture.db.crm_leads.documents == before
        assert fixture.db.telephony_calls.documents[0]['lead_id'] == 'manual'
        assert fixture.db.telephony_calls.documents[0]['source_id'] == 'source-a'
    run(scenario())


@pytest.mark.parametrize('did', [None, '+14155552671', '87011234567', '100'])
def test_unknown_or_invalid_did_remains_unattributed(fixture, did):
    async def scenario():
        await fixture.service.create(DID, 'source-a', 'admin')
        async with AsyncClient(transport=ASGITransport(app=fixture.app), base_url='http://mock') as client:
            response = await client.post('/api/telephony/webhook/events', json=dict(event='NOTIFY_START',
                pbx_call_id='unknown', caller_id=CALLER, called_did=did))
            assert response.status_code == 200
        assert fixture.db.telephony_calls.documents[0]['source_id'] is None
        lead = fixture.db.crm_leads.documents[0]
        assert lead['source_id'] is None and lead['source'] == 'phone'
    run(scenario())


def test_concurrent_webhook_retries_reserve_one_call_and_one_lead(fixture):
    async def scenario():
        await fixture.service.create(DID, 'source-a', 'admin')
        await asyncio.gather(*(webhook(fixture) for _ in range(8)))
        assert len(fixture.db.telephony_calls.documents) == len(fixture.db.crm_leads.documents) == 1
        events = fixture.db.crm_leads.documents[0]["_funnel_events"]
        assert len(events) == 1 and events[0]["kind"] == "created"
        assert events[0]["source_id"] == "source-a"
    run(scenario())


def test_outgoing_does_not_attribute_or_create_incoming_lead(fixture):
    async def scenario():
        await fixture.service.create(DID, 'source-a', 'admin')
        await webhook(fixture, 'NOTIFY_OUT_START', destination=CALLER)
        assert not fixture.db.crm_leads.documents
        call = fixture.db.telephony_calls.documents[0]
        assert call['direction'] == 'outbound' and call['source_id'] is None
        assert call['phone_number'] == CALLER
    run(scenario())


def test_answer_first_is_unknown_and_cannot_create_callback_or_outbound_acquisition(fixture):
    async def scenario():
        await fixture.service.create(DID, 'source-a', 'admin')
        await webhook(fixture, 'NOTIFY_ANSWER', destination=CALLER)
        assert not fixture.db.crm_leads.documents
        pending = fixture.db.telephony_calls.documents[0]
        assert pending['direction'] == 'unknown' and pending['attribution_captured'] is False
        await webhook(fixture, 'NOTIFY_OUT_START', destination=CALLER)
        await webhook(fixture, 'NOTIFY_ANSWER', destination=CALLER)
        await webhook(fixture, 'NOTIFY_OUT_END', destination=CALLER, disposition='answered')
        assert len(fixture.db.telephony_calls.documents) == 1 and not fixture.db.crm_leads.documents
        call = fixture.db.telephony_calls.documents[0]
        assert call['direction'] == 'outbound' and call['source_id'] is None
        # Even an inconsistent incoming-looking callback leg cannot turn a
        # reserved outbound call into an inbound acquisition.
        await webhook(fixture, 'NOTIFY_START')
        assert not fixture.db.crm_leads.documents and call['source_id'] is None
    run(scenario())


def test_outbound_links_one_existing_card_without_mutating_source_or_creating_events(fixture):
    async def scenario():
        from datetime import datetime
        card = dict(id='known', phone=CALLER, first_name='Existing', status='new', source='website',
                    source_id='source-b', channel_id='manual-channel', campaign_id='manual-campaign',
                    created_at=datetime(2026, 1, 1), updated_at=datetime(2026, 1, 1))
        fixture.db.crm_leads.documents.append(card)
        before = deepcopy(fixture.db.crm_leads.documents)
        for event in ('NOTIFY_OUT_START', 'NOTIFY_ANSWER', 'NOTIFY_OUT_END', 'NOTIFY_OUT_END'):
            await webhook(fixture, event, destination=CALLER)
        assert fixture.db.crm_leads.documents == before
        assert len(fixture.db.telephony_calls.documents) == 1
        assert fixture.db.telephony_calls.documents[0]['lead_id'] == 'known'
        assert fixture.db.telephony_calls.documents[0]['source_id'] is None
    run(scenario())


def test_answer_winning_insert_race_is_completed_by_confirmed_inbound_start(fixture, monkeypatch):
    async def scenario():
        await fixture.service.create(DID, 'source-a', 'admin')
        collection = fixture.db.telephony_calls
        insert = collection.insert_one
        async def answer_wins(document):
            await insert(dict(_id=document['_id'], pbx_call_id=document['pbx_call_id'], direction='unknown',
                              phone_number='', attribution_captured=False))
            raise DuplicateKeyError('ANSWER won reservation')
        monkeypatch.setattr(collection, 'insert_one', answer_wins)
        await webhook(fixture)
        assert len(collection.documents) == len(fixture.db.crm_leads.documents) == 1
        assert collection.documents[0]['direction'] == 'inbound'
        assert collection.documents[0]['source_id'] == 'source-a'
        assert collection.documents[0]['direction_event'] == 'NOTIFY_START'
        await webhook(fixture, 'NOTIFY_END')
        assert len(fixture.db.crm_leads.documents) == 1
    run(scenario())


def test_callback_request_and_unclassified_answer_never_create_acquisition(fixture, monkeypatch):
    async def scenario():
        request = AsyncMock(return_value={'status': 'success', 'from': '100', 'to': CALLER})
        monkeypatch.setattr(fixture.telephony.telephony_service, 'request_callback', request)
        async with AsyncClient(transport=ASGITransport(app=fixture.app), base_url='http://mock') as client:
            response = await client.post('/api/telephony/callbacks', json={'phone': CALLER}, headers={'Authorization': 'Bearer admin'})
            assert response.status_code == 200, response.text
        request.assert_awaited_once()
        assert not fixture.db.crm_leads.documents
        await webhook(fixture, 'NOTIFY_ANSWER', destination=CALLER)
        assert not fixture.db.crm_leads.documents
        assert {row['direction'] for row in fixture.db.telephony_calls.documents} == {'outbound', 'unknown'}
    run(scenario())


def test_recording_before_start_and_repeated_recording_keep_one_call(fixture):
    async def scenario():
        await fixture.service.create(DID, 'source-a', 'admin')
        for _ in range(2): await webhook(fixture, 'NOTIFY_RECORD', recording_url='/uploads/mock.mp3')
        assert len(fixture.db.telephony_calls.documents) == 1 and not fixture.db.crm_leads.documents
        await webhook(fixture)
        call = fixture.db.telephony_calls.documents[0]
        assert call['source_id'] == 'source-a' and call['is_recorded']
        assert len(fixture.db.crm_leads.documents) == 1
    run(scenario())


def test_legacy_call_replays_never_acquire_new_attribution(fixture):
    async def scenario():
        fixture.db.telephony_calls.documents.append(dict(_id='legacy', pbx_call_id='call-1', phone_number=CALLER))
        await fixture.service.create(DID, 'source-a', 'admin')
        await webhook(fixture, 'NOTIFY_END')
        assert 'source_id' not in fixture.db.telephony_calls.documents[0]
        assert not fixture.db.crm_leads.documents
    run(scenario())


def test_inactive_or_deleted_catalog_entry_is_never_guessed_and_source_delete_requires_unbinding(fixture):
    async def scenario():
        from crm.services.source_service import SourceService
        await fixture.service.create(DID, 'source-a', 'admin')
        with pytest.raises(ValueError, match='привязку'):
            await SourceService(fixture.db).delete_source('source-a')
        source = fixture.db.crm_sources.documents[0]
        source.pop('status')
        source['is_active'] = False
        assert (await fixture.service.attribution(DID))['source_id'] is None
        fixture.db.crm_sources.documents.remove(source)
        assert (await fixture.service.attribution(DID))['source_id'] is None
    run(scenario())


def test_form_encoded_zadarma_payload_uses_called_did(fixture):
    async def scenario():
        await fixture.service.create(DID, 'source-a', 'admin')
        async with AsyncClient(transport=ASGITransport(app=fixture.app), base_url='http://mock') as client:
            response = await client.post('/api/telephony/webhook/events', data={
                'event':'NOTIFY_START', 'pbx_call_id':'form-call', 'caller_id':CALLER, 'called_did':'77011234567'
            })
            assert response.status_code == 200
        assert fixture.db.crm_leads.documents[0]['source_id'] == 'source-a'
    run(scenario())


def test_mapping_change_after_call_reservation_cannot_rewrite_its_snapshot(fixture):
    async def scenario():
        await fixture.service.create(DID, 'source-a', 'admin')
        original = fixture.db.telephony_calls.insert_one
        async def insert_then_change(document):
            result = await original(document)
            await fixture.service.update(DID, 'source-b', 'admin')
            return result
        fixture.db.telephony_calls.insert_one = insert_then_change
        await webhook(fixture)
        assert fixture.db.telephony_calls.documents[0]['source_id'] == 'source-a'
        assert fixture.db.crm_leads.documents[0]['source_id'] == 'source-a'
    run(scenario())
