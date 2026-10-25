"""Clinical text edits after payment must leave all financial history intact."""
import asyncio
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from models.consultation import ConsultationSheet, ConsultationSheetUpdate
from test_accounting_ledger import modules
from test_appointment_modal_status import MemoryCollection


def fixture(modules):
    row = dict(service_id="service", service_name="Test service", quantity=1, price_per_unit=10000, total_price=10000)
    sheet = ConsultationSheet(id="sheet", patient_id="patient", doctor_id="doctor", doctor_name="Test doctor",
        created_by="admin", created_by_name="Test admin", treatment_services=[row], notes="Before")
    plan = dict(id="plan", consultation_sheet_id="sheet", paid_amount=2000,
                services=[{**row, "paid_amount": 2000}], accounting_events=[dict(event_id="deposit-event")])
    service = object.__new__(modules.sheets.ConsultationService)
    service.db = SimpleNamespace(consultation_sheets=MemoryCollection([sheet.dict()]),
                                 treatment_plans=MemoryCollection([plan]))
    service.collection = service.db.consultation_sheets
    service._update_treatment_plan_from_consultation = AsyncMock()
    return service, sheet


@pytest.mark.parametrize("full_form", [False, True])
def test_paid_consultation_allows_clinical_edits_without_financial_writes(modules, full_form):
    service, sheet = fixture(modules)
    before = deepcopy(service.db.treatment_plans.rows)
    data = dict(notes="After", complaints="Updated complaint", recommendations="Updated recommendation")
    if full_form:
        data.update(doctor_id=sheet.doctor_id, treatment_services=sheet.dict()["treatment_services"])
    result = asyncio.run(service.update_consultation_sheet("sheet", ConsultationSheetUpdate(**data)))
    assert result.notes == "After"
    assert result.complaints == "Updated complaint"
    assert result.recommendations == "Updated recommendation"
    assert result.treatment_services == sheet.treatment_services
    assert service.db.treatment_plans.rows == before
    assert not service.db.treatment_plans.writes
    service._update_treatment_plan_from_consultation.assert_not_awaited()


@pytest.mark.parametrize("change", ["doctor", "price", "remove_services"])
def test_paid_consultation_still_rejects_structural_edits_before_any_write(modules, change):
    service, sheet = fixture(modules)
    data = {"notes": "Must not be saved"}
    if change == "doctor":
        data["doctor_id"] = "other-doctor"
    elif change == "price":
        data["treatment_services"] = [{**sheet.dict()["treatment_services"][0], "total_price": 20000}]
    else:
        data["treatment_services"] = []
    before = deepcopy((service.collection.rows, service.db.treatment_plans.rows))
    with pytest.raises(HTTPException) as error:
        asyncio.run(service.update_consultation_sheet("sheet", ConsultationSheetUpdate(**data)))
    assert error.value.status_code == 409
    assert (service.collection.rows, service.db.treatment_plans.rows) == before
    assert not service.collection.writes


def test_unpaid_consultation_service_edit_still_updates_treatment_plan(modules):
    service, sheet = fixture(modules)
    service.db.treatment_plans.rows[0].pop("accounting_events")
    data = ConsultationSheetUpdate(treatment_services=[{**sheet.dict()["treatment_services"][0], "quantity": 2, "total_price": 20000}])
    result = asyncio.run(service.update_consultation_sheet("sheet", data))
    assert result.treatment_services[0].quantity == 2
    service._update_treatment_plan_from_consultation.assert_awaited_once()
