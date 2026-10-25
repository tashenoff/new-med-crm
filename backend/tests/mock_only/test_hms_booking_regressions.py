"""Actual booking routes with database/network-forbidden in-memory fixtures."""
from copy import deepcopy

import pytest

from test_appointment_modal_status import harness


def create_payload(h, **changes):
    return dict(patient_id="patient-fixture", doctor_id="doctor-fixture", room_id="room-fixture",
                appointment_date="2026-10-20", appointment_time="10:15", end_time="10:45",
                source_id="source-fixture", **changes)


@pytest.mark.parametrize("method,payload", [
    ("put", {"appointment_time": "10:15", "end_time": "10:45"}),
    ("put", {"end_time": "10:45"}),
])
def test_interval_conflicts_rejected_before_write(harness, method, payload):
    h = harness
    if method == "put":
        other = deepcopy(h.db.appointments.rows[0])
        other.update(id="other", appointment_time="10:30", end_time="11:00")
        h.db.appointments.rows.append(other)
    before = deepcopy(h.db.appointments.rows)
    response = (h.client.post("/api/appointments", json={**create_payload(h), **payload}) if method == "post"
                else h.client.put("/api/appointments/appointment-fixture", json=payload))
    assert response.status_code == 400, response.text
    assert h.db.appointments.rows == before


def test_room_conflict_across_different_doctors(harness):
    h = harness
    h.db.doctors.rows.append(dict(id="second-doctor", is_active=True))
    h.db.doctor_schedules.rows.append({**h.db.doctor_schedules.rows[0], "doctor_id": "second-doctor"})
    response = h.client.post("/api/appointments", json={**create_payload(h), "doctor_id": "second-doctor"})
    assert response.status_code == 200, response.text
    assert response.json()['appointment_time'] == '10:30'
    assert response.json()['end_time'] == '11:00'
    assert len(h.db.appointments.rows) == 2


@pytest.mark.parametrize('start,end,expected_end', [
    ('10:15', '10:45', '11:00'), ('09:45', '10:15', '11:00'), ('09:00', '11:00', '12:30')])
def test_new_conflicting_booking_moves_forward_and_preserves_duration(harness, start, end, expected_end):
    h = harness
    original = deepcopy(h.db.appointments.rows[0])
    response = h.client.post('/api/appointments', json={**create_payload(h),
        'appointment_time': start, 'end_time': end})
    assert response.status_code == 200, response.text
    assert response.json()['appointment_time'] == '10:30'
    assert response.json()['end_time'] == expected_end
    assert h.db.appointments.rows[0] == original


def test_repeated_new_bookings_fill_successive_free_slots(harness):
    h = harness
    for expected in ['10:30', '11:00', '11:30']:
        response = h.client.post('/api/appointments', json={**create_payload(h),
            'appointment_time': '10:00', 'end_time': '10:30'})
        assert response.status_code == 200, response.text
        assert response.json()['appointment_time'] == expected


def test_next_gap_must_fit_the_whole_duration_and_both_resources(harness):
    h = harness
    h.db.appointments.rows.append({**h.db.appointments.rows[0], 'id': 'other-room',
        'room_id': 'another-room', 'appointment_time': '11:00', 'end_time': '11:30'})
    response = h.client.post('/api/appointments', json={**create_payload(h),
        'appointment_time': '10:00', 'end_time': '11:00'})
    assert response.status_code == 200, response.text
    assert response.json()['appointment_time'] == '11:30'
    assert response.json()['end_time'] == '12:30'


def test_auto_time_skips_shift_breaks_but_never_changes_the_day(harness):
    h = harness
    h.db.doctor_schedules.rows[0]['end_time'] = '12:00'
    h.db.doctor_schedules.rows.append({**h.db.doctor_schedules.rows[0], 'start_time': '13:00', 'end_time': '18:00'})
    h.db.appointments.rows[0].update(appointment_time='11:00', end_time='12:00')
    response = h.client.post('/api/appointments', json={**create_payload(h),
        'appointment_time': '11:45', 'end_time': '12:15'})
    assert response.status_code == 200, response.text
    assert response.json()['appointment_time'] == '13:00'
    assert response.json()['end_time'] == '13:30'
    assert response.json()['appointment_date'] == '2026-10-20'


def test_no_remaining_free_time_does_not_insert_or_move_existing_booking(harness):
    h = harness
    h.db.appointments.rows[0].update(appointment_time='08:00', end_time='18:00')
    before = deepcopy(h.db.appointments.rows)
    response = h.client.post('/api/appointments', json=create_payload(h))
    assert response.status_code == 409, response.text
    assert 'другую дату' in response.json()['detail']
    assert h.db.appointments.rows == before


