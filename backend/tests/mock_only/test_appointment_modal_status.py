"""Real appointment HTTP routes and LeadService, with no Mongo or messaging.

Run with --noconftest -p no:cacheprovider. Do not import the application server:
its startup and global database fixtures are intentionally outside this test.
"""
import importlib
import re
import socket
import sys
import threading
from copy import deepcopy
from datetime import datetime
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest


def matches(document, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(matches(document, branch) for branch in expected):
                return False
        elif isinstance(expected, dict):
            actual = document.get(key)
            for operator, value in expected.items():
                if operator == "$ne":
                    if actual == value:
                        return False
                elif operator == "$nin":
                    if actual in value:
                        return False
                elif operator == "$regex":
                    if not re.search(value, actual or ""):
                        return False
                else:
                    raise AssertionError(f"Unsupported fake DB operator: {operator}")
        elif document.get(key) != expected:
            return False
    return True


class MemoryCollection:
    def __init__(self, rows=()):
        self.rows = deepcopy(list(rows))
        self.writes = []

    async def find_one(self, query):
        return next((deepcopy(row) for row in self.rows if matches(row, query)), None)

    def find(self, query):
        rows = [deepcopy(row) for row in self.rows if matches(row, query)]
        return SimpleNamespace(to_list=AsyncMock(return_value=rows))

    async def count_documents(self, query):
        return sum(matches(row, query) for row in self.rows)

    async def insert_one(self, document):
        self.rows.append(deepcopy(document))
        return SimpleNamespace(inserted_id=document.get("id"))

    async def update_one(self, query, update, upsert=False):
        self.writes.append(deepcopy(update))
        if upsert and not any(matches(row, query) for row in self.rows):
            self.rows.append(deepcopy(update.get("$setOnInsert", {})))
        for row in self.rows:
            if matches(row, query):
                old = deepcopy(row)
                row.update(deepcopy(update.get("$set", {})))
                for key, value in update.get("$push", {}).items():
                    row.setdefault(key, []).append(deepcopy(value))
                for key in update.get("$unset", {}):
                    row.pop(key, None)
                return SimpleNamespace(matched_count=1, modified_count=int(old != row))
        return SimpleNamespace(matched_count=0, modified_count=0)


@pytest.fixture
def harness(monkeypatch):
    import motor.motor_asyncio
    import pymongo
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    def forbidden(*args, **kwargs):
        raise AssertionError("Real Mongo clients and external connections are forbidden")

    monkeypatch.setattr(pymongo, "MongoClient", forbidden)
    monkeypatch.setattr(motor.motor_asyncio, "AsyncIOMotorClient", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    # Windows asyncio creates its wakeup pipe with a loopback socketpair.
    # Permit only that standard-library operation, never arbitrary loopback
    # connections (which could otherwise reach a locally running real Mongo).
    internal = threading.local()
    native_socketpair, native_connect = socket.socketpair, socket.socket.connect

    def socketpair(*args, **kwargs):
        internal.socketpair = True
        try:
            return native_socketpair(*args, **kwargs)
        finally:
            internal.socketpair = False

    def guarded_connect(sock, address):
        if getattr(internal, "socketpair", False):
            return native_connect(sock, address)
        return forbidden()

    monkeypatch.setattr(socket, "socketpair", socketpair)
    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)
    database = ModuleType("database")
    database.db = Mock()
    database.get_database = AsyncMock(return_value=database.db)
    monkeypatch.setitem(sys.modules, "database", database)
    crm_dependencies = ModuleType("crm.dependencies")
    crm_dependencies.get_database = database.get_database
    monkeypatch.setitem(sys.modules, "crm.dependencies", crm_dependencies)

    # Replace transport modules before any import: not even a real sender or
    # survey constructor may read config, queue a task or contact a patient.
    sender = SimpleNamespace(**{name: AsyncMock() for name in (
        "send_appointment_created_notification", "send_appointment_no_show_notification",
        "send_appointment_cancelled_notification", "send_appointment_completed_notification",
        "send_appointment_rescheduled_notification")})
    notifications = ModuleType("services.notification_sender")
    notifications.NotificationSender = Mock(return_value=sender)
    monkeypatch.setitem(sys.modules, "services.notification_sender", notifications)
    survey = AsyncMock()
    feedback = ModuleType("services.feedback_service")
    feedback.FeedbackService = Mock(return_value=SimpleNamespace(start_survey=survey))
    monkeypatch.setitem(sys.modules, "services.feedback_service", feedback)

    routes = importlib.import_module("routers.appointments")
    from models.appointment import Appointment
    from models.auth import UserRole
    appointment = Appointment(id="appointment-fixture", patient_id="patient-fixture",
        doctor_id="doctor-fixture", room_id="room-fixture", appointment_date="2026-10-20",
        appointment_time="10:00", end_time="10:30", price=100, deposit=0,
        deposit_type="fixed", status="confirmed", reason="Fixture visit", notes="Before").model_dump()
    db = SimpleNamespace(
        appointments=MemoryCollection([appointment]),
        patients=MemoryCollection([dict(id="patient-fixture", full_name="Fixture Patient", phone="+70000000801")]),
        doctors=MemoryCollection([dict(id="doctor-fixture", full_name="Fixture Doctor", is_active=True)]),
        rooms=MemoryCollection([dict(id="room-fixture", name="Fixture room")]),
        doctor_schedules=MemoryCollection([dict(doctor_id="doctor-fixture", day_of_week=1,
            is_active=True, start_time="08:00", end_time="18:00")]),
        crm_clients=MemoryCollection(),
        crm_funnel_events=MemoryCollection(),
        crm_leads=MemoryCollection([
            dict(id="lead-fixture", first_name="Fixture", phone="70000000801", source="other",
                status="in_progress", converted_to_client_id="patient-fixture",
                converted_to_appointment_id="appointment-fixture", created_at=datetime(2026, 1, 1)),
            dict(id="unrelated-lead", first_name="Unrelated", phone="70000000802", source="other",
                status="contacted", created_at=datetime(2026, 1, 2)),
        ]),
    )
    app = FastAPI()
    app.include_router(routes.appointments_router, prefix="/api")
    app.dependency_overrides[routes.get_database] = lambda: db
    app.dependency_overrides[routes.get_current_active_user] = lambda: SimpleNamespace(role=UserRole.SUPER_ADMIN)
    with TestClient(app) as client:
        yield SimpleNamespace(client=client, db=db, sender=sender, survey=survey)


def assert_correspondence(h, appointment_status, lead_status):
    assert h.db.appointments.rows[0]["status"] == appointment_status
    assert h.db.crm_leads.rows[0]["status"] == lead_status
    assert h.db.crm_leads.rows[0]["converted_to_appointment_id"] == h.db.appointments.rows[0]["id"]
    assert h.db.crm_leads.rows[1]["status"] == "contacted"
    assert h.db.crm_leads.rows[1]["id"] == "unrelated-lead"


@pytest.mark.parametrize("initial_status,lead_status", [("confirmed", "in_progress"), ("completed", "converted")])
def test_ordinary_modal_put_preserves_current_status_and_linked_card(harness, initial_status, lead_status):
    h = harness
    h.db.appointments.rows[0]["status"] = initial_status
    h.db.crm_leads.rows[0]["status"] = lead_status
    card_before = deepcopy(h.db.crm_leads.rows)
    # Full ordinary modal edit payload, deliberately omitting status.
    payload = {key: value for key, value in h.db.appointments.rows[0].items()
               if key not in ("status", "created_at", "updated_at", "id")}
    payload["notes"] = "Edited through modal"
    response = h.client.put("/api/appointments/appointment-fixture", json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == initial_status
    assert response.json()["notes"] == payload["notes"]
    assert "status" not in h.db.appointments.writes[-1]["$set"]
    assert h.db.crm_leads.rows == card_before
    assert_correspondence(h, initial_status, lead_status)
    for notification in vars(h.sender).values():
        notification.assert_not_awaited()
    h.survey.assert_not_awaited()


@pytest.mark.parametrize("explicit_default", [False, True])
def test_create_initial_unconfirmed_and_scheduled_crm_card(harness, explicit_default):
    h = harness
    h.db.appointments.rows.clear()
    h.db.crm_leads.rows[0].update(status="new", kanban_column_id="old-column")
    payload = dict(patient_id="patient-fixture", doctor_id="doctor-fixture", room_id="room-fixture",
        appointment_date="2026-10-20", appointment_time="10:00", end_time="10:30",
        price=100, deposit=0, source="other", source_id="source-fixture")
    if explicit_default:
        payload["status"] = "unconfirmed"
    response = h.client.post("/api/appointments", json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "unconfirmed"
    assert response.json()["source_id"] == "source-fixture"
    assert h.db.appointments.rows[0]["source_id"] == "source-fixture"
    assert "source_id" not in h.db.patients.rows[0]
    assert "source_id" not in h.db.crm_leads.rows[0]
    assert_correspondence(h, "unconfirmed", "contacted")
    observed = h.db.crm_leads.rows[0]["_funnel_events"]
    assert len(observed) == 1 and observed[0]["to_stage_id"] == "contacted"
    assert observed[0]["kind"] == "transition"
    assert "kanban_column_id" not in h.db.crm_leads.rows[0]
    h.sender.send_appointment_created_notification.assert_awaited_once()


@pytest.mark.parametrize("lookup", ["hms_phone", "crm_client"])
def test_calendar_patch_confirms_linked_card_and_later_stale_modal_cannot_reset_it(harness, lookup):
    h = harness
    h.db.appointments.rows[0]["status"] = "unconfirmed"
    h.db.crm_leads.rows[0].update(status="contacted", kanban_column_id="scheduled-column")
    if lookup == "crm_client":
        h.db.crm_clients.rows.append(dict(id="crm-client-fixture", hms_patient_id="patient-fixture"))
    response = h.client.patch("/api/appointments/appointment-fixture/status", json={"status": "confirmed"})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "confirmed"
    assert_correspondence(h, "confirmed", "in_progress")
    assert "kanban_column_id" not in h.db.crm_leads.rows[0]
    assert "Запись на прием подтверждена" in h.db.crm_leads.rows[0]["notes"]
    observed = h.db.crm_leads.rows[0]["_funnel_events"]
    assert len(observed) == 1 and observed[0]["to_stage_id"] == "in_progress"
    # Frontend regression covers the actual stale form; here exercise its HTTP contract.
    response = h.client.put("/api/appointments/appointment-fixture", json={"notes": "Saved after confirmation"})
    assert response.status_code == 200, response.text
    assert response.json()["notes"] == "Saved after confirmation"
    assert_correspondence(h, "confirmed", "in_progress")


def test_put_with_explicit_status_also_has_existing_crm_synchronization(harness):
    h = harness
    h.db.appointments.rows[0]["status"] = "unconfirmed"
    h.db.crm_leads.rows[0]["status"] = "contacted"
    response = h.client.put("/api/appointments/appointment-fixture", json={"status": "confirmed"})
    assert response.status_code == 200, response.text
    assert_correspondence(h, "confirmed", "in_progress")


def test_calendar_completed_patch_syncs_card_without_real_notifications(harness):
    h = harness
    h.db.appointments.rows[0]["appointment_date"] = "2000-01-01"
    response = h.client.patch("/api/appointments/appointment-fixture/status", json={"status": "completed"})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "completed"
    assert_correspondence(h, "completed", "converted")
    assert h.db.patients.rows[0]["appointments_count"] == 1
    h.sender.send_appointment_completed_notification.assert_awaited_once()
    h.survey.assert_awaited_once()
