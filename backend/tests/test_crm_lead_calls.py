from copy import deepcopy
from datetime import datetime, timedelta, timezone
import re
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from bson import ObjectId
import pytest

from crm.routes import leads as routes
from crm.schemas.lead_schemas import LeadResponse, LeadCallResponse
from crm.services.lead_calls import call_history, load_group_calls, resolve_group_patients
from crm.services.lead_identity import group_lead_touches


def inquiry(identifier, **fields):
    return {
        "id": identifier, "first_name": "Client", "phone": "+7 (701) 123-45-67",
        "source": "phone", "created_at": datetime(2026, 1, 1), **fields,
    }


def matches_query(document, query):
    if "$or" in query:
        return any(matches_query(document, condition) for condition in query["$or"])
    for field, condition in query.items():
        value = document.get(field)
        if "$in" in condition and value not in condition["$in"]:
            return False
        if "$regex" in condition and (not isinstance(value, str) or not re.search(condition["$regex"], value)):
            return False
    return True


def collection(documents):
    result = Mock()

    def find(query, projection=None):
        matched = [deepcopy(document) for document in documents if matches_query(document, query)]
        if projection:
            matched = [{field: value for field, value in document.items() if field == "_id" or field in projection} for document in matched]
        return SimpleNamespace(to_list=AsyncMock(return_value=matched))

    result.find.side_effect = find
    return result


async def test_real_call_records_are_counted_once_not_phone_inquiries():
    groups = group_lead_touches([inquiry("first"), inquiry("later", patient_id="patient-a")])
    documents = [
        {"_id": ObjectId(), "patient_id": "patient-a", "lead_id": "later", "phone_number": "77011234567"},
        {"_id": ObjectId(), "lead_id": "first", "direction": "outbound"},
        {"_id": ObjectId(), "phone_number": "8 (701) 123-45-67", "normalized_phone": "7011234567"},
    ]
    original = deepcopy(documents)
    calls = collection(documents)
    result = await load_group_calls(SimpleNamespace(telephony_calls=calls), groups)
    assert len(result[0]) == 3
    assert call_history(result[0])["call_count"] == 3
    assert documents == original
    calls.find.assert_called_once()
    assert "raw_payload" not in calls.find.call_args.args[1]
    assert "recording_url" not in calls.find.call_args.args[1]


async def test_explicit_links_win_over_changed_phone_and_block_conflicting_fallback():
    groups = [[inquiry("first", patient_id="patient-a")], [inquiry("other", patient_id="patient-b", phone="77029998877")]]
    documents = [
        {"id": "patient-link", "patient_id": "patient-a", "phone_number": "77029998877"},
        {"id": "lead-link", "lead_id": "first", "phone_number": "77029998877"},
        {"id": "conflicting", "patient_id": "patient-b", "lead_id": "first"},
        {"id": "unknown-patient", "patient_id": "unknown", "phone_number": "77011234567"},
        {"id": "unknown-lead", "lead_id": "unknown", "phone_number": "77011234567"},
    ]
    result = await load_group_calls(SimpleNamespace(telephony_calls=collection(documents)), groups)
    assert [[call["id"] for call in calls] for calls in result] == [["patient-link", "lead-link"], []]


async def test_shared_phone_does_not_duplicate_calls_between_patients_or_unlinked_group():
    groups = group_lead_touches([inquiry("first", patient_id="a"), inquiry("other", patient_id="b"), inquiry("unlinked")])
    documents = [
        {"id": "unlinked-call", "phone_number": "77011234567"},
        {"id": "linked-call", "patient_id": "a", "phone_number": "77011234567"},
    ]
    result = await load_group_calls(SimpleNamespace(telephony_calls=collection(documents)), groups)
    assert sum(len(calls) for calls in result) == 1
    assert next(calls for touches, calls in zip(groups, result) if touches[0]["id"] == "first")[0]["id"] == "linked-call"


@pytest.mark.parametrize("call", [
    {"phone_number": "+1 701 123 4567", "normalized_phone": "7011234567"},
    {"normalized_phone": "7011234567"},
    {"phone_number": "+7 (***) 123-45-67", "normalized_phone": "7011234567"},
    {"phone_number": "00000000000", "normalized_phone": "7011234567"},
])
async def test_suffix_only_invalid_and_different_country_calls_do_not_match(call):
    result = await load_group_calls(SimpleNamespace(telephony_calls=collection([call])), [[inquiry("first")]])
    assert result == [[]]


@pytest.mark.parametrize("call", [
    {"phone_number": "8 (701) 123-45-67"},
    {"normalized_phone": "77011234567"},
    {"phone_number": "+7.701.123.45.67", "normalized_phone": "7011234567"},
])
async def test_full_phone_matches_legacy_and_normalized_records(call):
    result = await load_group_calls(SimpleNamespace(telephony_calls=collection([call])), [[inquiry("first")]])
    assert len(result[0]) == 1


async def test_generic_client_id_supports_patient_and_lead_ids_but_not_collisions():
    groups = [[inquiry("first", patient_id="shared")], [inquiry("shared", phone="77029998877")]]
    documents = [{"id": "ambiguous", "client_id": "shared"}, {"id": "lead", "client_id": "first"}]
    result = await load_group_calls(SimpleNamespace(telephony_calls=collection(documents)), groups)
    assert [[call["id"] for call in calls] for calls in result] == [["lead"], []]


