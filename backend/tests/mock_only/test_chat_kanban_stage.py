"""Widget moves with an in-memory DB, no server startup or real messages."""
import asyncio
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from crm.schemas.kanban_schemas import ChatStageMove
from crm.services.chat_kanban_service import ChatKanbanService
from crm.services.kanban_service import KanbanService, SYSTEM_COLUMNS, canonical_column_id
from crm.services.lead_service import LeadService
from crm.models.lead import LeadStatus

spec = importlib.util.spec_from_file_location('kanban_test_helpers', Path(__file__).parents[1] / 'test_crm_kanban_columns.py')
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
database, touch, Collection = helpers.database, helpers.touch, helpers.Collection
http_client = helpers.http_client
PHONE = '+77011234567'


def fixture(*leads, linked=None):
    db = database(*leads)
    db.wazzup_chats = Collection([dict(phone=PHONE, **(linked or {}))])
    return db


async def custom(db): return await KanbanService(db).create('Follow up')


def payload(context, column):
    return ChatStageMove(lead_id=context['lead_id'], expected_column_id=context['current_column_id'], column_id=column)


async def test_read_has_no_automatic_settings_deal_or_column_creation():
    db = fixture()
    before = [list(db.system_settings.documents), list(db.crm_leads.documents), list(db.wazzup_chats.documents)]
    context = await ChatKanbanService(db).context(PHONE)
    assert context['link_state'] == 'missing' and not context['can_move']
    assert context['columns'] and all(column['is_system'] for column in context['columns'])
    assert before == [db.system_settings.documents, db.crm_leads.documents, db.wazzup_chats.documents]


async def test_exact_link_uses_first_touch_canonical_without_changing_other_deal():
    db = fixture(touch('first'), touch('history', 1), touch('other', converted_to_client_id='other', phone='77012223344'), linked={'linked_lead_id':'history'})
    column = await custom(db)
    service = ChatKanbanService(db)
    context = await service.context(PHONE)
    assert context['lead_id'] == 'first'
    result = await service.move(PHONE, payload(context, column['id']))
    assert result['current_column_id'] == column['id']
    assert db.crm_leads.documents[0]['kanban_column_id'] == column['id']
    assert 'kanban_column_id' not in db.crm_leads.documents[1]
    assert 'kanban_column_id' not in db.crm_leads.documents[2]
    assert db.wazzup_chats.documents == [dict(phone=PHONE, linked_lead_id='history')]


@pytest.mark.parametrize('status', list(SYSTEM_COLUMNS))
async def test_system_source_can_move_to_custom_without_faking_event_status(status):
    db = fixture(touch('first', status=status), linked={'linked_lead_id':'first'})
    column = await custom(db)
    service = ChatKanbanService(db)
    context = await service.context(PHONE)
    assert context['current_column_id'] == status and context['can_move']
    result = await service.move(PHONE, payload(context, column['id']))
    assert result['current_column_id'] == column['id']
    assert db.crm_leads.documents[0]['status'] == status
    assert db.crm_leads.documents[0]['kanban_override_source'] == 'whatsapp'
    assert next(c for c in await KanbanService(db).columns() if c['id'] == column['id'])['affected_count'] == 1


@pytest.mark.parametrize('target', list(SYSTEM_COLUMNS))
async def test_all_system_targets_including_new_are_rejected(target):
    db = fixture(touch('first'))
    await custom(db)
    service = ChatKanbanService(db)
    context = await service.context(PHONE)
    before = list(db.crm_leads.documents)
    with pytest.raises(HTTPException) as failure:
        await service.move(PHONE, payload(context, target))
    assert failure.value.status_code == 400
    assert db.crm_leads.documents == before


async def test_no_custom_is_readonly_and_forged_target_does_not_create_one():
    db = fixture(touch('first'))
    service = ChatKanbanService(db)
    context = await service.context(PHONE)
    assert not context['can_move']
    with pytest.raises(HTTPException): await service.move(PHONE, payload(context, 'custom_fake'))
    assert not db.system_settings.documents