def test_preview_returns_adjusted_time_without_creating_anything(harness):
    h = harness
    before = deepcopy(h.db.appointments.rows)
    response = h.client.post('/api/appointments/resolve-time', json=create_payload(h))
    assert response.status_code == 200, response.text
    assert response.json() == {'appointment_date': '2026-10-20', 'appointment_time': '10:30', 'end_time': '11:00'}
    assert h.db.appointments.rows == before


@pytest.mark.parametrize("status", ["cancelled", "no_show"])
def test_inactive_booking_does_not_block_rebooking(harness, status):
    h = harness
    h.db.appointments.rows[0]["status"] = status
    response = h.client.post("/api/appointments", json=create_payload(h))
    assert response.status_code == 200, response.text
    assert len(h.db.appointments.rows) == 2


@pytest.mark.parametrize("method", ["put", "patch"])
def test_reactivation_checks_for_new_booking_in_old_slot(harness, method):
    h = harness
    old = h.db.appointments.rows[0]
    old["status"] = "cancelled"
    h.db.appointments.rows.append({**old, "id": "replacement", "status": "confirmed"})
    before = deepcopy(h.db.appointments.rows)
    path = "/api/appointments/appointment-fixture" + ("/status" if method == "patch" else "")
    response = getattr(h.client, method)(path, json={"status": "confirmed"})
    assert response.status_code == 400, response.text
    assert h.db.appointments.rows == before


@pytest.mark.parametrize("start,end", [("17:45", "18:15"), ("18:00", "18:30"), ("10:00", "09:30"), ("10:00", "10:00")])
@pytest.mark.parametrize("method", ["post", "put"])
def test_full_interval_must_fit_shift(harness, start, end, method):
    h = harness
    before = deepcopy(h.db.appointments.rows)
    payload = {"appointment_time": start, "end_time": end}
    response = (h.client.post("/api/appointments", json={**create_payload(h), **payload}) if method == "post"
                else h.client.put("/api/appointments/appointment-fixture", json=payload))
    assert response.status_code == 400, response.text
    assert h.db.appointments.rows == before


def test_touching_intervals_allowed_and_second_shift_supported(harness):
    h = harness
    h.db.doctor_schedules.rows[0]["end_time"] = "12:00"
    h.db.doctor_schedules.rows.append({**h.db.doctor_schedules.rows[0], "start_time": "13:00", "end_time": "18:00"})
    response = h.client.post("/api/appointments", json={**create_payload(h), "appointment_time": "10:30", "end_time": "11:00"})
    assert response.status_code == 200, response.text
    response = h.client.put("/api/appointments/appointment-fixture", json={"appointment_time": "17:00", "end_time": "18:00"})
    assert response.status_code == 200, response.text


def test_manual_complex_schedule_exception_preserved(harness):
    h = harness
    h.db.doctor_schedules.rows.clear()
    response = h.client.post("/api/appointments", json={**create_payload(h), "appointment_time": "19:00", "end_time": "19:30", "complex_id": "manual-complex"})
    assert response.status_code == 200, response.text


def test_text_only_edit_of_legacy_booking_does_not_require_new_shift(harness):
    h = harness
    h.db.doctor_schedules.rows.clear()
    response = h.client.put("/api/appointments/appointment-fixture", json={"notes": "Updated clinical note"})
    assert response.status_code == 200, response.text


def test_legacy_booking_without_end_occupies_default_half_hour(harness):
    h = harness
    h.db.appointments.rows[0]["end_time"] = None
    response = h.client.post("/api/appointments", json=create_payload(h))
    assert response.status_code == 200, response.text
    assert response.json()['appointment_time'] == '10:30'


@pytest.mark.parametrize("method", ["post", "put"])
@pytest.mark.parametrize("end", ["14:15", "14:29"])
def test_minimum_appointment_duration_is_thirty_minutes(harness, method, end):
    h = harness
    payload = {"appointment_time": "14:00", "end_time": end}
    before = deepcopy(h.db.appointments.rows)
    response = (h.client.post("/api/appointments", json={**create_payload(h), **payload}) if method == "post"
                else h.client.put("/api/appointments/appointment-fixture", json=payload))
    assert response.status_code == 400, response.text
    assert "30" in response.json()["detail"]
    assert h.db.appointments.rows == before
