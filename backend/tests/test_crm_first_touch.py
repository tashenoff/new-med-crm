from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from crm.models.lead import Lead, LeadStatus
from crm.routes import leads as routes
from crm.schemas.lead_schemas import LeadResponse
from crm.services.lead_identity import group_lead_touches, normalize_identity_phone


def touch(identifier, day=0, **fields):
    return {
        "id": identifier,
        "first_name": "Same name",
        "phone": "+7 (701) 123-45-67",
        "source": "phone",
        "status": "new",
        "created_at": datetime(2026, 1, 1) + timedelta(days=day),
        "updated_at": datetime(2026, 1, 1),
        **fields,
    }


@pytest.mark.parametrize("phone", [None, "", "123", "123456789", "+7 (***) 123-45-67", "+7 (___) 123-45-67", "77011234567 ext 1", "00000000000", "1234567890123456"])
def test_invalid_phones_never_group(phone):
    assert normalize_identity_phone(phone) is None
    assert len(group_lead_touches([touch("first", phone=phone), touch("later", phone=phone)])) == 2


def test_formatted_phone_group_is_read_only_and_keeps_first_status():
    documents = [touch("later", 2, phone="8 (701) 123-45-67", source="whatsapp", status="closed"), touch("first")]
    original = deepcopy(documents)
    groups = group_lead_touches(documents)
    assert [[document["id"] for document in group] for group in groups] == [["first", "later"]]
    assert groups[0][0]["status"] == "new"
    assert documents == original


def test_patient_link_beats_changed_or_shared_phone():
    documents = [
        touch("first", converted_to_client_id="patient-a", phone=""),
        touch("later", 1, patient_id="patient-a", phone="77029998877"),
        touch("other", 2, converted_to_client_id="patient-b", phone="77029998877"),
        touch("ambiguous", 3, phone="77029998877"),
    ]
    groups = group_lead_touches(documents)
    assert {tuple(document["id"] for document in group) for group in groups} == {
        ("first", "later"), ("other",), ("ambiguous",)
    }


def test_unlinked_first_touch_attaches_only_to_unique_phone_link():
    groups = group_lead_touches([touch("first"), touch("later", 1, patient_id="patient-a"), touch("changed", 2, converted_to_client_id="patient-a", phone="77029998877")])
    assert [[document["id"] for document in group] for group in groups] == [["first", "later", "changed"]]


def test_names_do_not_group_and_equal_timestamps_are_deterministic():
    documents = [touch("b"), touch("a", created_at=datetime(2026, 1, 1, tzinfo=timezone.utc)), touch("other", phone="77029998877")]
    groups = group_lead_touches(documents)
    assert {tuple(document["id"] for document in group) for group in groups} == {("a", "b"), ("other",)}


def test_phone_matching_never_uses_suffixes():
    groups = group_lead_touches([touch("first", phone="+1 701 123 4567"), touch("different-country", phone="+7 701 123 4567")])
    assert len(groups) == 2


async def test_board_groups_before_pagination_and_preserves_history(monkeypatch):
    documents = [touch("first", status="qualified")]
    documents += [touch(f"later-{index}", index + 1, source="whatsapp", notes=f"Inquiry {index}", patient_id="patient-a") for index in range(105)]
    documents += [touch("separate", phone=None, status="lost")]
    original = deepcopy(documents)
    collection = Mock()
    collection.find.return_value.to_list = AsyncMock(return_value=documents)
    db = SimpleNamespace(crm_leads=collection)

    async def response(lead, database, strict_identity=False):
        assert strict_identity
        return LeadResponse(**lead.dict(), full_name=lead.full_name)

    monkeypatch.setattr(routes, "lead_to_response", response)
    board = await routes.get_kanban_leads(db)
    canonical = next(card for card in board if card.id == "first")
    assert len(board) == 2
    assert next(card for card in board if card.id == "separate").phone == ""
    assert canonical.status == LeadStatus.QUALIFIED
    assert canonical.converted_to_client_id is None
    assert canonical.identity_patient_id == "patient-a"
    assert len(canonical.linked_inquiries) == 105
    assert canonical.linked_inquiries[0].notes == "Inquiry 0"
    assert canonical.linked_inquiries[0].patient_id == "patient-a"
    assert canonical.linked_inquiries[0].source == "whatsapp"
    collection.find.assert_called_once_with({})
    collection.find.return_value.to_list.assert_awaited_once_with(length=None)
    assert [call[0] for call in collection.mock_calls] == ["find", "find().to_list"]
    assert documents == original


@pytest.mark.parametrize("phone", ["", "123", "+7 (***) 123-45-67"])
async def test_board_enrichment_does_not_lookup_invalid_phone(phone):
    db = SimpleNamespace(patients=Mock())
    response = await routes.lead_to_response(Lead(**touch("first", phone=phone)), db, strict_identity=True)
    assert response.treatment_plan_total == 0
    db.patients.find.assert_not_called()


async def test_board_enrichment_does_not_choose_shared_phone_patient():
    patients = Mock()
    patients.find.return_value.to_list = AsyncMock(return_value=[{"id": "a", "phone": "77011234567"}, {"id": "b", "phone": "87011234567"}])
    response = await routes.lead_to_response(Lead(**touch("first")), SimpleNamespace(patients=patients), strict_identity=True)
    assert response.treatment_plan_total == 0


async def test_scheduling_retains_contacted_status(monkeypatch):
    lead = Lead(**touch("first", converted_to_client_id="patient-a"))
    service = SimpleNamespace(get_lead_by_id=AsyncMock(return_value=lead), update_lead_status=AsyncMock())
    monkeypatch.setattr(routes, "LeadService", lambda db: service)
    patients = SimpleNamespace(find_one=AsyncMock(return_value={"id": "patient-a"}))
    appointments = Mock()
    appointments.find.return_value.to_list = AsyncMock(return_value=[])
    appointments.insert_one = AsyncMock()
    result = await routes.schedule_appointment_from_lead("first", {
        "appointment_date": "2026-10-08", "appointment_time": "10:00", "end_time": "10:30", "doctor_id": "doctor-a"
    }, {"patients": patients, "appointments": appointments})
    assert result["patient_id"] == "patient-a"
    assert appointments.insert_one.call_args.args[0]["status"] == "confirmed"
    service.update_lead_status.assert_awaited_once_with("first", LeadStatus.CONTACTED, "Запись на прием создана")
