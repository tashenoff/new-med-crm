"""Synthetic-only tests. Never import the CRM server/auth/database or read credentials."""
import ast
import asyncio
from contextlib import asynccontextmanager
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import importlib.abc
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

import httpx
from fastapi import FastAPI
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from pydantic import ValidationError

from reporting.access import authorize
from reporting.api import create_router
from reporting.contract import Envelope, FinanceReport, LIMITATIONS, MAX_EVENTS, MAX_RESPONSE_BYTES, PATH, ReportError, parse_period
from reporting.service import aggregate, Snapshot
from tools.finance_mcp.core import Adapter, FinanceApi, ALL_TOOLS, MARKER, TOOL_NAME, PAYROLL_TOOL
from tools.finance_mcp.synthetic import DEMO_CONTEXT, DEMO_COVERAGE, DEMO_EVENTS, SyntheticBackend, SyntheticHttpStand, event

PERIOD = {"date_from": "2026-10-19", "date_to": "2026-10-19"}
SCOPE = authorize(DEMO_CONTEXT)
SENTINEL = "PRIVATE_SYNTHETIC_SENTINEL"


class AggregateTests(unittest.TestCase):
    def report(self, events=DEMO_EVENTS, coverage=DEMO_COVERAGE, arguments=PERIOD):
        return aggregate(Snapshot(deepcopy(events), coverage), SCOPE, parse_period(arguments))

    def rejects(self, events=DEMO_EVENTS, coverage=DEMO_COVERAGE, code="INCOMPLETE_ACCOUNTING"):
        before = deepcopy(events)
        with self.assertRaises(ReportError) as error:
            self.report(events, coverage)
        self.assertEqual(error.exception.code, code)
        self.assertEqual(events, before)

    def test_decimal_aggregation_and_receipt_kinds(self):
        report = self.report()
        self.assertEqual(report.service_receipts_kzt, "200.00")
        self.assertEqual(report.plan_advances_kzt, "80.00")
        self.assertEqual(report.gross_recorded_receipts_kzt, "280.00")
        self.assertEqual(report.receipt_event_count, 4)
        self.assertEqual(report.date_basis, "occurred_at")
        self.assertEqual(report.limitations, LIMITATIONS)

    def test_bishkek_half_open_boundaries_and_explicit_offsets(self):
        period = parse_period(PERIOD)
        self.assertEqual(period.start_utc, "2026-10-18T18:00:00Z")
        self.assertEqual(period.end_utc_exclusive, "2026-10-19T18:00:00Z")
        rows = tuple(event(str(i), "service_receipt", "0.10", timestamp) for i, timestamp in enumerate([
            "2026-10-19T00:00:00+06:00", "2026-10-19T23:59:59.999999+06:00", "2026-10-20T00:00:00+06:00"]))
        self.assertEqual(self.report(rows).gross_recorded_receipts_kzt, "0.20")

    def test_prices_paid_amount_created_at_and_private_fields_are_not_inputs(self):
        rows = tuple({**row, "created_at": "1900-01-01", "appointment_date": "2099-01-01",
                      "price": 9999999, "paid_amount": 8888888, "patient_name": SENTINEL,
                      "phone": SENTINEL, "notes": SENTINEL} for row in DEMO_EVENTS)
        report = self.report(rows)
        self.assertEqual(report.gross_recorded_receipts_kzt, "280.00")
        self.assertNotIn(SENTINEL, report.model_dump_json())

    def test_foreign_clinic_never_contributes(self):
        row = event("foreign", "service_receipt", "900000.00", "2026-10-19T12:00:00Z", "foreign-clinic")
        self.assertEqual(self.report((row,)).gross_recorded_receipts_kzt, "0.00")

    def test_allocations_assignments_and_completions_do_not_double_count(self):
        rows = tuple(row for row in DEMO_EVENTS if row["kind"] in (
            "service_advance_allocation", "patient_deposit_received", "service_completion"))
        report = self.report(rows)
        self.assertEqual(report.gross_recorded_receipts_kzt, "0.00")
        self.assertEqual(report.receipt_event_count, 0)

    def test_identical_duplicate_event_is_counted_once(self):
        self.assertEqual(self.report(DEMO_EVENTS + (deepcopy(DEMO_EVENTS[0]),)).gross_recorded_receipts_kzt, "280.00")

    def test_conflicting_duplicate_event_is_refused(self):
        self.rejects(DEMO_EVENTS + ({**DEMO_EVENTS[0], "amount_kzt": "0.01"},), code="SOURCE_DATA_INVALID")

    def test_unscoped_legacy_data_never_assumed_to_be_the_clinic(self):
        self.rejects(({key: value for key, value in DEMO_EVENTS[0].items() if key != "clinic_id"},))

    def test_missing_coverage_or_unknown_tenant_boundary_is_refused(self):
        for change in ({"clinic_boundary_verified": False}, {"event_sources_complete": False},
                       {"unresolved_legacy_records": 1}, {"unresolved_legacy_records": False}):
            with self.subTest(change=change):
                self.rejects(coverage=replace(DEMO_COVERAGE, **change))
        with self.assertRaises(ReportError):
            aggregate(None, SCOPE, parse_period(PERIOD))

    def test_wrong_source_clinic_and_insufficient_period_coverage(self):
        self.rejects(coverage=replace(DEMO_COVERAGE, clinic_id="other"), code="FORBIDDEN")
        for change in ({"start_utc": datetime(2026, 10, 19, tzinfo=timezone.utc)},
                       {"end_utc_exclusive": datetime(2026, 10, 19, 17, tzinfo=timezone.utc)}):
            self.rejects(coverage=replace(DEMO_COVERAGE, **change))

    def test_empty_zero_requires_complete_coverage(self):
        self.assertEqual(self.report(()).gross_recorded_receipts_kzt, "0.00")
        self.rejects((), replace(DEMO_COVERAGE, event_sources_complete=False))

    def test_unknown_kind_refund_and_corrupt_receipt_fail_without_amounts(self):
        for kind in ("refund", "legacy_payment", "future_receipt", None):
            with self.subTest(kind=kind):
                self.rejects(({**DEMO_EVENTS[0], "kind": kind},))
        for field, value in (("currency", "USD"), ("event_id", ""), ("occurred_at", "2026-10-19")):
            self.rejects(({**DEMO_EVENTS[0], field: value},), code="SOURCE_DATA_INVALID")

    def test_invalid_amounts_are_not_clamped_or_rounded(self):
        for value in (True, None, "-0.01", "NaN", "Infinity", "1.001", "10000000000000", float("inf")):
            with self.subTest(value=value):
                self.rejects(({**DEMO_EVENTS[0], "amount_kzt": value},), code="SOURCE_DATA_INVALID")
        self.assertEqual(self.report(({**DEMO_EVENTS[0], "amount_kzt": Decimal("1.23")},)).gross_recorded_receipts_kzt, "1.23")

    def test_period_validation_leap_day_and_maximum(self):
        for arguments in ({"date_from": "2026-02-30", "date_to": "2026-03-01"},
                          {"date_from": "2026-10-20", "date_to": "2026-10-19"},
                          {"date_from": "2024-01-01", "date_to": "2025-01-01"},
                          {"date_from": "2026-10-19T00:00:00", "date_to": "2026-10-19"},
                          {"date_from": True, "date_to": "2026-10-19"}, {**PERIOD, "clinic_id": "other"}):
            with self.subTest(arguments=arguments), self.assertRaises(ReportError):
                parse_period(arguments)
        self.assertEqual(parse_period({"date_from": "2024-01-01", "date_to": "2024-12-31"}).date_to, "2024-12-31")
        self.assertEqual(parse_period({"date_from": "2024-02-29", "date_to": "2024-02-29"}).date_from, "2024-02-29")

    def test_source_bound_and_input_immutability(self):
        self.rejects((DEMO_EVENTS[0],) * (MAX_EVENTS + 1))
        before = deepcopy(DEMO_EVENTS)
        self.report()
        self.assertEqual(DEMO_EVENTS, before)


class HttpTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.backend = SyntheticBackend()
        self.client = httpx.AsyncClient(base_url="https://synthetic.invalid", transport=httpx.ASGITransport(app=self.backend.app))

    async def asyncTearDown(self):
        await self.client.aclose()

    async def read(self, params=PERIOD, **kwargs):
        return await self.client.get(PATH, params=params, **kwargs)

    async def test_real_route_returns_closed_aggregate(self):
        response = await self.read()
        self.assertEqual(response.status_code, 200)
        envelope = Envelope.model_validate_json(response.content)
        self.assertEqual(envelope.scope, SCOPE)
        self.assertEqual(envelope.report.gross_recorded_receipts_kzt, "280.00")

    async def test_anonymous_denied_before_reading_source(self):
        self.backend.context = None
        response = await self.read()
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.backend.source_reads, 0)

    async def test_current_permissions_revocation_membership_owner_and_expiry(self):
        self.assertEqual((await self.read()).status_code, 200)
        user, grant = DEMO_CONTEXT.user, DEMO_CONTEXT.grant
        denied = [replace(DEMO_CONTEXT, user=replace(user, active=False)),
                  replace(DEMO_CONTEXT, user=replace(user, permissions=frozenset())),
                  replace(DEMO_CONTEXT, user=replace(user, clinics=frozenset())),
                  replace(DEMO_CONTEXT, grant=replace(grant, active=False)),
                  replace(DEMO_CONTEXT, grant=replace(grant, owner_subject_id="other-owner")),
                  replace(DEMO_CONTEXT, grant=replace(grant, clinic_id="other-clinic")),
                  replace(DEMO_CONTEXT, grant=replace(grant, expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)))]
        for context in denied:
            with self.subTest(context=context):
                self.backend.context = context
                response = await self.read()
                self.assertEqual(response.status_code, 403)
                self.assertNotIn("gross_recorded_receipts_kzt", response.text)
        self.assertEqual(self.backend.source_reads, 1)
        self.assertEqual(self.backend.context_reads, 1+len(denied))

    async def test_wrong_or_extra_agent_scope_is_denied(self):
        for scopes in (frozenset(), frozenset({"finance.payroll.read"}), frozenset({"finance.summary.read", "payments.write"})):
            self.backend.context = replace(DEMO_CONTEXT, grant=replace(DEMO_CONTEXT.grant, scopes=scopes))
            self.assertEqual((await self.read()).status_code, 403)
        self.assertEqual(self.backend.source_reads, 0)

    async def test_model_cannot_override_identity_clinic_scope_or_timezone(self):
        for key in ("agent_id", "clinic_id", "subject_id", "scope", "url", "timezone", "patient_id", "metric"):
            with self.subTest(key=key):
                self.assertEqual((await self.read({**PERIOD, key: SENTINEL})).status_code, 422)
        self.assertEqual(self.backend.source_reads, 0)
        response = await self.read(headers={"X-Agent-ID": "other", "X-Clinic-ID": "other", "X-Scope": "payments.write"})
        self.assertEqual(response.json()["scope"], SCOPE.model_dump())

    async def test_duplicate_query_and_invalid_dates_are_refused(self):
        params = list(PERIOD.items()) + [("date_from", "2026-10-18")]
        self.assertEqual((await self.read(params)).status_code, 422)
        self.assertEqual((await self.read({"date_from": "2026-02-30", "date_to": "2026-03-01"})).status_code, 422)
        self.assertEqual(self.backend.source_reads, 0)

    async def test_mutation_methods_and_private_data_never_cross_api(self):
        rows = tuple({**row, "patient_name": SENTINEL, "medical_notes": SENTINEL} for row in DEMO_EVENTS)
        self.backend.snapshot = Snapshot(rows, DEMO_COVERAGE)
        before = deepcopy(self.backend.snapshot)
        for method in ("POST", "PUT", "PATCH", "DELETE"):
            self.assertEqual((await self.client.request(method, PATH, json={"amount": 999})).status_code, 405)
        response = await self.read()
        self.assertNotIn(SENTINEL, response.text)
        self.assertEqual(self.backend.snapshot, before)

    async def test_incomplete_accounting_returns_no_numbers_and_no_false_zero(self):
        self.backend.snapshot = Snapshot((), replace(DEMO_COVERAGE, event_sources_complete=False))
        response = await self.read()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json(), {"detail": {"code": "INCOMPLETE_ACCOUNTING", "complete": False}})

    async def test_unconfigured_production_router_is_closed_and_does_not_read_credentials(self):
        app = FastAPI()
        app.include_router(create_router())
        async with httpx.AsyncClient(base_url="https://synthetic.invalid", transport=httpx.ASGITransport(app=app)) as client:
            self.assertEqual((await client.get(PATH, params=PERIOD)).status_code, 401)
            response = await client.get(PATH, params=PERIOD, headers={"Authorization": "Bearer SYNTHETIC-NOT-A-CREDENTIAL"})
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["detail"]["code"], "REPORTING_UNCONFIGURED")

    async def test_unconfigured_source_stays_closed_even_after_context_is_supplied(self):
        async def resolve(request):
            return DEMO_CONTEXT
        app = FastAPI()
        app.include_router(create_router(resolve_context=resolve))
        async with httpx.AsyncClient(base_url="https://synthetic.invalid", transport=httpx.ASGITransport(app=app)) as client:
            self.assertEqual((await client.get(PATH, params=PERIOD)).status_code, 503)

    async def test_source_exception_does_not_expose_untrusted_details(self):
        async def resolve(request):
            return DEMO_CONTEXT
        async def failure(scope, period):
            raise RuntimeError(SENTINEL)
        app = FastAPI()
        app.include_router(create_router(resolve, failure))
        async with httpx.AsyncClient(base_url="https://synthetic.invalid", transport=httpx.ASGITransport(app=app)) as client:
            response = await client.get(PATH, params=PERIOD)
            self.assertEqual(response.status_code, 503)
            self.assertNotIn(SENTINEL, response.text)


class AdapterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.backend = SyntheticBackend()
        self.client = httpx.AsyncClient(base_url="https://synthetic.invalid", transport=httpx.ASGITransport(app=self.backend.app))
        self.adapter = Adapter(FinanceApi(self.client, SCOPE, synthetic_only=True))

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_adapter_reuses_server_report_strips_identity_and_does_not_write(self):
        before = deepcopy(self.backend.snapshot)
        result = await self.adapter.call(TOOL_NAME, PERIOD)
        self.assertEqual(result["gross_recorded_receipts_kzt"], "280.00")
        self.assertEqual(result["data_source"], "synthetic_demo")
        self.assertNotIn("scope", result)
        self.assertNotIn("agent_id", json.dumps(result))
        self.assertEqual(self.backend.snapshot, before)

    async def test_unknown_tools_and_identity_arguments_never_reach_http(self):
        for name, arguments in (("run_mongo", PERIOD), (TOOL_NAME, {**PERIOD, "agent_id": "other"})):
            with self.assertRaises(ReportError):
                await self.adapter.call(name, arguments)
        self.assertEqual(self.backend.context_reads, 0)

    async def test_revocation_after_success_is_checked_on_next_mcp_call(self):
        await self.adapter.call(TOOL_NAME, PERIOD)
        self.backend.context = replace(DEMO_CONTEXT, grant=replace(DEMO_CONTEXT.grant, active=False))
        with self.assertRaises(ReportError) as error:
            await self.adapter.call(TOOL_NAME, PERIOD)
        self.assertEqual(error.exception.code, "FORBIDDEN")
        self.assertEqual(self.backend.source_reads, 1)

    async def test_response_agent_subject_or_clinic_mismatch_is_refused(self):
        for field in ("agent_id", "subject_id", "clinic_id"):
            binding = SCOPE.model_copy(update={field: "other"})
            with self.subTest(field=field), self.assertRaises(ReportError) as error:
                await Adapter(FinanceApi(self.client, binding)).call(TOOL_NAME, PERIOD)
            self.assertEqual(error.exception.code, "FORBIDDEN")

    async def test_false_demo_marker_or_non_synthetic_payload_is_refused(self):
        self.backend.marker = None
        with self.assertRaises(ReportError):
            await self.adapter.call(TOOL_NAME, PERIOD)
        self.backend.marker = MARKER
        self.backend.snapshot = replace(self.backend.snapshot, coverage=replace(DEMO_COVERAGE, data_source="crm_api"))
        with self.assertRaises(ReportError):
            await self.adapter.call(TOOL_NAME, PERIOD)

    async def test_contract_rejects_extra_pii_invalid_totals_period_and_completeness(self):
        envelope = (await self.client.get(PATH, params=PERIOD)).json()
        def with_report(**changes):
            result = deepcopy(envelope)
            result["report"].update(changes)
            return result
        malformed = [with_report(patient_name=SENTINEL), with_report(gross_recorded_receipts_kzt="999.00"),
                     with_report(complete_within_declared_scope=1), with_report(receipt_event_count=True),
                     with_report(period={**envelope["report"]["period"], "date_from": "1900-01-01"})]
        for payload in malformed:
            with self.subTest(payload=payload):
                transport = httpx.MockTransport(lambda request: httpx.Response(200, json=payload, headers={"X-Finance-Synthetic": MARKER}))
                async with httpx.AsyncClient(base_url="https://synthetic.invalid", transport=transport) as client:
                    with self.assertRaises(ReportError):
                        await Adapter(FinanceApi(client, SCOPE, synthetic_only=True)).call(TOOL_NAME, PERIOD)

    async def test_redirect_duplicate_json_oversize_and_transport_errors_are_safe(self):
        responses = [httpx.Response(302, headers={"Location": "https://forbidden.invalid"}),
                     httpx.Response(200, content=b'{"report":{},"report":{}}', headers={"Content-Type": "application/json"}),
                     httpx.Response(200, content=b' '*(MAX_RESPONSE_BYTES+1), headers={"Content-Type": "application/json"}),
                     httpx.Response(500, text=SENTINEL)]
        for response in responses:
            async with httpx.AsyncClient(base_url="https://synthetic.invalid", transport=httpx.MockTransport(lambda request: response)) as client:
                with self.assertRaises(ReportError) as error:
                    await Adapter(FinanceApi(client, SCOPE)).call(TOOL_NAME, PERIOD)
                self.assertNotIn(SENTINEL, str(error.exception))
        def failure(request):
            raise httpx.ConnectError(SENTINEL)
        async with httpx.AsyncClient(base_url="https://synthetic.invalid", transport=httpx.MockTransport(failure)) as client:
            with self.assertRaises(ReportError) as error:
                await Adapter(FinanceApi(client, SCOPE)).call(TOOL_NAME, PERIOD)
            self.assertEqual(error.exception.code, "SOURCE_UNAVAILABLE")


