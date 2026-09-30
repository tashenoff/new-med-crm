"""Reactive notification-rule triggers for appointment lifecycle changes.

After any appointment update, the system dispatches notifications based on the
before/after transition: cancelled, completed (feedback ask), rescheduled
(date/time moved — with old AND new values via %old_date%/%old_time%)."""

import os

os.environ.setdefault("WAZZUP24_API_KEY", "test-key-for-tests")

from datetime import datetime  # noqa: E402

TEMPLATE = "%name%|%date%|%time%|%doctor%|%old_date%|%old_time%"


def _rule_doc(trigger, template=None):
    return {
        "status": True,
        "recipient": "patient",
        "trigger": trigger,
        "method": "wazzup",
        "message_template": template or TEMPLATE,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    }


async def _seed_ctx(db, trigger=None, template=None):
    if trigger:
        await db.notification_rules.insert_one(_rule_doc(trigger, template))
    await db.patients.insert_one({"id": "p1", "full_name": "Иван Петров", "phone": "87771234567"})
    await db.doctors.insert_one({"id": "d1", "full_name": "Доктор Иванова"})


def _appt(status="confirmed", date="2026-10-01", time="14:30", **extra):
    a = {
        "id": "a1",
        "patient_id": "p1",
        "doctor_id": "d1",
        "appointment_date": date,
        "appointment_time": time,
        "status": status,
    }
    a.update(extra)
    return a


async def _run_send(clean_db, existing, updated, monkeypatch):
    from routers.appointments import _send_appointment_notifications
    import services.notification_sender as ns_mod

    sent = []

    async def fake_send(request):
        sent.append(request)

    monkeypatch.setattr(ns_mod.wazzup_service, "send_message", fake_send)
    await _send_appointment_notifications(clean_db, existing, updated)
    return sent


async def test_status_to_cancelled_sends(clean_db, monkeypatch):
    await _seed_ctx(clean_db, trigger="appointment_cancelled")
    sent = await _run_send(
        clean_db,
        _appt(status="confirmed"), _appt(status="cancelled"), monkeypatch
    )
    assert len(sent) == 1
    assert "Иван Петров" in sent[0].text


async def test_status_to_completed_sends_feedback_ask(clean_db, monkeypatch):
    await _seed_ctx(clean_db, trigger="appointment_completed")
    sent = await _run_send(
        clean_db,
        _appt(status="in_progress"), _appt(status="completed"), monkeypatch
    )
    assert len(sent) == 1
    assert "Доктор Иванова" in sent[0].text


async def test_reschedule_on_date_change_sends_old_and_new(clean_db, monkeypatch):
    await _seed_ctx(clean_db, trigger="appointment_rescheduled")
    sent = await _run_send(
        clean_db,
        _appt(date="2026-10-01", time="14:30"),
        _appt(date="2026-10-03", time="14:30"),
        monkeypatch,
    )
    assert len(sent) == 1
    # %date%=новая дата, %old_date%=старая, %time%/%old_time% = новое/старое время
    assert sent[0].text == "Иван Петров|2026-10-03|14:30|Доктор Иванова|2026-10-01|14:30"


async def test_reschedule_on_time_change_only(clean_db, monkeypatch):
    await _seed_ctx(clean_db, trigger="appointment_rescheduled")
    sent = await _run_send(
        clean_db,
        _appt(date="2026-10-01", time="09:00"),
        _appt(date="2026-10-01", time="18:30"),
        monkeypatch,
    )
    assert len(sent) == 1
    assert "18:30" in sent[0].text
    assert "09:00" in sent[0].text


async def test_unchanged_schedule_no_reschedule_send(clean_db, monkeypatch):
    await _seed_ctx(clean_db, trigger="appointment_rescheduled")
    # Дата и время не менялись, статус тоже
    sent = await _run_send(
        clean_db,
        _appt(status="confirmed"), _appt(status="confirmed"), monkeypatch
    )
    assert sent == []


async def test_same_status_no_duplicate_cancelled(clean_db, monkeypatch):
    await _seed_ctx(clean_db, trigger="appointment_cancelled")
    # Уже отменено -> повторно не шлём
    sent = await _run_send(
        clean_db,
        _appt(status="cancelled"), _appt(status="cancelled"), monkeypatch
    )
    assert sent == []