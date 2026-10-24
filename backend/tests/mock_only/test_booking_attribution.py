"""Mock-only booking attribution contracts; no live persistence or providers."""
import asyncio
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
import pytest
from fastapi import HTTPException
from models.appointment import AppointmentCreate
from services.attribution import checked_attribution
from test_appointment_modal_status import harness as booking
from test_inbound_sources import fixture
from test_patient_phone import harness as patient_harness


def source(identifier, method, campaign):
    return dict(id=identifier, name='Source '+identifier, type='website', status='active',
                channels=[dict(id=method, name='Method '+method, adapter='form', active=True)],
                campaigns=[dict(id=campaign, name='Campaign '+campaign, active=True, channel_id=None, signals={})])


def test_booking_alias_and_cross_source_validation():
    data = dict(patient_id='p', doctor_id='d', appointment_date='2026-10-20', appointment_time='10:00', source_id='s', contactmethod_id='m')
    assert AppointmentCreate(**data).channel_id == 'm'
    from crm.schemas.lead_schemas import LeadCreate
    assert LeadCreate(first_name='Synthetic', phone='+77011234567', source='phone', contactmethod_id='m').channel_id == 'm'
    with pytest.raises(ValueError): AppointmentCreate(**data, channel_id='another')
    async def scenario():
        db = SimpleNamespace(crm_sources=SimpleNamespace(find_one=AsyncMock(return_value=source('s', 'm', 'c'))))
        assert (await checked_attribution(db, dict(source_id='s', channel_id='m', campaign_id='c')))['channel_name'] == 'Method m'
        with pytest.raises(HTTPException): await checked_attribution(db, dict(source_id='s', channel_id='foreign'))
        with pytest.raises(HTTPException): await checked_attribution(db, dict(source_id=None, campaign_id='c'))
        historical = dict(source_id='deleted', channel_id='old', campaign_id='old-campaign', source='phone', channel_name='Captured method')
        assert (await checked_attribution(db, dict(source_id='deleted', channel_id='old', campaign_id='old-campaign'), historical))['channel_name'] == 'Captured method'
        assert (await checked_attribution(db, dict(source_id='s'), historical))['channel_id'] is None
    asyncio.run(scenario())


def test_repeat_appointment_keeps_patient_acquisition_and_round_trips_current_dimensions(booking, monkeypatch):
    h = booking
    h.db.crm_sources.rows += [source('first-source', 'first-method', 'first-campaign'), source('visit-source', 'visit-method', 'visit-campaign')]
    patient = h.db.patients.rows[0]
    patient.update(source_id='first-source', source='website', channel_id='first-method', campaign_id='first-campaign')
    before = deepcopy(patient)
    h.db.appointments.rows.clear()
    payload = dict(patient_id=patient['id'], doctor_id='doctor-fixture', room_id='room-fixture',
                   appointment_date='2026-10-20', appointment_time='11:00', end_time='11:30',
                   source_id='visit-source', contactmethod_id='visit-method', campaign_id='visit-campaign')
    response = h.client.post('/api/appointments', json=payload)
    assert response.status_code == 200, response.text
    created = response.json()
    assert created['source_id'] == 'visit-source' and created['channel_id'] == 'visit-method'
    assert created['campaign_name'] == 'Campaign visit-campaign'
    assert patient == before, 'a repeat visit never rewrites first acquisition'
    identifier = created['id']
    detail = {**created, 'patient_name': 'Synthetic', 'doctor_name': 'Synthetic doctor', 'doctor_specialty': '', 'doctor_color': ''}
    aggregate = Mock(return_value=SimpleNamespace(to_list=AsyncMock(return_value=[detail])))
    monkeypatch.setattr(h.db.appointments, 'aggregate', aggregate, raising=False)
    reopened = h.client.get('/api/appointments/'+identifier)
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()['channel_id'] == 'visit-method' and reopened.json()['campaign_id'] == 'visit-campaign'
    projection = next(stage['$project'] for stage in aggregate.call_args.args[0] if '$project' in stage)
    assert {'channel_id', 'channel_name', 'campaign_id', 'campaign_name'} <= set(projection)
    bad = h.client.put('/api/appointments/'+identifier, json={'source_id': 'first-source', 'channel_id': 'visit-method'})
    assert bad.status_code == 422
    assert patient == before and h.db.appointments.rows[0]['source_id'] == 'visit-source'
    h.db.crm_sources.rows = [row for row in h.db.crm_sources.rows if row['id'] != 'visit-source']
    saved = h.client.put('/api/appointments/'+identifier, json={'source_id':'visit-source', 'channel_id':'visit-method', 'campaign_id':'visit-campaign', 'notes':'Manual note'})
    assert saved.status_code == 200 and saved.json()['channel_name'] == 'Method visit-method'
    assert patient == before


def test_direct_patient_and_crm_conversion_preserve_optional_first_acquisition(patient_harness):
    async def scenario():
        h = patient_harness
        h.db.crm_sources.documents.append(source('custom', 'method', 'campaign'))
        created = await h.patients.create_patient(h.patients.PatientCreate(full_name='Synthetic', phone='', source_id='custom',
                                contactmethod_id='method', campaign_id='campaign'), current_user=SimpleNamespace(role='admin'))
        assert created.channel_id == 'method' and created.campaign_name == 'Campaign campaign'
        updated = await h.patients.update_patient(created.id, h.patients.PatientUpdate(notes='Manual'), current_user=SimpleNamespace(role='admin'))
        assert updated.source_id == 'custom' and updated.channel_id == 'method'
        from crm.schemas.lead_schemas import LeadCreate
        lead = await h.integration.lead_service.create_lead(LeadCreate(first_name='CRM', phone='+77011234567', source='website',
                                          source_id='custom', channel_id='method', campaign_id='campaign'))
        await h.integration.convert_lead_to_patient(lead.id)
        converted = next(row for row in h.db.patients.documents if row.get('crm_client_id'))
        assert converted['source_id'] == 'custom' and converted['channel_id'] == 'method'
        assert converted['origin']['channel_id'] == 'method'
        h.forbidden_send.assert_not_called()
    asyncio.run(scenario())


def test_confirmed_legacy_origin_projects_only_absent_fields_without_rewriting_explicit_null():
    from services.patient_origin import project_first_acquisition
    original = {'id':'old', 'origin':{'kind':'crm_lead', 'entity_id':'lead', 'source_id':'saved', 'channel_id':'known'}}
    before = deepcopy(original)
    assert project_first_acquisition(original)['channel_id'] == 'known'
    assert original == before
    assert project_first_acquisition({**original, 'source_id':None})['source_id'] is None
