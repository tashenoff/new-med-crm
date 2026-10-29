"""No DB/network: authorization, validation, immutable accrual and retry behavior."""
import asyncio
import importlib
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError

from test_accounting_ledger import modules, memory_db, component_db, course_db, receipt
from services.admin_bonus_service import AdminBonusService, attach_bonuses


def setting(kind="percentage", value=10, **extra):
    return dict(enabled=True, rate_type=kind, rate_value=value, revision=str(uuid4()), **extra)


def event(row="row", paid=300, **extra):
    return dict(kind="service_receipt", service_row_id=row, amount_kzt=paid,
                recorded_by="cashier-a", occurred_at=datetime(2026, 9, 1, tzinfo=timezone.utc), **extra)


@pytest.mark.parametrize("factory", [memory_db, component_db, course_db])
@pytest.mark.parametrize("kind,value,expected", [("fixed", 80, 80), ("percentage", 10, 30)])
def test_real_writer_stores_bonus_atomically_and_retry_is_identical(modules, monkeypatch, factory, kind, value, expected):
    db, saved, _ = factory()
    saved["services"].append(dict(service_row_id="second-row", service_id="second-service", total_price=1000))
    db.admin_bonus_settings.find_one = AsyncMock(return_value=setting(kind, value))
    monkeypatch.setattr(modules.plans.TreatmentPlanService, "sync_persisted_payment", AsyncMock())
    body = receipt(discount_amount_kzt=0)
    ledger = modules.ledger.AccountingLedgerService(db)
    if factory is course_db:
        pay = lambda actor: ledger.record_session("plan", "catalog", "session-a", dict(body, session_id="session-a"), actor)
    else:
        pay = lambda actor: ledger.record_ordinary_service("plan", "row", "component_receipt" if factory is component_db else "service_receipt",
            body, actor, component_id="component-a" if factory is component_db else None)
    first = asyncio.run(pay("cashier-a"))["event"]
    assert first["admin_bonus"]["recipient_user_id"] == "cashier-a"
    assert first["admin_bonus"]["amount_kzt"] == expected
    assert saved["accounting_events"][0] == first
    saved_before = deepcopy(saved)
    replay = asyncio.run(pay("cashier-b"))["event"]
    assert replay == first and saved == saved_before
    db.admin_bonus_settings.find_one.assert_awaited_once()
    assert first["compensation_amount_kzt"] == 60  # Existing doctor percentage is untouched.


def test_fixed_one_per_patient_position_first_payment_only():
    plan = dict(patient_id="patient", services=[dict(service_row_id="row"), dict(service_row_id="other-row")], accounting_events=[])
    tariff = setting("fixed", 70)
    first = event()
    attach_bonuses(plan, [first], tariff)
    plan["accounting_events"].append(first)
    second = dict(event(paid=200), recorded_by="cashier-b")
    attach_bonuses(plan, [second], tariff)
    assert first["admin_bonus"]["amount_kzt"] == 70
    assert second["admin_bonus"]["status"] == "first_payment_already_recorded"
    assert second["admin_bonus"]["amount_kzt"] == 0
    other = event(row="other-row")
    attach_bonuses(plan, [other], tariff)
    assert other["admin_bonus"]["amount_kzt"] == 70
    another_patient = event()
    attach_bonuses(dict(patient_id="another", services=plan["services"], accounting_events=[]), [another_patient], tariff)
    assert another_patient["admin_bonus"]["amount_kzt"] == 70


def test_no_default_no_backfill_and_no_late_fixed_on_previously_paid_row():
    old = event()
    plan = dict(patient_id="patient", services=[dict(service_row_id="row"), dict(service_row_id="other-row")], accounting_events=[old])
    unchanged = deepcopy(plan)
    assert attach_bonuses(plan, [], setting()) == [] and plan == unchanged
    new = event()
    attach_bonuses(plan, [new], None)
    assert "admin_bonus" not in new
    attach_bonuses(plan, [new], setting("fixed", 100))
    assert new["admin_bonus"]["amount_kzt"] == 0
    assert plan == unchanged


