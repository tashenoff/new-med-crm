"""Real disposable Mongo regression: copy-on-write must retain the original CAS snapshot."""
from copy import deepcopy
from datetime import datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException


@pytest.fixture(autouse=True)
async def cleanup_link_sentinels(clean_db):
    for name, identifier in [('payments', 'legacy-receipt'), ('salary_accruals', 'legacy-accrual')]:
        await clean_db[name].delete_many({'id': identifier})
    yield
    for name, identifier in [('payments', 'legacy-receipt'), ('salary_accruals', 'legacy-accrual')]:
        await clean_db[name].delete_many({'id': identifier})


async def fixture_plan(db, stable=False):
    from services.accounting_ledger_service import assign_ledger_identities
    row = dict(service_id='package', service_name='Package', category=None, quantity_total=1,
               quantity_completed=0, price_per_unit=100, total_price=100, status='pending',
               payment_status='partially_paid', is_course=False, is_complex=True,
               components=[dict(service_id='a', price=40, quantity=1, paid=True, paid_amount=30,
                                discount_amount=10, status='completed', doctor_id='doctor-a',
                                appointment_id='visit-linked', payment_method_id='cash', notes='retained'),
                           dict(service_id='b', price=60, quantity=1, paid=False, paid_amount=0,
                                discount_amount=0, status='pending', doctor_id='doctor-b')])
    if stable:
        assign_ledger_identities([row])
    plan = dict(id='legacy-copy-regression', patient_id='copy-patient', consultation_sheet_id='copy-sheet',
                assigned_doctor_id='doctor-a', appointment_ids=['visit-linked'], services=[row],
                total_cost=100, paid_amount=30, payment_status='partially_paid', notes='before',
                updated_at=datetime(2026, 1, 1), created_at=datetime(2026, 1, 1),
                historical_receipt_ids=['legacy-receipt'], historical_accrual_ids=['legacy-accrual'])
    await db.treatment_plans.insert_one(deepcopy(plan))
    await db.appointments.insert_one(dict(id='visit-linked', patient_id='copy-patient', deposit=0,
                                          doctor_id='doctor-a', treatment_plan_id=plan['id']))
    await db.payments.insert_one(dict(id='legacy-receipt', plan_id=plan['id'], service_id='a', amount=30))
    await db.salary_accruals.insert_one(dict(id='legacy-accrual', plan_id=plan['id'], service_id='a', amount=15))
    return await db.treatment_plans.find_one({'id': plan['id']})


def consultation():
    # Incoming forged component data must not replace the persisted financial snapshot.
    return SimpleNamespace(id='copy-sheet', patient_id='copy-patient', doctor_id='doctor-a',
        doctor_name='Doctor', consultation_date=datetime(2026, 1, 1), recommendations='notes-only edit',
        treatment_services=[SimpleNamespace(service_id='package', service_name='Changed', quantity=8,
            price_per_unit=999, total_price=7992, is_complex=True,
            components=[dict(service_id='forged', price=7992, doctor_id='wrong')])])


def service_for(db, callback=None, queries=None):
    from services.consultation_service import ConsultationService
    class Collection:
        async def find_one(self, *args, **kwargs):
            return await db.treatment_plans.find_one(*args, **kwargs)
        async def update_one(self, query, update, **kwargs):
            if queries is not None: queries.append(deepcopy(query))
            if callback: await callback()
            return await db.treatment_plans.update_one(query, update, **kwargs)
    class DB:
        treatment_plans = Collection()
        def __getattr__(self, name): return db[name]
    service = ConsultationService.__new__(ConsultationService)
    service.db = DB()
    return service


def strip_added_ids(before, after):
    actual = deepcopy(after)
    for old, new in [(before, actual), *zip(before['components'], actual['components'])]:
        id_key = 'component_id' if 'service_id' in old and 'components' not in old else 'service_row_id'
        for key in (id_key, 'occurrence_ids'):
            if key in old:
                assert new[key] == old[key], 'Existing identity is immutable'
            else:
                values = [new[key]] if key != 'occurrence_ids' else new[key]
                assert len(values) == 1
                for value in values: assert str(UUID(value)) == value
                new.pop(key)
    return actual


