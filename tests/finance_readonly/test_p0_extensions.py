"""P0: payroll idle-incomplete, amounts due, finance breakdown."""
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))
UTC = timezone.utc

from reporting.access import authorize
from reporting.amounts_due import SCOPE as AMOUNTS_DUE_SCOPE, AmountsDueSnapshot, calculate as due_calculate
from reporting.breakdown import SCOPE as BREAKDOWN_SCOPE, breakdown
from reporting.contract import ReportError, parse_period
from reporting.payroll import SCOPE as PAYROLL_SCOPE, PERMISSION, calculate as payroll_calculate
from reporting.service import CoverageEvidence, Snapshot
from reporting.access import AccessContext, AgentGrant, UserIdentity
from tools.finance_mcp.synthetic import (
    DEMO_COVERAGE, DEMO_CONTEXT, DEMO_EVENTS, PAYROLL_CONTEXT, PAYROLL_SNAPSHOT, load_synthetic_salary,
)

def scoped_context(scope_name):
    return AccessContext(
        UserIdentity("demo-owner", True, frozenset({"finance_view"}), frozenset({"demo-clinic"})),
        AgentGrant("demo-finance-agent", "demo-owner", "demo-clinic", True, frozenset({scope_name}),
                   datetime(2099, 1, 1, tzinfo=UTC)),
    )

PERIOD = {"date_from": "2026-10-19", "date_to": "2026-10-19"}


class PayrollIdleCoverageTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = load_synthetic_salary()

    async def test_idle_consultation_mode_gap_does_not_block_complete_doctors(self):
        complete = PAYROLL_SNAPSHOT.doctors[0]
        idle = dict(id="idle-doctor", clinic_id="demo-clinic", is_active=True, full_name="withheld",
                    consultation_compensation_mode=None, payment_type="fixed", payment_value=10,
                    currency="KZT", services=[])
        snapshot = replace(PAYROLL_SNAPSHOT, doctors=(complete, idle))
        binding = authorize(PAYROLL_CONTEXT, required_scope=PAYROLL_SCOPE, required_permission=PERMISSION)
        report = await payroll_calculate(snapshot, binding, parse_period(PERIOD))
        self.assertEqual(report.accrued_kzt, "250.00")
        self.assertEqual([row.doctor_id for row in report.doctors], ["synthetic-doctor"])
        self.assertIsNone(report.paid_kzt)
        self.assertIsNone(report.outstanding_kzt)

    async def test_dangerous_incomplete_doctor_still_refuses(self):
        complete = PAYROLL_SNAPSHOT.doctors[0]
        legacy = dict(id="legacy", clinic_id="demo-clinic", assigned_doctor_id="legacy-doctor", paid_amount=999)
        doctor = dict(id="legacy-doctor", clinic_id="demo-clinic", is_active=True, full_name="withheld",
                      consultation_compensation_mode="none", payment_type="fixed", payment_value=10,
                      currency="KZT", services=["catalog"])
        snapshot = replace(PAYROLL_SNAPSHOT, doctors=(complete, doctor), plans=(legacy,))
        binding = authorize(PAYROLL_CONTEXT, required_scope=PAYROLL_SCOPE, required_permission=PERMISSION)
        with self.assertRaises(ReportError) as error:
            await payroll_calculate(snapshot, binding, parse_period(PERIOD))
        self.assertEqual(error.exception.code, "INCOMPLETE_ACCOUNTING")


class BreakdownTests(unittest.TestCase):
    def test_breakdown_matches_summary_totals_by_day_and_kind(self):
        scope = authorize(scoped_context(BREAKDOWN_SCOPE), required_scope=BREAKDOWN_SCOPE)
        report = breakdown(Snapshot(DEMO_EVENTS, DEMO_COVERAGE), scope, parse_period(PERIOD))
        self.assertEqual(report.gross_recorded_receipts_kzt, "280.00")
        self.assertEqual(report.receipt_event_count, 4)
        self.assertEqual(sum(row.receipt_event_count for row in report.by_day), 4)
        self.assertEqual(sum(row.receipt_event_count for row in report.by_kind), 4)
        kinds = {row.kind: row.amount_kzt for row in report.by_kind}
        self.assertEqual(kinds["plan_advance"], "80.00")
        self.assertIn("service_receipt", kinds)


class AmountsDueTests(unittest.TestCase):
    def test_verified_ledger_plan_due_and_legacy_refused(self):
        scope = authorize(scoped_context(AMOUNTS_DUE_SCOPE), required_scope=AMOUNTS_DUE_SCOPE)
        when = datetime(2026, 10, 18, 18, tzinfo=UTC)
        plan = dict(
            id="plan-a", clinic_id="demo-clinic", paid_amount=100, total_cost=250,
            accounting_events=[dict(plan_id="plan-a", event_id="r1", kind="service_receipt",
                                    amount_kzt=100, currency="KZT", occurred_at=when,
                                    service_row_id="row")],
            services=[dict(service_row_id="row", total_price=250, paid_amount=100)],
        )
        report = due_calculate(AmountsDueSnapshot((plan,), DEMO_COVERAGE), scope, parse_period(PERIOD))
        self.assertEqual(report.due_kzt, "150.00")
        self.assertEqual(report.payable_kzt, "250.00")
        self.assertEqual(report.funded_kzt, "100.00")
        self.assertEqual(report.plans[0].plan_id, "plan-a")
        legacy = dict(id="legacy", clinic_id="demo-clinic", paid_amount=50, total_cost=100)
        with self.assertRaises(ReportError) as error:
            due_calculate(AmountsDueSnapshot((legacy,), DEMO_COVERAGE), scope, parse_period(PERIOD))
        self.assertEqual(error.exception.code, "INCOMPLETE_ACCOUNTING")


if __name__ == "__main__":
    unittest.main()