def test_snapshot_and_half_up_rounding_survive_rate_change():
    plan = dict(patient_id="patient", services=[dict(service_row_id="row"), dict(service_row_id="other-row")], accounting_events=[])
    old, new = event(paid=0.05), event(paid=0.05)
    tariff = setting(value=10)
    attach_bonuses(plan, [old], tariff)
    tariff["rate_value"] = 20
    attach_bonuses(plan, [new], tariff)
    assert old["admin_bonus"]["rate_value"] == 10
    assert old["admin_bonus"]["amount_kzt"] == 0.01
    assert new["admin_bonus"]["rate_value"] == 20


@pytest.mark.parametrize("kind", ["service_deposit_allocation", "component_advance_allocation", "session_deposit_allocation"])
def test_excluded_deposit_does_not_receive_bonus_metadata(kind):
    item = dict(event(), kind=kind, recorded_by="appointment:technical")
    attach_bonuses({}, [item], setting())
    assert "admin_bonus" not in item


def test_no_bonus_for_advance_or_completion():
    items = [dict(event(), kind=kind) for kind in ("plan_advance", "patient_deposit_received", "service_completion")]
    attach_bonuses({}, items, setting())
    assert all("admin_bonus" not in item for item in items)


def test_excluded_advance_append_does_not_read_bonus_settings(modules):
    db = Mock()
    item = dict(kind="service_advance_allocation", amount_kzt=100)
    result = asyncio.run(modules.ledger.AccountingLedgerService(db)._payment_append({}, {}, [item], "actor", "operation"))
    assert result == item and "admin_bonus" not in result
    db.admin_bonus_settings.find_one.assert_not_called()


@pytest.mark.parametrize("value", [-1, True, "NaN", "Infinity", "0.001", 101])
def test_invalid_percentage_setting_rejected_without_write(modules, value):
    routes = importlib.import_module("routers.admin_bonuses")
    db = Mock()
    db.admin_bonus_settings.find_one = AsyncMock(return_value=None)
    with pytest.raises((HTTPException, ValidationError)):
        body = routes.BonusSettingUpdate(enabled=True, rate_type="percentage", rate_value=value)
        asyncio.run(AdminBonusService(db).save_setting(body, "manager"))
    db.admin_bonus_settings.insert_one.assert_not_called()


def test_settings_history_cas_and_first_insert_conflict(modules):
    routes = importlib.import_module("routers.admin_bonuses")
    db = Mock()
    current = setting()
    db.admin_bonus_settings.find_one = AsyncMock(return_value=current)
    db.admin_bonus_settings.update_one = AsyncMock(return_value=SimpleNamespace(matched_count=1))
    body = routes.BonusSettingUpdate(enabled=True, rate_type="fixed", rate_value="75.00", expected_revision=current["revision"])
    result = asyncio.run(AdminBonusService(db).save_setting(body, "manager"))
    query, update = db.admin_bonus_settings.update_one.call_args.args
    assert query["revision"] == current["revision"]
    assert update["$push"]["history"]["rate_value"] == 75
    assert result["updated_by"] == "manager" and result["revision"] != current["revision"]
    db.admin_bonus_settings.update_one.return_value = SimpleNamespace(matched_count=0)
    with pytest.raises(HTTPException, match="409"):
        asyncio.run(AdminBonusService(db).save_setting(body, "manager"))
    db.admin_bonus_settings.find_one.return_value = None
    db.admin_bonus_settings.insert_one = AsyncMock(side_effect=DuplicateKeyError("duplicate"))
    with pytest.raises(HTTPException, match="409"):
        asyncio.run(AdminBonusService(db).save_setting(routes.BonusSettingUpdate(enabled=False), "manager"))