@pytest.mark.parametrize('stable', [False, True])
async def test_copy_on_write_enriches_legacy_ids_once_and_keeps_every_link(clean_db, stable):
    before = await fixture_plan(clean_db, stable)
    refs = {name: await clean_db[name].find_one({}) for name in ('appointments', 'payments', 'salary_accruals')}
    queries = []
    service = service_for(clean_db, queries=queries)
    await service._update_treatment_plan_from_consultation(consultation(), 'user', 'User')
    saved = await clean_db.treatment_plans.find_one({'id': before['id']})
    assert queries[0]['services'] == before['services'], 'CAS compares the unmodified stored snapshot'
    assert strip_added_ids(before['services'][0], saved['services'][0]) == before['services'][0]
    assert saved == {**before, 'services': saved['services'], 'notes': 'notes-only edit', 'updated_at': saved['updated_at']}
    stable_ids = deepcopy(saved['services'])
    await service._update_treatment_plan_from_consultation(consultation(), 'user', 'User')
    repeated = await clean_db.treatment_plans.find_one({'id': before['id']})
    assert repeated['services'] == stable_ids, 'Retry cannot regenerate component/occurrence IDs'
    for name, expected in refs.items():
        assert await clean_db[name].find_one({'_id': expected['_id']}) == expected
        await clean_db[name].delete_one({'_id': expected['_id']})


@pytest.mark.parametrize('race', ['services', 'updated_at', 'accounting_events'])
async def test_real_conflicts_still_return_409_without_overwriting_competitor(clean_db, race):
    before = await fixture_plan(clean_db)
    competing = None
    async def concurrent_write():
        nonlocal competing
        if race == 'services':
            rows = deepcopy(before['services']); rows[0]['components'][0]['notes'] = 'concurrent writer'
            update = {'services': rows}
        elif race == 'updated_at':
            update = {'updated_at': before['updated_at'] + timedelta(seconds=1)}
        else:
            update = {'accounting_events': [dict(kind='component_completion', operation_id=str(uuid4()),
                component_id='existing-component', service_row_id='existing-row', amount_kzt=0)]}
        await clean_db.treatment_plans.update_one({'id': before['id']}, {'$set': update})
        competing = await clean_db.treatment_plans.find_one({'id': before['id']})
    with pytest.raises(HTTPException) as error:
        await service_for(clean_db, concurrent_write)._update_treatment_plan_from_consultation(consultation(), 'u', 'User')
    assert error.value.status_code == 409
    assert await clean_db.treatment_plans.find_one({'id': before['id']}) == competing


async def test_existing_ledger_blocks_generic_edit_without_any_write(clean_db):
    before = await fixture_plan(clean_db, True)
    await clean_db.treatment_plans.update_one({'id': before['id']}, {'$set': {'accounting_events': [
        dict(kind='component_completion', operation_id=str(uuid4()), amount_kzt=0)]}})
    before = await clean_db.treatment_plans.find_one({'id': before['id']})
    queries = []
    with pytest.raises(HTTPException) as error:
        await service_for(clean_db, queries=queries)._update_treatment_plan_from_consultation(consultation(), 'u', 'User')
    assert error.value.status_code == 409
    assert queries == []
    assert await clean_db.treatment_plans.find_one({'id': before['id']}) == before


async def test_paid_complex_cannot_be_removed_by_consultation_edit(clean_db):
    before = await fixture_plan(clean_db)
    incoming = consultation(); incoming.treatment_services = []
    with pytest.raises(HTTPException) as error:
        await service_for(clean_db)._update_treatment_plan_from_consultation(incoming, 'u', 'User')
    assert error.value.status_code == 400
    assert await clean_db.treatment_plans.find_one({'id': before['id']}) == before