async def test_inferred_patient_identity_cannot_arbitrarily_pick_a_group():
    groups = [[inquiry("first")], [inquiry("other", phone="77029998877")]]
    documents = [{"id": "ambiguous", "patient_id": "a"}, {"id": "explicit", "patient_id": "a", "lead_id": "first"}]
    result = await load_group_calls(SimpleNamespace(telephony_calls=collection(documents)), groups, ["a", "a"])
    assert [[call["id"] for call in calls] for calls in result] == [["explicit"], []]


@pytest.mark.parametrize("phone", [None, "", "123", "+7 (***) 123-45-67"])
async def test_invalid_inquiry_phones_never_trigger_phone_queries(phone):
    calls = collection([{"lead_id": "first"}, {"phone_number": ""}])
    result = await load_group_calls(SimpleNamespace(telephony_calls=calls), [[inquiry("first", phone=phone)]])
    assert len(result[0]) == 1
    assert all("phone_number" not in condition and "normalized_phone" not in condition for condition in calls.find.call_args.args[0]["$or"])


async def test_empty_board_does_not_query_calls_or_patients():
    db = SimpleNamespace(telephony_calls=Mock(), patients=Mock())
    assert await resolve_group_patients(db, []) == []
    assert await load_group_calls(db, []) == []
    db.telephony_calls.find.assert_not_called()
    db.patients.find.assert_not_called()


def test_timeline_is_bounded_but_count_is_complete_and_payload_is_safe():
    documents = [{
        "_id": ObjectId(), "created_at": datetime(2026, 1, 1) + timedelta(minutes=index),
        "direction": "inbound", "status": "answered", "duration": 20, "raw_payload": {"secret": "value"},
    } for index in range(105)]
    original = deepcopy(documents)
    history = call_history(documents)
    assert history["call_count"] == 105
    assert history["call_timeline_truncated"] is True
    assert len(history["call_timeline"]) == 100
    assert history["call_timeline"][0]["id"] == str(documents[-1]["_id"])
    assert history["call_timeline"][-1]["id"] == str(documents[5]["_id"])
    for call in history["call_timeline"]:
        assert "raw_payload" not in call
        LeadCallResponse(**call)
    assert documents == original


def test_timeline_orders_mixed_dates_and_puts_missing_invalid_dates_last():
    documents = [
        {"id": "missing"}, {"id": "invalid", "created_at": "not-a-date"},
        {"id": "older", "created_at": datetime(2026, 1, 1)},
        {"id": "newer", "created_at": "2026-01-02T00:00:00Z"},
        {"id": "same-time", "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc)},
    ]
    history = call_history(documents)
    assert [call["id"] for call in history["call_timeline"]] == ["newer", "same-time", "older", "invalid", "missing"]
    assert history["call_timeline_truncated"] is False
    assert history["call_timeline"][2]["created_at"].tzinfo == timezone.utc
    assert history["call_timeline"][-2]["created_at"] is None
    assert history["call_timeline"][-1]["duration"] == 0


@pytest.mark.parametrize("patients, expected", [
    ([{"id": "a", "phone": "87011234567"}], "a"),
    ([{"id": "a", "phone": "77011234567"}, {"id": "b", "phone": "87011234567"}], None),
    ([{"id": "other-country", "phone": "17011234567"}], None),
    ([], None),
])
async def test_resolve_patient_requires_unique_full_phone(patients, expected):
    result = await resolve_group_patients(SimpleNamespace(patients=collection(patients)), [[inquiry("first")]])
    assert result == [expected]


async def test_resolve_patient_uses_objectid_fallback_and_preserves_explicit_link():
    identifier = ObjectId()
    patients = collection([{"_id": identifier, "phone": "87011234567"}])
    groups = [[inquiry("first")], [inquiry("explicit", patient_id="existing", phone="77029998877")]]
    assert await resolve_group_patients(SimpleNamespace(patients=patients), groups) == [str(identifier), "existing"]


async def test_resolve_patient_keeps_shared_explicit_lead_identities_ambiguous():
    groups = [[inquiry("first", patient_id="a")], [inquiry("other", patient_id="b")], [inquiry("unlinked")]]
    patients = collection([{"id": "a", "phone": "77011234567"}])
    assert await resolve_group_patients(SimpleNamespace(patients=patients), groups) == ["a", "b", None]


async def test_kanban_response_exposes_real_calls_for_phone_resolved_patient(monkeypatch):
    documents = [inquiry("first"), inquiry("later", source="whatsapp", created_at=datetime(2026, 1, 2))]
    db = SimpleNamespace(
        crm_leads=collection(documents),
        patients=collection([{"id": "a", "phone": "87011234567"}]),
        telephony_calls=collection([
            {"_id": ObjectId(), "patient_id": "a", "phone_number": "77029998877", "status": "missed"},
            {"_id": ObjectId(), "lead_id": "later", "status": "answered"},
        ]),
    )

    async def response(lead, database, strict_identity=False):
        assert strict_identity
        assert lead.converted_to_client_id == "a"
        return LeadResponse(**lead.dict(), full_name=lead.full_name)

    monkeypatch.setattr(routes, "lead_to_response", response)
    board = await routes.get_kanban_leads(db)
    assert len(board) == 1
    assert board[0].identity_patient_id == "a"
    assert board[0].converted_to_client_id is None
    assert board[0].call_count == 2
    assert len(board[0].call_timeline) == 2
    assert len(board[0].linked_inquiries) == 1
    assert '"raw_payload"' not in board[0].json()
