"""Synthetic dental consultation lifecycle; run with --noconftest."""
import asyncio
from copy import deepcopy
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from models.consultation import TreatmentService, ConsultationSheetCreate, ConsultationSheetUpdate
from test_accounting_ledger import modules, memory_db, receipt
from test_appointment_modal_status import MemoryCollection


def dental(**changes):
    return dict(dict(service_id='catalog', service_name='Synthetic dental', unit='зуб',
                     teeth_numbers=['11', '21'], quantity=99, price_per_unit=1000,
                     discount=10, total_price=999999), **changes)


def test_dental_count_and_discounted_total_derive_from_selected_teeth():
    row = TreatmentService(**dental())
    assert row.quantity == 2
    assert row.total_price == 1800
    assert row.model_dump()['teeth_numbers'] == ['11', '21']
    assert TreatmentService(**dental(teeth_numbers=['11'], price_per_unit=1.005, discount=0)).total_price == 1.01


@pytest.mark.parametrize('changes', [dict(teeth_numbers=[]), dict(teeth_numbers=None),
    dict(teeth_numbers=['11', '11']), dict(teeth_numbers=['19']), dict(teeth_numbers=['51']),
    dict(discount=-1), dict(discount=101), dict(discount=float('nan')),
    dict(price_per_unit=-1), dict(price_per_unit=float('inf')), dict(is_course=True)])
def test_invalid_dental_selection_is_rejected(changes):
    with pytest.raises(ValidationError):
        TreatmentService(**dental(**changes))


def test_regular_and_course_services_keep_existing_pricing_and_quantity():
    for unit in (None, 'процедура'):
        row = TreatmentService(service_id='regular', service_name='Synthetic regular', unit=unit,
                               quantity=5, price_per_unit=100, total_price=450, is_course=True)
        assert row.quantity == 5 and row.total_price == 450 and row.is_course


def setup_service(modules, monkeypatch):
    db, saved, _ = memory_db()
    db.consultation_sheets = MemoryCollection()
    async def insert(document):
        saved.clear()
        saved.update(deepcopy(document))
    db.treatment_plans.insert_one = AsyncMock(side_effect=insert)
    monkeypatch.setattr(modules.plans.TreatmentPlanService, 'replay_appointment_deposits', AsyncMock(return_value=False))
    monkeypatch.setattr(modules.plans.TreatmentPlanService, 'sync_persisted_payment', AsyncMock())
    service = object.__new__(modules.sheets.ConsultationService)
    service.db, service.collection = db, db.consultation_sheets
    return service, db, saved


def test_create_reopen_edit_reopen_and_pay_retains_teeth(modules, monkeypatch):
    service, db, saved = setup_service(modules, monkeypatch)
    async def lifecycle():
        sheet = await service.create_consultation_sheet(ConsultationSheetCreate(
            patient_id='patient', doctor_id='doctor', treatment_services=[dental()]), 'cashier', 'Synthetic User')
        reopened = await service.get_consultation_sheet(sheet.id)
        assert reopened.treatment_services[0].teeth_numbers == ['11', '21']
        row_id = saved['services'][0]['service_row_id']
        assert saved['total_cost'] == 1800
        assert saved['services'][0]['unit'] == 'зуб'
        assert saved['services'][0]['discount'] == 10

        await service.update_consultation_sheet(sheet.id, ConsultationSheetUpdate(
            treatment_services=[dental(teeth_numbers=['11', '21', '31'])]), 'cashier', 'Synthetic User')
        reopened = await service.get_consultation_sheet(sheet.id)
        assert reopened.treatment_services[0].teeth_numbers == ['11', '21', '31']
        assert reopened.treatment_services[0].quantity == 3
        assert saved['total_cost'] == 2700
        row = saved['services'][0]
        assert row['service_row_id'] == row_id
        assert row['quantity_total'] == len(row['occurrence_ids']) == 3
        assert row['teeth_numbers'] == ['11', '21', '31']

        await modules.ledger.AccountingLedgerService(db).record_ordinary_service(saved['id'], row_id,
            'service_receipt', receipt(amount_kzt=2700, discount_amount_kzt=0), 'cashier')
        assert saved['services'][0]['teeth_numbers'] == ['11', '21', '31']
        assert saved['services'][0]['paid_amount'] == 2700
        assert saved['services'][0]['payment_status'] == 'paid'

        before = deepcopy(saved)
        # Reopening and saving clinical text after payment is still allowed.
        await service.update_consultation_sheet(sheet.id, ConsultationSheetUpdate(
            notes='Synthetic note', treatment_services=[reopened.treatment_services[0].model_dump()]))
        assert saved == before
        assert (await service.get_consultation_sheet(sheet.id)).notes == 'Synthetic note'
        with pytest.raises(HTTPException) as error:
            await service.update_consultation_sheet(sheet.id, ConsultationSheetUpdate(
                treatment_services=[dental(teeth_numbers=['11'])]))
        assert error.value.status_code == 409
        assert saved == before
    asyncio.run(lifecycle())
