"""Existing salary engine, synthetic doctors only; no application/DB startup."""
from contextlib import ExitStack
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

import httpx
from fastapi import FastAPI
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from reporting.access import authorize
from reporting.contract import ReportError, parse_period
from reporting.payroll import PATH, PERMISSION, SCOPE, PayrollEnvelope, calculate
from reporting.payroll_api import create_payroll_router
from tools.finance_mcp.core import Adapter, FinanceApi, PayrollApi, TOOL_NAME, PAYROLL_TOOL
from tools.finance_mcp.synthetic import (DEMO_CONTEXT, PAYROLL_CONTEXT, PAYROLL_SNAPSHOT,
    SyntheticBackend, load_synthetic_salary)

PERIOD = {"date_from": "2026-10-19", "date_to": "2026-10-19"}
BINDING = authorize(PAYROLL_CONTEXT, required_scope=SCOPE, required_permission=PERMISSION)


class PayrollTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        # Actual salary source; prevent any future accidental connection via its imports.
        import motor.motor_asyncio
        import pymongo
        cls.guards = ExitStack()
        for target in ("motor.motor_asyncio.AsyncIOMotorClient", "pymongo.MongoClient"):
            cls.guards.enter_context(patch(target, side_effect=AssertionError("Real DB forbidden")))
        cls.engine = load_synthetic_salary()

    @classmethod
    def tearDownClass(cls):
        cls.guards.close()

    async def test_existing_salary_formula_and_bishkek_half_open_period(self):
        before = deepcopy(PAYROLL_SNAPSHOT)
        with patch.object(self.engine.SalaryService, "_calculate_consultations_salary",
                autospec=True, side_effect=self.engine.SalaryService._calculate_consultations_salary) as engine:
            report = await calculate(PAYROLL_SNAPSHOT, BINDING, parse_period(PERIOD))
        self.assertEqual(engine.call_count, 1)
        self.assertEqual(report.accrued_kzt, "250.00")  # Two completions * existing fixed tariff 125.
        self.assertEqual(report.doctors[0].accrued_kzt, "250.00")
        self.assertEqual(report.period.start_utc, "2026-10-18T18:00:00Z")
        self.assertIsNone(report.paid_kzt)
        self.assertIsNone(report.outstanding_kzt)
        self.assertIn("unavailable", report.payout_status)
        self.assertNotIn("PRIVATE", report.model_dump_json())
        self.assertEqual(PAYROLL_SNAPSHOT, before)

    async def test_legacy_or_incomplete_accrual_is_refused_without_amounts(self):
        for change in ({"consultation_compensation_mode": None},
                       {"consultation_payment_type": "percentage", "consultation_payment_value": 30}):
            snapshot = replace(PAYROLL_SNAPSHOT, doctors=({**PAYROLL_SNAPSHOT.doctors[0], **change},))
            with self.assertRaises(ReportError) as error:
                await calculate(snapshot, BINDING, parse_period(PERIOD))
            self.assertEqual(error.exception.code, "INCOMPLETE_ACCOUNTING")

    async def test_legacy_plan_accounting_gap_is_not_a_zero_accrual(self):
        plan = dict(id="legacy", clinic_id="demo-clinic", assigned_doctor_id="synthetic-doctor", paid_amount=999)
        with self.assertRaises(ReportError) as error:
            await calculate(replace(PAYROLL_SNAPSHOT, plans=(plan,)), BINDING, parse_period(PERIOD))
        self.assertEqual(error.exception.code, "INCOMPLETE_ACCOUNTING")

    async def test_treatment_plan_accrual_reuses_verified_snapshot_and_refuses_corruption(self):
        from services.accounting_ledger_service import canonical_request, resolve_snapshot, compensation_amount
        doctor = {**PAYROLL_SNAPSHOT.doctors[0], "payment_type": "percentage", "payment_value": 30,
                  "payment_mode": "general", "consultation_compensation_mode": "none", "services": ["catalog"]}
        body = dict(operation_id=str(uuid4()), amount_kzt=100, discount_amount_kzt=0,
                    payment_source="cash", payment_method="cash")
        _, digest, _ = canonical_request("plan", "row", "service_receipt", body, None)
        snapshot = resolve_snapshot(doctor, "catalog")
        when = datetime(2026, 10, 18, 18, tzinfo=timezone.utc)
        event = dict(**body, event_id=str(uuid4()), kind="service_receipt", plan_id="plan", service_row_id="row",
            service_id="catalog", doctor_id="synthetic-doctor", currency="KZT", request_hash=digest,
            recorded_by="synthetic-owner", occurred_at=when, recorded_at=when,
            compensation_snapshot=snapshot, compensation_amount_kzt=compensation_amount(snapshot, "service_receipt", 100))
        plan = dict(id="plan", clinic_id="demo-clinic", assigned_doctor_id="synthetic-doctor",
            accounting_events=[event], services=[dict(service_row_id="row", service_id="catalog", total_price=100,
                                                     occurrence_ids=["occurrence"], paid_amount=100)])
        source = replace(PAYROLL_SNAPSHOT, doctors=(doctor,), plans=(plan,), appointments=())
        before = deepcopy(source)
        report = await calculate(source, BINDING, parse_period(PERIOD))
        self.assertEqual(report.accrued_kzt, "30.00")
        self.assertEqual(source, before)
        broken = deepcopy(plan)
        broken["accounting_events"][0]["compensation_amount_kzt"] = 999
        with self.assertRaises(ReportError) as error:
            await calculate(replace(source, plans=(broken,)), BINDING, parse_period(PERIOD))
        self.assertEqual(error.exception.code, "INCOMPLETE_ACCOUNTING")

    async def test_reports_are_not_cacheable_and_payroll_source_is_bounded(self):
        backend = SyntheticBackend()
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=backend.app), base_url="http://synthetic.invalid") as client:
            for path in (PATH, "/api/reporting/finance/summary"):
                self.assertEqual((await client.get(path, params=PERIOD)).headers.get("cache-control"), "no-store")
            backend.payroll_context = None
            self.assertEqual((await client.get(PATH, params=PERIOD)).headers.get("cache-control"), "no-store")
        oversized = {**PAYROLL_SNAPSHOT.doctors[0], "unused": [None] * 50_001}
        with self.assertRaises(ReportError):
            await calculate(replace(PAYROLL_SNAPSHOT, doctors=(oversized,)), BINDING, parse_period(PERIOD))

    async def test_foreign_records_excluded_missing_clinic_and_duplicate_doctor_refused(self):
        foreign = {**PAYROLL_SNAPSHOT.doctors[0], "id": "foreign", "clinic_id": "other"}
        report = await calculate(replace(PAYROLL_SNAPSHOT, doctors=PAYROLL_SNAPSHOT.doctors + (foreign,)), BINDING, parse_period(PERIOD))
        self.assertEqual([row.doctor_id for row in report.doctors], ["synthetic-doctor"])
        for rows in (({**foreign, "clinic_id": None},), PAYROLL_SNAPSHOT.doctors * 2):
            with self.assertRaises(ReportError):
                await calculate(replace(PAYROLL_SNAPSHOT, doctors=rows), BINDING, parse_period(PERIOD))

    async def test_coverage_must_prove_clinic_boundary_and_no_legacy_records(self):
        for coverage in (replace(PAYROLL_SNAPSHOT.coverage, clinic_boundary_verified=False),
                         replace(PAYROLL_SNAPSHOT.coverage, unresolved_legacy_records=1),
                         replace(PAYROLL_SNAPSHOT.coverage, clinic_id="foreign")):
            with self.assertRaises(ReportError):
                await calculate(replace(PAYROLL_SNAPSHOT, coverage=coverage), BINDING, parse_period(PERIOD))

    async def test_separate_scope_permission_owner_membership_expiry_every_call(self):
        backend = SyntheticBackend()
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=backend.app), base_url="http://synthetic.invalid") as client:
            self.assertEqual((await client.get(PATH, params=PERIOD)).status_code, 200)
            initial_reads = backend.source_reads
            invalid = [None, DEMO_CONTEXT,
                replace(PAYROLL_CONTEXT, user=replace(PAYROLL_CONTEXT.user, permissions=frozenset({"finance_view"}))),
                replace(PAYROLL_CONTEXT, user=replace(PAYROLL_CONTEXT.user, clinics=frozenset({"other"}))),
                replace(PAYROLL_CONTEXT, grant=replace(PAYROLL_CONTEXT.grant, owner_subject_id="other")),
                replace(PAYROLL_CONTEXT, grant=replace(PAYROLL_CONTEXT.grant, active=False)),
                replace(PAYROLL_CONTEXT, grant=replace(PAYROLL_CONTEXT.grant, scopes=frozenset({SCOPE, "payments.write"}))),
                replace(PAYROLL_CONTEXT, grant=replace(PAYROLL_CONTEXT.grant, expires_at=datetime(2000, 1, 1, tzinfo=timezone.utc)))]
            for context in invalid:
                backend.payroll_context = context
                response = await client.get(PATH, params=PERIOD)
                self.assertIn(response.status_code, (401, 403))
                self.assertNotIn("accrued_kzt", response.text)
            self.assertEqual(backend.source_reads, initial_reads)

    async def test_query_identity_and_write_methods_cannot_change_records(self):
        backend = SyntheticBackend()
        before = deepcopy(backend.payroll_snapshot)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=backend.app), base_url="http://synthetic.invalid") as client:
            for key in ("clinic_id", "agent_id", "doctor_id", "scope", "timezone"):
                self.assertEqual((await client.get(PATH, params={**PERIOD, key: "other"})).status_code, 422)
            for method in ("POST", "PUT", "PATCH", "DELETE"):
                self.assertEqual((await client.request(method, PATH, json={"salary": 999})).status_code, 405)
        self.assertEqual(before, backend.payroll_snapshot)

    async def test_default_route_remains_closed_even_with_bearer_looking_string(self):
        app = FastAPI()
        app.include_router(create_payroll_router())
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://synthetic.invalid") as client:
            self.assertEqual((await client.get(PATH, params=PERIOD)).status_code, 401)
            self.assertEqual((await client.get(PATH, params=PERIOD, headers={"Authorization": "Bearer synthetic-not-real"})).status_code, 503)

    async def test_payroll_adapter_strips_identity_and_revocation_is_immediate(self):
        backend = SyntheticBackend()
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=backend.app), base_url="http://synthetic.invalid") as client:
            adapter = Adapter(payroll_api=PayrollApi(client, BINDING, synthetic_only=True))
            report = await adapter.call(PAYROLL_TOOL, PERIOD)
            self.assertEqual(report["accrued_kzt"], "250.00")
            self.assertNotIn("scope", report)
            backend.payroll_context = None
            with self.assertRaises(ReportError) as error:
                await adapter.call(PAYROLL_TOOL, PERIOD)
            self.assertEqual(error.exception.code, "AUTH_REQUIRED")
            with self.assertRaises(ReportError):
                await adapter.call(PAYROLL_TOOL, {**PERIOD, "clinic_id": "other"})

    async def test_closed_payroll_contract_does_not_allow_payout_claims_or_pii(self):
        report = await calculate(PAYROLL_SNAPSHOT, BINDING, parse_period(PERIOD))
        envelope = PayrollEnvelope(scope=BINDING, report=report).model_dump(mode="json")
        for field, value in (("paid_kzt", "0.00"), ("outstanding_kzt", "250.00"),
                             ("accrual_complete", 1), ("patient_name", "PRIVATE"), ("accrued_kzt", "999.00")):
            bad = deepcopy(envelope)
            bad["report"][field] = value
            with self.assertRaises(ValueError):
                PayrollEnvelope.model_validate_json(json.dumps(bad))

    async def test_real_stdio_payroll_and_default_refusal(self):
        for demo in (True, False):
            params = StdioServerParameters(command=sys.executable,
                args=["-B", str(ROOT / "tools/finance_mcp/server.py")] + (["--demo"] if demo else []),
                env={"PYTHONUTF8": "1", "PYTHONDONTWRITEBYTECODE": "1", "PYTHONNOUSERSITE": "1"})
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    from tools.finance_mcp.core import ALL_TOOLS
                    self.assertEqual([tool.name for tool in (await session.list_tools()).tools], list(ALL_TOOLS))
                    result = await session.call_tool(PAYROLL_TOOL, PERIOD)
                    if demo:
                        self.assertFalse(result.isError)
                        report = json.loads(result.content[0].text)
                        self.assertEqual(report["accrued_kzt"], "250.00")
                        self.assertIsNone(report["paid_kzt"])
                        self.assertNotIn("PRIVATE", result.content[0].text)
                    else:
                        self.assertTrue(result.isError)
                        self.assertEqual(result.content[0].text, "REPORTING_UNCONFIGURED")


if __name__ == "__main__":
    unittest.main()