def test_http_access_setting_and_month_validation(modules, monkeypatch):
    routes = importlib.import_module("routers.admin_bonuses")
    app = FastAPI()
    app.include_router(routes.router)
    assert not any('refund' in route.path or 'cancel' in route.path for route in routes.router.routes)
    db = Mock()
    db.admin_bonus_settings.find_one = AsyncMock(return_value=None)
    db.admin_bonus_settings.insert_one = AsyncMock()
    actor = SimpleNamespace(id="server-manager", is_active=True, role="admin", permissions=[])
    app.dependency_overrides[routes.get_current_active_user] = lambda: actor
    app.dependency_overrides[routes.get_database] = lambda: db
    api = importlib.import_module("api_permissions")
    monkeypatch.setattr(api, "assert_single_clinic", AsyncMock())
    api.install_api_permissions(app)
    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://synthetic") as client:
            assert (await client.get("/api/admin-bonuses?month=2026-10")).status_code == 403
            assert (await client.get("/api/admin-bonuses/settings")).status_code == 403
            actor.permissions = ["finance_edit", "finance_view", "patients_view", "payroll_view"]
            assert (await client.put("/api/admin-bonuses/settings", json=dict(enabled=False))).status_code == 403
            actor.permissions = ["admin_bonus_manage"]
            default = (await client.get("/api/admin-bonuses/settings")).json()
            assert default == dict(enabled=False, rate_type=None, rate_value=None, revision=None)
            assert (await client.put("/api/admin-bonuses/settings", json=dict(enabled=True))).status_code == 422
            assert (await client.put("/api/admin-bonuses/settings", json=dict(enabled=True, rate_type="fixed", rate_value=50, user_id="forged"))).status_code == 422
            result = await client.put("/api/admin-bonuses/settings", json=dict(enabled=True, rate_type="fixed", rate_value=50))
            assert result.status_code == 200 and result.json()["updated_by"] == "server-manager"
            actor.permissions = ["admin_bonus_view"]
            assert (await client.get("/api/admin-bonuses?month=2026-10")).status_code == 403
            actor.permissions += ["patients_view"]
            for month in ("2026-13", "0000-01", "9999-12", "bad", "2026-1", "٢٠٢٦-10"):
                assert (await client.get("/api/admin-bonuses", params=dict(month=month))).status_code == 422
    asyncio.run(check())


def test_bonus_payload_does_not_escape_through_clinical_api(modules):
    api = importlib.import_module("api_permissions")
    value = dict(plan=dict(accounting_events=[dict(amount_kzt=100, compensation_amount_kzt=20, admin_bonus=dict(amount_kzt=10))]))
    assert api.redact_admin_bonus(value) == dict(plan=dict(accounting_events=[dict(amount_kzt=100, compensation_amount_kzt=20)]))
    assert "admin_bonus" in value["plan"]["accounting_events"][0]
    assert api.requirements("/api/admin-bonuses", "GET") == ("admin_bonus_view", "patients_view")
    assert api.requirements("/api/admin-bonuses/settings", "PUT") == ("admin_bonus_manage",)
    from models.staff import Permission, ROLE_PERMISSIONS
    assert Permission.ADMIN_BONUS_VIEW not in {p for preset in ROLE_PERMISSIONS.values() for p in preset}
    assert Permission.ADMIN_BONUS_MANAGE not in {p for preset in ROLE_PERMISSIONS.values() for p in preset}


def test_http_clinical_response_hides_bonus_without_explicit_view(modules, monkeypatch):
    api = importlib.import_module("api_permissions")
    app = FastAPI()
    @app.get("/api/treatment-plans/synthetic")
    async def read_plan():
        return dict(accounting_events=[dict(amount_kzt=100, admin_bonus=dict(amount_kzt=10))])
    actor = SimpleNamespace(is_active=True, permissions=["patients_view"])
    app.dependency_overrides[api.get_current_active_user] = lambda: actor
    app.dependency_overrides[api.get_database] = lambda: Mock()
    monkeypatch.setattr(api, "assert_single_clinic", AsyncMock())
    api.install_api_permissions(app)
    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://synthetic") as client:
            response = await client.get("/api/treatment-plans/synthetic")
            assert response.status_code == 200
            assert response.json() == dict(accounting_events=[dict(amount_kzt=100)])
            actor.permissions.append("admin_bonus_view")
            response = await client.get("/api/treatment-plans/synthetic")
            assert response.json()["accounting_events"][0]["admin_bonus"]["amount_kzt"] == 10
    asyncio.run(check())


