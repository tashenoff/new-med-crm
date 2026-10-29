"""Monthly salary regression tests: no Mongo, server startup or external data."""
import asyncio
from copy import deepcopy
import pytest

from test_doctor_compensation import modules, memory_db, persistence_db, doctor, plan, report


def test_monthly_create_edit_and_reopen(modules):
    db, records = persistence_db()
    service = modules.doctors.DoctorService(db)

    async def run():
        created = await service.create_doctor(modules.models.DoctorCreate(
            full_name='Synthetic monthly doctor', payment_type='monthly',
            payment_value=120000, currency='KZT', consultation_compensation_mode='none'))
        assert created.payment_type == 'monthly'
        assert (await service.get_doctor_by_id(created.id)).payment_value == 120000
        assert (await service.get_doctors())[0].payment_type == 'monthly'
        await service.update_doctor(created.id, modules.models.DoctorUpdate(payment_value=135000.5))
        reopened = await service.get_doctor_by_id(created.id)
        assert reopened.payment_type == 'monthly'
        assert reopened.payment_value == records[created.id]['payment_value'] == 135000.5
        # Ordinary profile editing does not alter the saved salary.
        await service.update_doctor(created.id, modules.models.DoctorUpdate(full_name='Renamed synthetic'))
        assert (await service.get_doctor_by_id(created.id)).payment_value == 135000.5

    asyncio.run(run())


@pytest.mark.parametrize('value', [0, 120000, 135000.5])
def test_monthly_without_patients(modules, value):
    result = report(modules, doctor(payment_type='monthly', payment_value=value))
    item = result['salary_data'][0]
    assert result['compensation_complete']
    assert item['total_appointments'] == item['total_revenue'] == 0
    assert item['calculated_salary'] == item['total_salary'] == value
    assert result['summary']['total_salary'] == value
    assert item['consultations_salary'] == item['treatment_plans_salary'] == 0
    assert item['salary_settings_basis'] == 'current_doctor_profile'


def test_monthly_not_multiplied_by_services_appointments_or_individual_overrides(modules):
    settings = doctor(payment_type='monthly', payment_value=120000, payment_mode='individual')
    settings['consultation_compensation_mode'] = 'separate'
    settings.update(consultation_payment_type='fixed', consultation_payment_value=9000)
    settings['services'] = [dict(service_id='service', commission_type='fixed', commission_value=5000)]
    appointments = [dict(id=str(i), doctor_id='doctor', status='completed', appointment_date='2026-10-05') for i in range(7)]
    paid_plan = plan(dict(service_id='service', paid_amount=3000, payment_date='2026-10-05',
        sessions=[dict(completed=True, date='2026-10-05') for _ in range(8)]))
    result = report(modules, settings, [paid_plan], appointments)
    item = result['salary_data'][0]
    assert result['compensation_complete']
    assert item['calculated_salary'] == 120000
    assert item['total_appointments'] == 7
    assert item['total_revenue'] == 3000
    assert not item['revenue_complete']
    assert item['revenue_accounting_blockers']  # Legacy revenue remains visibly qualified.
    from services.accounting_ledger_service import resolve_snapshot, compensation_amount
    snapshot = resolve_snapshot(settings, 'service')
    assert snapshot['payment_type'] == 'monthly'
    for kind, amount in [('service_receipt', 20000), ('service_completion', 0),
                         ('session_completion', 0), ('service_deposit_allocation', 4000)]:
        assert compensation_amount(snapshot, kind, amount) == 0


@pytest.mark.parametrize('start,end,complete', [
    ('2026-10-01', '2026-10-31', True), ('2026-10-15', '2026-10-15', True),
    ('2026-09-01', '2026-09-30', True), ('2026-09-01', '2026-10-31', False),
    ('2026-10-31', '2026-10-01', False),
])
def test_monthly_period_no_daily_or_multi_month_formula(modules, start, end, complete):
    service = modules.salary.SalaryService(memory_db(doctor(payment_type='monthly', payment_value=120000)))
    result = asyncio.run(service.get_doctor_salary_report(start, end))
    assert result['compensation_complete']
    assert result['salary_data'][0]['calculated_salary'] == (120000 if complete else None)
    assert result['salary_data'][0]['monthly_salary'] == 120000
    assert result['summary']['salary_total_complete'] is complete
    assert result['accounting_blockers'] == []


