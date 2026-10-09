"""Run only with --noconftest; all records and dependencies are in memory."""

import asyncio
import importlib
import socket
import sys
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock

import pytest


@pytest.fixture
def modules(monkeypatch):
    import motor.motor_asyncio
    import pymongo

    def forbidden(*args, **kwargs):
        raise AssertionError("Database/network access is forbidden")

    monkeypatch.setattr(pymongo, "MongoClient", forbidden)
    monkeypatch.setattr(motor.motor_asyncio, "AsyncIOMotorClient", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    root = Path(__file__).resolve().parents[2]
    monkeypatch.syspath_prepend(str(root))
    for name in ("models", "services"):
        package = ModuleType(name)
        package.__path__ = [str(root / name)]
        monkeypatch.setitem(sys.modules, name, package)
    database = ModuleType("database")
    database.db = SimpleNamespace()
    monkeypatch.setitem(sys.modules, "database", database)
    return SimpleNamespace(
        models=importlib.import_module("models.doctor"),
        salary=importlib.import_module("services.salary_service"),
        doctors=importlib.import_module("services.doctor_service"),
    )


def memory_db(doctor=None, plans=(), appointments=()):
    def collection(records):
        return SimpleNamespace(
            find=lambda query: SimpleNamespace(to_list=AsyncMock(return_value=deepcopy(records))),
            aggregate=lambda pipeline: SimpleNamespace(to_list=AsyncMock(return_value=[])),
        )

    return SimpleNamespace(
        doctors=collection([doctor] if doctor else []),
        treatment_plans=collection(list(plans)),
        appointments=collection(list(appointments)),
    )


def persistence_db():
    """Store only actual writes; return detached documents like a database driver."""
    records = {}

    def matches(record, query):
        return all(
            any(matches(record, condition) for condition in value)
            if key == "$or" else record.get(key) == value
            for key, value in query.items()
        )

    async def insert(document):
        records[document["id"]] = deepcopy(document)

    async def find_one(query):
        return next((deepcopy(row) for row in records.values() if matches(row, query)), None)

    async def update(query, changes):
        for row in records.values():
            if matches(row, query):
                row.update(deepcopy(changes["$set"]))
                return SimpleNamespace(matched_count=1)
        return SimpleNamespace(matched_count=0)

    def find(query):
        cursor = SimpleNamespace(to_list=AsyncMock(side_effect=lambda limit: [
            deepcopy(row) for row in records.values() if matches(row, query)]))
        cursor.sort = lambda *args: cursor
        return cursor

    return SimpleNamespace(doctors=SimpleNamespace(
        insert_one=AsyncMock(side_effect=insert), find_one=AsyncMock(side_effect=find_one),
        update_one=AsyncMock(side_effect=update), find=find)), records


@pytest.mark.parametrize("payment_mode", ["general", "individual"])
@pytest.mark.parametrize("kind", ["fixed", "percentage", "hybrid"])
@pytest.mark.parametrize("consultation_mode", ["none", "inherit", "separate"])
@pytest.mark.parametrize("consultation_kind", ["fixed", "percentage", "hybrid"])
def test_compensation_create_edit_round_trip(
        modules, payment_mode, kind, consultation_mode, consultation_kind):
    database, records = persistence_db()
    service = modules.doctors.DoctorService(database)

    def settings(edited=False):
        value = 23 if edited else 17
        consultation_value = 31 if edited else 19
        return dict(
            payment_mode=payment_mode, payment_type=kind, payment_value=value,
            currency="KZT", hybrid_fixed_amount=value if kind == "hybrid" else 0,
            hybrid_percentage_value=29 if edited else 13,
            services=["plain-service", dict(service_id="fixed-service", commission_type="fixed",
                       commission_value=150 if edited else 100, commission_currency="KZT"),
                      dict(service_id="percentage-service", commission_type="percentage",
                           commission_value=value, commission_currency="KZT")],
            consultation_compensation_mode=consultation_mode,
            consultation_payment_type=consultation_kind,
            consultation_payment_value=consultation_value, consultation_currency="KZT",
            consultation_hybrid_fixed_amount=(consultation_value if consultation_kind == "hybrid" else 0),
            consultation_hybrid_percentage_value=37 if edited else 11,
        )

    def assert_settings(document, expected):
        assert {key: document.get(key) for key in expected} == expected

    async def round_trip():
        original = settings()
        created = await service.create_doctor(modules.models.DoctorCreate(full_name="Doctor", **original))
        database.doctors.insert_one.assert_awaited_once()
        assert_settings(database.doctors.insert_one.call_args.args[0], original)
        assert_settings(records[created.id], original)
        assert_settings(created.model_dump(), original)
        assert_settings((await service.get_doctor_by_id(created.id)).model_dump(), original)
        assert_settings((await service.get_doctors())[0].model_dump(), original)

        edited = settings(edited=True)
        saved = await service.update_doctor(created.id, modules.models.DoctorUpdate(**edited))
        database.doctors.update_one.assert_awaited_once()
        assert_settings(database.doctors.update_one.call_args.args[1]["$set"], edited)
        assert_settings(records[created.id], edited)
        assert_settings(saved.model_dump(), edited)
        assert_settings((await service.get_doctor_by_id(created.id)).model_dump(), edited)
        assert_settings((await service.get_doctors())[0].model_dump(), edited)

    asyncio.run(round_trip())


def doctor(**settings):
    return dict(id="doctor", full_name="Doctor", is_active=True,
                services=["service"], consultation_compensation_mode="none", **settings)


def plan(service, **settings):
    return dict(dict(id="plan", assigned_doctor_id="doctor", payment_status="partially_paid",
                     paid_amount=300, total_cost=1000, services=[service]), **settings)


def report(modules, settings, plans=(), appointments=()):
    service = modules.salary.SalaryService(memory_db(settings, plans, appointments))
    return asyncio.run(service.get_doctor_salary_report("2026-10-01", "2026-10-31"))


@pytest.mark.parametrize("kind,value,percentage,expected", [
    ("percentage", 20, 0, 60), ("fixed", 50, 0, 100), ("hybrid", 50, 20, 160),
])
def test_general_actual_receipts_and_completed_occurrences(modules, kind, value, percentage, expected):
    settings = doctor(payment_type=kind, payment_value=value, hybrid_percentage_value=percentage)
    row = dict(service_id="service", price=1000, quantity=9, paid_amount=300,
               payment_date="2026-10-05", sessions=[
                   {"completed": True, "date": "2026-10-06"},
                   {"completed": True, "date": "2026-10-07"},
                   {"completed": False, "date": "2026-10-08"},
                   {"completed": True, "date": "2026-09-08"},
               ])
    item = report(modules, settings, [plan(row)])["salary_data"][0]
    assert item["treatment_plans_revenue"] == 300
    assert item["treatment_plans_salary"] == expected


@pytest.mark.parametrize("mode,kind,value,percentage,expected", [
    ("none", "hybrid", 40, 25, 0),
    ("inherit", "fixed", 40, 0, 80),
    ("inherit", "hybrid", 40, 25, 130),
    ("separate", "percentage", 25, 0, 50),
    ("separate", "fixed", 40, 0, 80),
    ("separate", "hybrid", 40, 25, 130),
])
def test_consultation_modes(modules, mode, kind, value, percentage, expected):
    settings = doctor(payment_type=kind, payment_value=value, hybrid_percentage_value=percentage,
                      payment_mode="individual")
    settings.update(consultation_compensation_mode=mode, consultation_payment_type=kind,
                    consultation_payment_value=value, consultation_hybrid_percentage_value=percentage)
    assert modules.salary.SalaryService(None)._calculate_consultations_salary(settings, 200, 2) == expected


@pytest.mark.parametrize("kind,value,expected", [("fixed", 50, 50), ("percentage", 20, 60)])
def test_individual_component_actual_received_not_gross(modules, kind, value, expected):
    settings = doctor(payment_type="fixed", payment_value=999, payment_mode="individual")
    settings["services"] = [dict(service_id="service", commission_type=kind, commission_value=value)]
    component = dict(service_id="service", doctor_id="doctor", price=1000, quantity=3,
                     paid=True, paid_amount=300, payment_date="2026-10-05",
                     sessions=[dict(completed=True, date="2026-10-06")])
    row = dict(is_complex=True, components=[component], discount=50)
    item = report(modules, settings, [plan(row, assigned_doctor_id="other")])["salary_data"][0]
    assert item["treatment_plans_revenue"] == 300
    assert item["treatment_plans_salary"] == expected


def test_no_fixed_accrual_from_paid_or_plan_completed_status(modules):
    row = dict(service_id="service", quantity=5, paid_amount=300, payment_date="2026-10-05")
    result = report(modules, doctor(payment_type="fixed", payment_value=100),
                    [plan(row, execution_status="completed")])
    assert result["salary_data"][0]["calculated_salary"] == 0
    assert "service_completion_unavailable" in {entry["code"] for entry in result["accounting_blockers"]}


def test_missing_receipt_date_does_not_use_plan_created_or_paid_date(modules):
    row = dict(service_id="service", price=1000, paid_amount=300)
    result = report(modules, doctor(payment_type="percentage", payment_value=20),
                    [plan(row, payment_date=datetime(2026, 10, 5), created_at=datetime(2026, 10, 1))])
    assert result["salary_data"][0]["calculated_salary"] == 0
    assert "receipt_period_unavailable" in {entry["code"] for entry in result["accounting_blockers"]}


def test_appointment_price_and_deposit_are_not_consultation_receipts(modules):
    settings = doctor(payment_type="hybrid", payment_value=50, hybrid_percentage_value=20)
    settings["consultation_compensation_mode"] = "inherit"
    appointments = [dict(id="appointment", doctor_id="doctor", appointment_date="2026-10-06",
                         status="completed", price=1000, deposit=500),
                    dict(id="pending", doctor_id="doctor", appointment_date="2026-10-07",
                         status="scheduled", price=1000)]
    result = report(modules, settings, appointments=appointments)
    item = result["salary_data"][0]
    assert item["appointments_revenue"] == 0
    assert item["consultations_salary"] == 50
    assert item["completed_appointments"] == 1
    assert "consultation_receipts_unavailable" in {entry["code"] for entry in result["accounting_blockers"]}


def test_creation_requires_explicit_consultation_mode(modules):
    with pytest.raises(ValueError):
        modules.models.DoctorCreate(full_name="Doctor")
    for mode in ("none", "inherit"):
        assert modules.models.DoctorCreate(full_name="Doctor", consultation_compensation_mode=mode)
    with pytest.raises(ValueError):
        modules.models.DoctorCreate(full_name="Doctor", consultation_compensation_mode="separate")


@pytest.mark.parametrize("settings", [
    {"currency": "USD"}, {"consultation_currency": "RUB"},
    {"payment_value": -1}, {"payment_type": "percentage", "payment_value": 101},
    {"hybrid_percentage_value": 101}, {"consultation_payment_value": -1},
    {"consultation_payment_type": "percentage", "consultation_payment_value": 101},
    {"consultation_hybrid_percentage_value": -1}, {"payment_value": float("nan")},
    {"services": [dict(service_id="service", commission_type="fixed", commission_value=-1)]},
    {"services": [dict(service_id="service", commission_type="percentage", commission_value=101)]},
    {"services": [dict(service_id="service", commission_currency="USD")]},
])
def test_write_validation(modules, settings):
    for model, required in ((modules.models.DoctorCreate, dict(full_name="Doctor", consultation_compensation_mode="none")),
                            (modules.models.DoctorUpdate, {})):
        with pytest.raises(ValueError):
            model(**required, **settings)


def test_legacy_read_does_not_invent_mode_or_convert_currency(modules):
    legacy = modules.models.Doctor(full_name="Legacy", currency="USD", hybrid_fixed_amount=100)
    assert legacy.currency == "USD"
    assert legacy.consultation_compensation_mode is None
    assert modules.models.DoctorUpdate(phone=None).model_dump(exclude_unset=True) == {"phone": None}
    assert modules.salary.SalaryService(None)._calculate_consultations_salary(legacy.model_dump(), 200, 2) == 0


def test_partial_update_validates_effective_scheme_before_write(modules):
    stored = doctor(payment_type="percentage", payment_value=30)
    database = memory_db()
    database.doctors.find_one = AsyncMock(return_value=stored)
    database.doctors.update_one = AsyncMock()
    with pytest.raises(Exception) as error:
        asyncio.run(modules.doctors.DoctorService(database).update_doctor(
            "doctor", modules.models.DoctorUpdate(payment_value=200)))
    assert getattr(error.value, "status_code", None) == 422
    database.doctors.update_one.assert_not_called()


def test_non_kzt_legacy_report_is_blocked_not_converted(modules):
    result = report(modules, doctor(payment_type="fixed", payment_value=50, currency="USD"))
    assert result["salary_data"][0]["calculated_salary"] == 0
    assert result["salary_data"][0]["currency"] == "USD"
    assert "legacy_non_kzt_compensation" in {entry["code"] for entry in result["accounting_blockers"]}


@pytest.mark.parametrize("value", [0, 100])
def test_percentage_boundaries_and_large_fixed_values(modules, value):
    assert modules.models.DoctorCreate(full_name="Doctor", consultation_compensation_mode="none",
                                       payment_value=value, hybrid_percentage_value=value)
    assert modules.models.DoctorCreate(full_name="Doctor", consultation_compensation_mode="separate",
                                       payment_type="fixed", payment_value=10000,
                                       consultation_payment_type="fixed", consultation_payment_value=10000)


def test_inherit_ignores_separate_tariff_even_in_individual_mode(modules):
    settings = doctor(payment_mode="individual", payment_type="hybrid", payment_value=40,
                      hybrid_percentage_value=25, consultation_payment_type="fixed", consultation_payment_value=999)
    settings["consultation_compensation_mode"] = "inherit"
    assert modules.salary.SalaryService(None)._calculate_consultations_salary(settings, 200, 2) == 130


def test_explicit_general_mode_survives_create_and_update(modules):
    services = [dict(service_id="service", commission_type="fixed", commission_value=100)]
    database = memory_db()
    database.doctors.insert_one = AsyncMock()
    database.doctors.find_one = AsyncMock(return_value=doctor(payment_mode="general", payment_type="fixed", payment_value=50))
    database.doctors.update_one = AsyncMock(return_value=SimpleNamespace(matched_count=1))
    service = modules.doctors.DoctorService(database)
    created = asyncio.run(service.create_doctor(modules.models.DoctorCreate(
        full_name="Doctor", consultation_compensation_mode="none", payment_mode="general", services=services)))
    assert created.payment_mode == "general"
    asyncio.run(service.update_doctor("doctor", modules.models.DoctorUpdate(payment_mode="general", services=services)))
    assert database.doctors.update_one.call_args.args[1]["$set"]["payment_mode"] == "general"


def test_legacy_personal_update_does_not_touch_settings(modules):
    stored = doctor(currency="USD")
    stored.pop("consultation_compensation_mode")
    database = memory_db()
    database.doctors.find_one = AsyncMock(return_value=stored)
    database.doctors.update_one = AsyncMock(return_value=SimpleNamespace(matched_count=1))
    result = asyncio.run(modules.doctors.DoctorService(database).update_doctor(
        "doctor", modules.models.DoctorUpdate(full_name="New Name")))
    assert result.currency == "USD"
    assert result.consultation_compensation_mode is None
    assert set(database.doctors.update_one.call_args.args[1]["$set"]) == {"full_name", "updated_at"}


def test_omitted_mode_on_legacy_settings_update_is_rejected(modules):
    stored = doctor(payment_type="fixed", payment_value=50)
    stored.pop("consultation_compensation_mode")
    database = memory_db()
    database.doctors.find_one = AsyncMock(return_value=stored)
    database.doctors.update_one = AsyncMock()
    with pytest.raises(Exception) as error:
        asyncio.run(modules.doctors.DoctorService(database).update_doctor(
            "doctor", modules.models.DoctorUpdate(payment_value=60)))
    assert error.value.status_code == 422
    database.doctors.update_one.assert_not_called()


def test_session_payment_status_without_received_amount_is_not_list_price(modules):
    row = dict(service_id="service", payment_type="per_session", price_per_unit=1000,
               sessions=[dict(completed=True, date="2026-10-06", paid=True, paid_at="2026-10-06")])
    result = report(modules, doctor(payment_type="hybrid", payment_value=50, hybrid_percentage_value=20), [plan(row)])
    assert result["salary_data"][0]["calculated_salary"] == 50
    assert "actual_receipt_amount_unavailable" in {entry["code"] for entry in result["accounting_blockers"]}


def test_explicit_session_receipts_include_partial_uncompleted_units(modules):
    row = dict(service_id="service", payment_type="per_session", price_per_unit=1000,
               sessions=[dict(completed=False, date="2026-10-06", paid_amount=250, paid_at="2026-10-06"),
                         dict(completed=True, date="2026-10-07", paid_amount=100, paid_at="2026-09-07")])
    result = report(modules, doctor(payment_type="hybrid", payment_value=50, hybrid_percentage_value=20), [plan(row)])
    assert result["salary_data"][0]["treatment_plans_revenue"] == 250
    assert result["salary_data"][0]["calculated_salary"] == 100


def test_counter_only_completions_are_not_assigned_to_created_month(modules):
    row = dict(service_id="service", quantity_completed=3, quantity_total=5)
    result = report(modules, doctor(payment_type="fixed", payment_value=50), [plan(row)])
    assert result["salary_data"][0]["calculated_salary"] == 0
    assert "completion_period_unavailable" in {entry["code"] for entry in result["accounting_blockers"]}


def test_individual_ordinary_service_fixed_and_percentage(modules):
    for kind, value, expected in (("fixed", 50, 100), ("percentage", 20, 60)):
        settings = doctor(payment_mode="individual")
        settings["services"] = [dict(service_id="service", commission_type=kind, commission_value=value)]
        row = dict(service_id="service", price=1000, quantity=10, discount=50,
                   paid_amount=300, payment_date="2026-10-06",
                   sessions=[dict(completed=True, date="2026-10-07"), dict(completed=True, date="2026-10-08")])
        assert report(modules, settings, [plan(row)])["salary_data"][0]["calculated_salary"] == expected


def test_legacy_alias_is_not_substituted(modules):
    settings = doctor(payment_type="hybrid", payment_value=0, hybrid_fixed_amount=100, hybrid_percentage_value=20)
    result = report(modules, settings)
    assert result["salary_data"][0]["calculated_salary"] == 0
    assert "legacy_hybrid_tariff_ambiguous" in {entry["code"] for entry in result["accounting_blockers"]}


def test_incomplete_report_endpoint_fails_closed_for_legacy_ui(modules, monkeypatch):
    auth = ModuleType("routers.auth")
    auth.get_current_active_user = lambda: None
    auth.require_role = lambda roles: auth.get_current_active_user
    monkeypatch.setitem(sys.modules, "routers.auth", auth)
    routes = importlib.import_module("routers.doctors")
    service = SimpleNamespace(get_doctor_salary_report=AsyncMock(return_value={
        "compensation_complete": False, "accounting_blockers": [{"code": "consultation_receipts_unavailable"}]}))
    with pytest.raises(Exception) as error:
        asyncio.run(routes.get_doctor_salary_report("2026-10-01", "2026-10-31", None, service))
    assert error.value.status_code == 409
    assert error.value.detail["accounting_blockers"][0]["code"] == "consultation_receipts_unavailable"


def test_schedule_read_preserves_compensation_contract(modules):
    fields = dict(payment_type="hybrid", payment_value=50, hybrid_percentage_value=25,
                  consultation_compensation_mode="inherit", consultation_hybrid_percentage_value=10)
    model = modules.models.DoctorWithSchedule(
        id="doctor", full_name="Doctor", phone=None, calendar_color="#123456", is_active=True,
        user_id=None, created_at=datetime(2026, 10, 1), updated_at=datetime(2026, 10, 1), **fields)
    assert all(model.model_dump()[key] == value for key, value in fields.items())


def test_legacy_plan_receipt_without_service_allocation_is_blocked(modules):
    row = dict(service_id="service", price=1000, quantity=5)
    result = report(modules, doctor(payment_type="percentage", payment_value=20), [plan(row)])
    assert result["salary_data"][0]["calculated_salary"] == 0
    assert "actual_receipt_amount_unavailable" in {entry["code"] for entry in result["accounting_blockers"]}


def test_completed_appointment_with_unknown_date_is_blocked(modules):
    settings = doctor(payment_type="fixed", payment_value=50)
    settings["consultation_compensation_mode"] = "inherit"
    result = report(modules, settings, appointments=[dict(id="appointment", doctor_id="doctor", status="completed")])
    assert result["salary_data"][0]["calculated_salary"] == 0
    assert "completion_period_unavailable" in {entry["code"] for entry in result["accounting_blockers"]}


def test_unassigned_complex_component_is_not_paid_to_multiple_eligible_doctors(modules):
    row = dict(is_complex=True, components=[dict(service_id="service", paid_amount=300,
                payment_date="2026-10-05", sessions=[dict(completed=True, date="2026-10-06")])])
    result = report(modules, doctor(payment_type="fixed", payment_value=50), [plan(row, assigned_doctor_id="other")])
    assert result["salary_data"][0]["calculated_salary"] == 0


def test_legacy_individual_services_without_tariffs_are_blocked(modules):
    result = report(modules, doctor(payment_mode="individual"),
                    [plan(dict(service_id="service", paid_amount=300, payment_date="2026-10-05"))])
    assert "invalid_compensation_settings" in {entry["code"] for entry in result["accounting_blockers"]}


def test_legacy_unknown_service_payment_mode_is_blocked(modules):
    result = report(modules, doctor(payment_mode="unknown"),
                    [plan(dict(service_id="service", paid_amount=300, payment_date="2026-10-05"))])
    assert "invalid_compensation_settings" in {entry["code"] for entry in result["accounting_blockers"]}


def test_complete_report_endpoint_preserves_success_response(modules, monkeypatch):
    auth = ModuleType("routers.auth")
    auth.get_current_active_user = lambda: None
    auth.require_role = lambda roles: auth.get_current_active_user
    monkeypatch.setitem(sys.modules, "routers.auth", auth)
    routes = importlib.import_module("routers.doctors")
    payload = dict(compensation_complete=True, accounting_blockers=[], salary_data=[], summary={})
    service = SimpleNamespace(get_doctor_salary_report=AsyncMock(return_value=payload))
    assert asyncio.run(routes.get_doctor_salary_report("2026-10-01", "2026-10-31", None, service)) == payload


@pytest.mark.parametrize("per_session", [False, True])
@pytest.mark.parametrize("deposited", [0, 200, 300])
@pytest.mark.parametrize("kind,expected_fixed", [("percentage", 0), ("hybrid", 50)])
@pytest.mark.parametrize("completed", [False, True])
def test_allocated_deposit_requires_completed_service(modules, per_session, deposited, kind, expected_fixed, completed):
    settings = doctor(payment_type=kind, payment_value=20 if kind == "percentage" else 50,
                      hybrid_percentage_value=20)
    payment = dict(paid_amount=300, paid_from_deposit=deposited, cash_amount=300 - deposited, payment_date="2026-10-05")
    row = dict(service_id="service", sessions=[dict(completed=completed, date="2026-10-06")], **payment)
    if per_session:
        row.update(payment_type="per_session", sessions=[dict(completed=completed, date="2026-10-06", **payment)])
    item = report(modules, settings, [plan(row, deposit_amount=9999)])["salary_data"][0]
    revenue = 300 if completed else 300 - deposited
    assert item["treatment_plans_revenue"] == revenue
    assert item["treatment_plans_salary"] == (expected_fixed if completed else 0) + revenue * 0.2


def test_actual_modal_http_persist_readback_contract(modules, monkeypatch, tmp_path):
    """Real React modal payloads, real HTTP models, in-memory storage only."""
    import json
    import os
    import subprocess
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    frontend = Path(__file__).resolve().parents[3].with_name("crm-doctor-compensation-frontend") / "frontend"
    assert (frontend / "tests/doctorCompensation.test.mjs").exists(), "Frontend checkout is required for UI contract verification"
    payload_path = tmp_path / "payloads.json"
    readback_path = tmp_path / "readback.json"

    def run_ui(variable, path):
        result = subprocess.run(
            ["node", "--test", "--test-name-pattern=cross-stack modal", "tests/doctorCompensation.test.mjs"],
            cwd=frontend, env={**os.environ, variable: str(path)}, capture_output=True, text=True,
            encoding="utf-8", timeout=60)
        assert result.returncode == 0, result.stdout[-6000:] + result.stderr[-2000:]

    run_ui("DOCTOR_CONTRACT_PAYLOADS", payload_path)
    cases = json.loads(payload_path.read_text(encoding="utf-8"))
    assert len(cases) == 54
    auth = ModuleType("routers.auth")
    auth.get_current_active_user = lambda: SimpleNamespace(id="mock-user")
    auth.require_role = lambda roles: auth.get_current_active_user
    monkeypatch.setitem(sys.modules, "routers.auth", auth)
    routes = importlib.import_module("routers.doctors")
    database, records = persistence_db()
    service = modules.doctors.DoctorService(database)
    app = FastAPI()
    app.include_router(routes.doctors_router, prefix="/api")
    app.dependency_overrides[routes.get_doctor_service] = lambda: service
    # Override authentication only, including dependencies captured by earlier imports.
    for route in routes.doctors_router.routes:
        for dependency in route.dependant.dependencies:
            if dependency.name == "current_user":
                app.dependency_overrides[dependency.call] = auth.get_current_active_user
    readbacks = []
    with TestClient(app) as client:
        for case in cases:
            created = client.post("/api/doctors", json=case["created"])
            assert created.status_code == 200, created.text
            doctor_id = created.json()["id"]
            for phase in ("created", "edited"):
                expected = case[phase]
                response = created if phase == "created" else client.put(f"/api/doctors/{doctor_id}", json=expected)
                assert response.status_code == 200, response.text
                for key, value in expected.items():
                    assert response.json()[key] == value, key
                    assert records[doctor_id][key] == value, key
                single = client.get(f"/api/doctors/{doctor_id}")
                listed = client.get("/api/doctors")
                assert single.status_code == listed.status_code == 200
                listed_doctor = next(row for row in listed.json() if row["id"] == doctor_id)
                for key, value in expected.items():
                    assert single.json()[key] == listed_doctor[key] == value, key
                readbacks.append(dict(expected=expected, actual=single.json()))
    readback_path.write_text(json.dumps(readbacks), encoding="utf-8")
    run_ui("DOCTOR_CONTRACT_READBACK", readback_path)


def test_unallocated_appointment_and_plan_deposit_never_earns_percentage(modules):
    settings = doctor(payment_type="percentage", payment_value=20)
    row = dict(service_id="service", sessions=[dict(completed=False, date="2026-10-06")])
    appointment = dict(id="visit", doctor_id="doctor", status="no_show", deposit_amount=9000,
                       appointment_date="2026-10-05")
    item = report(modules, settings, [plan(row, deposit_amount=9000, paid_amount=0,
                                         payment_status="unpaid")], [appointment])["salary_data"][0]
    assert item["total_revenue"] == 0
    assert item["calculated_salary"] == 0


@pytest.mark.parametrize("status", ["no_show", "cancelled", "in_progress"])
def test_unallocated_or_uncompleted_deposit_is_not_doctor_income(modules, status):
    settings = doctor(payment_type="percentage", payment_value=20)
    row = dict(service_id="service", paid_amount=300, paid_from_deposit=300,
               payment_date="2026-10-05", sessions=[dict(completed=False, date="2026-10-06")])
    result = report(modules, settings, [plan(row, deposit_amount=900, execution_status=status)],
                    [dict(doctor_id="doctor", status=status, deposit_amount=900, appointment_date="2026-10-05")])
    assert result["salary_data"][0]["total_revenue"] == 0
    assert result["salary_data"][0]["calculated_salary"] == 0


def test_lab_analysis_revenue_never_enters_doctor_row(modules):
    database = memory_db(doctor(payment_type="percentage", payment_value=20))
    lab = SimpleNamespace(find=AsyncMock(), aggregate=AsyncMock())
    database.lab_analyses = lab
    database.patient_analyses = lab
    result = asyncio.run(modules.salary.SalaryService(database).get_doctor_salary_report("2026-10-01", "2026-10-31"))
    assert result["salary_data"][0]["total_revenue"] == 0
    assert result["salary_data"][0]["calculated_salary"] == 0
    lab.find.assert_not_called()
    lab.aggregate.assert_not_called()


@pytest.mark.parametrize("role,expected_status", [
    ("super_admin", 200),
    ("admin", 200),
    ("doctor", 200),
    ("marketer", 200),
    ("administrator", 200),
    ("patient", 403),
])
def test_salary_report_employee_role_authorization(modules, monkeypatch, role, expected_status):
    """Exercise the real FastAPI role dependency with no database access."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from models.auth import UserInDB, UserRole

    # Earlier tests cache routers with stubbed auth; load fresh production modules.
    root = Path(__file__).resolve().parents[2]
    loaded = {}
    for name in ("auth", "doctors"):
        spec = importlib.util.spec_from_file_location(f"routers.{name}", root / "routers" / f"{name}.py")
        module = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, f"routers.{name}", module)
        spec.loader.exec_module(module)
        loaded[name] = module
    auth, routes = loaded["auth"], loaded["doctors"]
    user = UserInDB(full_name="Employee", role=UserRole(role), hashed_password="unused")
    payload = dict(compensation_complete=True, accounting_blockers=[], salary_data=[], summary={})
    service = SimpleNamespace(get_doctor_salary_report=AsyncMock(return_value=payload))
    app = FastAPI()
    app.include_router(routes.doctors_router, prefix="/api")
    # Keep get_current_active_user and require_role in the dependency graph.
    app.dependency_overrides[auth.get_current_user] = lambda: user
    app.dependency_overrides[routes.get_salary_service] = lambda: service

    with TestClient(app) as client:
        response = client.get("/api/doctors/salary-report", params={
            "date_from": "2026-10-01", "date_to": "2026-10-31"})
    assert response.status_code == expected_status, response.text
    if expected_status == 200:
        assert response.json() == payload
        service.get_doctor_salary_report.assert_awaited_once_with("2026-10-01", "2026-10-31")
    else:
        assert response.json() == {"detail": "Not enough permissions"}
        service.get_doctor_salary_report.assert_not_awaited()