def test_report_context_requires_explicit_zone_and_does_not_grant_ordinary_admin_access(modules, monkeypatch):
    routes = importlib.import_module("routers.admin_bonuses")
    app = FastAPI()
    app.include_router(routes.router)
    actor = SimpleNamespace(id="operator", is_active=True, role="admin", permissions=[])
    app.dependency_overrides[routes.get_current_active_user] = lambda: actor
    app.dependency_overrides[routes.get_database] = lambda: Mock()
    api = importlib.import_module("api_permissions")
    monkeypatch.setattr(api, "assert_single_clinic", AsyncMock())
    api.install_api_permissions(app)
    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://synthetic") as client:
            assert (await client.get("/api/admin-bonuses/context")).status_code == 403
            actor.permissions = ["admin_bonus_view", "patients_view"]
            monkeypatch.delenv("ADMIN_BONUS_TIMEZONE", raising=False)
            assert (await client.get("/api/admin-bonuses/context")).status_code == 503
            assert (await client.get("/api/admin-bonuses?month=2026-10")).status_code == 503
            monkeypatch.setenv("ADMIN_BONUS_TIMEZONE", "Asia/Almaty")
            result = await client.get("/api/admin-bonuses/context?timezone=UTC")
            assert result.status_code == 200
            assert result.json()["timezone"] == "Asia/Almaty"
    asyncio.run(check())
    from permission_policy import effective_permissions
    for role in ("admin", "super_admin"):
        permissions = effective_permissions(dict(role=role, permission_mode="legacy", custom_permissions=[]))
        assert "admin_bonus_view" not in permissions and "admin_bonus_manage" not in permissions


def test_missing_report_timezone_does_not_block_recording_real_payment(modules, monkeypatch):
    monkeypatch.delenv("ADMIN_BONUS_TIMEZONE", raising=False)
    db, saved, _ = memory_db()
    saved["services"].append(dict(service_row_id="second-row", service_id="second-service", total_price=1000))
    db.admin_bonus_settings.find_one = AsyncMock(return_value=setting())
    result = asyncio.run(modules.ledger.AccountingLedgerService(db, sync_payment=False).record_ordinary_service(
        "plan", "row", "service_receipt", receipt(), "cashier-a"))
    assert result["event"]["admin_bonus"]["amount_kzt"] == 30
    assert saved["paid_amount"] == 300


@pytest.mark.parametrize("kind,value", [("fixed", 100), ("percentage", 5)])
def test_quantity_of_one_plain_position_does_not_meet_source_threshold(kind, value):
    plan = dict(patient_id="patient", services=[dict(service_row_id="row", quantity=3)], accounting_events=[])
    payment = event()
    assert attach_bonuses(plan, [payment], setting(kind, value)) == [payment]
    assert "admin_bonus" not in payment


def test_eligibility_counts_identities_without_pricing_unpaid_siblings():
    from services.payment_completion_service import payment_positions, payable_targets
    rows = [dict(service_row_id="row", total_price=1000), dict(service_row_id="other", total_price=None)]
    assert len(list(payment_positions(rows))) == 2
    assert len(list(payable_targets(rows, {("row", None, None)}))) == 1
    payment = event(paid=300)
    attach_bonuses(dict(services=rows, accounting_events=[]), [payment], setting("percentage", 5))
    assert payment["admin_bonus"]["amount_kzt"] == 15
