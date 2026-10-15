"""CRM names own display; Wazzup contact_name remains external metadata."""
from datetime import datetime
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from services.wazzup_chat_service import WazzupChatService


PHONE = "+77051234567"
RAW_NAME = "External Wazzup name"


async def seed_lead(db, **extra):
    lead = {
        "id": "lead-name-test", "first_name": "Old", "last_name": "Alias",
        "middle_name": "Obsolete", "phone": "8 (705) 123-45-67",
        "source": "whatsapp", "status": "new", "created_at": datetime.utcnow(),
        **extra,
    }
    await db.crm_leads.insert_one(lead)
    return lead["id"]


async def seed_chat(db, **extra):
    await db.wazzup_chats.insert_one({
        "phone": PHONE, "contact_name": RAW_NAME,
        "last_message_time": datetime.utcnow(), **extra,
    })


@pytest.mark.parametrize("link", ["explicit", "phone", "missing-lead"])
async def test_deals_rename_overrides_stale_contact_name(clean_db, link):
    db = clean_db
    lead_id = await seed_lead(db)
    extra = {} if link == "phone" else {"linked_lead_id": lead_id if link == "explicit" else "deleted"}
    await seed_chat(db, **extra)
    from crm.services.lead_service import LeadService
    from crm.schemas.lead_schemas import LeadUpdate

    svc = WazzupChatService(db)
    await svc.get_chat(PHONE)  # A previous read must not cache the CRM name.
    await LeadService(db).update_lead(lead_id, LeadUpdate(first_name="Renamed", last_name="Deal"))
    for item in [await svc.get_chat(PHONE), *(await svc.list_chats())]:
        assert item["patient_name"] == "Renamed Deal Obsolete"
        assert item["lead_name"] == "Renamed Deal Obsolete"
        assert item["linked_lead_id"] == lead_id
        assert item["source"] == "lead"
        assert item["patient_id"] is None
        assert item["contact_name"] == RAW_NAME
    stored = await db.wazzup_chats.find_one({"phone": PHONE})
    assert stored["contact_name"] == RAW_NAME


@pytest.mark.parametrize("link", ["patient", "phone", "converted-lead"])
async def test_patient_name_wins_over_lead_and_external_name(clean_db, link):
    db = clean_db
    await db.patients.insert_one({"id": "patient-name-test", "full_name": "Official Patient Name",
                                  "phone": PHONE if link == "phone" else "+77059998877"})
    lead_id = await seed_lead(db, converted_to_client_id="patient-name-test")
    await seed_chat(db, linked_lead_id=lead_id,
                    **({"linked_patient_id": "patient-name-test"} if link == "patient" else {}))
    for item in [await WazzupChatService(db).get_chat(PHONE), *(await WazzupChatService(db).list_chats())]:
        assert item["patient_id"] == "patient-name-test"
        assert item["patient_name"] == "Official Patient Name"
        assert item["contact_name"] == RAW_NAME
    assert (await db.wazzup_chats.find_one({"phone": PHONE}))["contact_name"] == RAW_NAME


@pytest.fixture
async def booking_client(clean_db, monkeypatch):
    # Only the real route under test; every DB dependency is the guarded fixture.
    monkeypatch.setenv("WAZZUP24_API_KEY", "test-key-for-tests")
    from crm.routes.leads import leads_router, get_database
    from services.notification_sender import NotificationSender

    monkeypatch.setattr(NotificationSender, "send_appointment_created_notification", AsyncMock())
    app = FastAPI()
    app.include_router(leads_router, prefix="/api/crm")
    app.dependency_overrides[get_database] = lambda: clean_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def book(client, lead_id, **extra):
    response = await client.post(f"/api/crm/leads/{lead_id}/schedule-appointment", json={
        "appointment_date": "2026-11-01", "appointment_time": "11:00", "end_time": "11:30",
        **extra,
    })
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("chat_link", ["lead", "phone", "none"])
@pytest.mark.parametrize("official", ["Petrov Petr Petrovich", "Petrov Petr"])
async def test_booking_persists_official_name_and_links_existing_chat(clean_db, booking_client, chat_link, official):
    db = clean_db
    lead_id = await seed_lead(db)
    if chat_link != "none":
        await seed_chat(db, **({"linked_lead_id": lead_id, "phone": "+77058887766"} if chat_link == "lead" else {}))
    result = await book(booking_client, lead_id, patient_full_name=official)
    patient = await db.patients.find_one({"id": result["patient_id"]})
    lead = await db.crm_leads.find_one({"id": lead_id})
    assert patient["full_name"] == official
    assert (patient["last_name"], patient["first_name"], patient["middle_name"]) == (
        "Petrov", "Petr", "Petrovich" if official.endswith("Petrovich") else None)
    assert lead["converted_to_client_id"] == patient["id"]
    assert (lead["last_name"], lead["first_name"], lead["middle_name"]) == (
        patient["last_name"], patient["first_name"], patient["middle_name"])
    assert (await db.appointments.find_one({"id": result["appointment_id"]}))["patient_id"] == patient["id"]
    if chat_link != "none":
        stored = await db.wazzup_chats.find_one({})
        assert stored["linked_patient_id"] == patient["id"]  # Before any listing auto-link.
        assert stored["contact_name"] == RAW_NAME
        items = await WazzupChatService(db).list_chats()
        assert len(items) == 1
        assert items[0]["patient_name"] == official
        assert items[0]["patient_id"] == patient["id"]
        assert items[0]["contact_name"] == RAW_NAME
    else:
        assert await db.wazzup_chats.count_documents({}) == 0
    # Retrying the route must reuse the converted patient, and cannot rename it.
    again = await book(booking_client, lead_id, patient_full_name="Different Name")
    assert again["patient_id"] == patient["id"]
    assert await db.patients.count_documents({}) == 1
    assert (await db.patients.find_one({"id": patient["id"]}))["full_name"] == official


@pytest.mark.parametrize("identity", ["converted", "iin"])
async def test_booking_preserves_existing_patient_name(clean_db, booking_client, identity):
    db = clean_db
    await db.patients.insert_one({"id": "existing", "full_name": "Existing Official Name",
                                 "phone": "+77059998877", "iin": "123456789012"})
    lead_id = await seed_lead(db, **({"converted_to_client_id": "existing"} if identity == "converted"
                                   else {"iin": "123456789012"}))
    await seed_chat(db)
    result = await book(booking_client, lead_id, patient_full_name="Untrusted New Name")
    assert result["patient_id"] == "existing"
    assert await db.patients.count_documents({}) == 1
    assert (await db.patients.find_one({"id": "existing"}))["full_name"] == "Existing Official Name"
    lead = await db.crm_leads.find_one({"id": lead_id})
    assert lead["converted_to_client_id"] == "existing"
    assert (lead["last_name"], lead["first_name"], lead["middle_name"]) == ("Existing", "Official", "Name")
    stored = await db.wazzup_chats.find_one({"phone": PHONE})
    assert stored["linked_patient_id"] == "existing"
    assert stored["contact_name"] == RAW_NAME
    assert (await WazzupChatService(db).list_chats())[0]["patient_name"] == "Existing Official Name"


async def test_booking_without_optional_name_preserves_legacy_name(clean_db, booking_client):
    lead_id = await seed_lead(clean_db)
    result = await book(booking_client, lead_id)
    patient = await clean_db.patients.find_one({"id": result["patient_id"]})
    assert patient["full_name"] == "Old Alias"
    assert patient["middle_name"] == "Obsolete"