async def test_ambiguous_and_stale_links_never_choose_a_random_deal():
    db = fixture(touch('one', converted_to_client_id='patient-a'), touch('two', converted_to_client_id='patient-b'))
    service = ChatKanbanService(db)
    assert (await service.context(PHONE))['link_state'] == 'ambiguous'
    db.wazzup_chats.documents[0]['linked_lead_id'] = 'gone'
    context = await service.context(PHONE)
    assert context['link_state'] == 'stale' and context['lead_id'] is None
    with pytest.raises(HTTPException): await service.move(PHONE, ChatStageMove(lead_id='one',expected_column_id='new',column_id='custom_fake'))


async def test_stale_source_deleted_target_and_changed_link_are_rejected():
    db = fixture(touch('first'), touch('second', phone='77019990000'), linked={'linked_lead_id':'first'})
    column = await custom(db)
    service = ChatKanbanService(db)
    context = await service.context(PHONE)
    db.crm_leads.documents[0]['status'] = 'contacted'
    with pytest.raises(HTTPException) as failure: await service.move(PHONE, payload(context,column['id']))
    assert failure.value.status_code == 409
    context = await service.context(PHONE)
    db.wazzup_chats.documents[0]['linked_lead_id'] = 'second'
    with pytest.raises(HTTPException) as failure: await service.move(PHONE,payload(context,column['id']))
    assert failure.value.status_code == 409
    db.wazzup_chats.documents[0]['linked_lead_id'] = 'first'
    context = await service.context(PHONE)
    await KanbanService(db).delete(column['id'])
    with pytest.raises(HTTPException) as failure: await service.move(PHONE,payload(context,column['id']))
    assert failure.value.status_code == 404


async def test_system_event_clears_widget_override_and_column_deletion_preserves_event_status():
    db = fixture(touch('first', status='contacted'), linked={'linked_lead_id':'first'})
    column = await custom(db)
    service = ChatKanbanService(db)
    context = await service.context(PHONE)
    await service.move(PHONE,payload(context,column['id']))
    await LeadService(db).update_lead_status('first',LeadStatus.IN_PROGRESS)
    assert (await service.context(PHONE))['current_column_id'] == 'in_progress'
    context = await service.context(PHONE)
    await service.move(PHONE,payload(context,column['id']))
    await KanbanService(db).delete(column['id'])
    assert db.crm_leads.documents[0]['status'] == 'in_progress'
    assert canonical_column_id(db.crm_leads.documents[0]) == 'in_progress'


async def test_widget_source_extension_does_not_expand_regular_kanban_manual_move_rights():
    db = fixture(touch('first',status='contacted'))
    column = await custom(db)
    with pytest.raises(HTTPException): await KanbanService(db).move('first',column['id'])


async def test_conflicting_explicit_patient_and_deal_links_are_not_resolved_by_priority():
    db = fixture(touch('first', converted_to_client_id='patient-a'), linked={'linked_lead_id':'first','linked_patient_id':'patient-b'})
    context = await ChatKanbanService(db).context(PHONE)
    assert context['link_state'] == 'ambiguous'
    assert not context['can_move'] and context['lead_id'] is None


def test_widget_http_contract_and_existing_nonpatient_authorization(http_client):
    client, db, app = http_client
    db.wazzup_chats = Collection([dict(phone=PHONE, linked_lead_id='history')])
    read = client.get('/api/crm/whatsapp/kanban-stage', params={'phone':PHONE})
    assert read.status_code == 200 and read.json()['lead_id'] == 'first'
    assert not db.system_settings.documents
    column = client.post('/api/crm/kanban/columns', json={'name':'Follow up'}).json()
    context = client.get('/api/crm/whatsapp/kanban-stage', params={'phone':PHONE}).json()
    changed = client.patch('/api/crm/whatsapp/kanban-stage', params={'phone':PHONE}, json=payload(context,column['id']).model_dump())
    assert changed.status_code == 200 and changed.json()['current_column_id'] == column['id']
    forged = client.patch('/api/crm/whatsapp/kanban-stage', params={'phone':PHONE}, json=payload(changed.json(),'new').model_dump())
    assert forged.status_code == 400
    from routers.auth import get_current_active_user
    app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(id='patient',role='patient')
    assert client.get('/api/crm/whatsapp/kanban-stage',params={'phone':PHONE}).status_code == 403