@pytest.mark.parametrize('kind', ['percentage', 'fixed', 'hybrid'])
def test_cross_month_monthly_row_never_blocks_existing_report_schemes(modules, kind):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    existing = dict(doctor(payment_type=kind, payment_value=25 if kind == 'percentage' else 50),
                    id='existing', consultation_compensation_mode='inherit' if kind == 'fixed' else 'none')
    appointments = [dict(doctor_id='existing', status='completed', appointment_date='2026-10-15')]
    db = memory_db(existing, appointments=appointments)
    service = modules.salary.SalaryService(db)
    baseline = asyncio.run(service.get_doctor_salary_report('2026-09-01', '2026-10-31'))
    monthly = doctor(payment_type='monthly', payment_value=120000)
    db.doctors.find = lambda query: SimpleNamespace(to_list=AsyncMock(return_value=[existing, monthly]))
    result = asyncio.run(service.get_doctor_salary_report('2026-09-01', '2026-10-31'))
    assert result['compensation_complete']
    assert result['accounting_blockers'] == []
    assert next(row for row in result['salary_data'] if row['doctor_id'] == 'existing') == baseline['salary_data'][0]
    assert result['summary']['total_salary'] == baseline['summary']['total_salary']
    monthly_row = next(row for row in result['salary_data'] if row['doctor_id'] == 'doctor')
    assert monthly_row['monthly_salary'] == 120000
    assert monthly_row['calculated_salary'] is None
    assert not result['summary']['salary_total_complete']


def test_cross_month_report_endpoint_returns_rows_instead_of_new_409(modules):
    import importlib
    from types import SimpleNamespace

    routes = importlib.import_module('routers.doctors')
    service = modules.salary.SalaryService(memory_db(doctor(payment_type='monthly', payment_value=120000)))
    result = asyncio.run(routes.get_doctor_salary_report('2026-09-01', '2026-10-31',
        SimpleNamespace(is_active=True, permissions=['payroll_view']), service))
    assert result['salary_data'][0]['monthly_salary'] == 120000
    assert result['salary_data'][0]['calculated_salary'] is None


def test_changing_current_salary_changes_past_month_preview_without_history(modules):
    settings = doctor(payment_type='monthly', payment_value=120000)
    service = modules.salary.SalaryService(memory_db(settings))
    before = asyncio.run(service.get_doctor_salary_report('2026-09-01', '2026-09-30'))
    settings['payment_value'] = 135000
    after = asyncio.run(service.get_doctor_salary_report('2026-09-01', '2026-09-30'))
    assert before['salary_data'][0]['calculated_salary'] == 120000
    assert after['salary_data'][0]['calculated_salary'] == 135000
    assert after['salary_data'][0]['salary_settings_basis'] == 'current_doctor_profile'


@pytest.mark.parametrize('invalid', [
    dict(payment_value=-1), dict(payment_value=True), dict(payment_value='NaN'),
    dict(payment_value='Infinity'), dict(payment_value=None), dict(currency='USD'),
    dict(consultation_compensation_mode='separate', consultation_payment_type='monthly', consultation_payment_value=50),
])
def test_monthly_invalid_settings_do_not_write(modules, invalid):
    data = dict(full_name='Synthetic', payment_type='monthly', payment_value=120000,
                consultation_compensation_mode='none', currency='KZT')
    with pytest.raises(ValueError):
        modules.models.DoctorCreate(**dict(data, **invalid))
    db, records = persistence_db()
    service = modules.doctors.DoctorService(db)

    async def run():
        created = await service.create_doctor(modules.models.DoctorCreate(**data))
        before = deepcopy(records)
        with pytest.raises(Exception):
            await service.update_doctor(created.id, modules.models.DoctorUpdate(**invalid))
        assert records == before
    asyncio.run(run())


def test_monthly_has_no_example_default(modules):
    with pytest.raises(ValueError):
        modules.models.DoctorCreate(full_name='Synthetic', payment_type='monthly', consultation_compensation_mode='none')
    assert modules.models.DoctorCreate(full_name='Basic').payment_value == 0
    for value in [None, True, float('nan'), -1]:
        result = report(modules, doctor(payment_type='monthly', payment_value=value))
        assert not result['compensation_complete']


def test_monthly_salary_uses_common_super_admin_permission(modules, monkeypatch):
    from test_doctor_compensation import test_salary_report_employee_role_authorization
    test_salary_report_employee_role_authorization(modules, monkeypatch, 'super_admin', 200, False)
