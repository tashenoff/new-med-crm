"""No sockets/DB: exact-unit auto completion and atomic remaining-payment commands."""
import asyncio
from copy import deepcopy
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from test_accounting_ledger import modules, memory_db, component_db, course_db, receipt


def setup_case(modules, monkeypatch, target_kind='service', scheme='hybrid', auto=True):
    db, saved, settings = {'service': memory_db, 'component': component_db, 'session': course_db}[target_kind]()
    saved['compensation_policy'] = modules.ledger.COMPLETED_PAID_POLICY
    if auto:
        saved['payment_completion_policy'] = modules.ledger.AUTO_COMPLETION_POLICY
    settings.update(payment_type=scheme, payment_value=10 if scheme == 'percentage' else 1000, hybrid_percentage_value=10)
    row = saved['services'][0]
    row.update(total_price=3000, quantity=1, occurrence_ids=['first'])
    target = row
    if target_kind == 'component':
        row['total_price'] = 6000
        target = row['components'][0]
        target.update(price=3000, quantity=1, doctor_id='doctor', occurrence_ids=['component-first'])
        row['components'][1].update(price=3000, doctor_id='doctor-b')
    elif target_kind == 'session':
        row.update(total_price=6000, quantity=2)
        target = row['sessions'][0]
        target.update(price=3000, doctor_id='doctor')
        row['sessions'][1].update(price=3000, doctor_id='doctor-b')
    db.doctors.find_one = AsyncMock(side_effect=lambda q: dict(settings, id=q['id']))
    hook = AsyncMock()
    monkeypatch.setattr(modules.plans.TreatmentPlanService, 'sync_persisted_payment', hook)
    ledger = modules.ledger.AccountingLedgerService(db)
    def pay(amount, body=None):
        body = body or receipt(amount_kzt=amount, discount_amount_kzt=0)
        if target_kind == 'session':
            return ledger.record_session('plan', 'catalog', 'session-a', dict(body, session_id='session-a'), 'cashier')
        return ledger.record_ordinary_service('plan', 'row', target_kind + '_receipt', body, 'cashier', component_id='component-a' if target_kind == 'component' else None)
    return db, saved, settings, ledger, pay, hook


def totals(modules, saved, doctor='doctor'):
    return modules.ledger.ordinary_ledger_totals(saved, doctor, datetime(2000, 1, 1), datetime(2100, 1, 1))


def batch_body(amount, **changes):
    return dict(receipt(amount_kzt=amount, discount_amount_kzt=0), **changes)


@pytest.mark.parametrize('target_kind', ['service', 'component', 'session'])
@pytest.mark.parametrize('scheme,expected', [('fixed', 1000), ('percentage', 300), ('hybrid', 1300), ('individual_fixed', 1000), ('individual_percentage', 300)])
def test_full_payment_atomically_completes_exact_target_once(modules, monkeypatch, target_kind, scheme, expected):
    db, saved, settings, ledger, pay, hook = setup_case(modules, monkeypatch, target_kind)
    if scheme.startswith('individual'):
        settings.update(payment_mode='individual', services=[dict(service_id='component-catalog' if target_kind == 'component' else 'catalog', commission_type=scheme.split('_')[1], commission_value=10 if scheme.endswith('percentage') else 1000)])
    else:
        settings.update(payment_type=scheme, payment_value=10 if scheme == 'percentage' else 1000)
    asyncio.run(pay(1000))
    assert not any(e['kind'].endswith('_completion') for e in saved['accounting_events'])
    assert totals(modules, saved) == (1000, 0, [])
    final = receipt(amount_kzt=2000, discount_amount_kzt=0)
    asyncio.run(pay(2000, final))
    assert totals(modules, saved) == (3000, expected, [])
    assert totals(modules, saved, 'doctor-b') == (0, 0, [])
    completions = [e for e in saved['accounting_events'] if e['kind'].endswith('_completion')]
    assert len(completions) == 1
    assert completions[0]['completion_source'] == 'full_payment'
    assert completions[0]['doctor_id'] == 'doctor'
    assert completions[0]['recorded_by'] == 'cashier'
    before = deepcopy(saved)
    asyncio.run(pay(2000, final))
    assert saved == before
    pushed = db.treatment_plans.update_one.call_args.args[1]['$push']['accounting_events']['$each']
    assert len(pushed) == 2 and pushed[0]['amount_kzt'] == 2000


