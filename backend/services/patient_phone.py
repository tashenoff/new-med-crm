"""Conservative formatting at patient creation boundaries, never a data migration."""
import re

import phonenumbers


def normalize_patient_phone(value: str) -> str:
    """Add '+' only to a validated international identity, preserving its digits.

    Bare short numbers and 11-digit local 8 prefixes are ambiguous. Leave them,
    malformed values and unsupported numbers unchanged rather than guessing a country.
    """
    if not isinstance(value, str) or not re.fullmatch(r"\+?[0-9\s().-]+", value.strip()):
        return value
    digits = re.sub(r"[^0-9]", "", value)
    if not value.strip().startswith("+") and (
        len(digits) < 11 or (len(digits) == 11 and digits.startswith("8"))
    ):
        return value
    candidate = "+" + digits
    try:
        number = phonenumbers.parse(candidate, None)
    except phonenumbers.NumberParseException:
        return value
    if phonenumbers.is_valid_number(number) and phonenumbers.format_number(
        number, phonenumbers.PhoneNumberFormat.E164
    ) == candidate:
        return candidate
    return value
