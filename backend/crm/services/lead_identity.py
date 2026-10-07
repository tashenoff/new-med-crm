import re
from collections import defaultdict
from datetime import datetime, timezone


def normalize_identity_phone(phone):
    if not isinstance(phone, str) or not re.fullmatch(r"\+?[0-9\s().-]+", phone.strip()):
        return None
    digits = re.sub(r"[^0-9]", "", phone)
    if not 10 <= len(digits) <= 15 or len(set(digits)) == 1:
        return None
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    return digits


def patient_link(document):
    return document.get("converted_to_client_id") or document.get("patient_id")


def touch_order(document):
    created_at = document.get("created_at")
    if isinstance(created_at, str):
        try:
            created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except ValueError:
            created_at = None
    if not isinstance(created_at, datetime):
        created_at = datetime.max.replace(tzinfo=timezone.utc)
    elif created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return created_at, str(document.get("id", ""))


def group_lead_touches(documents):
    """Build a read-only first-touch projection, without merging source documents."""
    phone_links = defaultdict(set)
    for document in documents:
        phone = normalize_identity_phone(document.get("phone"))
        link = patient_link(document)
        if phone and link:
            phone_links[phone].add(link)

    groups = defaultdict(list)
    for document in documents:
        link = patient_link(document)
        phone = normalize_identity_phone(document.get("phone"))
        if link:
            key = ("patient", link)
        elif phone and len(phone_links[phone]) == 1:
            key = ("patient", next(iter(phone_links[phone])))
        elif phone:
            key = ("phone", phone)
        else:
            key = ("lead", document["id"])
        groups[key].append(document)

    return sorted(
        [sorted(touches, key=touch_order) for touches in groups.values()],
        key=lambda touches: touch_order(touches[0]),
        reverse=True,
    )