class ProtocolTests(unittest.IsolatedAsyncioTestCase):
    @asynccontextmanager
    async def session(self, demo):
        params = StdioServerParameters(command=sys.executable,
            args=["-B", str(ROOT / "tools/finance_mcp/server.py")] + (["--demo"] if demo else []),
            env={"PYTHONUTF8": "1", "PYTHONDONTWRITEBYTECODE": "1", "PYTHONNOUSERSITE": "1"})
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session

    async def test_real_stdio_mcp_to_owned_synthetic_tcp_http_server(self):
        async with self.session(True) as session:
            tools = (await session.list_tools()).tools
            self.assertEqual([tool.name for tool in tools], list(ALL_TOOLS))
            self.assertFalse(tools[0].inputSchema["additionalProperties"])
            self.assertTrue(tools[0].model_dump()["annotations"]["readOnlyHint"])
            result = await session.call_tool(TOOL_NAME, PERIOD)
            self.assertFalse(result.isError)
            report = json.loads(result.content[0].text)
            self.assertEqual(report["gross_recorded_receipts_kzt"], "280.00")
            self.assertEqual(report["receipt_event_count"], 4)
            self.assertEqual(report["data_source"], "synthetic_demo")

    async def test_default_stdio_is_unconnected_and_extra_identity_is_not_accepted(self):
        async with self.session(False) as session:
            result = await session.call_tool(TOOL_NAME, PERIOD)
            self.assertTrue(result.isError)
            self.assertEqual(result.content[0].text, "REPORTING_UNCONFIGURED")
            denied = await session.call_tool(TOOL_NAME, {**PERIOD, "clinic_id": "other"})
            self.assertTrue(denied.isError)
            self.assertEqual(denied.content[0].text, "INVALID_ARGUMENTS")

    async def test_real_http_revocation_and_mutation_denials(self):
        stand = SyntheticHttpStand().start()
        try:
            async with httpx.AsyncClient(base_url=stand.origin, trust_env=False) as client:
                self.assertEqual((await client.get(PATH, params=PERIOD)).status_code, 200)
                stand.backend.context = None
                self.assertEqual((await client.get(PATH, params=PERIOD)).status_code, 401)
                for method in ("POST", "PUT", "PATCH", "DELETE"):
                    self.assertEqual((await client.request(method, PATH, json={})).status_code, 405)
        finally:
            stand.close()
        self.assertFalse(stand.thread.is_alive())


