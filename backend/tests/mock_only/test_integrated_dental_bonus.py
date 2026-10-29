"""Cross-feature synthetic contracts: dental rows, source eligibility and monthly pay."""
import asyncio
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from models.consultation import ConsultationSheetCreate
from test_accounting_ledger import modules, course_db
from test_consultation_teeth import dental, setup_service


@pytest.mark.parametrize('with_sibling', [False, True])
def test_dental_teeth_quantity_is_one_source_position_and_monthly_events_are_zero(modules, monkeypatch, with_sibling):
    service, db, saved = setup_service(modules, monkeypatch)
    db.admin_bonus_settings.find_one = AsyncMock(return_value=dict(enabled=True, rate_type='percentage', rate_value=10, revision='synthetic'))
    db.doctors.find_one = AsyncMock(return_value=dict(id='doctor', payment_type='monthly', payment_value=120000, currency='KZT'))
    rows = [dental(teeth_numbers=['11', '21', '31'])]
    if with_sibling:
        rows.append(dict(service_id='sibling', service_name='Synthetic sibling', price_per_unit=1000, quantity=1, total_price=1000))

    async def run():
        sheet = await service.create_consultation_sheet(ConsultationSheetCreate(
            patient_id='patient', doctor_id='doctor', treatment_services=rows), 'cashier', 'Synthetic')
        assert saved['consultation_sheet_id'] == sheet.id
        row = saved['services'][0]
        result = await modules.ledger.AccountingLedgerService(db, sync_payment=False).record_ordinary_service(
            saved['id'], row['service_row_id'], 'service_receipt', dict(operation_id=str(uuid4()),
                amount_kzt=2700, discount_amount_kzt=0, payment_source='cash', payment_method='cash'), 'cashier')
        event = result['event']
        assert row['teeth_numbers'] == ['11', '21', '31']
        assert event['compensation_snapshot']['payment_type'] == 'monthly'
        assert event['compensation_amount_kzt'] == 0
        if with_sibling:
            assert event['admin_bonus']['amount_kzt'] == 270
        else:
            assert 'admin_bonus' not in event  # Three teeth do not turn one ordinary row into three source positions.
    asyncio.run(run())


@pytest.mark.parametrize('sessions', [1, 5])
@pytest.mark.parametrize('kind,value,per_session', [('fixed', 80, 80), ('percentage', 10, 50)])
def test_course_source_stage_count_with_monthly_doctor(modules, monkeypatch, sessions, kind, value, per_session):
    db, saved, settings = course_db()
    settings.update(payment_type='monthly', payment_value=120000)
    parent = saved['services'][0]
    parent.update(total_price=sessions * 500, quantity=sessions,
        sessions=[dict(session_id=f'session-{i}', date='2026-10-08', price=500) for i in range(sessions)])
    saved['total_cost'] = sessions * 500
    db.admin_bonus_settings.find_one = AsyncMock(return_value=dict(enabled=True, rate_type=kind, rate_value=value, revision='synthetic'))
    monkeypatch.setattr(modules.plans.TreatmentPlanService, 'sync_persisted_payment', AsyncMock())

    async def run():
        for i in range(sessions):
            result = await modules.ledger.AccountingLedgerService(db, sync_payment=False).record_session('plan', 'catalog', f'session-{i}',
                dict(operation_id=str(uuid4()), session_id=f'session-{i}', amount_kzt=500, funding_source='cash', payment_method='cash'), 'cashier')
            assert result['event']['compensation_amount_kzt'] == 0
        events = [event for event in saved['accounting_events'] if event['kind'] == 'session_receipt']
        assert len(events) == sessions
        if sessions == 1:
            assert all('admin_bonus' not in event for event in events)
        else:
            assert len([event for event in events if event.get('admin_bonus')]) == 5
            assert sum(event['admin_bonus']['amount_kzt'] for event in events) == per_session * 5
    asyncio.run(run())
