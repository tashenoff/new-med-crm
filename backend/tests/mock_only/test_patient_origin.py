"""Read-only provenance projection and new conversions; no DB/provider access."""
import asyncio
from copy import deepcopy
from types import SimpleNamespace

import pytest

from test_patient_phone import fixture, harness


@pytest.mark.parametrize('creator,source,description,notes', [
    ('wazzup_webhook', 'social', 'Обращение через WhatsApp: synthetic: message', ''),
    ('telephony_webhook', 'phone', 'Обращение через Zadarma-звонок', ''),
    ('manager', 'referral', 'Заметка врача: перезвонить: завтра', 'Заметка врача: перезвонить: завтра'),
    ('manager', 'social', 'Обращение через WhatsApp: ручная заметка', 'Обращение через WhatsApp: ручная заметка')
])
def test_new_lead_conversion_separates_origin_and_preserves_manual_text(harness, creator, source, description, notes):
    async def scenario():
        from crm.schemas.lead_schemas import LeadCreate
        h = harness
        lead = await h.integration.lead_service.create_lead(LeadCreate(first_name='Synthetic', last_name='Patient',
            phone='+77011234567', source=source, source_id='synthetic-source', description=description), created_by=creator)
        before = deepcopy(h.db.crm_leads.documents)
        await h.integration.convert_lead_to_patient(lead.id)
        patient = h.db.patients.documents[0]
        assert patient['notes'] == notes
        assert patient['origin'] == dict(kind='crm_lead', entity_id=lead.id, source=source,
            source_id='synthetic-source', channel='whatsapp' if creator == 'wazzup_webhook' else None)
        assert h.db.crm_leads.documents == before, 'message and manual description remain in CRM'
        listed = await h.patients.get_patients(current_user=SimpleNamespace(role='admin'))
        detail = await h.patients.get_patient(patient['id'], current_user=SimpleNamespace(role='admin'))
        assert listed[0].origin == detail.origin
        assert listed[0].notes == detail.notes == notes
        h.forbidden_send.assert_not_called()
    asyncio.run(scenario())


@pytest.mark.parametrize('template', ['schedule', 'integration'])
def test_proven_legacy_whatsapp_origin_hides_only_generated_note_without_writing(harness, template):
    async def scenario():
        h = harness
        description = 'Обращение через WhatsApp: т'
        lead = dict(id='synthetic-lead', source='social', source_id='source:with:colon',
            created_by='wazzup_webhook', description=description)
        h.db.crm_leads.documents.append(lead)
        identifier = lead['id']
        note = f'Создан из заявки CRM. {description}'
        if template == 'integration':
            identifier = 'synthetic-client'
            h.db.crm_clients.documents.append(dict(id=identifier, source_lead_id=lead['id']))
            note = f'Конвертирован из лида {lead["id"]}. {description}'
        patient = dict(id='synthetic-patient', full_name='Synthetic Patient', phone='77011234567',
            notes=note, crm_client_id=identifier, source='social')
        h.db.patients.documents.append(patient)
        before = deepcopy(h.db.patients.documents)
        listed = await h.patients.get_patients(current_user=SimpleNamespace(role='admin'))
        detail = await h.patients.get_patient(patient['id'], current_user=SimpleNamespace(role='admin'))
        assert listed[0].origin == detail.origin
        assert detail.origin.legacy_generated_note is True
        assert detail.origin.channel == 'whatsapp'
        assert detail.origin.source_id == lead['source_id']
        assert listed[0].notes == detail.notes == note, 'raw note retained for unrelated edit/save'
        assert h.db.patients.documents == before
        updated = await h.patients.update_patient(patient['id'], h.patients.PatientUpdate(notes=note), current_user=SimpleNamespace(role='admin'))
        assert updated.notes == note and updated.origin.legacy_generated_note
        assert h.db.patients.documents[0]['notes'] == note
    asyncio.run(scenario())


@pytest.mark.parametrize('creator,description,notes,link', [
    ('wazzup_webhook', 'Обращение через WhatsApp: т', 'Заметка врача: позвонить: завтра', 'synthetic-lead'),
    ('wazzup_webhook', 'Обращение через WhatsApp: т', 'Создан из заявки CRM. Обращение через WhatsApp: т\nПозвонить: завтра', 'synthetic-lead'),
    ('wazzup_webhook', 'Обращение через WhatsApp: т', 'Создан из заявки CRM. Обращение через WhatsApp: другой текст', 'synthetic-lead'),
    ('manager', 'Обращение через WhatsApp: ручная заметка', 'Создан из заявки CRM. Обращение через WhatsApp: ручная заметка', 'synthetic-lead'),
    ('manager', 'Клиника: новый филиал', 'Создан из заявки CRM. Клиника: новый филиал', 'synthetic-lead'),
    ('wazzup_webhook', 'Обращение через WhatsApp: т', 'Создан из заявки CRM. Обращение через WhatsApp: т', 'missing-lead')
])
def test_ambiguous_or_manual_notes_are_never_parsed_or_removed(harness, creator, description, notes, link):
    async def scenario():
        h = harness
        h.db.crm_leads.documents.append(dict(id='synthetic-lead', source='social', created_by=creator, description=description))
        patient = dict(id='synthetic-patient', full_name='Synthetic', phone='77011234567', notes=notes,
            crm_client_id=link, source='social')
        h.db.patients.documents.append(patient)
        before = deepcopy(patient)
        result = await h.patients.get_patient(patient['id'], current_user=SimpleNamespace(role='admin'))
        assert result.origin is None
        assert result.notes == notes
        assert h.db.patients.documents[0] == before
    asyncio.run(scenario())


def test_crm_client_conversion_retains_manual_notes(harness):
    async def scenario():
        from crm.schemas.client_schemas import ClientCreate
        from crm.schemas.client_schemas import ClientUpdate
        h = harness
        client = await h.integration.client_service.create_client(ClientCreate(first_name='Synthetic', last_name='Client', phone='+77011234567'))
        note = 'Ручная заметка: позвонить: завтра'
        await h.integration.client_service.update_client(client.id, ClientUpdate(notes=note))
        await h.integration.convert_client_to_hms_patient(client.id)
        patient = h.db.patients.documents[0]
        assert patient['origin'] == dict(kind='crm_client', entity_id=client.id)
        assert patient['notes'] == note
        assert h.db.crm_clients.documents[0]['notes'] == note
        h.forbidden_send.assert_not_called()
    asyncio.run(scenario())
