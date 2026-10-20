"""Manual WhatsApp attachment saving: isolated files/collections, no network or DB."""
import asyncio
import importlib
import socket
import sys
import uuid
from pathlib import Path
from copy import deepcopy
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI, Header, HTTPException
from httpx import ASGITransport, AsyncClient
from pymongo.errors import DuplicateKeyError


class Collection:
    def __init__(self, *rows):
        self.rows = list(deepcopy(rows))
        self.duplicate_after_insert = False

    async def find_one(self, query):
        await asyncio.sleep(0)
        return next((deepcopy(row) for row in self.rows
                     if all(row.get(k) == v for k, v in query.items())), None)

    async def update_one(self, query, update, upsert=False):
        row = next((row for row in self.rows if all(row.get(k) == v for k, v in query.items())), None)
        if row is None and upsert:
            row = {**query, **deepcopy(update.get('$setOnInsert', {}))}
            self.rows.append(row)
            if self.duplicate_after_insert:
                self.duplicate_after_insert = False
                raise DuplicateKeyError('concurrent request already inserted this _id')
        if row is not None:
            row.update(deepcopy(update.get('$set', {})))


@pytest.fixture
def harness(monkeypatch):
    import motor.motor_asyncio
    import pymongo

    def forbidden(*args, **kwargs):
        raise AssertionError('Real database/network access is forbidden')

    monkeypatch.setattr(motor.motor_asyncio, 'AsyncIOMotorClient', forbidden)
    monkeypatch.setattr(pymongo, 'MongoClient', forbidden)
    monkeypatch.setattr(socket, 'create_connection', forbidden)
    monkeypatch.setenv('WAZZUP24_API_KEY', 'mock-only-token')
    tmp_path = Path(__file__).resolve().parents[3] / '.test-tmp' / uuid.uuid4().hex
    tmp_path.mkdir(parents=True)
    monkeypatch.chdir(tmp_path)
    uploads = tmp_path / 'uploads'
    uploads.mkdir()
    (uploads / 'attachment.pdf').write_bytes(b'%PDF fixture')
    db = SimpleNamespace(patients=Collection({'id': 'patient'}), documents=Collection(),
                         wazzup_messages=Collection())
    database = ModuleType('database')
    database.db = db
    database.get_database = lambda: db
    monkeypatch.setitem(sys.modules, 'database', database)
    dependencies = ModuleType('dependencies')

    async def authenticated(authorization: str = Header(default='')):
        if authorization != 'Bearer fixture':
            raise HTTPException(401, 'Authentication required')
        return SimpleNamespace(id='manager')

    dependencies.get_current_user = authenticated
    monkeypatch.setitem(sys.modules, 'dependencies', dependencies)
    chats = ModuleType('services.wazzup_chat_service')
    chat = SimpleNamespace(get_chat=AsyncMock(return_value={'patient_id': 'patient'}),
                           upsert_outgoing=AsyncMock())
    chats.WazzupChatService = Mock(return_value=chat)
    monkeypatch.setitem(sys.modules, 'services.wazzup_chat_service', chats)
    for name in ['routers.wazzup', 'services.wazzup_service', 'services.document_service']:
        monkeypatch.delitem(sys.modules, name, raising=False)
    router = importlib.import_module('routers.wazzup')
    app = FastAPI()
    app.include_router(router.router)

    async def request(message_id='message', auth=True):
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://fixture') as client:
            return await client.post(f'/api/wazzup/messages/{message_id}/save-to-patient',
                                     headers={'Authorization': 'Bearer fixture'} if auth else {})

    def seed(direction='incoming', **fields):
        db.wazzup_messages.rows[:] = [dict(message_id='message', phone='+70000000000',
            media_url='/uploads/attachment.pdf', direction=direction, message_type='document',
            metadata={'filename': 'result.pdf'}, **fields)]

    yield SimpleNamespace(db=db, chat=chat, request=request, seed=seed, router=router, uploads=uploads)
    for name in ['routers.wazzup', 'services.wazzup_service', 'services.document_service']:
        sys.modules.pop(name, None)


