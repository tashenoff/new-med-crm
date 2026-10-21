"""Real resolver/read adapter exercised only with projected in-memory records."""
from copy import deepcopy
from dataclasses import asdict, replace
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import io
import stat

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))
import httpx
from fastapi import FastAPI

from reporting.access import authorize
from reporting.configured import build_bound_routers
from reporting.contract import PATH, SCOPE, ReportError, parse_period
from reporting.grant_store import JsonGrantStore, decode_grants
from reporting.live_access import API_ORIGIN, PAPERCLIP_RUNTIME, AGENT_ID, DeploymentBinding, StoredGrant
from reporting.live_source import LiveReadAdapter, APPOINTMENTS, doctor_projection, plan_projection
from reporting.payroll import PATH as PAYROLL_PATH, SCOPE as PAYROLL_SCOPE, PERMISSION
from reporting.service import aggregate
from tools.finance_mcp.core import PAYROLL_TOOL, TOOL_NAME
from tools.finance_mcp.live_client import bound_adapter
from tools.finance_mcp.synthetic import load_synthetic_salary

PERIOD = {"date_from": "2026-10-19", "date_to": "2026-10-19"}
TOKEN = "mcr_" + "A" * 43  # Obviously synthetic; never persisted, issued or installed.
BINDING = DeploymentBinding("synthetic-clinic", "synthetic-owner", "synthetic-database", True)
FUTURE = datetime(2099, 1, 1, tzinfo=timezone.utc)


def grant(scope=SCOPE):
    return StoredGrant(sha256(TOKEN.encode()).hexdigest(), BINDING.owner_id, BINDING.clinic_id,
        AGENT_ID, API_ORIGIN, PAPERCLIP_RUNTIME, scope, True, FUTURE)


def projected(row, projection):
    # Fixture implements the inclusion projection, including nested array leaves.
    def select(value, paths):
        if [] in paths:
            return deepcopy(value)
        if isinstance(value, list):
            return [select(child, paths) for child in value]
        if not isinstance(value, dict):
            return deepcopy(value)
        return {key: select(child, [path[1:] for path in paths if path and path[0] == key])
                for key, child in value.items() if any(path and path[0] == key for path in paths)}
    return select(row, [key.split(".") for key, include in projection.items() if include])


def query_matches(row, query):
    if not query:
        return True
    if "$or" in query:
        return any(query_matches(row, child) for child in query["$or"])
    return all(row.get(key) == value for key, value in query.items())


class Collection:
    def __init__(self, rows):
        self.rows, self.reads = rows, []

    def find(self, query, projection, **options):
        self.reads.append((deepcopy(query), deepcopy(projection), options))
        records = [projected(row, projection) for row in self.rows if query_matches(row, query)]
        class Cursor:
            def max_time_ms(self, value):
                assert value == 2000
                return self
            def limit(self, value):
                self.bound = value
                return self
            async def to_list(self, value):
                assert value == self.bound
                return deepcopy(records[:value])
        return Cursor()


class Sessions:
    def __init__(self):
        self.calls, self.fail = [], False
    async def start_session(self, **options):
        self.calls.append(options)
        if self.fail:
            raise RuntimeError("Unsupported snapshot; PRIVATE DETAIL")
        class Session:
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                pass
        return Session()


class Store:
    def __init__(self):
        self.grants = (grant(), grant(PAYROLL_SCOPE))
        self.reads = 0
    def read(self):
        self.reads += 1
        return self.grants


def database():
    doctor = dict(id="doctor", is_active=True, full_name="PRIVATE NAME", phone="PRIVATE PHONE",
        consultation_compensation_mode="separate", consultation_payment_type="fixed",
        consultation_payment_value=125, consultation_currency="KZT", payment_type="fixed",
        payment_value=10, currency="KZT", services=[])
    return SimpleNamespace(name=BINDING.database_namespace, client=Sessions(),
        users=Collection([dict(_id=BINDING.owner_id, is_active=True, hashed_password="PRIVATE HASH", email="PRIVATE EMAIL")]),
        staff=Collection([dict(_id=BINDING.owner_id, is_active=True, role="admin",
                               custom_permissions=["payroll_view"], phone="PRIVATE PHONE")]),
        doctors=Collection([doctor]), treatment_plans=Collection([]),
        appointments=Collection([dict(id="appointment", doctor_id="doctor", status="completed",
            appointment_date="2026-10-19T00:00:00Z", patient_name="PRIVATE PATIENT")]))


class LiveTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        load_synthetic_salary()
        self.db, self.store = database(), Store()
        self.app = FastAPI()
        for router in build_bound_routers(self.db, BINDING, self.store):
            self.app.include_router(router)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url=API_ORIGIN,
                                       headers={"Authorization": "Bearer " + TOKEN})
    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_actual_resolver_and_source_produce_both_reports_without_private_fields(self):
        finance = await self.client.get(PATH, params=PERIOD)
        payroll = await self.client.get(PAYROLL_PATH, params=PERIOD)
        self.assertEqual(finance.status_code, 200, finance.text)
        self.assertEqual(payroll.status_code, 200, payroll.text)
        self.assertEqual(finance.json()["report"]["gross_recorded_receipts_kzt"], "0.00")
        self.assertEqual(payroll.json()["report"]["accrued_kzt"], "125.00")
        self.assertNotIn("PRIVATE", finance.text + payroll.text)
        self.assertIsNone(payroll.json()["report"]["paid_kzt"])
        self.assertEqual(self.db.client.calls, [{"snapshot": True}, {"snapshot": True}])

    async def test_live_mcp_adapter_uses_fixed_api_and_server_identity(self):
        async with bound_adapter(BINDING, TOKEN, transport=httpx.ASGITransport(app=self.app)) as adapter:
            self.assertEqual((await adapter.call(PAYROLL_TOOL, PERIOD))["accrued_kzt"], "125.00")
            self.assertEqual((await adapter.call(TOOL_NAME, PERIOD))["data_source"], "crm_api")
            self.store.grants = ()
            with self.assertRaises(ReportError) as error:
                await adapter.call(TOOL_NAME, PERIOD)
            self.assertEqual(error.exception.code, "FORBIDDEN")

    async def test_anonymous_wrong_or_duplicate_credentials_never_read_identity_or_business(self):
        for headers in ({}, {"Authorization": "Bearer wrong"},
                        {"Authorization": "Bearer mcr_" + "B" * 43},
                        [("Authorization", "Bearer " + TOKEN), ("Authorization", "Bearer " + TOKEN)]):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url=API_ORIGIN) as client:
                response = await client.get(PATH, params=PERIOD, headers=headers)
                self.assertIn(response.status_code, (401, 403))
        self.assertEqual(self.db.users.reads + self.db.staff.reads + self.db.treatment_plans.reads, [])

    async def test_live_user_staff_and_grant_revocations_are_checked_each_request(self):
        self.assertEqual((await self.client.get(PATH, params=PERIOD)).status_code, 200)
        for collection, field, value in ((self.db.users, "is_active", False), (self.db.staff, "is_active", False),
                                       (self.db.users, "password_expires_at", datetime(2000, 1, 1)),
                                       (self.db.staff, "user_id", "different-owner")):
            before = deepcopy(collection.rows)
            collection.rows[0][field] = value
            self.assertEqual((await self.client.get(PATH, params=PERIOD)).status_code, 403)
            collection.rows = before
        self.store.grants = (replace(grant(), active=False),)
        self.assertEqual((await self.client.get(PATH, params=PERIOD)).status_code, 403)

    async def test_no_permission_fallback_or_implicit_payroll_for_admin_or_super_admin(self):
        self.db.staff.rows[0]["custom_permissions"] = []
        self.assertEqual((await self.client.get(PAYROLL_PATH, params=PERIOD)).status_code, 403)
        self.assertEqual((await self.client.get(PATH, params=PERIOD)).status_code, 200)
        self.db.staff.rows[0]["role"] = "super_admin"
        self.assertEqual((await self.client.get(PAYROLL_PATH, params=PERIOD)).status_code, 403)
        self.assertEqual((await self.client.get(PATH, params=PERIOD)).status_code, 200)
        self.db.staff.rows = []
        self.assertEqual((await self.client.get(PATH, params=PERIOD)).status_code, 403)
        self.assertEqual(self.db.doctors.reads, [])

    async def test_duplicate_owner_or_staff_mapping_is_refused(self):
        for collection in (self.db.users, self.db.staff):
            before = deepcopy(collection.rows)
            collection.rows.append(deepcopy(collection.rows[0]))
            self.assertEqual((await self.client.get(PATH, params=PERIOD)).status_code, 403)
            collection.rows = before

    async def test_wrong_grant_target_owner_agent_clinic_scope_expiry_is_refused(self):
        for changes in ({"owner_id": "other"}, {"clinic_id": "other"}, {"agent_id": "other"},
                        {"api_origin": "https://wrong.invalid"}, {"paperclip_runtime": "https://wrong.invalid"},
                        {"scope": "payments.write"}, {"expires_at": datetime(2000, 1, 1, tzinfo=timezone.utc)}):
            self.store.grants = (replace(grant(), **changes),)
            self.assertEqual((await self.client.get(PATH, params=PERIOD)).status_code, 403)
        self.assertEqual(self.db.treatment_plans.reads, [])

    async def test_binding_requires_explicit_clinic_namespace_and_known_agent(self):
        for changes in ({"clinic_id": ""}, {"owner_id": ""}, {"database_namespace": "other"},
                        {"single_clinic_confirmed": False}, {"agent_id": "other"}):
            with self.assertRaises(ReportError):
                build_bound_routers(self.db, replace(BINDING, **changes), self.store)
        self.db.name = "different-deployment"
        self.assertEqual((await self.client.get(PATH, params=PERIOD)).status_code, 503)

    async def test_unknown_snapshot_support_does_not_fallback_or_leak_details(self):
        self.db.client.fail = True
        response = await self.client.get(PATH, params=PERIOD)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("PRIVATE", response.text)
        self.assertEqual(self.db.treatment_plans.reads, [])

    async def test_finance_reads_bson_utc_and_does_not_use_created_at_or_list_price(self):
        self.db.treatment_plans.rows = [dict(id="plan", paid_amount=100, created_at="PRIVATE",
            total_cost=99999, patient_name="PRIVATE", accounting_events=[dict(plan_id="plan", event_id="receipt",
                kind="service_receipt", amount_kzt=100, currency="KZT", occurred_at=datetime(2026, 10, 18, 18),
                service_row_id="row")], services=[dict(service_row_id="row", paid_amount=100, price=99999)])]
        response = await self.client.get(PATH, params=PERIOD)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["report"]["gross_recorded_receipts_kzt"], "100.00")
        projection = self.db.treatment_plans.reads[0][1]
        self.assertNotIn("patient_name", projection)
        self.assertNotIn("created_at", projection)
        self.assertNotIn("total_cost", projection)

    async def test_legacy_partial_coverage_foreign_clinic_and_duplicate_ids_are_incomplete(self):
        cases = [[dict(id="legacy", paid_amount=100)],
                 [dict(id="foreign", clinic_id="other")], [dict(id="duplicate"), dict(id="duplicate")],
                 [dict(id="legacy", services=[dict(paid=True)])],
                 [dict(id="legacy", payments=[dict(amount=100)])]]
        for rows in cases:
            self.db.treatment_plans.rows = rows
            response = await self.client.get(PATH, params=PERIOD)
            self.assertEqual(response.status_code, 409, response.text)
            self.assertNotIn("gross_recorded_receipts_kzt", response.text)

    async def test_plan_advances_remain_external_receipts_and_legacy_balance_is_refused(self):
        self.db.treatment_plans.rows = [dict(id="plan", paid_amount=0, advance_balance_kzt=80,
            accounting_events=[dict(plan_id="plan", event_id="advance", kind="plan_advance", amount_kzt=80,
                                    currency="KZT", occurred_at=datetime(2026, 10, 19))])]
        response = await self.client.get(PATH, params=PERIOD)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["report"]["plan_advances_kzt"], "80.00")
        self.db.treatment_plans.rows[0]["advance_balance_kzt"] = 90
        self.assertEqual((await self.client.get(PATH, params=PERIOD)).status_code, 409)

    async def test_shared_snapshot_for_payroll_and_no_unbounded_business_reads(self):
        await self.client.get(PAYROLL_PATH, params=PERIOD)
        sessions = [collection.reads[0][2]["session"] for collection in
                    (self.db.doctors, self.db.treatment_plans, self.db.appointments)]
        self.assertTrue(all(session is sessions[0] for session in sessions))
        self.db.treatment_plans.rows = [dict(id=str(index)) for index in range(5001)]
        self.assertEqual((await self.client.get(PATH, params=PERIOD)).status_code, 409)

    async def test_strict_route_arguments_and_methods_never_write(self):
        before = deepcopy((self.db.users.rows, self.db.staff.rows, self.db.doctors.rows, self.db.appointments.rows))
        self.assertEqual((await self.client.get(PATH, params={**PERIOD, "clinic_id": "other"})).status_code, 422)
        for path in (PATH, PAYROLL_PATH):
            for method in ("POST", "PUT", "PATCH", "DELETE"):
                self.assertEqual((await self.client.request(method, path, json={})).status_code, 405)
        self.assertEqual(before, (self.db.users.rows, self.db.staff.rows, self.db.doctors.rows, self.db.appointments.rows))