@pytest.mark.parametrize('target_kind', ['component', 'session'])
def test_remaining_payment_one_commit_preserves_previously_paid_doctor_a(modules, monkeypatch, target_kind):
    from services.payment_completion_service import PaymentCompletionService
    db, saved, settings, ledger, pay, hook = setup_case(modules, monkeypatch, target_kind)
    asyncio.run(pay(3000))
    old_events = deepcopy(saved['accounting_events'])
    before = db.treatment_plans.update_one.await_count
    hook.reset_mock()
    body = batch_body(3000, service_row_id='row')
    result = asyncio.run(PaymentCompletionService(db).settle_remaining('plan', body, 'cashier'))
    assert db.treatment_plans.update_one.await_count == before + 1
    hook.assert_awaited_once()
    assert saved['accounting_events'][:len(old_events)] == old_events
    assert totals(modules, saved) == (3000, 1300, [])
    assert totals(modules, saved, 'doctor-b') == (3000, 1300, [])
    assert result['plan']['execution_status'] == 'completed'
    previous = deepcopy(saved)
    asyncio.run(PaymentCompletionService(db).settle_remaining('plan', body, 'cashier'))
    assert saved == previous
    with pytest.raises(HTTPException) as error:
        asyncio.run(PaymentCompletionService(db).settle_remaining('plan', dict(body, payment_method='other'), 'cashier'))
    assert error.value.status_code == 409


@pytest.mark.parametrize('target_kind', ['component', 'session'])
def test_whole_purchase_failure_does_not_persist_any_part_or_sync(modules, monkeypatch, target_kind):
    from services.payment_completion_service import PaymentCompletionService
    db, saved, settings, ledger, pay, hook = setup_case(modules, monkeypatch, target_kind)
    db.doctors.find_one = AsyncMock(side_effect=lambda q: dict(settings) if q['id'] == 'doctor' else None)
    before = deepcopy(saved)
    with pytest.raises(HTTPException):
        asyncio.run(PaymentCompletionService(db).settle_remaining('plan', batch_body(6000), 'cashier'))
    assert saved == before
    db.treatment_plans.update_one.assert_not_awaited()
    hook.assert_not_awaited()


@pytest.mark.parametrize('embedded', [False, True])
def test_auto_paid_doctorless_lab_is_completed_without_doctor_or_salary(modules, monkeypatch, embedded):
    from services.payment_completion_service import PaymentCompletionService
    db, saved, settings, ledger, pay, hook = setup_case(modules, monkeypatch, 'component' if embedded else 'service')
    if embedded:
        lab = saved['services'][0]['components'][1]
    else:
        lab = dict(service_id='lab', service_row_id='lab-row', total_price=3000, occurrence_ids=['lab-first'])
        saved['services'].append(lab)
    lab.pop('doctor_id', None)
    lab_id = lab['service_id']
    db.service_prices.find_one = AsyncMock(side_effect=lambda q: dict(id=q['id'], service_type='regular', **({'laboratory_id':'lab'} if q['id'] == lab_id else {})))
    asyncio.run(modules.ledger.snapshot_analysis_catalogs(db, saved['services']))
    asyncio.run(PaymentCompletionService(db).settle_remaining('plan', batch_body(6000), 'cashier'))
    lab_events = [e for e in saved['accounting_events'] if e.get('service_id') == lab_id]
    assert len(lab_events) == 2
    assert all(e['doctor_id'] is None and e['compensation_amount_kzt'] == 0 for e in lab_events)
    assert totals(modules, saved) == (3000, 1300, [])
    assert saved['execution_status'] == 'completed'