@pytest.mark.parametrize('direction', ['incoming', 'outgoing'])
def test_manual_save_and_repeated_requests_create_one_document(harness, direction):
    h = harness
    h.seed(direction)
    assert h.db.documents.rows == []
    first = asyncio.run(h.request())
    second = asyncio.run(h.request())
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert len(h.db.documents.rows) == 1
    assert h.db.wazzup_messages.rows[0]['saved_to_patient'] is True
    assert h.db.documents.rows[0]['uploaded_by'] == 'manager'
    assert (h.uploads / 'attachment.pdf').read_bytes() == b'%PDF fixture'


@pytest.mark.parametrize('direction', ['incoming', 'outgoing'])
def test_simultaneous_saves_are_idempotent(harness, direction):
    h = harness
    h.seed(direction)

    async def save():
        return await asyncio.gather(*(h.request() for _ in range(5)))

    results = asyncio.run(save())
    assert all(r.status_code == 200 for r in results)
    assert len({r.json()['document_id'] for r in results}) == 1
    assert len(h.db.documents.rows) == 1


def test_duplicate_key_race_returns_saved_document(harness):
    harness.seed('outgoing')
    harness.db.documents.duplicate_after_insert = True
    assert asyncio.run(harness.request()).status_code == 200
    assert len(harness.db.documents.rows) == 1


@pytest.mark.parametrize('direction', ['incoming', 'outgoing'])
def test_without_linked_patient_does_not_save(harness, direction):
    harness.seed(direction)
    harness.chat.get_chat.return_value = None
    response = asyncio.run(harness.request())
    assert response.status_code == 400
    assert 'не привязан пациент' in response.json()['detail']
    assert harness.db.documents.rows == []
    assert 'saved_to_patient' not in harness.db.wazzup_messages.rows[0]


def test_missing_patient_or_file_cannot_report_saved(harness):
    h = harness
    h.seed('outgoing')
    h.db.patients.rows.clear()
    assert asyncio.run(h.request()).status_code == 404
    h.db.patients.rows.append({'id': 'patient'})
    (h.uploads / 'attachment.pdf').unlink()
    assert asyncio.run(h.request()).status_code == 404
    assert h.db.documents.rows == []
    assert 'saved_to_patient' not in h.db.wazzup_messages.rows[0]


def test_existing_document_from_old_auto_save_is_reused(harness):
    h = harness
    h.seed('outgoing')
    from models.document import Document
    doc = Document(id='existing', patient_id='patient', filename='attachment.pdf',
        original_filename='original.pdf', file_path=str(h.uploads / 'attachment.pdf'),
        file_size=12, file_type='document', uploaded_by='whatsapp', uploaded_by_name='WhatsApp')
    h.db.documents.rows.append(doc.model_dump())
    before = deepcopy(h.db.documents.rows)
    response = asyncio.run(h.request())
    assert response.status_code == 200
    assert response.json()['document_id'] == 'existing'
    assert h.db.documents.rows == before


def test_authentication_still_required(harness):
    harness.seed('outgoing')
    assert asyncio.run(harness.request(auth=False)).status_code == 401
    assert harness.db.documents.rows == []


def test_outgoing_send_keeps_delivery_and_history_without_patient_document(harness, monkeypatch):
    h = harness
    service = h.router.wazzup_service
    monkeypatch.setattr(service, '_make_request', AsyncMock(return_value={'messageId': 'sent'}))
    monkeypatch.setattr(service, 'save_message_to_db', AsyncMock())
    result = asyncio.run(service.send_media('+70000000000', 'https://fixture.invalid/uploads/attachment.pdf',
        h.router.MessageType.DOCUMENT, channel_id='channel', original_filename='result.pdf'))
    assert result.id == 'sent'
    assert service._make_request.call_args.args[:2] == ('POST', 'message')
    assert service._make_request.call_args.args[2]['contentUri'].endswith('/attachment.pdf')
    service.save_message_to_db.assert_awaited_once()
    assert service.save_message_to_db.call_args.kwargs['direction'] == 'outgoing'
    h.chat.upsert_outgoing.assert_awaited_once()
    assert h.db.documents.rows == []
