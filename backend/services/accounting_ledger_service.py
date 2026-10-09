"""Forward-only ordinary, course and component accounting on the owning plan."""

from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from hashlib import sha256
import json
from uuid import UUID, uuid4, uuid5, NAMESPACE_URL
from urllib.parse import quote

from fastapi import HTTPException

from compensation import accrue, tariff


def reject_ledger_writer(document):
    if document.get("accounting_events"):
        raise HTTPException(409, "This plan has accounting events; use ledger commands. Generic payment, completion, sheet edits and deletion are locked.")


def assign_ledger_identities(rows):
    for row in rows:
        row.setdefault("service_row_id", str(uuid4()))
        quantity = row.get("quantity_total", row.get("quantity", 1)) or 1
        if not isinstance(quantity, int) or isinstance(quantity, bool) or not 1 <= quantity <= 10000:
            raise HTTPException(422, "Service quantity must be an integer from 1 to 10000 for stable occurrences")
        row.setdefault("occurrence_ids", [str(uuid4()) for _ in range(quantity)])
        for component in row.get("components") or []:
            component.setdefault("component_id", str(uuid4()))
            component_quantity = component.get("quantity", 1)
            if isinstance(component_quantity, bool) or not isinstance(component_quantity, (int, float)) or not 1 <= component_quantity <= 10000 or int(component_quantity) != component_quantity:
                raise HTTPException(422, "Component quantity must be an integer from 1 to 10000")
            component.setdefault("occurrence_ids", [str(uuid4()) for _ in range(int(component_quantity))])
        for session in row.get("sessions") or []:
            session.setdefault("session_id", str(uuid4()))


def preserve_ledger_identities(previous_rows, incoming_rows):
    previous = {row["service_row_id"]: row for row in previous_rows if row.get("service_row_id")}
    incoming_ids = [row.get("service_row_id") for row in incoming_rows if row.get("service_row_id")]
    if len(incoming_ids) != len(set(incoming_ids)):
        raise HTTPException(409, "Duplicate stable service_row_id")
    for row in incoming_rows:
        original = previous.get(row.get("service_row_id"))
        if original:
            if row.get("service_id") != original.get("service_id") or row.get("occurrence_ids") != original.get("occurrence_ids"):
                raise HTTPException(409, "Service identity and stable occurrence_ids cannot be rewritten")
            for child_field, identity_field in (("components", "component_id"), ("sessions", "session_id")):
                identities = [child.get(identity_field) for child in original.get(child_field) or []]
                if identities and identities != [child.get(identity_field) for child in row.get(child_field) or []]:
                    raise HTTPException(409, f"Stable {identity_field} identities cannot be rewritten")
                if child_field == "components" and any(
                        old.get("service_id") != new.get("service_id") or old.get("occurrence_ids") != new.get("occurrence_ids")
                        for old, new in zip(original.get(child_field) or [], row.get(child_field) or [])):
                    raise HTTPException(409, "Component service identity and occurrence_ids cannot be rewritten")
        elif any(original.get("service_id") == row.get("service_id") for original in previous.values()):
            raise HTTPException(409, "Preserve the existing service_row_id when editing a row")


def money(value, field):
    try:
        if isinstance(value, bool) or value is None:
            raise ValueError
        amount = Decimal(str(value))
        if not amount.is_finite() or amount < 0 or amount != amount.quantize(Decimal("0.01")):
            raise ValueError
        return amount
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(422, f"{field} must be a finite non-negative KZT amount with at most two decimal places") from None


def validate_deposit_catalog(catalog, service_id):
    # The catalog's individual service type is "regular"; analyses carry a lab link.
    if (not isinstance(catalog, dict) or catalog.get("id") != service_id or catalog.get("service_type") not in (None, "regular")
            or catalog.get("laboratory_id") or catalog.get("laboratory_name")
            or catalog.get("is_analysis") or catalog.get("is_lab_analysis")
            or "анализ" in str(catalog.get("category", "")).lower()):
        raise HTTPException(409, "Patient deposits require a known individual non-analysis service")


def deposit_catalog_snapshot(catalog):
    snapshot = {field: catalog.get(field) for field in ("id", "service_type", "laboratory_id", "laboratory_name", "category", "is_analysis", "is_lab_analysis")}
    if snapshot["service_type"] is None:
        snapshot["service_type"] = "regular"
    return snapshot


def is_ledger_plan(plan):
    return "accounting_events" in plan or any(row.get("service_row_id") for row in plan.get("services", []))


def frontend_receipt(body):
    command = dict(body)
    for source, target in (("amount", "amount_kzt"), ("discount_amount", "discount_amount_kzt"),
                           ("funding_source", "payment_source")):
        if source in command:
            value = command.pop(source)
            if target in command and command[target] != value:
                raise HTTPException(422, f"Conflicting {source} and {target}")
            command[target] = value
    if "payment_method_id" in command:
        if "payment_method" in command and command["payment_method"] != command["payment_method_id"]:
            raise HTTPException(422, "Conflicting payment method identity")
        command["payment_method"] = command["payment_method_id"]
    return command


def stable_row(plan, service_id, row_id=None):
    targets = [row for row in plan.get("services", []) if row.get("service_id") == service_id
               and (row_id is None or row.get("service_row_id") == row_id)]
    if len(targets) != 1 or not targets[0].get("service_row_id"):
        raise HTTPException(422, "Send a unique stable service_row_id belonging to this catalog service")
    return targets[0]["service_row_id"]


def completion_command(plan, row_id, occurrence_id, body):
    command = dict(body)
    for field, expected in (("service_row_id", row_id), ("occurrence_id", occurrence_id)):
        if field in command and command.pop(field) != expected:
            raise HTTPException(422, f"Conflicting {field}")
    rows = [row for row in plan.get("services", []) if row.get("service_row_id") == row_id]
    if len(rows) != 1:
        raise HTTPException(422, "A unique stable service_row_id is required")
    row = rows[0]
    for index, stable_id in enumerate(row.get("occurrence_ids") or []):
        alias = "occurrence:" + quote(f"{plan['id']}:{row.get('service_id')}:{index}", safe="~()*!.'")
        if occurrence_id == alias:
            occurrence_id = stable_id
            break
    return command, occurrence_id


def plan_result(plan, result):
    document = deepcopy(plan)
    document.pop("_id", None)
    document["advance_balance_kzt"] = float(advance_balance(document.get("accounting_events", []), document["id"]))
    document["deposit_balance"] = float(patient_deposit_balance(document.get("accounting_events", []), document["id"]))
    return dict(result, plan=document)


def canonical_request(plan_id, row_id, kind, body, occurrence_id):
    if kind.startswith("component_"):
        command = dict(body)
        component_id = command.pop("component_id", None)
        if not isinstance(component_id, str) or not component_id:
            raise HTTPException(422, "A stable component_id is required")
        operation_id, _, canonical = canonical_request(
            plan_id, row_id, kind.replace("component_", "service_", 1), command, occurrence_id)
        canonical.update(kind=kind, component_id=component_id)
        digest = sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
        return operation_id, digest, canonical
    if kind.startswith("session_"):
        command = dict(body)
        session_id = command.pop("session_id", None)
        scheduled_date = command.pop("date", None) if kind == "session_completion" else None
        if not isinstance(session_id, str) or not session_id or session_id.isdecimal():
            raise HTTPException(422, "A stable session_id, not an index, is required")
        operation_id, _, canonical = canonical_request(
            plan_id, row_id, kind.replace("session_", "service_", 1), command, occurrence_id)
        canonical.update(kind=kind, session_id=session_id)
        if scheduled_date is not None:
            canonical["date"] = scheduled_date
        digest = sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
        return operation_id, digest, canonical
    if not isinstance(body, dict):
        raise HTTPException(422, "A command body with operation_id UUID is required")
    allowed = {"operation_id"}
    if kind == "service_receipt":
        allowed |= {"amount_kzt", "discount_amount_kzt", "payment_source", "payment_method",
                    "payment_method_id", "payment_method_name"}
    elif kind == "plan_advance":
        allowed |= {"amount_kzt", "payment_method", "payment_method_id", "payment_method_name", "note"}
    elif kind in ("service_advance_allocation", "service_deposit_allocation"):
        allowed |= {"amount_kzt", "discount_amount_kzt", "payment_source"}
        if kind == "service_deposit_allocation":
            allowed |= {"completion_occurrence_id"}
    elif kind == "patient_deposit_received":
        allowed |= {"amount_kzt", "appointment_id"}
    elif kind != "service_completion":
        raise HTTPException(422, "Unsupported ordinary-service event kind")
    if set(body) - allowed:
        raise HTTPException(422, "Unknown command fields; doctor, currency and timestamps are server-owned")
    try:
        operation_id = str(UUID(body["operation_id"]))
    except (ValueError, TypeError, AttributeError, KeyError):
        raise HTTPException(422, "operation_id must be a caller UUID") from None
    canonical = dict(plan_id=plan_id, service_row_id=row_id, kind=kind, occurrence_id=occurrence_id)
    if kind in ("service_receipt", "plan_advance"):
        amount = money(body.get("amount_kzt"), "amount_kzt")
        discount = money(body.get("discount_amount_kzt", 0), "discount_amount_kzt")
        if not amount:
            raise HTTPException(422, "Receipt amount must be positive")
        if kind == "service_receipt" and body.get("payment_source") != "cash":
            raise HTTPException(422, "Only explicit cash receipts are supported; plan-credit allocation is not implemented")
        method = body.get("payment_method")
        if not isinstance(method, str) or not method.strip():
            raise HTTPException(422, "payment_method is required")
        canonical.update(amount_kzt=format(amount, ".2f"), payment_method=method.strip())
        if kind == "service_receipt":
            canonical.update(discount_amount_kzt=format(discount, ".2f"), payment_source="cash")
        elif "note" in body:
            if body["note"] is not None and not isinstance(body["note"], str):
                raise HTTPException(422, "note must be a string")
            canonical["note"] = body["note"]
        for field in ("payment_method_id", "payment_method_name"):
            if field in body:
                if not isinstance(body[field], str) or not body[field].strip():
                    raise HTTPException(422, f"{field} must be a non-empty string")
                canonical[field] = body[field].strip()
        if "payment_method_id" in canonical and canonical["payment_method_id"] != canonical["payment_method"]:
            raise HTTPException(422, "Conflicting payment method identity")
    elif kind == "patient_deposit_received":
        amount = money(body.get("amount_kzt"), "amount_kzt")
        if not amount or not isinstance(body.get("appointment_id"), str) or not body["appointment_id"] or row_id is not None:
            raise HTTPException(422, "Patient deposit requires appointment identity and positive amount")
        canonical.update(amount_kzt=format(amount, ".2f"), appointment_id=body["appointment_id"])
    elif kind in ("service_advance_allocation", "service_deposit_allocation"):
        amount = money(body.get("amount_kzt"), "amount_kzt")
        discount = money(body.get("discount_amount_kzt", 0), "discount_amount_kzt")
        source = "patient_deposit" if kind == "service_deposit_allocation" else "plan_advance"
        if not amount or body.get("payment_source") != source:
            raise HTTPException(422, f"Allocation requires a positive amount and payment_source={source}")
        canonical.update(amount_kzt=format(amount, ".2f"), discount_amount_kzt=format(discount, ".2f"),
                         payment_source=source)
        if "completion_occurrence_id" in body:
            if not isinstance(body["completion_occurrence_id"], str) or not body["completion_occurrence_id"]:
                raise HTTPException(422, "Stable completion_occurrence_id is required")
            canonical["completion_occurrence_id"] = body["completion_occurrence_id"]
    elif not isinstance(occurrence_id, str) or not occurrence_id:
        raise HTTPException(422, "A stable occurrence_id is required")
    digest = sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    return operation_id, digest, canonical