def test_manual_completion_then_payment_does_not_replace_or_duplicate_execution(modules, monkeypatch):
    db, saved, settings, ledger, pay, hook = setup_case(modules, monkeypatch)
    asyncio.run(ledger.record_ordinary_service('plan', 'row', 'service_completion', dict(operation_id=str(uuid4())), 'doctor', 'first'))
    original = deepcopy(saved['accounting_events'][0])
    asyncio.run(pay(3000))
    assert len(saved['accounting_events']) == 2
    assert saved['accounting_events'][0] == original
    assert totals(modules, saved) == (3000, 1300, [])


def test_auto_batch_cas_retry_and_stale_amount_do_not_double_charge(modules, monkeypatch):
    from services.payment_completion_service import PaymentCompletionService
    db, saved, settings, ledger, pay, hook = setup_case(modules, monkeypatch, 'component')
    update = db.treatment_plans.update_one.side_effect
    attempts = []
    async def retry(query, changes):
        attempts.append(deepcopy(changes))
        if len(attempts) == 1:
            return SimpleNamespace(matched_count=0)
        return await update(query, changes)
    db.treatment_plans.update_one.side_effect = retry
    with pytest.raises(HTTPException) as error:
        asyncio.run(PaymentCompletionService(db).settle_remaining('plan', batch_body(5000), 'cashier'))
    assert error.value.status_code == 409
    assert not attempts
    asyncio.run(PaymentCompletionService(db).settle_remaining('plan', batch_body(6000), 'cashier'))
    assert len(attempts) == 2
    assert len(saved['accounting_events']) == 4
    assert totals(modules, saved)[1:] == (1300, [])
    assert totals(modules, saved, 'doctor-b')[1:] == (1300, [])
    hook.assert_awaited_once()


def test_history_not_completed_or_recalculated_by_new_payment_code(modules, monkeypatch):
    from services.payment_completion_service import PaymentCompletionService
    db, saved, settings, ledger, pay, hook = setup_case(modules, monkeypatch, auto=False)
    asyncio.run(pay(3000))
    assert len(saved['accounting_events']) == 1
    assert saved['services'][0].get('quantity_completed', 0) == 0
    assert totals(modules, saved) == (3000, 0, [])
    before = deepcopy(saved)
    with pytest.raises(HTTPException) as error:
        asyncio.run(PaymentCompletionService(db).settle_remaining('plan', batch_body(3000), 'cashier'))
    assert error.value.status_code == 409
    assert saved == before


def test_unallocated_advance_does_not_complete_but_exact_full_allocation_does(modules, monkeypatch):
    db, saved, settings, ledger, pay, hook = setup_case(modules, monkeypatch)
    asyncio.run(ledger.record_plan_advance('plan', dict(operation_id=str(uuid4()), payment_purpose='plan_advance', amount=3000, payment_method='card'), 'cashier'))
    assert saved['services'][0].get('status') != 'completed'
    assert totals(modules, saved) == (0, 0, [])
    allocation = dict(operation_id=str(uuid4()), amount_kzt=3000, discount_amount_kzt=0, payment_source='plan_advance')
    asyncio.run(ledger.record_ordinary_service('plan', 'row', 'service_receipt', allocation, 'cashier'))
    assert saved['services'][0]['status'] == 'completed'
    assert totals(modules, saved) == (3000, 1300, [])


def test_course_total_mismatch_is_rejected_without_charging_more_than_quoted(modules, monkeypatch):
    from services.payment_completion_service import PaymentCompletionService
    db, saved, settings, ledger, pay, hook = setup_case(modules, monkeypatch, 'session')
    saved['services'][0]['total_price'] = 5000
    with pytest.raises(HTTPException) as error:
        asyncio.run(PaymentCompletionService(db).settle_remaining('plan', batch_body(6000), 'cashier'))
    assert error.value.status_code == 409
    db.treatment_plans.update_one.assert_not_awaited()
    hook.assert_not_awaited()


def test_automatic_completion_policy_is_not_client_writable(modules):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        modules.plans.TreatmentPlanCreate(title='Plan', services=[], payment_completion_policy='full_payment_v1')


