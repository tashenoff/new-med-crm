"""Preserve the backup's CRM scheduling regression without a database fixture."""
import asyncio
import pytest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture(autouse=True)
def isolated_imports(monkeypatch):
    import sys
    import socket
    from pathlib import Path
    from types import ModuleType
    import motor.motor_asyncio
    import pymongo
    def forbidden(*args, **kwargs):
        raise AssertionError("Real database/network access forbidden")
    monkeypatch.setattr(motor.motor_asyncio, "AsyncIOMotorClient", forbidden)
    monkeypatch.setattr(pymongo, "MongoClient", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    root = Path(__file__).parents[2]
    for name in ["crm", "crm.routes", "crm.services", "services", "models", "routers"]:
        package = ModuleType(name)
        package.__path__ = [str(root.joinpath(*name.split('.')))]
        monkeypatch.setitem(sys.modules, name, package)
    database = ModuleType("database")
    database.db = MagicMock()
    database.get_database = lambda: database.db
    monkeypatch.setitem(sys.modules, "database", database)
    dependencies = ModuleType("crm.dependencies")
    dependencies.get_database = database.get_database
    monkeypatch.setitem(sys.modules, "crm.dependencies", dependencies)
    notifications = ModuleType("services.notification_sender")
    notifications.NotificationSender = type("NoNetworkSender", (), {"__init__": lambda self, *args, **kwargs: None, "send_appointment_created_notification": AsyncMock()})
    monkeypatch.setitem(sys.modules, "services.notification_sender", notifications)
    monkeypatch.delitem(sys.modules, "crm.routes.leads", raising=False)


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


@pytest.mark.parametrize("chosen,source,expected_id,expected_type,error", [
    ({"source_id": "web"}, {"id": "web", "type": "website"}, "web", "website", None),
    ({"source_id": "web", "source": "social"}, {"id": "web", "type": "website"}, "web", "website", None),
    ({}, None, "2gis", "phone", None),
    ({"source_id": "deleted"}, None, None, None, 422),
    ({"source_id": ""}, None, None, None, 422),
    ({"source_id": ["web"]}, None, None, None, 422),
    ({"source_id": "legacy"}, {"id": "legacy"}, "legacy", "other", None),
])
def test_scheduling_keeps_selected_appointment_source_without_changing_history(monkeypatch, chosen, source, expected_id, expected_type, error):
    monkeypatch.setenv("WAZZUP24_API_KEY", "local-test-placeholder")
    from fastapi import HTTPException
    from crm.models.lead import Lead
    from crm.routes import leads as routes
    from services.notification_sender import NotificationSender
    lead = Lead(id="first", first_name="Client", phone="+77011234567", source="phone", source_id="2gis",
                converted_to_client_id="patient-a", created_at=datetime(2026, 1, 1))
    service = SimpleNamespace(get_lead_by_id=AsyncMock(return_value=lead), update_lead_status=AsyncMock())
    monkeypatch.setattr(routes, "LeadService", lambda db: service)
    notifications = AsyncMock()
    monkeypatch.setattr(NotificationSender, "send_appointment_created_notification", notifications)
    db = MagicMock()
    db.__getitem__.side_effect = lambda name: getattr(db, name)
    db.patients.find_one = AsyncMock(return_value={"id": "patient-a", "source_id": "2gis", "source": "phone"})
    db.patients.insert_one = AsyncMock()
    db.patients.update_one = AsyncMock()
    db.appointments.find.return_value.to_list = AsyncMock(return_value=[])
    db.appointments.insert_one = AsyncMock()
    db.crm_sources.find_one = AsyncMock(return_value=source)
    db.crm_leads.update_one = AsyncMock()
    db.wazzup_chats.update_many = AsyncMock()
    db.doctors.find_one = AsyncMock(return_value={"full_name": "Doctor"})
    form = {"appointment_date": "2026-10-08", "appointment_time": "10:00", "end_time": "10:30", "doctor_id": "doctor-a", **chosen}
    if error:
        with pytest.raises(HTTPException) as caught:
            asyncio.run(routes.schedule_appointment_from_lead("first", form, db))
        assert caught.value.status_code == error
        db.appointments.insert_one.assert_not_awaited()
        db.patients.insert_one.assert_not_awaited()
        notifications.assert_not_awaited()
    else:
        result = asyncio.run(routes.schedule_appointment_from_lead("first", form, db))
        assert result["patient_id"] == "patient-a"
        record = db.appointments.insert_one.call_args.args[0]
        assert record["source_id"] == expected_id
        assert record["source"] == expected_type
        db.patients.insert_one.assert_not_awaited()
        db.patients.update_one.assert_not_awaited()
        update = db.crm_leads.update_one.call_args.args[1]["$set"]
        assert "source_id" not in update and "source" not in update
        assert lead.source_id == "2gis"
