from collections import defaultdict
from datetime import datetime, timezone

from .lead_identity import normalize_identity_phone, patient_link, touch_order


CALL_TIMELINE_LIMIT = 100
CALL_FIELDS = (
    "id", "phone_number", "normalized_phone", "patient_id", "lead_id", "client_id",
    "direction", "status", "disposition", "duration", "created_at", "notes",
)


def phone_pattern(phone):
    digits = list(phone)
    if len(phone) == 11 and phone.startswith("7"):
        digits[0] = "[78]"
    return r"^\s*\+?[\s().-]*" + r"[\s().-]*".join(digits) + r"[\s().-]*$"


async def resolve_group_patients(db, groups):
    identities = [next((patient_link(touch) for touch in touches if patient_link(touch)), None) for touches in groups]
    phones = {
        phone for touches, identity in zip(groups, identities) if not identity
        for touch in touches if (phone := normalize_identity_phone(touch.get("phone")))
    }
    if not phones:
        return identities
    patients = await db.patients.find(
        {"$or": [{"phone": {"$regex": phone_pattern(phone)}} for phone in sorted(phones)]},
        {"id": 1, "phone": 1},
    ).to_list(length=None)
    matches = defaultdict(set)
    for touches, identity in zip(groups, identities):
        if identity:
            for touch in touches:
                phone = normalize_identity_phone(touch.get("phone"))
                if phone:
                    matches[phone].add(str(identity))
    for patient in patients:
        phone = normalize_identity_phone(patient.get("phone"))
        identifier = patient.get("id") or patient.get("_id")
        if phone and identifier:
            matches[phone].add(str(identifier))
    for index, touches in enumerate(groups):
        if identities[index]:
            continue
        group_phones = {normalize_identity_phone(touch.get("phone")) for touch in touches}
        candidates = set().union(*(matches[phone] for phone in group_phones if phone))
        if len(candidates) == 1:
            identities[index] = next(iter(candidates))
    return identities


async def load_group_calls(db, groups, identities=None):
    """Match persisted call documents conservatively, never inquiry channels."""
    lead_groups = {}
    patient_groups = defaultdict(set)
    phone_groups = defaultdict(set)
    if identities is None:
        identities = [next((patient_link(touch) for touch in touches if patient_link(touch)), None) for touches in groups]
    for index, touches in enumerate(groups):
        if identities[index]:
            patient_groups[str(identities[index])].add(index)
        for touch in touches:
            lead_groups[str(touch["id"])] = index
            phone = normalize_identity_phone(touch.get("phone"))
            if phone:
                phone_groups[phone].add(index)

    calls_by_group = [[] for touches in groups]
    if not groups:
        return calls_by_group
    conditions = [{"lead_id": {"$in": list(lead_groups)}}]
    if patient_groups:
        conditions.append({"patient_id": {"$in": list(patient_groups)}})
    conditions.append({"client_id": {"$in": sorted(set(lead_groups) | set(patient_groups))}})
    if phone_groups:
        conditions.append({"normalized_phone": {"$in": sorted(
            set(phone_groups) | {phone[-10:] for phone in phone_groups}
        )}})
        conditions.extend({"phone_number": {"$regex": phone_pattern(phone)}} for phone in sorted(phone_groups))
    projection = {field: 1 for field in CALL_FIELDS}
    calls = await db.telephony_calls.find({"$or": conditions}, projection).to_list(length=None)
    for call in calls:
        patient_id = call.get("patient_id")
        lead_id = call.get("lead_id")
        client_id = call.get("client_id")
        if patient_id:
            matches = patient_groups.get(str(patient_id), set())
            index = next(iter(matches)) if len(matches) == 1 else None
            linked_index = lead_groups.get(str(lead_id)) if lead_id else None
            if linked_index is not None:
                if linked_index not in matches:
                    continue
                index = linked_index
        elif lead_id:
            index = lead_groups.get(str(lead_id))
        elif client_id:
            matches = set(patient_groups.get(str(client_id), set()))
            if str(client_id) in lead_groups:
                matches.add(lead_groups[str(client_id)])
            index = next(iter(matches)) if len(matches) == 1 else None
        else:
            phone = normalize_identity_phone(call.get("phone_number"))
            if not call.get("phone_number"):
                normalized = normalize_identity_phone(call.get("normalized_phone"))
                phone = normalized if normalized and len(normalized) > 10 else None
            matches = phone_groups.get(phone, set())
            index = next(iter(matches)) if len(matches) == 1 else None
        if index is not None:
            calls_by_group[index].append(call)
    return calls_by_group


def call_history(calls):
    timeline = []
    for call in calls:
        created_at = touch_order(call)[0]
        timeline.append({
            "id": str(call.get("_id") or call.get("id") or ""),
            "phone_number": call.get("phone_number") or "",
            "direction": call.get("direction"),
            "status": call.get("status"),
            "disposition": call.get("disposition"),
            "duration": call.get("duration") or 0,
            "created_at": None if created_at == datetime.max.replace(tzinfo=timezone.utc) else created_at,
            "notes": call.get("notes"),
        })
    timeline.sort(key=touch_order)
    dated = [call for call in timeline if call["created_at"] is not None]
    undated = [call for call in timeline if call["created_at"] is None]
    timeline = list(reversed(dated)) + undated
    return {
        "call_count": len(calls),
        "call_timeline": timeline[:CALL_TIMELINE_LIMIT],
        "call_timeline_truncated": len(calls) > CALL_TIMELINE_LIMIT,
    }