def test_doctorless_lab_sessions_full_course_complete_with_no_doctor_income(modules, monkeypatch):
    from services.payment_completion_service import PaymentCompletionService
    db, saved, settings, ledger, pay, hook = setup_case(modules, monkeypatch, 'session')
    for session in saved['services'][0]['sessions']:
        session.pop('doctor_id', None)
    db.service_prices.find_one = AsyncMock(side_effect=lambda q: dict(id=q['id'], service_type='regular', laboratory_id='lab'))
    asyncio.run(modules.ledger.snapshot_analysis_catalogs(db, saved['services']))
    asyncio.run(PaymentCompletionService(db).settle_remaining('plan', batch_body(6000), 'cashier'))
    assert len(saved['accounting_events']) == 4
    assert all(event['doctor_id'] is None and event['compensation_amount_kzt'] == 0 for event in saved['accounting_events'])
    assert saved['execution_status'] == 'completed'
    assert totals(modules, saved) == (0, 0, [])
    db.doctors.find_one.assert_not_awaited()


def test_whole_mixed_plan_reuses_catalog_ids_but_completes_distinct_rows_and_doctors_once(modules, monkeypatch):
    from services.payment_completion_service import PaymentCompletionService
    db, saved, settings, ledger, pay, hook = setup_case(modules, monkeypatch)
    saved['services'].extend([
        dict(service_id='catalog', service_row_id='course-row', is_course=True, payment_type='single', total_price=3000,
             sessions=[dict(session_id='s1', price=1000, doctor_id='doctor-b'), dict(session_id='s2', price=2000, doctor_id='doctor-b')]),
        dict(service_id='package', service_row_id='package-row', is_complex=True, total_price=6000, components=[
            dict(service_id='catalog', component_id='c1', price=3000, quantity=1, occurrence_ids=['c1-first'], doctor_id='doctor-c'),
            dict(service_id='catalog', component_id='c2', price=3000, quantity=1, occurrence_ids=['c2-first'], doctor_id='doctor-d')])])
    result = asyncio.run(PaymentCompletionService(db).settle_remaining('plan', batch_body(12000), 'cashier'))
    db.treatment_plans.update_one.assert_awaited_once()
    hook.assert_awaited_once()
    assert result['plan']['payment_status'] == 'paid'
    assert result['plan']['execution_status'] == 'completed'
    assert len(saved['accounting_events']) == 10
    assert totals(modules, saved) == (3000, 1300, [])
    assert totals(modules, saved, 'doctor-b') == (3000, 2300, [])
    assert totals(modules, saved, 'doctor-c') == (3000, 1300, [])
    assert totals(modules, saved, 'doctor-d') == (3000, 1300, [])


def test_paid_doctor_a_does_not_wait_for_other_doctors_unpaid_course(modules, monkeypatch):
    db, saved, settings, ledger, pay, hook = setup_case(modules, monkeypatch)
    saved['services'].append(dict(service_id='course', service_row_id='course-row', is_course=True, total_price=1000,
        sessions=[dict(session_id='b-first', price=1000, doctor_id='doctor-b')]))
    asyncio.run(pay(3000))
    assert saved['execution_status'] == 'in_progress'
    assert totals(modules, saved) == (3000, 1300, [])
    assert totals(modules, saved, 'doctor-b') == (0, 0, [])


