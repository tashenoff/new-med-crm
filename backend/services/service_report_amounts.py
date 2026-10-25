"""Read-only service report amounts; never redistribute recorded row payments."""
from decimal import Decimal, ROUND_HALF_UP


def cents(value):
    return int((Decimal(str(value or 0)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def row_amounts(row):
    children = row.get("components") if row.get("is_complex") else (
        row.get("sessions") if row.get("is_course") else None)
    child_amounts = [row_amounts({"price": row.get("session_price", row.get("price_per_unit", 0)), **child})
                     if row.get("is_course") else row_amounts(child) for child in (children or [])]
    discount = cents(row.get("discount_amount", row.get("discount_total"))) if (
        "discount_amount" in row or "discount_total" in row) else sum(
            cents(child.get("discount_amount")) for child in (children or []))
    expected = max(0, cents(row.get("total_price", row.get("price", 0))) - discount)
    if "paid_amount" in row and row["paid_amount"] is not None:
        paid = cents(row["paid_amount"])
        known = True
    elif child_amounts and any(amount[2] for amount in child_amounts):
        paid = sum(amount[1] for amount in child_amounts)
        known = True
    elif row.get("payment_status") == "paid" or row.get("paid"):
        paid, known = expected, True
    else:
        paid, known = 0, False
    return expected, max(0, paid), known


def service_report_amounts(plan):
    """Return (net expected, allocated paid) in row order.

    Old plans may contain only an aggregate payment. Distribute its remainder
    among rows without payment data. Event-backed plans use recorded amounts
    exclusively: an unallocated deposit is not a service payment.
    """
    amounts = [list(row_amounts(row)) for row in plan.get("services", [])]
    if not plan.get("accounting_events"):
        remaining = max(0, cents(plan.get("paid_amount")) - sum(row[1] for row in amounts))
        candidates = [index for index, row in enumerate(amounts) if not row[2] and row[0] > 0]
        capacity = sum(amounts[index][0] for index in candidates)
        remaining = min(remaining, capacity)
        if capacity and remaining:
            shares = {index: remaining * amounts[index][0] // capacity for index in candidates}
            remainder_order = sorted(candidates, key=lambda index: -(remaining * amounts[index][0] % capacity))
            for index in remainder_order[:remaining - sum(shares.values())]:
                shares[index] += 1
            for index, share in shares.items():
                amounts[index][1] += share
    return [(expected / 100, paid / 100) for expected, paid, _ in amounts]
