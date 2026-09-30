"""Notification-rule trigger: no-show (unfulfilled appointment).

When an appointment is marked `no_show`, the system must automatically send a
WhatsApp message polling the reason for the no-show — configured as a normal
notification rule with the new trigger `appointment_no_show` (recipient=patient).
Mirrors the existing `appointment_created` auto-notification pattern.
"""

import os

# wazzup_service is a module-level singleton that raises on init without a key;
# guarantee one before anything imports it (lazy imports inside tests run after this).
os.environ.setdefault("WAZZUP24_API_KEY", "test-key-for-tests")

from datetime import datetime  # noqa: E402


def _rule_doc(trigger="appointment_no_show", status=True, template="%name%, вы не явились на приём %date% к %doctor% в %time%. Пожалуйста, сообщите причину."):
    return {
        "status": status,
        "recipient": "patient",
        "trigger": trigger,
        "method": "wazzup",
        "message_template": template,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    }


async def _seed_active_no_show_rule(db):
    res = await db.notification_rules.insert_one(_rule_doc())
    return str(res.inserted_id)


async def test_no_show_trigger_sends_reason_poll(clean_db, monkeypatch):
    from services.notification_sender import NotificationSender
    import services.notification_sender as ns_mod

    await _seed_active_no_show_rule(clean_db)

    sent = []

    async def fake_send(request):
        sent.append(request)

    monkeypatch.setattr(ns_mod.wazzup_service, "send_message", fake_send)

    sender = NotificationSender(clean_db)
    await sender.send_appointment_no_show_notification(
        patient_phone="87771234567",
        patient_name="Иван Петров",
        doctor_name="Доктор Иванова",
        appointment_date="2026-10-01",
        appointment_time="14:30",
    )

    assert len(sent) == 1
    msg = sent[0]
    assert msg.phone == "87771234567"
    assert "Иван Петров" in msg.text
    assert "2026-10-01" in msg.text
    assert "14:30" in msg.text
    assert "Доктор Иванова" in msg.text


async def test_no_show_trigger_ignores_disabled_rule(clean_db, monkeypatch):
    from services.notification_sender import NotificationSender
    import services.notification_sender as ns_mod

    await clean_db.notification_rules.insert_one(_rule_doc(status=False))

    sent = []

    async def fake_send(request):
        sent.append(request)

    monkeypatch.setattr(ns_mod.wazzup_service, "send_message", fake_send)

    sender = NotificationSender(clean_db)
    await sender.send_appointment_no_show_notification(
        patient_phone="87771234567", patient_name="Иван", doctor_name="Д",
        appointment_date="2026-10-01", appointment_time="14:30",
    )
    assert sent == []


async def test_no_show_trigger_no_rules_no_send(clean_db, monkeypatch):
    from services.notification_sender import NotificationSender
    import services.notification_sender as ns_mod

    sent = []

    async def fake_send(request):
        sent.append(request)

    monkeypatch.setattr(ns_mod.wazzup_service, "send_message", fake_send)

    sender = NotificationSender(clean_db)
    await sender.send_appointment_no_show_notification(
        patient_phone="87771234567", patient_name="Иван", doctor_name="Д",
        appointment_date="2026-10-01", appointment_time="14:30",
    )
    assert sent == []


async def test_marking_appointment_no_show_triggers_send(clean_db, monkeypatch):
    """The router wiring: an appointment whose status becomes no_show fires the send."""
    from routers.appointments import _send_appointment_notifications
    import services.notification_sender as ns_mod

    await _seed_active_no_show_rule(clean_db)

    patient = {
        "id": "p1",
        "full_name": "Иван Петров",
        "phone": "87771234567",
    }
    doctor = {"id": "d1", "full_name": "Доктор Иванова"}
    await clean_db.patients.insert_one(patient)
    await clean_db.doctors.insert_one(doctor)

    existing = {
        "id": "a1",
        "patient_id": "p1",
        "doctor_id": "d1",
        "appointment_date": "2026-10-01",
        "appointment_time": "14:30",
        "status": "confirmed",
    }
    updated = dict(existing)
    updated["status"] = "no_show"

    sent = []

    async def fake_send(request):
        sent.append(request)

    monkeypatch.setattr(ns_mod.wazzup_service, "send_message", fake_send)

    await _send_appointment_notifications(clean_db, existing, updated)

    assert len(sent) == 1
    assert "Иван Петров" in sent[0].text
    assert sent[0].phone == "87771234567"


async def test_non_no_show_status_does_not_send(clean_db, monkeypatch):
    """Routing guard: a completed status must not fire the no_show rule."""
    from routers.appointments import _send_appointment_notifications
    import services.notification_sender as ns_mod

    await _seed_active_no_show_rule(clean_db)

    patient = {"id": "p1", "full_name": "Иван", "phone": "87771234567"}
    await clean_db.patients.insert_one(patient)

    existing = {
        "id": "a1",
        "patient_id": "p1",
        "appointment_date": "2026-10-01",
        "appointment_time": "14:30",
        "status": "in_progress",
    }
    updated = dict(existing)
    updated["status"] = "completed"  # не no_show; правила completed нет -> ничего не шлём

    sent = []

    async def fake_send(request):
        sent.append(request)

    monkeypatch.setattr(ns_mod.wazzup_service, "send_message", fake_send)

    await _send_appointment_notifications(clean_db, existing, updated)
    assert sent == []