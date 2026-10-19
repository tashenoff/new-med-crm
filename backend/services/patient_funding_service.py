"""Patient source receipts, separate from their assignments to treatment plans."""
from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException
from services.accounting_ledger_service import money, is_ledger_plan, patient_deposit_balance, advance_balance


def patient_funding_summary(appointments, plans):
    sources = {}
    for source in appointments:
        identity = source.get('id') or str(source.get('_id', ''))
        amount = money(source.get('deposit') or 0, 'appointment deposit')
        if source.get('deposit_type') == 'percent':
            if amount > 100:
                raise HTTPException(409, 'Invalid percentage appointment deposit')
            amount = (money(source.get('price') or 0, 'appointment price') * amount / 100).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if identity in sources or (not identity and amount):
            raise HTTPException(409, 'Duplicate or missing appointment deposit source')
        sources[identity] = amount
    received = sum(sources.values(), Decimal(0))
    used, advances = Decimal(0), Decimal(0)
    assigned = {}
    known = True
    for plan in plans:
        events = plan.get('accounting_events') or []
        advances += advance_balance(events, plan['id'])
        if is_ledger_plan(plan):
            balance = patient_deposit_balance(events, plan['id'])
            receipts = [event for event in events if event.get('kind') == 'patient_deposit_received']
            total = sum((money(event['amount_kzt'], 'deposit receipt') for event in receipts), Decimal(0))
            used += total - balance
            for event in receipts:
                key = event['appointment_id']
                assigned[key] = assigned.get(key, Decimal(0)) + money(event['amount_kzt'], 'deposit receipt')
        else:
            # Complex/course parents mirror child totals. Count one level only.
            for row in plan.get('services', []):
                targets = row.get('components', []) if row.get('is_complex') else row.get('sessions', []) if row.get('is_course') and row.get('payment_type') == 'per_session' else [row]
                for target in targets:
                    if (target.get('paid') or target.get('payment_status') == 'paid' or target.get('paid_amount')) and 'paid_from_deposit' not in target and received:
                        known = False
                    used += money(target.get('paid_from_deposit') or 0, 'legacy paid_from_deposit')
            # A legacy cash top-up and a booking deposit share a balance without
            # provenance. Do not invent their split after funds were consumed.
            if plan.get('extra_deposit') and any(row.get('paid_from_deposit') for row in plan.get('services', [])):
                known = False
    if any(amount > sources.get(key, Decimal(0)) for key, amount in assigned.items()):
        raise HTTPException(409, 'Assigned deposits exceed stored appointment receipts')
    if used > received:
        known = False
    return dict(deposit_received_kzt=float(received), deposit_used_kzt=float(used) if known else None,
                deposit_available_kzt=float(received-used) if known else None,
                advance_available_kzt=float(advances), known=known,
                detail=None if known else 'Исторические данные не позволяют подтвердить остаток депозита.')


async def get_patient_funding(db, patient_id):
    if not await db.patients.find_one({'id': patient_id}):
        raise HTTPException(404, 'Patient not found')
    appointments = await db.appointments.find({'patient_id': patient_id}).to_list(None)
    plans = await db.treatment_plans.find({'patient_id': patient_id}).to_list(None)
    return patient_funding_summary(appointments, plans)
