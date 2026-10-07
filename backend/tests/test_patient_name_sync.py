from datetime import datetime
import pytest

from services.patient_crm_sync import sync_crm_names_from_patient, parse_full_name


@pytest.mark.asyncio
async def test_sync_updates_linked_client_and_lead(clean_db):
    db = clean_db
    await db.patients.drop()
    await db.crm_clients.drop()
    await db.crm_leads.drop()

    patient_id = "patient-111"
    old_full = "Ivanov Ivan Ivanovich"
    new_full = "Petrov Petr Petrovich"

    await db.patients.insert_one({
        "id": patient_id,
        "full_name": old_full,
        "phone": "+77001112233",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    })

    await db.crm_clients.insert_one({
        "id": "client-111",
        "hms_patient_id": patient_id,
        "first_name": "Ivan",
        "last_name": "Ivanov",
        "middle_name": "Ivanovich",
        "phone": "+77001112233",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    })

    await db.crm_leads.insert_one({
        "id": "lead-111",
        "converted_to_client_id": patient_id,
        "first_name": "Ivan",
        "last_name": "Ivanov",
        "middle_name": "Ivanovich",
        "phone": "+77001112233",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    })

    await sync_crm_names_from_patient(db, patient_id, new_full)

    client = await db.crm_clients.find_one({"id": "client-111"})
    lead = await db.crm_leads.find_one({"id": "lead-111"})

    assert client["last_name"] == "Petrov"
    assert client["first_name"] == "Petr"
    assert client["middle_name"] == "Petrovich"
    assert client["updated_at"] > client["created_at"]

    assert lead["last_name"] == "Petrov"
    assert lead["first_name"] == "Petr"
    assert lead["middle_name"] == "Petrovich"
    assert lead["updated_at"] > lead["created_at"]


@pytest.mark.asyncio
async def test_sync_no_crm_records_does_not_raise(clean_db):
    db = clean_db
    await db.patients.drop()
    await db.crm_clients.drop()
    await db.crm_leads.drop()

    await db.patients.insert_one({
        "id": "patient-222",
        "full_name": "Sidorov Sidor",
        "phone": "+77002223344",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    })

    await sync_crm_names_from_patient(db, "patient-222", "Kuznetsov Kuzma")


@pytest.mark.asyncio
async def test_sync_only_matching_client_updated(clean_db):
    db = clean_db
    await db.patients.drop()
    await db.crm_clients.drop()
    await db.crm_leads.drop()

    await db.patients.insert_one({
        "id": "patient-333",
        "full_name": "Old Name",
        "phone": "+77003334455",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    })

    await db.crm_clients.insert_one({
        "id": "client-match",
        "hms_patient_id": "patient-333",
        "first_name": "Name",
        "last_name": "Old",
        "phone": "+77003334455",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    })

    await db.crm_clients.insert_one({
        "id": "client-other",
        "hms_patient_id": "patient-other",
        "first_name": "Other",
        "last_name": "Otherov",
        "phone": "+77009998877",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    })

    await sync_crm_names_from_patient(db, "patient-333", "Newenko New Newych")

    matched = await db.crm_clients.find_one({"id": "client-match"})
    other = await db.crm_clients.find_one({"id": "client-other"})

    assert matched["last_name"] == "Newenko"
    assert matched["first_name"] == "New"
    assert matched["middle_name"] == "Newych"

    assert other["last_name"] == "Otherov"
    assert other["first_name"] == "Other"
    assert "middle_name" not in other or other.get("middle_name") is None