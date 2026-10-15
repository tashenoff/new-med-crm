"""Prospective full-payment completion and one-plan atomic settlement. No backfill."""
from copy import deepcopy
from decimal import Decimal
from hashlib import sha256
import json
from types import SimpleNamespace
from uuid import UUID, uuid4, uuid5

from fastapi import HTTPException
from services.accounting_ledger_service import (
    AccountingLedgerService, AUTO_COMPLETION_POLICY, base_event_kind, canonical_request,
    compensation_amount, component_price, deposit_catalog_snapshot, execution_projection,
    is_analysis_catalog, money, plan_result, reject_legacy_balance,
    reject_unresolved_child_state, resolve_snapshot,
)


def payable_targets(rows, selected_keys=None):
    for parent in rows:
        if parent.get('is_complex'):
            for child in parent.get('components') or []:
                if selected_keys is not None and target_key(parent, child, 'component') not in selected_keys:
                    continue
                yield parent, child, 'component', component_price(parent, child)
        elif parent.get('is_course') or parent.get('payment_type') == 'per_session':
            for session in parent.get('sessions') or []:
                if selected_keys is not None and target_key(parent, session, 'session') not in selected_keys:
                    continue
                yield parent, session, 'session', money(session.get('price', parent.get('session_price', parent.get('price_per_unit'))), 'session price')
        else:
            if selected_keys is not None and target_key(parent, parent, 'service') not in selected_keys:
                continue
            yield parent, parent, 'service', money(parent.get('total_price'), 'total_price')


def target_key(parent, target, prefix):
    return (parent.get('service_row_id'), target.get('component_id') if prefix == 'component' else None,
            (target.get('session_id') or target.get('id')) if prefix == 'session' else None)


async def append_auto_completions(db, plan, fields, appended, recorded_by, operation_id):
    if plan.get('payment_completion_policy') != AUTO_COMPLETION_POLICY:
        return appended
    trigger_keys = {(e.get('service_row_id'), e.get('component_id'), e.get('session_id'))
                    for e in appended if base_event_kind(e.get('kind', '')) in
                    ('service_receipt', 'service_advance_allocation', 'service_deposit_allocation')}
    if not trigger_keys:
        return appended
    result = list(appended)
    all_events = list(plan.get('accounting_events') or []) + result
    rows = fields['services']
    now = max(e['occurred_at'] for e in appended)
    for parent, target, prefix, price in payable_targets(rows, trigger_keys):
        key = target_key(parent, target, prefix)
        if key not in trigger_keys:
            continue
        linked = [e for e in all_events if (e.get('service_row_id'), e.get('component_id'), e.get('session_id')) == key]
        payments = [e for e in linked if base_event_kind(e.get('kind', '')) in
                    ('service_receipt', 'service_advance_allocation', 'service_deposit_allocation')]
        received = sum((money(e['amount_kzt'], 'event amount') for e in payments), Decimal('0'))
        discounts = {money(e.get('discount_amount_kzt', 0), 'discount') for e in payments}
        if len(discounts) != 1:
            raise HTTPException(409, 'Inconsistent target discounts')
        net = price - next(iter(discounts))
        target.update(payment_status='paid' if received == net else 'partially_paid', payment_date=now)
        if prefix != 'service':
            target.update(paid=received == net, amount_due_kzt=float(net - received))
        if received != net:
            continue
        identities = [key[2]] if prefix == 'session' else target.get('occurrence_ids') or []
        expected_count = 1 if prefix == 'session' else target.get('quantity_total', target.get('quantity', 1))
        if not key[0] or not identities or len(identities) != expected_count or any(not isinstance(i, str) or not i for i in identities) or len(set(identities)) != len(identities):
            raise HTTPException(409, 'Stable occurrence identities are required for automatic completion')
        existing = {e.get('occurrence_id') for e in linked if e.get('kind') == prefix + '_completion'}
        if not set(identities) - existing:
            continue
        service_id = target.get('service_id', parent.get('service_id'))
        catalog = await db.service_prices.find_one({'id': service_id})
        doctor_id = target.get('doctor_id') or parent.get('doctor_id') or plan.get('assigned_doctor_id')
        if not target.get('doctor_id') and is_analysis_catalog(catalog, service_id):
            doctor_id = None
            target['service_catalog_snapshot'] = deposit_catalog_snapshot(catalog)
            snapshot = resolve_snapshot(dict(payment_type='percentage', payment_value=0), service_id)
        else:
            doctor = await db.doctors.find_one({'id': doctor_id}) if doctor_id else None
            if not doctor:
                raise HTTPException(409, 'Assign a known earning doctor before automatic completion')
            snapshot = resolve_snapshot(doctor, service_id)
        for occurrence in identities:
            if occurrence in existing:
                continue
            child_operation = str(uuid5(UUID(operation_id), json.dumps(['paid-completion', plan['id'], *key, occurrence])))
            body = dict(operation_id=child_operation)
            if key[1]: body['component_id'] = key[1]
            if key[2]: body['session_id'] = key[2]
            _, digest, _ = canonical_request(plan['id'], key[0], prefix + '_completion', body, occurrence)
            event = dict(event_id=str(uuid4()), operation_id=child_operation, request_hash=digest,
                kind=prefix + '_completion', plan_id=plan['id'], service_row_id=key[0], service_id=service_id,
                occurrence_id=occurrence, doctor_id=doctor_id, recorded_by=recorded_by, occurred_at=now,
                recorded_at=now, currency='KZT', amount_kzt=0, compensation_snapshot=deepcopy(snapshot),
                compensation_amount_kzt=compensation_amount(snapshot, prefix + '_completion', 0),
                completion_source='full_payment', payment_operation_id=operation_id)
            if key[1]: event['component_id'] = key[1]
            if key[2]: event['session_id'] = key[2]
            if doctor_id is None: event['service_catalog_snapshot'] = deposit_catalog_snapshot(catalog)
            result.append(event)
        if prefix == 'session':
            target.update(completed=True, completed_at=now, performed_by_id=recorded_by)
            parent['quantity_completed'] = sum(bool(s.get('completed')) for s in parent.get('sessions') or [])
            parent['status'] = 'completed' if parent['quantity_completed'] == len(parent['sessions']) else 'in_progress'
        else:
            target['quantity_completed'] = len(identities)
            target['status'] = 'completed'
    for parent in rows:
        children = parent.get('components') if parent.get('is_complex') else parent.get('sessions') if parent.get('is_course') or parent.get('payment_type') == 'per_session' else None
        if children:
            parent['payment_status'] = 'paid' if all(c.get('payment_status') == 'paid' for c in children) else 'partially_paid' if parent.get('paid_amount') else 'unpaid'
    fields['payment_status'] = 'paid' if all(r.get('payment_status') == 'paid' for r in rows) else 'partially_paid'
    fields['payment_date'] = now if fields['payment_status'] == 'paid' else None
    if len(result) != len(appended):
        fields.update(execution_projection(rows, list(plan.get('accounting_events') or []) + result))
    return result


