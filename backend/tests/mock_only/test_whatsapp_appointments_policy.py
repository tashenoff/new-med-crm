"""Real appointment endpoints with isolated collections and outbound send mocks."""
import importlib
from copy import deepcopy
import pytest
from test_appointment_modal_status import harness


@pytest.fixture(autouse=True)
def fixed_clinic_day(harness, monkeypatch):
    policy = importlib.import_module('services.appointment_status_policy')
    monkeypatch.setattr(policy, 'clinic_today', lambda: '2026-10-19')


@pytest.mark.parametrize('status', ['arrived', 'in_progress', 'completed', 'no_show'])
def test_future_visit_cannot_be_marked_as_attendance_or_completion(harness, status):
    h = harness
    before = deepcopy(h.db.appointments.rows[0])
    response = h.client.patch('/api/appointments/appointment-fixture/status', json={'status': status})
    assert response.status_code == 409, response.text
    assert 'даты приёма' in response.json()['detail']
    assert h.db.appointments.rows[0] == before
    assert not h.db.appointments.writes
    assert not h.db.crm_leads.writes


def test_future_confirmation_uses_only_explicitly_linked_deal(harness):
    h = harness
    h.db.crm_leads.rows.append(dict(id='other-deal',phone='70000000801',status='contacted',converted_to_client_id='patient-fixture',converted_to_appointment_id='another-visit'))
    before = deepcopy(h.db.crm_leads.rows[-1])
    result = h.client.patch('/api/appointments/appointment-fixture/status', json={'status': 'confirmed'})
    assert result.status_code == 200
    assert h.db.crm_leads.rows[-1] == before


def test_phone_only_link_cannot_change_patient_other_deal(harness):
    h = harness
    h.db.crm_leads.rows[0].pop('converted_to_appointment_id')
    before = deepcopy(h.db.crm_leads.rows)
    result = h.client.patch('/api/appointments/appointment-fixture/status', json={'status': 'confirmed'})
    assert result.status_code == 200
    assert h.db.crm_leads.rows == before
    assert not h.db.crm_leads.writes


def test_put_cannot_bypass_future_visit_rule(harness):
    response = harness.client.put('/api/appointments/appointment-fixture', json={'status': 'completed'})
    assert response.status_code == 409
    assert not harness.db.appointments.writes


def test_moving_arrived_visit_into_future_requires_status_change(harness):
    h = harness
    h.db.appointments.rows[0].update(status='arrived',appointment_date='2026-10-19')
    response = h.client.put('/api/appointments/appointment-fixture', json={'appointment_date': '2026-10-20'})
    assert response.status_code == 409
    assert not h.db.appointments.writes


def test_today_completion_changes_only_selected_visit_not_paid_crm_stage(harness):
    h = harness
    h.db.appointments.rows[0]['appointment_date'] = '2026-10-19'
    result = h.client.patch('/api/appointments/appointment-fixture/status', json={'status': 'completed'})
    assert result.status_code == 200
    assert h.db.crm_leads.rows[0]['status'] == 'converted'
    assert h.db.crm_leads.rows[0]['status'] != 'closed'
    assert len(h.db.crm_leads.rows) == 2
