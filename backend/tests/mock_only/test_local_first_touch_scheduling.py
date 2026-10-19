"""Preserve the backup's CRM scheduling regression without a database fixture."""
import asyncio
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock


def test_first_touch_scheduling_keeps_patient_link_and_contacted_status(monkeypatch):
    monkeypatch.setenv("WAZZUP24_API_KEY", "local-test-placeholder")
    from crm.models.lead import Lead, LeadStatus
    from crm.routes import leads as routes
    from services.notification_sender import NotificationSender

    lead = Lead(id="first", first_name="Client", phone="+77011234567",
                source="phone", converted_to_client_id="patient-a",
                created_at=datetime(2026, 1, 1))
    service = SimpleNamespace(get_lead_by_id=AsyncMock(return_value=lead),
                              update_lead_status=AsyncMock())
    monkeypatch.setattr(routes, "LeadService", lambda db: service)
    notifications = AsyncMock()
    monkeypatch.setattr(NotificationSender, "send_appointment_created_notification", notifications)
    db = MagicMock()
    db.__getitem__.side_effect = lambda name: getattr(db, name)
    db.patients.find_one = AsyncMock(return_value={"id": "patient-a"})
    db.patients.insert_one = AsyncMock()
    db.appointments.find.return_value.to_list = AsyncMock(return_value=[])
    db.appointments.insert_one = AsyncMock()
    db.crm_leads.update_one = AsyncMock()
    db.wazzup_chats.update_many = AsyncMock()
    db.doctors.find_one = AsyncMock(return_value={"full_name": "Doctor"})
    result = asyncio.run(routes.schedule_appointment_from_lead("first", {
        "appointment_date": "2026-10-08", "appointment_time": "10:00",
        "end_time": "10:30", "doctor_id": "doctor-a",
    }, db))

    assert result["patient_id"] == "patient-a"
    db.patients.insert_one.assert_not_awaited()
    appointment = db.appointments.insert_one.call_args.args[0]
    assert appointment["status"] == "confirmed"
    assert appointment["patient_id"] == "patient-a"
    assert appointment["appointment_date"] == "2026-10-08"
    assert appointment["source"] == "phone"
    service.update_lead_status.assert_awaited_once_with(
        "first", LeadStatus.CONTACTED, "Запись на прием создана")
    db.crm_leads.update_one.assert_awaited_once()
    assert db.crm_leads.update_one.call_args.args[1]["$set"]["converted_to_client_id"] == "patient-a"
    notifications.assert_awaited_once()
