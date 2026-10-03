"""Запись лида через /api/crm/leads/{id}/schedule-appointment шлёт уведомление о создании.

Баг: при записи пациента из WhatsApp-виджета уведомление о создании записи не
отправлялось (завершение — отправлялось). Причина: schedule_appointment_from_lead
в crm/routes/leads.py вставлял запись мимо штатной цепочки и не звал
send_appointment_created_notification. Фикс: добавили вызов (как в create_appointment).
"""
import os

os.environ.setdefault("WAZZUP24_API_KEY", "test-key-for-tests")

import pytest  # noqa: E402


@pytest.fixture
def schedule_client(clean_db, monkeypatch):
    from httpx import AsyncClient, ASGITransport
    import server
    from crm.routes import leads as leads_mod

    sent = []

    class _FakeNotifSender:
        def __init__(self, db):
            pass

        async def send_appointment_created_notification(self, **kw):
            sent.append(kw)

    monkeypatch.setattr("services.notification_sender.NotificationSender", _FakeNotifSender)
    monkeypatch.setattr("database.db", clean_db)
    transport = ASGITransport(app=server.app)
    client = AsyncClient(transport=transport, base_url="http://test")
    client.sent = sent
    return client


async def _seed_lead(db, name="Иван", last="Петров", phone="+77051234567"):
    import uuid
    from datetime import datetime
    lead = {
        "id": str(uuid.uuid4()),
        "first_name": name,
        "last_name": last,
        "phone": phone,
        "status": "new",
        "source": "phone",
        "created_at": datetime.utcnow(),
    }
    await db.crm_leads.insert_one(lead)
    return lead["id"]


async def test_schedule_appointment_sends_created_notification(schedule_client, clean_db):
    """Запись лида из виджета отправляет уведомление о создании записи."""
    lead_id = await _seed_lead(clean_db)
    payload = {
        "appointment_date": "2026-10-10",
        "appointment_time": "11:00",
        "end_time": "11:30",
        "service": "Консультация",
    }
    async with schedule_client as client:
        r = await client.post(f"/api/crm/leads/{lead_id}/schedule-appointment", json=payload)
    assert r.status_code == 200, r.text
    assert len(client.sent) == 1, f"уведомление о создании должно уйти, отправлено: {client.sent}"
    assert client.sent[0]["patient_phone"] == "+77051234567"
    assert client.sent[0]["appointment_date"] == "2026-10-10"
    assert client.sent[0]["appointment_time"] == "11:00"