class _StagedPlan:
    """Run existing ledger validation on a private copy; never write the real DB."""
    def __init__(self, document):
        self.document = deepcopy(document)

    async def find_one(self, query):
        return deepcopy(self.document) if query.get('id') == self.document['id'] else None

    async def update_one(self, query, changes):
        for key, expected in query.items():
            if key == 'accounting_events.operation_id':
                if any(e['operation_id'] == expected['$ne'] for e in self.document.get('accounting_events', [])):
                    return SimpleNamespace(matched_count=0)
            elif self.document.get(key) != expected:
                return SimpleNamespace(matched_count=0)
        self.document.update(deepcopy(changes.get('$set', {})))
        pushed = changes.get('$push', {}).get('accounting_events')
        if pushed is not None:
            self.document.setdefault('accounting_events', []).extend(deepcopy(pushed.get('$each', [pushed])))
        return SimpleNamespace(matched_count=1)


class PaymentCompletionService:
    def __init__(self, db):
        self.db = db

    async def settle_remaining(self, plan_id, body, recorded_by):
        command = dict(body)
        scope = command.pop('service_row_id', None)
        operation_id, _, canonical = canonical_request(plan_id, None, 'service_receipt', command, None)
        if money(command.get('discount_amount_kzt', 0), 'discount'):
            raise HTTPException(422, 'Set discounts on individual targets before aggregate settlement')
        digest = sha256(json.dumps(dict(canonical, service_row_id=scope), sort_keys=True).encode()).hexdigest()
        for _ in range(5):
            plan = await self.db.treatment_plans.find_one({'id': plan_id})
            if not plan:
                raise HTTPException(404, 'Treatment plan not found')
            if plan.get('payment_completion_policy') != AUTO_COMPLETION_POLICY:
                raise HTTPException(409, 'Automatic settlement requires a new auto-completion plan; history is not migrated')
            events = plan.get('accounting_events') or []
            previous = [e for e in events if e.get('batch_operation_id') == operation_id]
            if previous:
                if any(e.get('batch_request_hash') != digest for e in previous):
                    raise HTTPException(409, 'operation_id already used for a different settlement')
                return plan_result(plan, {})
            if any(e.get('operation_id') == operation_id for e in events):
                raise HTTPException(409, 'operation_id already used')
            reject_legacy_balance(plan, events)
            rows = [r for r in plan.get('services', []) if scope is None or r.get('service_row_id') == scope]
            if not rows or (scope is not None and len(rows) != 1):
                raise HTTPException(422, 'Select a unique stable service_row_id')
            units = []
            total = Decimal('0')
            for parent in rows:
                reject_unresolved_child_state(parent, events)
                if parent.get('is_course') or parent.get('payment_type') == 'per_session':
                    course_total = sum((price for _, _, _, price in payable_targets([parent])), Decimal('0'))
                    if course_total != money(parent.get('total_price'), 'course total_price'):
                        raise HTTPException(409, 'Session prices must match the course total before aggregate settlement')
            for parent, target, prefix, price in payable_targets(rows):
                key = target_key(parent, target, prefix)
                payments = [e for e in events if (e.get('service_row_id'), e.get('component_id'), e.get('session_id')) == key
                            and base_event_kind(e.get('kind', '')) in ('service_receipt', 'service_advance_allocation', 'service_deposit_allocation')]
                received = sum((money(e['amount_kzt'], 'event amount') for e in payments), Decimal('0'))
                if received != money(target.get('paid_amount', 0), 'paid_amount'):
                    raise HTTPException(409, 'Prior target funding is not event-backed')
                discount = money(target.get('discount_amount', 0), 'discount')
                due = price - discount - received
                base_price = money(target.get('price'), 'component base price') if prefix == 'component' else price
                if base_price <= 0:
                    raise HTTPException(422, 'A service/component/session base price must be positive; no funds collected')
                if due == 0 and received == 0:
                    raise HTTPException(422, 'Zero net after discount or allocation is not a cash receipt; no funds collected')
                if due < 0:
                    raise HTTPException(409, 'Target is overfunded')
                if due:
                    units.append((parent, target, prefix, due, discount))
                    total += due
            if not units or total != Decimal(canonical['amount_kzt']):
                raise HTTPException(409, 'Remaining amount changed; refresh the plan before paying')
            staged = _StagedPlan(plan)
            ledger = AccountingLedgerService(SimpleNamespace(treatment_plans=staged,
                service_prices=self.db.service_prices, doctors=self.db.doctors), sync_payment=False)
            for parent, target, prefix, due, discount in units:
                key = target_key(parent, target, prefix)
                child_operation = str(uuid5(UUID(operation_id), json.dumps(['settle-target', *key])))
                payment = dict(command, operation_id=child_operation, amount_kzt=float(due), discount_amount_kzt=float(discount))
                if prefix == 'session':
                    payment.update(session_id=key[2], service_row_id=key[0])
                    await ledger.record_session(plan_id, parent['service_id'], key[2], payment, recorded_by)
                else:
                    await ledger.record_ordinary_service(plan_id, key[0], prefix + '_receipt', payment, recorded_by, component_id=key[1])
            result_plan = staged.document
            appended = result_plan['accounting_events'][len(events):]
            for event in appended:
                event.update(batch_operation_id=operation_id, batch_request_hash=digest)
            fields = {k: deepcopy(result_plan[k]) for k in ('services', 'paid_amount', 'payment_status', 'payment_date',
                'advance_balance_kzt', 'execution_status', 'started_at', 'completed_at', 'updated_at') if k in result_plan}
            fields['payment_status'] = 'paid' if all(r.get('payment_status') == 'paid' for r in result_plan['services']) else 'partially_paid'
            query = {'id': plan_id}
            for key in ('services', 'accounting_events', 'paid_amount', 'updated_at', 'assigned_doctor_id',
                        'payment_completion_policy', 'deposit_balance', 'deposit_amount', 'extra_deposit'):
                query[key] = plan.get(key)
            result = await self.db.treatment_plans.update_one(query, {'$set': fields, '$push': {'accounting_events': {'$each': appended}}})
            if result.matched_count:
                await AccountingLedgerService(self.db)._sync_payment(plan_id)
                return plan_result(await self.db.treatment_plans.find_one({'id': plan_id}), {})
        raise HTTPException(409, 'Concurrent payment; retry with the same operation_id')
