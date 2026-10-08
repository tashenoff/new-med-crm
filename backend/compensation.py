"""Pure compensation rules; no persistence, price allocation or currency conversion."""

from datetime import datetime, timezone
from math import isfinite


COMPENSATION_FIELDS = frozenset({
    "payment_type", "payment_value", "currency", "hybrid_fixed_amount",
    "hybrid_percentage_value", "payment_mode", "services",
    "consultation_compensation_mode", "consultation_payment_type",
    "consultation_payment_value", "consultation_currency",
    "consultation_hybrid_fixed_amount", "consultation_hybrid_percentage_value",
})


def nonnegative(value, field):
    if isinstance(value, bool):
        raise ValueError(f"{field} must be a finite non-negative number")
    try:
        amount = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field} must be a finite non-negative number") from None
    if not isfinite(amount) or amount < 0:
        raise ValueError(f"{field} must be a finite non-negative number")
    return amount


def validate_compensation(settings, require_mode=False):
    """Validate supplied fields, or an effective merged update before persistence."""
    mode = settings.get("consultation_compensation_mode")
    if require_mode and mode is None:
        raise ValueError("consultation_compensation_mode must be explicitly selected")
    if "consultation_compensation_mode" in settings and mode not in ("none", "inherit", "separate"):
        raise ValueError("consultation_compensation_mode must be none, inherit or separate")
    if "payment_mode" in settings and settings["payment_mode"] not in ("general", "individual"):
        raise ValueError("payment_mode must be general or individual")
    for prefix in ("", "consultation_"):
        currency_field = prefix + "currency"
        if currency_field in settings and settings[currency_field] != "KZT":
            raise ValueError(f"{currency_field}: compensation currency must be KZT")
        kind = settings.get(prefix + "payment_type")
        if prefix + "payment_type" in settings and kind not in ("percentage", "fixed", "hybrid"):
            raise ValueError(f"{prefix}payment_type is invalid")
        for suffix in ("payment_value", "hybrid_percentage_value", "hybrid_fixed_amount"):
            field = prefix + suffix
            if field not in settings:
                continue
            amount = nonnegative(settings[field], field)
            if (suffix == "hybrid_percentage_value" or
                    (suffix == "payment_value" and kind == "percentage")) and amount > 100:
                raise ValueError(f"{field} must be between 0 and 100")
        alias = prefix + "hybrid_fixed_amount"
        if settings.get(alias) and settings[alias] != settings.get(prefix + "payment_value"):
            raise ValueError(f"{alias} is deprecated; use {prefix}payment_value for fixed per occurrence")
    if mode == "separate" and require_mode:
        for field in ("consultation_payment_type", "consultation_payment_value"):
            if settings.get(field) is None:
                raise ValueError(f"{field} is required for separate consultation compensation")
        if settings.get("consultation_payment_type") == "hybrid" and settings.get("consultation_hybrid_percentage_value") is None:
            raise ValueError("consultation_hybrid_percentage_value is required for hybrid consultations")
    for service in settings.get("services") or []:
        if isinstance(service, str):
            continue
        if not isinstance(service, dict) or not service.get("service_id"):
            raise ValueError("services must contain service IDs or service commission objects")
        kind = service.get("commission_type", "percentage")
        if kind not in ("fixed", "percentage"):
            raise ValueError("Individual commission_type must be fixed or percentage")
        amount = nonnegative(service.get("commission_value", 0), "commission_value")
        if kind == "percentage" and amount > 100:
            raise ValueError("commission_value must be between 0 and 100")
        if service.get("commission_currency", "KZT") != "KZT":
            raise ValueError("commission_currency must be KZT")


def tariff(settings, prefix=""):
    """Read the canonical tariff without substituting deprecated hybrid aliases."""
    kind = settings.get(prefix + "payment_type") or "percentage"
    value = settings.get(prefix + "payment_value") or 0
    percent = settings.get(prefix + "hybrid_percentage_value") or 0
    currency = settings.get(prefix + "currency", "KZT")
    alias = settings.get(prefix + "hybrid_fixed_amount")
    if currency != "KZT":
        raise ValueError("legacy_non_kzt_compensation")
    if alias and alias != value:
        raise ValueError("legacy_hybrid_tariff_ambiguous")
    validate_compensation({prefix + "payment_type": kind, prefix + "payment_value": value,
                           prefix + "hybrid_percentage_value": percent})
    return kind, float(value), float(percent)


def accrue(scheme, received, completed):
    kind, value, percent = scheme
    if kind == "fixed":
        return value * completed
    if kind == "hybrid":
        return value * completed + received * percent / 100
    return received * value / 100


def in_period(value, start, end):
    try:
        parsed = value if isinstance(value, datetime) else datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return start <= parsed <= end
    except (TypeError, ValueError, AttributeError):
        return None


def service_accrual_data(item, start, end):
    """Only dated explicit completions/receipts qualify for a period report."""
    blockers = set()
    completed = 0
    sessions = item.get("sessions") or []
    for session in sessions:
        if session.get("completed") is True:
            included = in_period(session.get("date"), start, end)
            if included is None:
                blockers.add("completion_period_unavailable")
            elif included:
                completed += 1
    if not sessions:
        blockers.add("service_completion_unavailable")
    if (item.get("quantity_completed") or 0) > sum(session.get("completed") is True for session in sessions):
        blockers.add("completion_period_unavailable")
    received = 0.0
    receipt_items = sessions if item.get("payment_type") == "per_session" else [item]
    for receipt in receipt_items:
        if "paid_amount" not in receipt or receipt["paid_amount"] is None:
            if receipt.get("paid") or receipt.get("payment_status") in ("paid", "partially_paid"):
                blockers.add("actual_receipt_amount_unavailable")
            continue
        try:
            amount = nonnegative(receipt["paid_amount"], "paid_amount")
        except ValueError:
            blockers.add("invalid_actual_receipt_amount")
            continue
        included = in_period(receipt.get("paid_at") or receipt.get("payment_date"), start, end)
        if amount and included is None:
            blockers.add("receipt_period_unavailable")
        elif included:
            received += amount
    return received, completed, blockers