@pytest.mark.parametrize('entry', ['directory_create', 'directory_update', 'plan_create', 'plan_update'])
def test_complex_zero_base_price_rejected_on_creation_and_editing(modules, monkeypatch, entry):
    from models.services import ServicePriceCreate, ServicePriceUpdate
    from services.service_price_service import ServicePriceService
    db, saved, settings = component_db()
    db.service_prices.insert_one = AsyncMock()
    db.service_prices.update_one = AsyncMock()
    db.treatment_plans.insert_one = AsyncMock()
    db.patients.find_one = AsyncMock(return_value=dict(id='patient'))
    async def catalog(query):
        if query.get('id') == 'catalog':
            return dict(id='catalog', service_type='complex', price=1000, components=saved['services'][0]['components'])
        if query.get('id'):
            return dict(id=query['id'], service_type='regular', price=0, is_active=True)
        return None
    db.service_prices.find_one = AsyncMock(side_effect=catalog)
    components = [dict(service_id='component-catalog', price=500)]
    with pytest.raises(HTTPException) as error:
        if entry == 'directory_create':
            asyncio.run(ServicePriceService(db).create_service_price(ServicePriceCreate(service_type='complex', service_name='Package', price=1000, components=components)))
        elif entry == 'directory_update':
            asyncio.run(ServicePriceService(db).update_service_price('catalog', ServicePriceUpdate(components=components)))
        elif entry == 'plan_create':
            data = modules.plans.TreatmentPlanCreate(title='Plan', services=[dict(service_id='catalog', is_complex=True, total_price=1000, components=components)])
            asyncio.run(modules.plans.TreatmentPlanService(db).create_treatment_plan('patient', data, 'cashier', 'Cashier'))
        else:
            rows = deepcopy(saved['services'])
            rows[0]['components'][0]['price'] = 0
            asyncio.run(modules.plans.TreatmentPlanService(db).update_treatment_plan('plan', modules.plans.TreatmentPlanUpdate(services=rows)))
    assert error.value.status_code == 400
    db.service_prices.insert_one.assert_not_awaited()
    db.service_prices.update_one.assert_not_awaited()
    db.treatment_plans.insert_one.assert_not_awaited()
    db.treatment_plans.update_one.assert_not_awaited()


def test_positive_base_price_and_full_percentage_discount_are_distinct_validation_fields(modules):
    from pydantic import ValidationError
    from models.services import ServiceComponent
    from services.service_price_service import validate_component_snapshot
    with pytest.raises(ValidationError):
        ServiceComponent(service_id='service', price=0)
    component = ServiceComponent(service_id='service', price=1000, discount=100)
    validate_component_snapshot([component.model_dump()], require_positive_prices=True)
    # Existing historical snapshot parsing is not changed into a migration.
    validate_component_snapshot([dict(service_id='a', price=0), dict(service_id='b', price=1000)])


@pytest.mark.parametrize('kind', ['component', 'session'])
@pytest.mark.parametrize('zero_kind', ['base', 'discount'])
def test_unsupported_zero_payable_part_fails_before_any_charge_without_inventing_salary(modules, monkeypatch, kind, zero_kind):
    from services.payment_completion_service import PaymentCompletionService
    db, saved, settings, ledger, pay, hook = setup_case(modules, monkeypatch, kind)
    row = saved['services'][0]
    targets = row['components'] if kind == 'component' else row['sessions']
    if zero_kind == 'base':
        row['total_price'] = 3000
        targets[0]['price'] = 0
    else:
        targets[0]['discount_amount'] = 3000
    before = deepcopy(saved)
    with pytest.raises(HTTPException) as error:
        asyncio.run(PaymentCompletionService(db).settle_remaining('plan', batch_body(3000), 'cashier'))
    assert error.value.status_code == 422
    assert ('base price' if zero_kind == 'base' else 'Zero net') in error.value.detail
    assert saved == before
    db.treatment_plans.update_one.assert_not_awaited()
    hook.assert_not_awaited()


@pytest.mark.parametrize('kind', ['service', 'component'])
def test_aggregate_payment_preserves_existing_discount_and_partial_receipt(modules, monkeypatch, kind):
    from services.payment_completion_service import PaymentCompletionService
    db, saved, settings, ledger, pay, hook = setup_case(modules, monkeypatch, kind)
    asyncio.run(pay(1000, receipt(amount_kzt=1000, discount_amount_kzt=300)))
    previous = deepcopy(saved['accounting_events'])
    amount = 4700 if kind == 'component' else 1700
    result = asyncio.run(PaymentCompletionService(db).settle_remaining('plan', batch_body(amount), 'cashier'))
    assert saved['accounting_events'][:len(previous)] == previous
    assert result['plan']['payment_status'] == 'paid'
    assert result['plan']['execution_status'] == 'completed'
    assert totals(modules, saved) == (2700, 1270, [])
