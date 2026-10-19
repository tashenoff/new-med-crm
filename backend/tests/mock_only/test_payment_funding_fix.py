"""No real DB or notifications: exercise receipt assignment and source balances."""
import asyncio
import importlib
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from test_accounting_ledger import modules, deposit_fixture, appointment_source, deposit_totals


def setup_put(modules, monkeypatch, amount=0):
    db, plan, ledger = deposit_fixture(modules, monkeypatch)
    source = appointment_source(db, amount)
    source.update(doctor_id='doctor', appointment_date='2026-10-19', appointment_time='10:00')
    db.treatment_plans.find.return_value.sort.return_value.to_list = AsyncMock(side_effect=lambda *args: [deepcopy(plan)])
    routes = importlib.import_module('routers.appointments')
    monkeypatch.setattr(routes, '_send_appointment_notifications', AsyncMock())
    return db, plan, source, routes


def test_put_new_deposit_applies_once_and_same_save_has_no_duplicate_revenue(modules, monkeypatch):
    db, plan, source, routes = setup_put(modules, monkeypatch)
    user = SimpleNamespace(role=routes.UserRole.ADMIN)
    payload = routes.AppointmentUpdate(deposit=700, deposit_type='amount')
    result = asyncio.run(routes.update_appointment('appointment', payload, user, db))
    assert result.deposit == 700
    assert source['deposit_assignment_pending'] is False
    assert source['treatment_plan_deposit_claims'] == [dict(plan_id='plan', amount_kzt=700)]
    events = deepcopy(plan['accounting_events'])
    asyncio.run(routes.update_appointment('appointment', payload, user, db))
    assert plan['accounting_events'] == events
    assert len([event for event in events if event['kind'] == 'patient_deposit_received']) == 1
    assert deposit_totals(modules, plan) == (700, 0)


def test_put_failed_assignment_replays_pending_source_on_unchanged_retry(modules, monkeypatch):
    db, plan, source, routes = setup_put(modules, monkeypatch)
    user = SimpleNamespace(role=routes.UserRole.ADMIN)
    payload = routes.AppointmentUpdate(deposit=700, deposit_type='amount')
    update = db.treatment_plans.update_one.side_effect
    db.treatment_plans.update_one.side_effect = RuntimeError('interrupted')
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes.update_appointment('appointment', payload, user, db))
    assert error.value.status_code == 503
    assert source['deposit_assignment_pending'] is True
    assert not plan.get('accounting_events')
    db.treatment_plans.update_one.side_effect = update
    asyncio.run(routes.update_appointment('appointment', payload, user, db))
    assert source['deposit_assignment_pending'] is False
    assert deposit_totals(modules, plan) == (700, 0)


def test_unrelated_put_does_not_backfill_old_deposit(modules, monkeypatch):
    db, plan, source, routes = setup_put(modules, monkeypatch, 700)
    asyncio.run(routes.update_appointment('appointment', routes.AppointmentUpdate(notes='Updated'), SimpleNamespace(role=routes.UserRole.ADMIN), db))
    assert not plan.get('accounting_events')
    assert not source.get('treatment_plan_deposit_claims')


@pytest.mark.parametrize('amount', [100, 900])
def test_assigned_deposit_amount_remains_immutable(modules, monkeypatch, amount):
    db, plan, source, routes = setup_put(modules, monkeypatch)
    user = SimpleNamespace(role=routes.UserRole.ADMIN)
    asyncio.run(routes.update_appointment('appointment', routes.AppointmentUpdate(deposit=700), user, db))
    before = deepcopy(plan)
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes.update_appointment('appointment', routes.AppointmentUpdate(deposit=amount), user, db))
    assert error.value.status_code == 409
    assert source['deposit'] == 700
    assert plan == before


def test_received_without_usage_and_percent_source_are_available(modules):
    summary = importlib.import_module('services.patient_funding_service').patient_funding_summary
    result = summary([dict(id='appointment',deposit=20,deposit_type='percent',price=5000)], [])
    assert result['deposit_received_kzt'] == result['deposit_available_kzt'] == 1000
    assert result['deposit_used_kzt'] == 0


def test_funding_counts_source_once_not_plan_assignments(modules, monkeypatch):
    db, plan, source, routes = setup_put(modules, monkeypatch)
    asyncio.run(routes.update_appointment('appointment', routes.AppointmentUpdate(deposit=1200), SimpleNamespace(role=routes.UserRole.ADMIN), db))
    summary = importlib.import_module('services.patient_funding_service').patient_funding_summary
    result = summary([source], [plan])
    assert result['deposit_received_kzt'] == 1200
    assert result['deposit_used_kzt'] == 1000
    assert result['deposit_available_kzt'] == 200
    assert result['advance_available_kzt'] == 0


def test_legacy_complex_counts_children_without_parent_duplicate(modules):
    summary = importlib.import_module('services.patient_funding_service').patient_funding_summary
    plan = dict(id='old',services=[dict(is_complex=True,paid_from_deposit=300,components=[dict(paid=True,paid_from_deposit=100),dict(paid=True,paid_from_deposit=200)])])
    result = summary([dict(id='appointment',deposit=1000)], [plan])
    assert result['deposit_used_kzt'] == 300
    assert result['deposit_available_kzt'] == 700


def test_missing_legacy_funding_provenance_is_unknown_not_fake_zero(modules):
    summary = importlib.import_module('services.patient_funding_service').patient_funding_summary
    result = summary([dict(id='appointment',deposit=1000)], [dict(id='old',services=[dict(payment_status='paid',paid_amount=500)])])
    assert result['deposit_received_kzt'] == 1000
    assert result['deposit_available_kzt'] is None
    assert not result['known']


def test_legacy_paid_service_retry_cannot_spend_deposit_again(modules, monkeypatch):
    db, plan, _ = deposit_fixture(modules, monkeypatch)
    row = plan['services'][0]
    row.pop('service_row_id')
    row.update(payment_status='paid',paid_amount=1000,paid_from_deposit=300)
    plan.update(paid_amount=1000,deposit_balance=400)
    monkeypatch.setattr(modules.routes, 'db', db)
    monkeypatch.setattr(modules.plans.TreatmentPlanService, 'get_treatment_plan', AsyncMock(return_value=deepcopy(plan)))
    asyncio.run(modules.routes.mark_service_paid('plan','catalog',dict(payment_method_id='cash'),SimpleNamespace(id='recorder')))
    assert plan['deposit_balance'] == 400
    db.treatment_plans.update_one.assert_not_awaited()


def test_funding_endpoint_enforces_patient_scope(modules):
    with pytest.raises(HTTPException) as error:
        asyncio.run(modules.routes.get_patient_funding_summary('other',SimpleNamespace(role=modules.routes.UserRole.PATIENT,patient_id='mine')))
    assert error.value.status_code == 403