def resolve_snapshot(doctor, service_id):
    mode = doctor.get("payment_mode") or "general"
    settings = doctor
    if mode == "individual":
        configs = [entry for entry in doctor.get("services") or []
                   if isinstance(entry, dict) and entry.get("service_id") == service_id]
        if len(configs) != 1 or configs[0].get("commission_type") not in ("fixed", "percentage") or configs[0].get("commission_value") is None:
            raise HTTPException(409, "An explicit individual service tariff is required")
        config = configs[0]
        settings = dict(payment_type=config["commission_type"], payment_value=config["commission_value"],
                        currency=config.get("commission_currency", "KZT"))
    elif mode != "general":
        raise HTTPException(409, "Invalid doctor compensation mode")
    try:
        kind, value, percent = tariff(settings)
    except ValueError as error:
        raise HTTPException(409, f"Cannot snapshot doctor tariff: {error}") from None
    return dict(payment_mode=mode, payment_type=kind, payment_value=value,
                hybrid_percentage_value=percent, currency="KZT", service_id=service_id)


def compensation_amount(snapshot, kind, amount):
    kind = base_event_kind(kind)
    scheme = tariff(snapshot)
    computed = accrue(scheme, float(amount) if kind in ("service_receipt", "service_advance_allocation") else 0,
                      1 if kind == "service_completion" else 0)
    return float(Decimal(str(computed)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def utc_datetime(value):
    if not isinstance(value, datetime):
        raise ValueError("Stored event timestamp must be a BSON datetime")
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def event_result(event):
    result = deepcopy(event)
    for field in ("occurred_at", "recorded_at"):
        result[field] = utc_datetime(result[field])
    return {"event": result}


def advance_balance(events, plan_id):
    if not isinstance(events, list) or any(not isinstance(event, dict) for event in events):
        raise HTTPException(409, "Invalid accounting_events storage")
    balance = Decimal("0")
    seen = set()
    for event in events:
        kind = event.get("kind")
        if kind not in ("plan_advance", "service_advance_allocation", "session_advance_allocation", "component_advance_allocation"):
            continue
        try:
            if event["plan_id"] != plan_id or event["currency"] != "KZT":
                raise ValueError
            identity = (str(UUID(event["event_id"])), str(UUID(event["operation_id"])))
            if any(identity[index] == previous[index] for previous in seen for index in (0, 1)):
                raise ValueError
            seen.add(identity)
            if not event["recorded_by"] or utc_datetime(event["occurred_at"]) != utc_datetime(event["recorded_at"]):
                raise ValueError
            if kind == "plan_advance":
                if event["compensation_amount_kzt"] != 0 or event.get("doctor_id") or event.get("service_row_id"):
                    raise ValueError
                fields = ("operation_id", "amount_kzt", "payment_method", "payment_method_id", "payment_method_name", "note")
                row_id = None
            else:
                fields = ("operation_id", "amount_kzt", "discount_amount_kzt", "payment_source")
                if kind == "session_advance_allocation":
                    fields += ("session_id",)
                elif kind == "component_advance_allocation":
                    fields += ("component_id",)
                row_id = event["service_row_id"]
                snapshot = event["compensation_snapshot"]
                if not row_id or not event["doctor_id"] or not event["service_id"] or "payment_method" in event:
                    raise ValueError
                if not isinstance(snapshot, dict) or snapshot.get("service_id") != event["service_id"]:
                    raise ValueError
                if compensation_amount(snapshot, kind, event["amount_kzt"]) != float(money(event["compensation_amount_kzt"], "event compensation")):
                    raise ValueError
            body = {field: event[field] for field in fields if field in event}
            _, request_hash, _ = canonical_request(plan_id, row_id, kind, body, None)
            if request_hash != event["request_hash"]:
                raise ValueError
            amount = money(event["amount_kzt"], "advance event amount")
            balance += amount if kind == "plan_advance" else -amount
            if balance < 0:
                raise ValueError
        except (ValueError, KeyError, TypeError, HTTPException):
            raise HTTPException(409, "Invalid plan advance event; balance is blocked") from None
    return balance


def reject_legacy_balance(plan, events):
    if not events and (plan.get("paid_amount") or plan.get("deposit_amount") or plan.get("deposit_balance")
                       or plan.get("extra_deposit") or plan.get("payment_status") in ("paid", "partially_paid")):
        raise HTTPException(409, "Unallocated legacy plan balances are not event evidence; no backfill is supported")


def patient_deposit_balance(events, plan_id):
    """Only validated plan-owned appointment assignments can fund allocations."""
    if not isinstance(events, list) or any(not isinstance(event, dict) for event in events):
        raise HTTPException(409, "Invalid patient deposit event storage")
    balance = Decimal("0")
    identities = set()
    appointments = set()
    for event in events:
        kind = event.get("kind", "")
        if not isinstance(kind, str):
            raise HTTPException(409, "Invalid patient deposit event kind")
        if kind != "patient_deposit_received" and base_event_kind(kind) != "service_deposit_allocation":
            continue
        try:
            identity = (str(UUID(event["event_id"])), str(UUID(event["operation_id"])))
            if any(identity[i] == previous[i] for previous in identities for i in (0, 1)):
                raise ValueError
            identities.add(identity)
            if event["plan_id"] != plan_id or event["currency"] != "KZT" or not event["recorded_by"] or event["compensation_amount_kzt"] != 0:
                raise ValueError
            if utc_datetime(event["occurred_at"]) != utc_datetime(event["recorded_at"]):
                raise ValueError
            fields = ("operation_id", "amount_kzt", "appointment_id") if kind == "patient_deposit_received" else (
                "operation_id", "amount_kzt", "discount_amount_kzt", "payment_source", "component_id", "session_id", "completion_occurrence_id")
            body = {field: event[field] for field in fields if field in event}
            if kind == "patient_deposit_received":
                if event.get("doctor_id") or event.get("service_id") or event.get("service_row_id") or event.get("compensation_snapshot") or event["appointment_id"] in appointments:
                    raise ValueError
                appointments.add(event["appointment_id"])
                row_id = None
            else:
                row_id = event["service_row_id"]
                if not row_id or not event["doctor_id"] or not event["service_id"] or not event["completion_occurrence_id"] or event.get("payment_method"):
                    raise ValueError
            _, digest, _ = canonical_request(plan_id, row_id, kind, body, None)
            if digest != event["request_hash"]:
                raise ValueError
            amount = money(event["amount_kzt"], "patient deposit amount")
            balance += amount if kind == "patient_deposit_received" else -amount
            if balance < 0:
                raise ValueError
        except (KeyError, TypeError, ValueError, HTTPException):
            raise HTTPException(409, "Invalid or unlinked patient deposit event; balance is blocked") from None
    return balance


def execution_projection(rows, events):
    completions = [event for event in events if event.get("kind") in ("service_completion", "session_completion", "component_completion")]
    completed = {(event["service_row_id"], event.get("component_id"), event["kind"], event["occurrence_id"]) for event in completions}
    expected = set()
    for row in rows:
        if row.get("is_complex"):
            components = row.get("components") or []
            if not components or any(not component.get("component_id") or not component.get("occurrence_ids") for component in components):
                return dict(execution_status="in_progress", completed_at=None,
                            started_at=min(utc_datetime(event["occurred_at"]) for event in completions))
            row_expected = {(row.get("service_row_id"), component["component_id"], "component_completion", identity)
                            for component in components for identity in component["occurrence_ids"]}
            expected.update(row_expected)
            row["status"] = "completed" if row_expected <= completed else "in_progress"
            continue
        course = row.get("is_course") or row.get("payment_type") == "per_session"
        identities = [(session.get("session_id") or session.get("id")) for session in row.get("sessions") or []] if course else row.get("occurrence_ids") or []
        if not identities or any(not identity for identity in identities):
            return dict(execution_status="in_progress", completed_at=None,
                        started_at=min(utc_datetime(event["occurred_at"]) for event in completions))
        expected.update((row.get("service_row_id"), None, "session_completion" if course else "service_completion", identity) for identity in identities)
    all_completed = bool(expected) and expected <= completed
    return dict(execution_status="completed" if all_completed else "in_progress",
                started_at=min(utc_datetime(event["occurred_at"]) for event in completions),
                completed_at=max(utc_datetime(event["occurred_at"]) for event in completions) if all_completed else None)


def base_event_kind(kind):
    return kind.replace("session_", "service_", 1).replace("component_", "service_", 1)


def reject_unresolved_child_state(row, events):
    row_events = [event for event in events if event.get("service_row_id") == row.get("service_row_id")]
    if not row_events and (row.get("paid_amount") or row.get("paid") or row.get("paid_from_deposit")
                           or row.get("quantity_completed") or row.get("payment_status") in ("paid", "partially_paid")):
        raise HTTPException(409, "Legacy row payment/completion state is not event evidence")
    for field, identity in (("sessions", "session_id"), ("components", "component_id")):
        for child in row.get(field) or []:
            child_id = child.get(identity) or (child.get("id") if field == "sessions" else None)
            if not any(event.get(identity) == child_id for event in row_events) and (
                    child.get("paid_amount") or child.get("paid") or child.get("paid_from_deposit")
                    or child.get("completed") or child.get("quantity_completed")
                    or child.get("payment_status") in ("paid", "partially_paid")):
                raise HTTPException(409, "Legacy child payment/completion state is not event evidence")


def component_price(row, component):
    from services.service_price_service import validate_component_snapshot
    components = row.get("components") or []
    # Plan snapshots may repeat a catalog service when each component has its own
    # stable identity. Catalog definitions retain their stricter uniqueness rule.
    identities = [entry.get("component_id") for entry in components]
    if not identities or not all(identities) or len(set(identities)) != len(identities):
        raise HTTPException(409, "Unique stable component identities required")
    validate_component_snapshot([dict(entry, service_id=entry["component_id"]) for entry in components])
    weights = [money(entry["price"], "component price") * entry.get("quantity", 1) for entry in components]
    total = money(row.get("total_price"), "complex total_price")
    scale = Decimal("1") if total == total.to_integral() else Decimal("0.01")
    raw = [total * weight / sum(weights) for weight in weights]
    shares = [(value // scale) * scale for value in raw]
    shares[weights.index(max(weights))] += total - sum(shares)
    return shares[components.index(component)]


class AccountingLedgerService:
    def __init__(self, db):
        self.db = db

    async def plan_deposit_allocations(self, plan, events, balance, operation_id, recorded_by, now):
        """Water-fill prospective exact units using integer cents; never invent identities."""
        rows = deepcopy(plan.get("services", []))
        units = []
        keys = set()
        payment_kinds = ("service_receipt", "service_advance_allocation", "service_deposit_allocation")
        funded_total = sum((money(event["amount_kzt"], "event amount") for event in events
                            if base_event_kind(event.get("kind", "")) in payment_kinds), Decimal("0"))
        if money(plan.get("paid_amount", 0), "paid_amount") != funded_total:
            raise HTTPException(409, "Prior plan payment cannot be reconstructed from events")
        for parent in rows:
            row_id = parent.get("service_row_id")
            if not row_id or sum(row.get("service_row_id") == row_id for row in rows) != 1:
                raise HTTPException(409, "Unique stable service rows required for plan distribution")
            reject_unresolved_child_state(parent, events)
            if parent.get("is_complex"):
                targets = [(child, "component", component_price(parent, child)) for child in parent.get("components") or []]
            elif parent.get("is_course") or parent.get("payment_type") == "per_session":
                targets = [(child, "session", money(child.get("price", parent.get("session_price", parent.get("price_per_unit"))), "session price")) for child in parent.get("sessions") or []]
            else:
                targets = [(parent, "service", money(parent.get("total_price"), "total_price"))]
            if not targets:
                raise HTTPException(409, "Stable payable child units required")
            for target, prefix, price in targets:
                component = target.get("component_id") if prefix == "component" else None
                session = target.get("session_id") if prefix == "session" else None
                identities = [session] if prefix == "session" else target.get("occurrence_ids") or []
                if not identities or any(not isinstance(identity, str) or not identity for identity in identities) or len(set(identities)) != len(identities) or (prefix == "component" and not component):
                    raise HTTPException(409, "Stable exact unit identities required for plan distribution")
                expected_count = 1 if prefix == "session" else target.get("quantity_total", target.get("quantity", 1))
                if len(identities) != expected_count or (prefix == "session" and session.isdecimal()):
                    raise HTTPException(409, "Stable unit identities do not match payable quantity")
                linked = [event for event in events if event.get("service_row_id") == row_id and event.get("component_id") == component and event.get("session_id") == session]
                payments = [event for event in linked if base_event_kind(event.get("kind", "")) in payment_kinds]
                received = sum((money(event["amount_kzt"], "event amount") for event in payments), Decimal("0"))
                if money(target.get("paid_amount", 0), "paid_amount") != received:
                    raise HTTPException(409, "Prior unit payment cannot be reconstructed from events")
                completed_count = sum(base_event_kind(event.get("kind", "")) == "service_completion" for event in linked)
                if ((prefix != "session" and target.get("quantity_completed", 0) != completed_count)
                        or (target.get("completed") and not completed_count)
                        or (target.get("status") == "completed" and completed_count != len(identities))):
                    raise HTTPException(409, "Prior unit completion cannot be reconstructed from events")
                discount = money(target.get("discount_amount", 0), "discount")
                net = price - discount
                if net < received or ((target.get("paid") or target.get("payment_status") == "paid") and net != received):
                    raise HTTPException(409, "Stored funding does not match payable capacity")
                if received == net or completed_count == len(identities):
                    continue
                cents, residual = divmod(int(net * 100), len(identities))
                # Unbound row receipts can only be reconstructed for a single unit.
                unbound = sum((money(event["amount_kzt"], "amount") for event in payments if not event.get("completion_occurrence_id")), Decimal("0"))
                if unbound and len(identities) != 1:
                    raise HTTPException(409, "Prior row payment has no exact occurrence attribution")
                for index, identity in enumerate(identities):
                    key = (row_id, component or "", session or "", identity)
                    if key in keys:
                        raise HTTPException(409, "Duplicate exact payable unit")
                    keys.add(key)
                    funded = sum((money(event["amount_kzt"], "amount") for event in payments if event.get("completion_occurrence_id") == identity), Decimal("0")) + unbound
                    capacity = cents + (index < residual) - int(funded * 100)
                    completed = any(base_event_kind(event.get("kind", "")) == "service_completion" and event.get("occurrence_id") == identity for event in linked)
                    if capacity < 0:
                        raise HTTPException(409, "Exact unit funding exceeds capacity")
                    if capacity and not completed and not target.get("paid") and target.get("payment_status") != "paid":
                        units.append(dict(key=key, target=target, parent=parent, prefix=prefix, capacity=capacity, share=0, discount=discount))
        units.sort(key=lambda unit: unit["key"])
        remaining = int(balance * 100)
        active = list(units)
        while remaining and active:
            capped = [unit for unit in active if (unit["capacity"] - unit["share"]) * len(active) <= remaining]
            if capped:
                for unit in capped:
                    amount = unit["capacity"] - unit["share"]
                    unit["share"] += amount
                    remaining -= amount
                active = [unit for unit in active if unit not in capped]
                continue
            portion, residual = divmod(remaining, len(active))
            for index, unit in enumerate(active):
                unit["share"] += portion + (index < residual)
            remaining = 0
        appended = []
        for unit in units:
            if not unit["share"]:
                continue
            row_id, component, session, identity = unit["key"]
            target, parent = unit["target"], unit["parent"]
            service_id = target.get("service_id", parent.get("service_id"))
            catalog = await self.db.service_prices.find_one({"id": service_id})
            validate_deposit_catalog(catalog, service_id)
            doctor_id = target.get("doctor_id") or parent.get("doctor_id") or plan.get("assigned_doctor_id")
            doctor = await self.db.doctors.find_one({"id": doctor_id}) if doctor_id else None
            if not doctor:
                raise HTTPException(409, "Known earning doctor required for plan distribution")
            snapshot = resolve_snapshot(doctor, service_id)
            command = dict(operation_id=str(uuid5(UUID(operation_id), json.dumps(unit["key"]))), amount_kzt=unit["share"] / 100,
                discount_amount_kzt=float(unit["discount"]), payment_source="patient_deposit", completion_occurrence_id=identity)
            if component:
                command["component_id"] = component
            if session:
                command["session_id"] = session
            kind = unit["prefix"] + "_deposit_allocation"
            _, digest, _ = canonical_request(plan["id"], row_id, kind, command, None)
            appended.append(dict(command, event_id=str(uuid4()), request_hash=digest, kind=kind,
                plan_id=plan["id"], service_row_id=row_id, service_id=service_id, doctor_id=doctor_id,
                currency="KZT", recorded_by=recorded_by, occurred_at=now, recorded_at=now,
                compensation_snapshot=snapshot, compensation_amount_kzt=0, service_catalog_snapshot=deposit_catalog_snapshot(catalog)))
            amount = Decimal(unit["share"]) / 100
            target["paid_amount"] = float(money(target.get("paid_amount", 0), "paid_amount") + amount)
            target["paid_from_deposit"] = float(money(target.get("paid_from_deposit", 0), "paid_from_deposit") + amount)
        for parent in rows:
            children = parent.get("components") if parent.get("is_complex") else parent.get("sessions") if parent.get("is_course") or parent.get("payment_type") == "per_session" else None
            if children is not None:
                parent["paid_amount"] = float(sum((money(child.get("paid_amount", 0), "paid_amount") for child in children), Decimal("0")))
                parent["paid_from_deposit"] = float(sum((money(child.get("paid_from_deposit", 0), "paid_from_deposit") for child in children), Decimal("0")))
        return appended, rows, Decimal(remaining) / 100

    async def record_patient_deposit(self, plan_id, appointment_id, amount, recorded_by):
        operation_id = str(uuid5(NAMESPACE_URL, f"patient-deposit:{plan_id}:{appointment_id}"))
        body = dict(operation_id=operation_id, appointment_id=appointment_id, amount_kzt=amount)
        _, digest, canonical = canonical_request(plan_id, None, "patient_deposit_received", body, None)
        for _ in range(5):
            plan = await self.db.treatment_plans.find_one({"id": plan_id})
            if not plan:
                raise HTTPException(404, "Treatment plan not found")
            events = plan.get("accounting_events", [])
            balance = patient_deposit_balance(events, plan_id)
            previous = next((event for event in events if event.get("operation_id") == operation_id), None)
            if previous:
                if previous["request_hash"] != digest:
                    raise HTTPException(409, "Appointment deposit assignment cannot be rewritten")
                return event_result(previous)
            reject_legacy_balance(plan, events)
            now = datetime.now(timezone.utc)
            now = now.replace(microsecond=(now.microsecond // 1000) * 1000)
            event = dict(event_id=str(uuid4()), operation_id=operation_id, request_hash=digest,
                         kind="patient_deposit_received", plan_id=plan_id, appointment_id=appointment_id,
                         amount_kzt=float(Decimal(canonical["amount_kzt"])), currency="KZT", recorded_by=recorded_by,
                         occurred_at=now, recorded_at=now, compensation_amount_kzt=0,
                         allocation_policy="plan_equal_share_v1")
            query = {"id": plan_id, "accounting_events.operation_id": {"$ne": operation_id}}
            for key in ("accounting_events", "services", "updated_at", "paid_amount", "deposit_amount", "deposit_balance", "extra_deposit", "assigned_doctor_id"):
                query[key] = plan.get(key)
            allocations, rows, remaining = await self.plan_deposit_allocations(plan, events,
                balance + Decimal(canonical["amount_kzt"]), operation_id, recorded_by, now)
            allocated = sum((money(entry["amount_kzt"], "amount") for entry in allocations), Decimal("0"))
            result = await self.db.treatment_plans.update_one(query, {"$push": {"accounting_events": {"$each": [event] + allocations}},
                "$set": {"services": rows, "paid_amount": float(money(plan.get("paid_amount", 0), "paid_amount") + allocated),
                         "deposit_balance": float(remaining), "updated_at": now}})
            if result.matched_count:
                return event_result(event)
        raise HTTPException(409, "Concurrent deposit assignment; retry with the same appointment")

    async def settle_patient_deposit_row(self, plan_id, service_id, body, recorded_by, component_service_id=None, session_id=None):
        """Close the modal's discounted payable using immutable prior unit funding."""
        body = dict(body or {})
        if body.get("component_id") is not None and component_service_id is None:
            raise HTTPException(422, "component_id requires a component route")
        if set(body) - {"amount", "payment_method_id", "payment_method_name", "service_row_id", "component_id"}:
            raise HTTPException(422, "Unsupported modal payment fields")
        for _ in range(5):
            plan = await self.db.treatment_plans.find_one({"id": plan_id})
            if not plan:
                raise HTTPException(404, "Treatment plan not found")
            row_id = stable_row(plan, service_id, body.get("service_row_id"))
            rows = deepcopy(plan["services"])
            row = next(row for row in rows if row["service_row_id"] == row_id)
            parent = row
            component_id = None
            prefix = "service"
            if component_service_id is not None:
                targets = [child for child in row.get("components", [])
                           if component_service_id in (child.get("service_id"), child.get("component_id"))
                           and (not body.get("component_id") or child.get("component_id") == body["component_id"])]
                if not row.get("is_complex") or len(targets) != 1 or not targets[0].get("component_id"):
                    raise HTTPException(422, "A unique stable component is required")
                row = targets[0]
                component_id = row["component_id"]
                prefix = "component"
            elif session_id is not None:
                sessions = row.get("sessions", [])
                # Existing modal URLs use array indices. After assignment the plan
                # is immutable, so resolve that alias to its persisted exact unit.
                if isinstance(session_id, str) and session_id.isdecimal():
                    stable_ids = [child.get("session_id") for child in sessions]
                    if (not any(event.get("allocation_policy") == "plan_equal_share_v1" for event in plan.get("accounting_events", []))
                            or not stable_ids or any(not isinstance(key, str) or not key or key.isdecimal() for key in stable_ids)
                            or len(set(stable_ids)) != len(stable_ids) or int(session_id) >= len(sessions)):
                        raise HTTPException(409, "Legacy session index has no stable exact unit identity")
                    session_id = stable_ids[int(session_id)]
                targets = [child for child in sessions if child.get("session_id") == session_id]
                if (not row.get("is_course") and row.get("payment_type") != "per_session") or len(targets) != 1 or not isinstance(session_id, str):
                    raise HTTPException(422, "A unique stable session_id is required")
                row = targets[0]
                prefix = "session"
            elif row.get("is_complex") or row.get("is_course") or row.get("payment_type") == "per_session":
                raise HTTPException(422, "Use explicit stable component/session deposit commands")
            events = plan.get("accounting_events", [])
            balance = patient_deposit_balance(events, plan_id)
            advance_balance(events, plan_id)
            reject_legacy_balance(plan, events)
            price = (component_price(parent, row) if component_id else
                     money(row.get("price", parent.get("session_price", parent.get("price_per_unit"))), "session price")
                     if session_id else money(row.get("total_price"), "total_price"))
            payable = money(body.get("amount", price - money(row.get("discount_amount", 0), "discount")), "amount")
            if payable > price or not payable:
                raise HTTPException(422, "Payable amount must be positive and at most the service price")
            discount = price - payable
            operation_id = str(uuid5(NAMESPACE_URL, f"patient-deposit-modal:{plan_id}:{row_id}" + (f":{prefix}:{component_id or session_id}" if prefix != "service" else "")))
            prior = [event for event in events if event.get("settlement_id") == operation_id]
            if row.get("patient_deposit_settlement"):
                prior.append(row["patient_deposit_settlement"])
            method = body.get("payment_method_id")
            if prior:
                if any(event["discount_amount_kzt"] != float(discount) or event.get("settlement_payment_method") != method
                       or event.get("settlement_payment_method_name") != body.get("payment_method_name") for event in prior):
                    raise HTTPException(409, "Completed modal settlement cannot be rewritten")
                return plan_result(plan, {})["plan"]
            if not any(event.get("kind") == "patient_deposit_received" for event in events):
                raise HTTPException(409, "No event-backed patient deposit for this plan")
            row_events = [event for event in events if event.get("service_row_id") == row_id
                          and event.get("component_id") == component_id and event.get("session_id") == session_id]
            payments = [event for event in row_events if base_event_kind(event.get("kind", "")) in
                        ("service_receipt", "service_advance_allocation", "service_deposit_allocation")]
            received = sum((money(event["amount_kzt"], "event amount") for event in payments), Decimal("0"))
            deposited = sum((money(event["amount_kzt"], "event amount") for event in payments
                             if base_event_kind(event["kind"]) == "service_deposit_allocation"), Decimal("0"))
            if (money(row.get("paid_amount", 0), "paid_amount") != received
                    or money(row.get("paid_from_deposit", 0), "paid_from_deposit") != deposited):
                raise HTTPException(409, "Unlinked legacy row payment is blocked")
            # The allocation snapshot locks the discount too; modal settlement
            # must obey the same rule as explicit receipts.
            if payments and any(money(event.get("discount_amount_kzt", 0), "discount") != discount for event in payments):
                raise HTTPException(409, "Discount is locked after the first receipt; send the same total discount")
            if received > payable:
                raise HTTPException(409, "Discounted payable is less than immutable prior funding")
            if prefix != "service":
                reject_unresolved_child_state(parent, events)
                if not row_events and (row.get("completed") or row.get("quantity_completed")):
                    raise HTTPException(409, "Unlinked legacy completion is blocked")
            identities = [session_id] if session_id else row.get("occurrence_ids") or []
            if not identities or len(identities) != len(set(identities)):
                raise HTTPException(409, "Stable occurrence identities required")
            earning_service_id = row.get("service_id", service_id)
            catalog = await self.db.service_prices.find_one({"id": earning_service_id})
            validate_deposit_catalog(catalog, earning_service_id)
            doctor_id = row.get("doctor_id") or parent.get("doctor_id") or plan.get("assigned_doctor_id")
            doctor = await self.db.doctors.find_one({"id": doctor_id}) if doctor_id else None
            if not doctor:
                raise HTTPException(409, "Known earning doctor required")
            snapshot = resolve_snapshot(doctor, earning_service_id)
            cash = payable - received
            if cash and (not isinstance(method, str) or not method.strip()):
                raise HTTPException(422, "Payment method required for actual cash receipt")
            now = datetime.now(timezone.utc)
            now = now.replace(microsecond=(now.microsecond // 1000) * 1000)
            appended = []
            if cash:
                command = dict(operation_id=str(uuid5(UUID(operation_id), "cash")), amount_kzt=float(cash),
                    discount_amount_kzt=float(discount), payment_source="cash", payment_method=method)
                for field in ("payment_method_id", "payment_method_name"):
                    if field in body:
                        command[field] = body[field]
                if component_id:
                    command["component_id"] = component_id
                if session_id:
                    command["session_id"] = session_id
                _, digest, _ = canonical_request(plan_id, row_id, prefix + "_receipt", command, None)
                appended.append(dict(command, event_id=str(uuid4()), request_hash=digest, kind=prefix + "_receipt"))
            for event in appended:
                event.update(plan_id=plan_id, service_row_id=row_id, service_id=earning_service_id, doctor_id=doctor_id,
                    currency="KZT", recorded_by=recorded_by, occurred_at=now, recorded_at=now, compensation_snapshot=deepcopy(snapshot),
                    compensation_amount_kzt=compensation_amount(snapshot, base_event_kind(event["kind"]), event["amount_kzt"]),
                    settlement_id=operation_id, settlement_payment_method=method,
                    settlement_payment_method_name=body.get("payment_method_name"))
            row.update(paid_amount=float(payable), paid_from_deposit=float(deposited), discount_amount=float(discount),
                       payment_status="paid", payment_date=now,
                       patient_deposit_settlement=dict(settlement_id=operation_id, discount_amount_kzt=float(discount),
                           settlement_payment_method=method, settlement_payment_method_name=body.get("payment_method_name")))
            for field in ("payment_method_id", "payment_method_name"):
                if field in body:
                    row[field] = body[field]
            if prefix != "service":
                row.update(paid=True, amount_due_kzt=0)
                parent["paid_amount"] = float(sum((money(event["amount_kzt"], "amount") for event in events
                    if event.get("service_row_id") == row_id and base_event_kind(event.get("kind", "")) in
                    ("service_receipt", "service_advance_allocation", "service_deposit_allocation")), Decimal("0")) + cash)
                parent["payment_status"] = "paid" if all(child.get("paid") for child in
                    parent["components" if component_id else "sessions"]) else "partially_paid"
                parent["discount_amount"] = float(sum((money(child.get("discount_amount", 0), "child discount")
                    for child in parent["components" if component_id else "sessions"]), Decimal("0")))
            fields = dict(services=rows, paid_amount=float(sum((money(event["amount_kzt"], "event amount") for event in events
                if base_event_kind(event.get("kind", "")) in ("service_receipt", "service_advance_allocation", "service_deposit_allocation")), Decimal("0")) + cash),
                deposit_balance=float(balance), updated_at=now,
                payment_status="paid" if all(row.get("payment_status") == "paid" for row in rows) else "partially_paid")
            query = {"id": plan_id}
            for key in ("services", "accounting_events", "paid_amount", "updated_at", "assigned_doctor_id", "deposit_balance", "deposit_amount", "extra_deposit"):
                query[key] = plan.get(key)
            result = await self.db.treatment_plans.update_one(query, {"$set": fields, "$push": {"accounting_events": {"$each": appended}}})
            if result.matched_count:
                from services.treatment_plan_service import TreatmentPlanService
                await TreatmentPlanService(self.db).sync_persisted_payment(plan_id)
                return plan_result(await self.db.treatment_plans.find_one({"id": plan_id}), {})["plan"]
        raise HTTPException(409, "Concurrent modal settlement; retry unchanged request")

    async def record_component_receipt(self, plan_id, service_id, component_service_id, body, recorded_by):
        plan = await self.db.treatment_plans.find_one({"id": plan_id})
        if not plan:
            raise HTTPException(404, "Treatment plan not found")
        command = frontend_receipt(body)
        row_id = command.pop("service_row_id", None)
        component_id = command.pop("component_id", None)
        row_id = stable_row(plan, service_id, row_id)
        row = next(entry for entry in plan["services"] if entry.get("service_row_id") == row_id)
        targets = [entry for entry in row.get("components") or []
                   if (component_id is None or entry.get("component_id") == component_id)
                   and component_service_id in (entry.get("service_id"), entry.get("component_id"))]
        if not row.get("is_complex") or len(targets) != 1 or not targets[0].get("component_id"):
            raise HTTPException(422, "A unique stable component belonging to this complex is required")
        component_id = targets[0]["component_id"]
        result = await self.record_ordinary_service(plan_id, row_id, "component_receipt", command,
                                                    recorded_by, component_id=component_id)
        return plan_result(await self.db.treatment_plans.find_one({"id": plan_id}), result)

    async def complete_session(self, plan_id, service_id, body, recorded_by):
        command = dict(body)
        row_id = command.pop("service_row_id", None)
        session_id = command.get("session_id")
        for attempt in range(5):
            plan = await self.db.treatment_plans.find_one({"id": plan_id})
            if not plan:
                raise HTTPException(404, "Treatment plan not found")
            row_id = stable_row(plan, service_id, row_id)
            operation_id, request_hash, canonical = canonical_request(
                plan_id, row_id, "session_completion", command, session_id)
            events = plan.get("accounting_events", [])
            advance_balance(events, plan_id)
            previous = next((event for event in events if event.get("operation_id") == operation_id), None)
            if previous:
                if previous.get("request_hash") != request_hash:
                    raise HTTPException(409, "operation_id was already used with a different canonical request")
                return plan_result(plan, event_result(previous))
            reject_legacy_balance(plan, events)
            rows = deepcopy(plan.get("services") or [])
            row = next(entry for entry in rows if entry.get("service_row_id") == row_id)
            reject_unresolved_child_state(row, events)
            if not row.get("is_course") and row.get("payment_type") != "per_session":
                raise HTTPException(422, "A course row is required")
            targets = [entry for entry in row.get("sessions") or []
                       if (entry.get("session_id") or entry.get("id")) == session_id]
            if len(targets) != 1:
                raise HTTPException(422, "A unique prospectively created session_id is required")
            session = targets[0]
            if "date" in canonical and canonical["date"] != session.get("date"):
                raise HTTPException(422, "Completion date must match the scheduled session")
            target_events = [event for event in events if event.get("service_row_id") == row_id
                             and event.get("session_id") == session_id]
            if session.get("completed") or any(event.get("kind") == "session_completion" for event in target_events):
                raise HTTPException(409, "This session is already completed")
            if not target_events and (session.get("paid_amount") or session.get("paid")):
                raise HTTPException(409, "Legacy session payment state is not event evidence")
            doctor_id = session.get("doctor_id") or row.get("doctor_id") or plan.get("assigned_doctor_id")
            doctor = await self.db.doctors.find_one({"id": doctor_id}) if doctor_id else None
            if not doctor:
                raise HTTPException(409, "Assign a known earning doctor before recording an event")
            snapshot = resolve_snapshot(doctor, service_id)
            now = datetime.now(timezone.utc)
            now = now.replace(microsecond=(now.microsecond // 1000) * 1000)
            event = dict(event_id=str(uuid4()), operation_id=operation_id, request_hash=request_hash,
                kind="session_completion", plan_id=plan_id, service_row_id=row_id, session_id=session_id,
                occurrence_id=session_id, service_id=service_id, doctor_id=doctor_id, recorded_by=recorded_by,
                occurred_at=now, recorded_at=now, currency="KZT", amount_kzt=0,
                compensation_snapshot=snapshot, compensation_amount_kzt=compensation_amount(snapshot, "session_completion", 0))
            if "date" in canonical:
                event["date"] = canonical["date"]
            session.update(completed=True, completed_at=now, performed_by_id=recorded_by)
            row["quantity_completed"] = sum(entry.get("kind") == "session_completion" and entry.get("service_row_id") == row_id for entry in events) + 1
            row["status"] = "completed" if row["quantity_completed"] == len(row["sessions"]) else "in_progress"
            fields = dict(services=rows, updated_at=now, **execution_projection(rows, events + [event]))
            query = {"id": plan_id, "accounting_events.operation_id": {"$ne": operation_id}}
            for key in ("services", "accounting_events", "paid_amount", "payment_status", "updated_at", "assigned_doctor_id",
                        "deposit_amount", "deposit_balance", "extra_deposit"):
                query[key] = plan.get(key)
            result = await self.db.treatment_plans.update_one(query, {"$set": fields, "$push": {"accounting_events": event}})
            if result.matched_count:
                return plan_result(await self.db.treatment_plans.find_one({"id": plan_id}), event_result(event))
        raise HTTPException(409, "Concurrent accounting update; retry with the same operation_id")

    async def record_session(self, plan_id, service_id, session_id, body, recorded_by):
        command = frontend_receipt(body)
        kind = "session_deposit_allocation" if command.get("payment_source") == "patient_deposit" else ("session_advance_allocation" if command.get("payment_source") == "plan_advance" else "session_receipt")
        row_id = command.pop("service_row_id", None)
        if command.get("session_id") != session_id:
            raise HTTPException(422, "Conflicting or missing session_id")
        if kind == "session_deposit_allocation":
            if command.get("completion_occurrence_id", session_id) != session_id:
                raise HTTPException(422, "Deposit must link to this exact session completion")
            command["completion_occurrence_id"] = session_id
        for attempt in range(5):
            plan = await self.db.treatment_plans.find_one({"id": plan_id})
            if not plan:
                raise HTTPException(404, "Treatment plan not found")
            row_id = stable_row(plan, service_id, row_id)
            operation_id, request_hash, canonical = canonical_request(
                plan_id, row_id, kind, command, None)
            events = plan.get("accounting_events", [])
            balance = advance_balance(events, plan_id)
            deposit_balance = patient_deposit_balance(events, plan_id)
            previous = next((event for event in events if event.get("operation_id") == operation_id), None)
            if previous:
                if previous.get("request_hash") != request_hash:
                    raise HTTPException(409, "operation_id was already used with a different canonical request")
                return plan_result(plan, event_result(previous))
            reject_legacy_balance(plan, events)
            rows = deepcopy(plan.get("services") or [])
            row = next(entry for entry in rows if entry.get("service_row_id") == row_id)
            reject_unresolved_child_state(row, events)
            if not row.get("is_course") and row.get("payment_type") != "per_session":
                raise HTTPException(422, "A course row is required")
            targets = [entry for entry in row.get("sessions") or []
                       if (entry.get("session_id") or entry.get("id")) == session_id]
            if len(targets) != 1:
                raise HTTPException(422, "A unique prospectively created session_id is required")
            session = targets[0]
            target_events = [event for event in events if event.get("service_row_id") == row_id
                             and event.get("session_id") == session_id]
            if not target_events and (session.get("paid_amount") or session.get("paid") or session.get("completed")):
                raise HTTPException(409, "Legacy session state is not event evidence")
            doctor_id = session.get("doctor_id") or row.get("doctor_id") or plan.get("assigned_doctor_id")
            doctor = await self.db.doctors.find_one({"id": doctor_id}) if doctor_id else None
            if not doctor:
                raise HTTPException(409, "Assign a known earning doctor before recording an event")
            snapshot = resolve_snapshot(doctor, service_id)
            if kind == "session_deposit_allocation":
                catalog = await self.db.service_prices.find_one({"id": service_id})
                validate_deposit_catalog(catalog, service_id)
            payments = [event for event in target_events if event.get("kind") in ("session_receipt", "session_advance_allocation", "session_deposit_allocation")]
            received = sum((money(event["amount_kzt"], "event amount") for event in payments), Decimal("0"))
            amount = Decimal(canonical["amount_kzt"])
            if kind == "session_advance_allocation" and amount > balance:
                raise HTTPException(409, "Insufficient same-plan event-backed unallocated advance")
            if kind == "session_deposit_allocation" and any(event.get("allocation_policy") == "plan_equal_share_v1" for event in events):
                raise HTTPException(409, "Patient deposit shares are assigned only at plan receipt assignment")
            if kind == "session_deposit_allocation" and amount > deposit_balance:
                raise HTTPException(409, "Insufficient same-plan event-backed patient deposit")
            discount = Decimal(canonical["discount_amount_kzt"])
            if discount:
                raise HTTPException(422, "Session discounts are not supported")
            price = session.get("price", row.get("session_price", row.get("price_per_unit")))
            unsettled = money(session["amount_due_kzt"], "session amount_due_kzt") if "amount_due_kzt" in session else money(price, "session price") - received
            if unsettled < 0 or amount > unsettled:
                raise HTTPException(422, "Actual receipt exceeds session unsettled amount")
            now = datetime.now(timezone.utc)
            now = now.replace(microsecond=(now.microsecond // 1000) * 1000)
            session.update(paid_amount=float(received + amount), amount_due_kzt=float(unsettled - amount),
                           paid=amount == unsettled,
                           payment_status="paid" if amount == unsettled else "partially_paid", payment_date=now)
            event = dict(event_id=str(uuid4()), operation_id=operation_id, request_hash=request_hash,
                kind=kind, plan_id=plan_id, service_row_id=row_id, session_id=session_id,
                service_id=service_id, doctor_id=doctor_id, recorded_by=recorded_by,
                occurred_at=now, recorded_at=now, currency="KZT", amount_kzt=float(amount),
                discount_amount_kzt=0, payment_source=canonical["payment_source"], compensation_snapshot=snapshot,
                compensation_amount_kzt=compensation_amount(snapshot, kind, amount))
            if kind == "session_deposit_allocation":
                event["completion_occurrence_id"] = session_id
                event["service_catalog_snapshot"] = deposit_catalog_snapshot(catalog)
            for field in ("payment_method", "payment_method_id", "payment_method_name"):
                if field in canonical:
                    event[field] = canonical[field]
                    session[field] = canonical[field]
            row["paid_amount"] = float(sum((money(entry["amount_kzt"], "event amount") for entry in events
                if entry.get("service_row_id") == row_id and entry.get("kind") in ("session_receipt", "session_advance_allocation", "session_deposit_allocation")), Decimal("0")) + amount)
            row["payment_status"] = "paid" if all(entry.get("paid") for entry in row["sessions"]) else "partially_paid"
            fields = dict(services=rows, updated_at=now, advance_balance_kzt=float(balance - amount if kind == "session_advance_allocation" else balance),
                paid_amount=float(sum((money(entry["amount_kzt"], "event amount") for entry in events
                    if base_event_kind(entry.get("kind", "")) in ("service_receipt", "service_advance_allocation", "service_deposit_allocation")), Decimal("0")) + amount),
                payment_status="paid" if all(entry.get("payment_status") == "paid" for entry in rows) else "partially_paid")
            if kind == "session_deposit_allocation":
                fields["deposit_balance"] = float(deposit_balance - amount)
            query = {"id": plan_id, "accounting_events.operation_id": {"$ne": operation_id}}
            for key in ("services", "accounting_events", "paid_amount", "payment_status", "updated_at", "assigned_doctor_id",
                        "deposit_amount", "deposit_balance", "extra_deposit"):
                query[key] = plan.get(key)
            result = await self.db.treatment_plans.update_one(query, {"$set": fields, "$push": {"accounting_events": event}})
            if result.matched_count:
                from services.treatment_plan_service import TreatmentPlanService
                await TreatmentPlanService(self.db).sync_persisted_payment(plan_id)
                return plan_result(await self.db.treatment_plans.find_one({"id": plan_id}), event_result(event))
        raise HTTPException(409, "Concurrent accounting update; retry with the same operation_id")

    async def record_plan_advance(self, plan_id, body, recorded_by):
        command = dict(body)
        if command.pop("payment_purpose", None) != "plan_advance":
            raise HTTPException(422, "payment_purpose=plan_advance is required")
        command = frontend_receipt(command)
        operation_id, request_hash, canonical = canonical_request(plan_id, None, "plan_advance", command, None)
        for attempt in range(5):
            plan = await self.db.treatment_plans.find_one({"id": plan_id})
            if not plan:
                raise HTTPException(404, "Treatment plan not found")
            events = plan.get("accounting_events", [])
            balance = advance_balance(events, plan_id)
            patient_deposit_balance(events, plan_id)
            previous = next((event for event in events if event.get("operation_id") == operation_id), None)
            if previous:
                if previous.get("request_hash") != request_hash:
                    raise HTTPException(409, "operation_id was already used with a different canonical request")
                return plan_result(plan, event_result(previous))
            reject_legacy_balance(plan, events)
            now = datetime.now(timezone.utc)
            now = now.replace(microsecond=(now.microsecond // 1000) * 1000)
            amount = Decimal(canonical["amount_kzt"])
            event = dict(event_id=str(uuid4()), operation_id=operation_id, request_hash=request_hash,
                         kind="plan_advance", plan_id=plan_id, amount_kzt=float(amount), currency="KZT",
                         recorded_by=recorded_by, occurred_at=now, recorded_at=now, compensation_amount_kzt=0)
            for field in ("payment_method", "payment_method_id", "payment_method_name", "note"):
                if field in canonical:
                    event[field] = canonical[field]
            fields = dict(advance_balance_kzt=float(balance + amount), updated_at=now)
            query = {"id": plan_id, "accounting_events.operation_id": {"$ne": operation_id}}
            for key in ("services", "accounting_events", "paid_amount", "payment_status", "updated_at",
                        "deposit_amount", "deposit_balance", "extra_deposit"):
                query[key] = plan.get(key)
            result = await self.db.treatment_plans.update_one(query, {"$set": fields, "$push": {"accounting_events": event}})
            if result.matched_count:
                plan.update(fields)
                plan["accounting_events"] = events + [event]
                return plan_result(plan, event_result(event))
        raise HTTPException(409, "Concurrent accounting update; retry with the same operation_id")

    async def record_ordinary_service(self, plan_id, row_id, kind, body, recorded_by, occurrence_id=None, component_id=None):
        if kind in ("service_receipt", "component_receipt") and isinstance(body, dict):
            if body.get("payment_source") in ("plan_advance", "patient_deposit"):
                kind = kind.replace("receipt", "deposit_allocation" if body["payment_source"] == "patient_deposit" else "advance_allocation")
        event_kind = kind
        if component_id:
            body = dict(body, component_id=component_id)
            kind = base_event_kind(kind)
        if base_event_kind(event_kind) == "service_deposit_allocation":
            plan = await self.db.treatment_plans.find_one({"id": plan_id})
            targets = [row for row in (plan or {}).get("services", []) if row.get("service_row_id") == row_id]
            target = targets[0] if len(targets) == 1 else {}
            if component_id:
                children = [child for child in target.get("components", []) if child.get("component_id") == component_id]
                target = children[0] if len(children) == 1 else {}
            identities = target.get("occurrence_ids") or []
            body = dict(body)
            link = body.get("completion_occurrence_id") or (identities[0] if len(identities) == 1 else None)
            if not link or link not in identities:
                raise HTTPException(422, "Deposit allocation requires exact completion_occurrence_id for multi-occurrence rows")
            body["completion_occurrence_id"] = link
        operation_id, request_hash, canonical = canonical_request(plan_id, row_id, event_kind, body, occurrence_id)
        for attempt in range(5):
            plan = await self.db.treatment_plans.find_one({"id": plan_id})
            if not plan:
                raise HTTPException(404, "Treatment plan not found")
            if "accounting_events" in plan and not isinstance(plan["accounting_events"], list):
                raise HTTPException(409, "Invalid accounting_events storage; an append-only array is required")
            events = plan.get("accounting_events") or []
            if any(not isinstance(event, dict) for event in events):
                raise HTTPException(409, "Invalid stored accounting event; payroll is blocked")
            balance = advance_balance(events, plan_id)
            deposit_balance = patient_deposit_balance(events, plan_id)
            previous = next((event for event in events if event.get("operation_id") == operation_id), None)
            if previous:
                if previous.get("request_hash") != request_hash:
                    raise HTTPException(409, "operation_id was already used with a different canonical request")
                return event_result(previous)
            reject_legacy_balance(plan, events)
            rows = deepcopy(plan.get("services") or [])
            targets = [row for row in rows if row.get("service_row_id") == row_id]
            if len(targets) != 1:
                raise HTTPException(409, "A unique stable service_row_id is required; legacy rows are not backfilled")
            row = targets[0]
            parent = row
            if component_id:
                reject_unresolved_child_state(parent, events)
                components = [entry for entry in row.get("components") or [] if entry.get("component_id") == component_id]
                if not row.get("is_complex") or len(components) != 1 or kind not in ("service_receipt", "service_advance_allocation", "service_deposit_allocation", "service_completion"):
                    raise HTTPException(422, "A unique component target is required")
                row = components[0]
                price = component_price(parent, row) if kind != "service_completion" else None
                catalog = await self.db.service_prices.find_one({"id": row.get("service_id")})
                if not catalog or catalog.get("id") != row.get("service_id") or catalog.get("service_type") == "complex":
                    raise HTTPException(409, "Unknown component service link")
            elif row.get("is_complex") or row.get("is_course") or row.get("payment_type") == "per_session":
                raise HTTPException(422, "Use a stable course-session or component ledger command for this row")
            row_events = [event for event in events if event.get("service_row_id") == row_id
                          and event.get("component_id") == component_id]
            if not row_events and (row.get("paid_amount") or row.get("paid") or row.get("paid_from_deposit")
                                   or row.get("quantity_completed") or row.get("payment_status") in ("paid", "partially_paid")
                                   or any(session.get("completed") for session in row.get("sessions") or [])):
                raise HTTPException(409, "Unresolved legacy payment/completion state is not accounting evidence")
            doctor_id = row.get("doctor_id") or parent.get("doctor_id") or plan.get("assigned_doctor_id")
            if not doctor_id:
                raise HTTPException(409, "Assign the earning doctor before recording an event")
            doctor = await self.db.doctors.find_one({"id": doctor_id})
            if not doctor:
                raise HTTPException(409, "Earning doctor not found")
            snapshot = resolve_snapshot(doctor, row.get("service_id"))
            if kind == "service_deposit_allocation":
                catalog = await self.db.service_prices.find_one({"id": row.get("service_id")})
                validate_deposit_catalog(catalog, row.get("service_id"))
            received = sum(money(event.get("amount_kzt"), "stored amount_kzt") for event in row_events
                           if base_event_kind(event.get("kind", "")) in ("service_receipt", "service_advance_allocation", "service_deposit_allocation"))
            fields = {}
            amount = Decimal("0")
            if kind in ("service_receipt", "service_advance_allocation", "service_deposit_allocation"):
                amount = Decimal(canonical["amount_kzt"])
                discount = Decimal(canonical["discount_amount_kzt"])
                payments = [event for event in row_events if base_event_kind(event.get("kind", "")) in ("service_receipt", "service_advance_allocation", "service_deposit_allocation")]
                if payments and any(money(event.get("discount_amount_kzt"), "event discount") != discount for event in payments):
                    raise HTTPException(409, "Discount is locked after the first receipt; send the same total discount")
                if kind == "service_advance_allocation" and amount > balance:
                    raise HTTPException(409, "Insufficient same-plan event-backed unallocated advance")
                if kind == "service_deposit_allocation" and any(event.get("allocation_policy") == "plan_equal_share_v1" for event in events):
                    raise HTTPException(409, "Patient deposit shares are assigned only at plan receipt assignment")
                if kind == "service_deposit_allocation" and amount > deposit_balance:
                    raise HTTPException(409, "Insufficient same-plan event-backed patient deposit")
                net = (price if component_id else money(row.get("total_price"), "total_price")) - discount
                if net < 0 or received + amount > net:
                    raise HTTPException(422, "Actual receipt exceeds the discounted remaining balance")
                row.update(paid_amount=float(received + amount), discount_amount=float(discount),
                           payment_status="paid" if received + amount == net else "partially_paid")
                if component_id:
                    row.update(paid=received + amount == net, amount_due_kzt=float(net - received - amount))
                    parent["paid_amount"] = float(sum((money(entry["amount_kzt"], "event amount") for entry in events
                        if entry.get("service_row_id") == row_id and base_event_kind(entry.get("kind", "")) in ("service_receipt", "service_advance_allocation", "service_deposit_allocation")), Decimal("0")) + amount)
                    parent["payment_status"] = "paid" if all(entry.get("paid") for entry in parent["components"]) else "partially_paid"
                if kind == "service_receipt":
                    row["payment_method_name"] = canonical.get("payment_method_name", canonical["payment_method"])
                    if "payment_method_id" in canonical:
                        row["payment_method_id"] = canonical["payment_method_id"]
            else:
                occurrences = row.get("occurrence_ids") or []
                if occurrence_id not in occurrences or len(set(occurrences)) != len(occurrences):
                    raise HTTPException(409, "A prospectively created stable occurrence_id is required")
                if any(event.get("kind") == event_kind and event.get("occurrence_id") == occurrence_id for event in row_events):
                    raise HTTPException(409, "This occurrence is already completed")
                row["quantity_completed"] = sum(event.get("kind") == event_kind for event in row_events) + 1
                row["status"] = "completed" if row["quantity_completed"] == len(occurrences) else "in_progress"
            now = datetime.now(timezone.utc)
            now = now.replace(microsecond=(now.microsecond // 1000) * 1000)
            event = dict(event_id=str(uuid4()), operation_id=operation_id, request_hash=request_hash,
                         kind=event_kind, plan_id=plan_id, service_row_id=row_id, service_id=row.get("service_id"),
                         doctor_id=doctor_id, recorded_by=recorded_by, occurred_at=now, recorded_at=now,
                         currency="KZT", amount_kzt=float(amount), compensation_snapshot=snapshot,
                         compensation_amount_kzt=compensation_amount(snapshot, kind, amount))
            if component_id:
                event["component_id"] = component_id
            if kind == "service_deposit_allocation":
                event["completion_occurrence_id"] = canonical["completion_occurrence_id"]
                event["service_catalog_snapshot"] = deposit_catalog_snapshot(catalog)
                fields["deposit_balance"] = float(deposit_balance - amount)
            if kind in ("service_receipt", "service_advance_allocation", "service_deposit_allocation"):
                event.update(payment_source=canonical["payment_source"], discount_amount_kzt=float(discount))
                if kind == "service_receipt":
                    event["payment_method"] = canonical["payment_method"]
                for field in ("payment_method_id", "payment_method_name"):
                    if field in canonical:
                        event[field] = canonical[field]
                row["payment_date"] = now
                fields["paid_amount"] = float(sum((money(entry["amount_kzt"], "event amount") for entry in events
                    if base_event_kind(entry.get("kind", "")) in ("service_receipt", "service_advance_allocation", "service_deposit_allocation")), Decimal("0")) + amount)
                fields["advance_balance_kzt"] = float(balance - amount if kind == "service_advance_allocation" else balance)
                fields["payment_status"] = "paid" if all(entry.get("payment_status") == "paid" for entry in rows) else "partially_paid"
                fields["payment_date"] = now if fields["payment_status"] == "paid" else None
            else:
                event["occurrence_id"] = occurrence_id
                fields.update(execution_projection(rows, events + [event]))
            fields.update(services=rows, updated_at=now)
            query = {"id": plan_id, "accounting_events.operation_id": {"$ne": operation_id}}
            for key in ("services", "accounting_events", "paid_amount", "payment_status", "updated_at", "assigned_doctor_id",
                        "deposit_amount", "deposit_balance", "extra_deposit"):
                query[key] = plan.get(key)
            result = await self.db.treatment_plans.update_one(query, {"$set": fields, "$push": {"accounting_events": event}})
            if result.matched_count:
                if kind in ("service_receipt", "service_advance_allocation", "service_deposit_allocation"):
                    from services.treatment_plan_service import TreatmentPlanService
                    await TreatmentPlanService(self.db).sync_persisted_payment(plan_id)
                return event_result(event)
        plan = await self.db.treatment_plans.find_one({"id": plan_id})
        previous = next((event for event in (plan or {}).get("accounting_events", []) if event.get("operation_id") == operation_id), None)
        if previous and previous.get("request_hash") == request_hash:
            return event_result(previous)
        raise HTTPException(409, "Concurrent accounting update or operation conflict; retry with the same operation_id")


def ordinary_ledger_totals(plan, doctor_id, start, end):
    """Verify stored snapshots, never calculate payroll from source balances."""
    start = start.replace(tzinfo=timezone.utc) if start.tzinfo is None else start.astimezone(timezone.utc)
    end = end.replace(tzinfo=timezone.utc) if end.tzinfo is None else end.astimezone(timezone.utc)
    revenue = 0.0
    salary = 0.0
    blockers = []

    stored_events = plan.get("accounting_events", [])
    if not isinstance(stored_events, list) or any(not isinstance(event, dict) for event in stored_events):
        return 0.0, 0.0, [dict(code="invalid_accounting_event", plan_id=plan.get("id"))]
    try:
        advance_balance(stored_events, plan.get("id"))
        patient_deposit_balance(stored_events, plan.get("id"))
    except HTTPException:
        return 0.0, 0.0, [dict(code="invalid_accounting_event", plan_id=plan.get("id"))]
    identities = set()
    occurrences = set()
    valid_completions = {}
    deposit_allocations = []
    for event in plan.get("accounting_events") or []:
        if event.get("doctor_id") != doctor_id:
            continue
        try:
            kind = event["kind"]
            base_kind = base_event_kind(kind)
            if base_kind not in ("service_receipt", "service_advance_allocation", "service_deposit_allocation", "service_completion") or event["plan_id"] != plan["id"] or event["currency"] != "KZT":
                raise ValueError
            identity = (event["event_id"], event["operation_id"])
            UUID(identity[0])
            UUID(identity[1])
            if any(identity[index] == previous[index] for previous in identities for index in (0, 1)):
                raise ValueError
            identities.add(identity)
            if not event["service_row_id"] or not event["request_hash"] or not event["recorded_by"]:
                raise ValueError
            snapshot = event["compensation_snapshot"]
            if not isinstance(snapshot, dict) or snapshot.get("service_id") != event.get("service_id") or snapshot.get("payment_mode") not in ("general", "individual"):
                raise ValueError
            amount = money(event["amount_kzt"], "event amount")
            body = {"operation_id": event["operation_id"]}
            if kind.startswith("service_"):
                rows = [row for row in plan.get("services", []) if row.get("service_row_id") == event["service_row_id"]]
                if len(rows) != 1 or rows[0].get("service_id") != event["service_id"] or rows[0].get("is_complex") or rows[0].get("is_course") or rows[0].get("payment_type") == "per_session":
                    raise ValueError
                if base_kind == "service_completion" and event["occurrence_id"] not in rows[0].get("occurrence_ids", []):
                    raise ValueError
            if kind.startswith("component_"):
                body["component_id"] = event["component_id"]
                rows = [row for row in plan.get("services", []) if row.get("service_row_id") == event["service_row_id"]]
                if len(rows) != 1 or not rows[0].get("is_complex"):
                    raise ValueError
                components = [entry for entry in rows[0].get("components") or [] if entry.get("component_id") == event["component_id"]]
                if len(components) != 1 or components[0].get("service_id") != event["service_id"]:
                    raise ValueError
                if base_kind == "service_completion" and event["occurrence_id"] not in components[0].get("occurrence_ids", []):
                    raise ValueError
            if kind.startswith("session_"):
                body["session_id"] = event["session_id"]
                if "date" in event:
                    body["date"] = event["date"]
                if base_kind == "service_completion" and event["occurrence_id"] != event["session_id"]:
                    raise ValueError
                rows = [row for row in plan.get("services", []) if row.get("service_row_id") == event["service_row_id"]]
                if len(rows) != 1 or rows[0].get("service_id") != event["service_id"] or len([
                        session for session in rows[0].get("sessions") or []
                        if (session.get("session_id") or session.get("id")) == event["session_id"]]) != 1:
                    raise ValueError
            if base_kind == "service_completion":
                occurrence = (event["service_row_id"], event.get("session_id"), event.get("component_id"), event["occurrence_id"])
                if amount or occurrence in occurrences:
                    raise ValueError
                occurrences.add(occurrence)
            elif not amount or event.get("payment_source") != ("cash" if base_kind == "service_receipt" else ("patient_deposit" if base_kind == "service_deposit_allocation" else "plan_advance")) or (base_kind == "service_receipt" and not event.get("payment_method")):
                raise ValueError
            if base_kind in ("service_receipt", "service_advance_allocation", "service_deposit_allocation"):
                body.update(amount_kzt=event["amount_kzt"], discount_amount_kzt=event["discount_amount_kzt"],
                            payment_source=event["payment_source"])
                if base_kind == "service_receipt":
                    body["payment_method"] = event["payment_method"]
                for field in ("payment_method_id", "payment_method_name"):
                    if field in event:
                        body[field] = event[field]
                if base_kind == "service_deposit_allocation":
                    validate_deposit_catalog(event.get("service_catalog_snapshot"), event["service_id"])
                    body["completion_occurrence_id"] = event["completion_occurrence_id"]
                    rows = [row for row in plan.get("services", []) if row.get("service_row_id") == event["service_row_id"]]
                    target = components[0] if kind.startswith("component_") else (rows[0] if len(rows) == 1 else {})
                    expected = [event.get("session_id")] if kind.startswith("session_") else target.get("occurrence_ids", [])
                    if target.get("service_id") != event["service_id"] or event["completion_occurrence_id"] not in expected:
                        raise ValueError
            _, request_hash, _ = canonical_request(event["plan_id"], event["service_row_id"], kind, body, event.get("occurrence_id"))
            if request_hash != event["request_hash"]:
                raise ValueError
            if compensation_amount(snapshot, kind, amount) != float(money(event["compensation_amount_kzt"], "event compensation")):
                raise ValueError
            occurred = utc_datetime(event["occurred_at"])
            if utc_datetime(event["recorded_at"]) != occurred:
                raise ValueError
            if base_kind == "service_completion":
                valid_completions[(event["service_row_id"], event.get("component_id"), event.get("session_id"), event["occurrence_id"], event["service_id"], event["doctor_id"])] = event
            if base_kind == "service_deposit_allocation":
                deposit_allocations.append(event)
                continue
            if start <= occurred.astimezone(timezone.utc) <= end:
                revenue += float(amount)
                salary += event["compensation_amount_kzt"]
        except (ValueError, KeyError, TypeError, HTTPException):
            blockers.append(dict(code="invalid_accounting_event", plan_id=plan.get("id"), event_id=event.get("event_id")))
    for allocation in deposit_allocations:
        completion = valid_completions.get((allocation["service_row_id"], allocation.get("component_id"), allocation.get("session_id"), allocation["completion_occurrence_id"], allocation["service_id"], allocation["doctor_id"]))
        if completion and start <= utc_datetime(completion["occurred_at"]) <= end:
            revenue += allocation["amount_kzt"]
            salary += float(Decimal(str(accrue(tariff(allocation["compensation_snapshot"]), allocation["amount_kzt"], 0))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    for row in plan.get("services") or []:
        if row.get("is_complex") and row.get("components"):
            for component in row["components"]:
                earner = component.get("doctor_id") or row.get("doctor_id") or plan.get("assigned_doctor_id")
                if earner and earner != doctor_id:
                    continue
                if not earner or not row.get("service_row_id") or not component.get("component_id") or not any(
                        event.get("service_row_id") == row.get("service_row_id")
                        and event.get("component_id") == component.get("component_id") and event.get("doctor_id") == doctor_id
                        for event in plan.get("accounting_events") or []):
                    blockers.append(dict(code="accounting_ledger_gap", plan_id=plan.get("id"),
                                         service_row_id=row.get("service_row_id"), component_id=component.get("component_id")))
            continue
        earner = row.get("doctor_id") or plan.get("assigned_doctor_id")
        if earner and earner != doctor_id:
            continue
        if not earner or not row.get("service_row_id") or not any(
                event.get("service_row_id") == row.get("service_row_id") and event.get("doctor_id") == doctor_id
                for event in plan.get("accounting_events") or []):
            blockers.append(dict(code="accounting_ledger_gap", plan_id=plan.get("id"), service_row_id=row.get("service_row_id")))

    return round(revenue, 2), round(salary, 2), blockers
