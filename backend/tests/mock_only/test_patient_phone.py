"""Run with --noconftest. Synthetic collections only; no provider or Mongo calls."""
import asyncio
from copy import deepcopy
import importlib
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from test_inbound_sources import fixture  # Reuse its network/DB-denying fixture.


CASES = [
    ('77011234567', '+77011234567'),
    ('+77011234567', '+77011234567'),
    ('7 (701) 123-45-67', '+77011234567'),
    ('12025550123', '+12025550123'),
    ('442071234567', '+442071234567'),
    ('8613812345678', '+8613812345678'),
    ('+82101234567', '+82101234567'),
    ('87011234567', '87011234567'),
    ('7011234567', '7011234567'),
    ('02071234567', '02071234567'),
    ('99999999999', '99999999999'),
    ('+123', '+123'), ('123', '123'),
    ('+7701123456700000', '+7701123456700000'),
    ('phone 77011234567', 'phone 77011234567'),
    ('77011234567 ext 1', '77011234567 ext 1'), ('', '')
]


@pytest.fixture
def harness(fixture, monkeypatch):
    db = fixture.db
    monkeypatch.setattr(type(db), '__getitem__', lambda self, key: getattr(self, key), raising=False)
    monkeypatch.setenv('WAZZUP24_API_KEY', 'synthetic-only')
    # Unrelated feedback/AI may send replies: replace them before loading the route.
    feedback = ModuleType('services.feedback_service')
    feedback.FeedbackService = lambda database: SimpleNamespace(handle_incoming=AsyncMock(return_value={'consumed': False}))
    monkeypatch.setitem(sys.modules, 'services.feedback_service', feedback)
    for name in ['routers.wazzup', 'routers.patients', 'services.wazzup_service', 'services.wazzup_chat_service',
                 'crm.services.integration_service', 'crm.routes.leads']:
        monkeypatch.delitem(sys.modules, name, raising=False)
    wazzup = importlib.import_module('routers.wazzup')
    chats = importlib.import_module('services.wazzup_chat_service')
    chat_updates = AsyncMock()
    monkeypatch.setattr(chats.WazzupChatService, 'upsert_incoming', chat_updates)
    monkeypatch.setattr(wazzup, '_trigger_auto_ai_analysis', AsyncMock())
    saved_messages = AsyncMock()
    monkeypatch.setattr(wazzup.wazzup_service, 'save_message_to_db', saved_messages)
    forbidden_send = AsyncMock(side_effect=AssertionError('Provider call forbidden'))
    monkeypatch.setattr(wazzup.wazzup_service, 'send_message', forbidden_send)
    monkeypatch.setattr(wazzup.wazzup_service, '_make_request', forbidden_send)
    lead_module = importlib.import_module('crm.services.lead_service')
    monkeypatch.setattr(lead_module.LeadService, 'convert_to_client', AsyncMock())
    integration = importlib.import_module('crm.services.integration_service').IntegrationService(db)
    patients = importlib.import_module('routers.patients')
    phone_check = importlib.import_module('crm.routes.leads').check_patient_by_phone
    return SimpleNamespace(**vars(fixture), wazzup=wazzup, chats=chats, chat_updates=chat_updates,
        saved_messages=saved_messages, forbidden_send=forbidden_send, integration=integration,
        patients=patients, phone_check=phone_check)


@pytest.mark.parametrize('raw,expected', CASES)
def test_normalization_never_guesses_country_changes_digits_or_truncates(fixture, raw, expected):
    from services.patient_phone import normalize_patient_phone
    assert normalize_patient_phone(raw) == expected
    assert normalize_patient_phone(expected) == expected


@pytest.mark.parametrize('origin,raw', [
    ('whatsapp', '77011234567'), ('telephony', '+77011234567'),
    ('telephony', '77011234567'), ('whatsapp', '8613812345678')
])
def test_inbound_to_patient_persistence_search_dedup_and_routing(harness, origin, raw):
    async def scenario():
        from services.patient_phone import normalize_patient_phone
        h = harness
        expected = normalize_patient_phone(raw)
        if origin == 'whatsapp':
            payload = {'messages': [{'chatId': raw + '@c.us', 'messageId': 'synthetic',
                'channelId': 'synthetic-channel', 'type': 'text', 'text': 'Synthetic inquiry',
                'isEcho': False, 'userName': 'Synthetic Patient'}]}
            assert (await h.wazzup.webhook_incoming_message(payload))['status'] == 'ok'
            assert h.db.crm_leads.documents[0]['phone'] == expected
            await h.wazzup.webhook_incoming_message(payload)
            assert len(h.db.crm_leads.documents) == 1, 'repeat inbound must reuse the active lead'
            assert h.saved_messages.call_args.kwargs['phone'] == raw
            assert h.chat_updates.call_args.kwargs['phone'] == raw
        else:
            await h.telephony._find_or_create_lead(h.db, raw, 'Synthetic Patient')
            await h.telephony._find_or_create_lead(h.db, expected, 'Synthetic Patient')
            assert len(h.db.crm_leads.documents) == 1
        lead = h.db.crm_leads.documents[0]
        before = deepcopy(lead)
        result = await h.integration.convert_lead_to_patient(lead['id'])
        patient = h.db.patients.documents[0]
        assert patient['id'] == result['patient_id'] and patient['phone'] == expected
        assert h.db.crm_leads.documents[0] == before, 'formatting does not rewrite historical lead fields'
        for query in (raw, expected):
            checked = await h.phone_check(query, h.db)
            assert checked['patient']['id'] == patient['id']
            assert checked['active_lead']['id'] == lead['id']
        digits = expected.lstrip('+')
        listed = await h.patients.get_patients(search=digits, current_user=SimpleNamespace(role='admin'))
        assert [row.phone for row in listed] == [expected]
        assert h.telephony._normalize_phone(raw) == h.telephony._normalize_phone(expected)
        assert h.chats.WazzupChatService._norm_phone(raw) == h.chats.WazzupChatService._norm_phone(expected)
        assert await h.wazzup.wazzup_service.format_phone(raw) == await h.wazzup.wazzup_service.format_phone(expected)
        h.forbidden_send.assert_not_called()
    asyncio.run(scenario())