class GrantContractTests(unittest.TestCase):
    def test_grant_decoder_only_accepts_closed_metadata_and_two_exact_scopes(self):
        def document(grants):
            return json.dumps({"version": 1, "grants": [dict(asdict(row), expires_at=row.expires_at.isoformat()) for row in grants]})
        self.assertEqual(len(decode_grants(document([grant(), grant(PAYROLL_SCOPE)]))), 2)
        for raw in (document([grant()] * 2), document([replace(grant(), scope="all")]),
                    document([grant(), grant(PAYROLL_SCOPE), grant()]),
                    '{"version":1,"version":1,"grants":[]}', '{"version":true,"grants":[]}',
                    document([grant()]).replace('"active": true', '"active": 1')):
            with self.assertRaises(ReportError):
                decode_grants(raw)

    def test_protected_store_read_permissions_and_no_follow_without_creating_files(self):
        store = JsonGrantStore(str(ROOT / "synthetic-never-created.json"))
        row = dict(asdict(grant()), expires_at=FUTURE.isoformat())
        raw = json.dumps({"version": 1, "grants": [row]}).encode()
        class Stream(io.BytesIO):
            def fileno(self):
                return 17
        def fake_os(mode=stat.S_IFREG | 0o600, uid=1001, size=len(raw)):
            return SimpleNamespace(name="posix", O_RDONLY=0, O_NOFOLLOW=131072, open=Mock(return_value=17),
                fdopen=lambda *args: Stream(raw), fstat=lambda *args: SimpleNamespace(st_mode=mode, st_uid=uid, st_size=size),
                geteuid=lambda: 1001)
        safe = fake_os()
        with patch("reporting.grant_store.os", safe):
            self.assertEqual(len(store.read()), 1)
            self.assertEqual(safe.open.call_args.args[1], safe.O_RDONLY | safe.O_NOFOLLOW)
        for unsafe in (fake_os(mode=stat.S_IFREG | 0o644), fake_os(uid=999), fake_os(size=20000),
                       fake_os(mode=stat.S_IFDIR | 0o600)):
            with patch("reporting.grant_store.os", unsafe), self.assertRaises(ReportError):
                store.read()

    def test_store_has_no_create_write_or_issue_and_default_server_is_not_activated(self):
        self.assertFalse(any(hasattr(JsonGrantStore, name) for name in ("write", "create", "issue", "save")))
        source = (ROOT / "backend/server.py").read_text(encoding="utf-8")
        self.assertNotIn("build_bound_routers", source)
        self.assertNotIn("live_access", source)
        for projection in (plan_projection(), doctor_projection(), APPOINTMENTS):
            self.assertFalse({"phone", "full_name", "email", "patient_name", "patient_id", "notes", "hashed_password"} & projection.keys())


if __name__ == "__main__":
    unittest.main()
