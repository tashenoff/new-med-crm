"""Read-only reporting regressions with no external database."""
import asyncio
import importlib
from copy import deepcopy
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from services.service_report_amounts import service_report_amounts
from test_accounting_ledger import modules


def plan():
    return dict(id="plan", patient_id="patient", total_cost=20000, paid_amount=10000,
        services=[dict(service_name="A", total_price=10000, price_per_unit=10000, quantity_total=1,
                       payment_status="paid", paid_amount=10000),
                  dict(service_name="B", total_price=10000, price_per_unit=10000, quantity_total=1,
                       payment_status="unpaid", paid_amount=0)])


def test_explicit_service_payment_is_not_distributed_twice():
    assert service_report_amounts(plan()) == [(10000, 10000), (10000, 0)]


def test_legacy_remainder_only_distributed_to_unknown_rows():
    data = plan()
    data["services"][1].pop("paid_amount")
    assert service_report_amounts(data) == [(10000, 10000), (10000, 0)]
    data["paid_amount"] = 12000
    assert service_report_amounts(data) == [(10000, 10000), (10000, 2000)]


def test_legacy_aggregate_only_payment_conserves_cents():
    data = dict(paid_amount=0.01, services=[dict(total_price=1)] * 3)
    assert service_report_amounts(data) == [(1, 0.01), (1, 0), (1, 0)]
    data["paid_amount"] = 4
    assert service_report_amounts(data) == [(1, 1), (1, 1), (1, 1)]


def test_ledger_unallocated_deposit_is_not_a_service_payment():
    data = dict(paid_amount=2000, accounting_events=[dict(kind="plan_deposit")],
                services=[dict(total_price=10000, payment_status="unpaid")])
    assert service_report_amounts(data) == [(10000, 0)]


def test_two_thousand_deposit_allocated_to_service_counts_only_once():
    data = dict(paid_amount=2000, deposit_amount=2000, deposit_balance=0,
        accounting_events=[dict(kind="patient_deposit_received", amount_kzt=2000),
                           dict(kind="service_deposit_allocation", amount_kzt=2000)],
        services=[dict(total_price=10000, paid_amount=2000, payment_status="partially_paid")])
    assert service_report_amounts(data) == [(10000, 2000)]


@pytest.mark.parametrize("kind", ["course", "complex"])
def test_nested_partial_receipts_and_discount_are_counted_once(kind):
    row = dict(total_price=10000, discount_amount=1000)
    row["is_" + kind] = True
    row["sessions" if kind == "course" else "components"] = [
        dict(price=5000, paid_amount=2000), dict(price=5000, paid_amount=0)]
    data = dict(paid_amount=2000, services=[row], accounting_events=[dict(kind="receipt")])
    assert service_report_amounts(data) == [(9000, 2000)]
    row["paid_amount"] = 2000
    assert service_report_amounts(data) == [(9000, 2000)]


def test_fully_paid_discounted_legacy_row_uses_net_amount():
    assert service_report_amounts(dict(paid_amount=8000, services=[
        dict(total_price=10000, discount_amount=2000, payment_status="paid")])) == [(8000, 8000)]


def test_legacy_paid_course_and_session_price_fallback():
    row = dict(total_price=10000, price_per_unit=5000, is_course=True,
               payment_status="paid", sessions=[{}, {}])
    assert service_report_amounts(dict(services=[row])) == [(10000, 10000)]
    row.update(payment_status="partially_paid", sessions=[dict(paid=True), dict(paid=False)])
    assert service_report_amounts(dict(services=[row])) == [(10000, 5000)]


def test_summary_details_and_category_filter_use_same_allocations(modules, monkeypatch):
    routes = importlib.import_module("routers.services_router")
    data = plan()
    data["services"][0]["category"] = "Therapy"
    data["services"][1]["category"] = "Other"
    db = Mock()
    db.treatment_plans.find.return_value.to_list = AsyncMock(return_value=[data])
    db.patients.find_one = AsyncMock(return_value=dict(full_name="Test patient"))
    monkeypatch.setattr(routes, "db", db)
    summary = asyncio.run(routes.get_services_report(year=2026, month=10, categories=None, doctor_ids=None))
    assert summary["totals"]["total_paid"] == 10000
    assert summary["totals"]["total_outstanding"] == 10000
    query = db.treatment_plans.find.call_args.args[0]
    assert query["created_at"] == {"$gte": datetime(2026, 10, 1), "$lt": datetime(2026, 11, 1)}
    detail = asyncio.run(routes.get_service_detail_report("A", year=2026, month=10))
    assert detail["totals"]["total_paid"] == 10000
    assert detail["totals"]["total_expected"] == 10000
    filtered = asyncio.run(routes.get_services_report(year=2026, month=10, categories="Other", doctor_ids=None))
    assert filtered["totals"]["total_paid"] == 0
    assert filtered["totals"]["total_expected"] == 10000


@pytest.mark.parametrize("month,end", [(1, datetime(2026, 2, 1)), (12, datetime(2027, 1, 1))])
def test_month_boundaries_in_both_reports(modules, monkeypatch, month, end):
    routes = importlib.import_module("routers.services_router")
    db = Mock()
    db.treatment_plans.find.return_value.to_list = AsyncMock(return_value=[])
    monkeypatch.setattr(routes, "db", db)
    for call in (routes.get_services_report(year=2026, month=month),
                 routes.get_service_detail_report("A", year=2026, month=month)):
        asyncio.run(call)
        query = db.treatment_plans.find.call_args.args[0]
        assert query["created_at"] == {"$gte": datetime(2026, month, 1), "$lt": end}


def test_statistics_date_only_includes_whole_last_day():
    from services.statistics_service import StatisticsService
    db = Mock()
    db.treatment_plans.find.return_value.to_list = AsyncMock(return_value=[])
    asyncio.run(StatisticsService(db).get_treatment_plan_statistics("2026-10-01", "2026-10-31"))
    query = db.treatment_plans.find.call_args.args[0]["created_at"]
    assert query == {"$gte": datetime(2026, 10, 1), "$lt": datetime(2026, 11, 1)}
    assert query["$gte"] <= datetime(2026, 10, 31, 23, 59, 59, 999999) < query["$lt"]
    asyncio.run(StatisticsService(db).get_treatment_plan_statistics(date_to="2026-10-31T15:30:00"))
    assert db.treatment_plans.find.call_args.args[0]["created_at"] == {"$lte": datetime(2026, 10, 31, 15, 30)}