def test_existing_bare_patient_stays_raw_and_is_found_by_both_forms(harness):
    async def scenario():
        h = harness
        raw = {'id': 'legacy-patient', 'full_name': 'Synthetic Legacy', 'phone': '77011234567', 'source': 'other'}
        h.db.patients.documents.append(deepcopy(raw))
        for phone in ('77011234567', '+77011234567'):
            assert (await h.phone_check(phone, h.db))['patient']['id'] == raw['id']
            assert (await h.telephony._find_patient_by_phone(h.db, phone))['id'] == raw['id']
        listed = await h.patients.get_patients(search='77011234567', current_user=SimpleNamespace(role='admin'))
        detail = await h.patients.get_patient(raw['id'], current_user=SimpleNamespace(role='admin'))
        assert listed[0].phone == detail.phone == raw['phone'], 'API reads do not migrate data'
        assert h.db.patients.documents == [raw]
    asyncio.run(scenario())


@pytest.mark.parametrize('raw,expected', [CASES[0], CASES[5], CASES[7], CASES[8], CASES[10]])
def test_crm_client_conversion_and_direct_creation(harness, raw, expected):
    async def scenario():
        from crm.schemas.client_schemas import ClientCreate
        h = harness
        client = await h.integration.client_service.create_client(ClientCreate(first_name='Synthetic', last_name='Patient', phone=raw))
        await h.integration.convert_client_to_hms_patient(client.id)
        assert h.db.patients.documents[0]['phone'] == expected
        created = await h.patients.create_patient(h.patients.PatientCreate(full_name='Synthetic Direct', phone=raw),
            current_user=SimpleNamespace(role='admin'))
        assert created.phone == h.db.patients.documents[1]['phone'] == expected
        h.forbidden_send.assert_not_called()
    asyncio.run(scenario())


@pytest.mark.parametrize('raw,expected', [CASES[0], CASES[5], CASES[7], CASES[8], CASES[10]])
def test_schedule_from_legacy_lead_normalizes_only_the_new_patient(harness, monkeypatch, raw, expected):
    from crm.models.lead import Lead
    from crm.routes import leads as routes
    lead = Lead(id='synthetic-lead', first_name='Synthetic', phone=raw, source='social',
                description='Обращение через WhatsApp: т', created_by='wazzup_webhook')
    service = SimpleNamespace(get_lead_by_id=AsyncMock(return_value=lead), update_lead_status=AsyncMock())
    monkeypatch.setattr(routes, 'LeadService', lambda db: service)
    notifications = ModuleType('services.notification_sender')
    sender = SimpleNamespace(send_appointment_created_notification=AsyncMock())
    notifications.NotificationSender = lambda db: sender
    monkeypatch.setitem(sys.modules, 'services.notification_sender', notifications)
    db = MagicMock()
    db.__getitem__.side_effect = lambda name: getattr(db, name)
    db.patients.find_one = AsyncMock(return_value=None)
    db.patients.insert_one = AsyncMock()
    db.appointments.find.return_value.to_list = AsyncMock(return_value=[])
    db.appointments.insert_one = AsyncMock()
    db.crm_leads.update_one = AsyncMock()
    db.wazzup_chats.update_many = AsyncMock()
    db.doctors.find_one = AsyncMock(return_value={'full_name': 'Synthetic Doctor'})
    asyncio.run(routes.schedule_appointment_from_lead(lead.id, {
        'appointment_date': '2026-10-23', 'appointment_time': '10:00',
        'end_time': '10:30', 'doctor_id': 'synthetic-doctor'
    }, db))
    assert db.patients.insert_one.call_args.args[0]['phone'] == expected
    assert lead.phone == raw
    harness.forbidden_send.assert_not_called()