class IsolationTests(unittest.TestCase):
    def test_new_modules_have_no_db_imports_environment_reads_or_write_calls(self):
        paths = list((ROOT / "backend/reporting").glob("*.py")) + [ROOT / "tools/finance_mcp/core.py"]
        forbidden_modules = {"database", "motor", "pymongo", "routers", "dotenv"}
        forbidden_calls = {"insert_one", "insert_many", "update_one", "update_many", "delete_one", "delete_many", "bulk_write", "save"}
        for path in paths:
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    self.assertFalse({alias.name.split('.')[0] for alias in node.names} & forbidden_modules)
                    if any(alias.name == "os" for alias in node.names):
                        self.assertIn(path.name, {"grant_store.py", "grok_oauth.py"})
                if isinstance(node, ast.ImportFrom) and node.module:
                    if path.name == "oauth_server.py" and node.module == "routers.auth":
                        self.assertLessEqual({alias.name for alias in node.names},
                                             {"authenticate_user", "hydrate_access"})
                    else:
                        self.assertNotIn(node.module.split('.')[0], forbidden_modules)
                    if node.module == "services" or node.module.startswith("services."):
                        self.assertEqual(node.module, "services.salary_service")
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                    self.assertNotIn(node.func.attr, forbidden_calls)
                    self.assertNotIn(node.func.attr, {"getenv", "load_dotenv"})

    def test_new_router_exposes_one_get_and_is_registered_without_importing_server(self):
        router = create_router()
        self.assertEqual([(route.path, route.methods) for route in router.routes], [(PATH, {"GET"})])
        tree = ast.parse((ROOT / "backend/server.py").read_text(encoding="utf-8"))
        self.assertTrue(any(isinstance(node, ast.ImportFrom) and node.module == "reporting.activation" for node in tree.body))


if __name__ == "__main__":
    unittest.main(verbosity=2)
