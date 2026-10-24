"""Streamable HTTP on synthetic backend records only; old SDK skips this module."""
import asyncio
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import datetime, timezone
from hashlib import sha256
import importlib.util
import json
import os
from pathlib import Path
import socket
import sys
import threading
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))
MODERN = importlib.util.find_spec("mcp.server.streamable_http_manager") is not None

if MODERN:
    import httpx
    from fastapi import FastAPI
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client
    import uvicorn
    from reporting.access_api import ACCESS_PATH
    from reporting.configured import build_bound_routers
    from reporting.live_access import API_ORIGIN
    from tools.finance_mcp.core import AMOUNTS_DUE_TOOL, BREAKDOWN_TOOL, PAYROLL_TOOL, TOOL_NAME
    from tools.finance_mcp.http_server import MCP_PATH, MAX_REQUEST_BYTES, create_http_app
    from tools.finance_mcp.synthetic import load_synthetic_salary
    from test_live_adapters import BINDING, PERIOD, TOKEN, Store, database, grant
    from reporting.payroll import SCOPE as PAYROLL_SCOPE


@unittest.skipUnless(MODERN, "HTTP tests require the separate MCP 1.30 runtime")
class HttpMcpTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        load_synthetic_salary()
        self.db, self.store = database(), Store()
        self.backend = FastAPI()
        for router in build_bound_routers(self.db, BINDING, self.store):
            self.backend.include_router(router)
        self.backend_transport = httpx.ASGITransport(app=self.backend)

    @asynccontextmanager
    async def remote(self, binding=True):
        app = create_http_app(BINDING if binding else None, api_transport=self.backend_transport)
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=API_ORIGIN,
                headers={"Authorization": "Bearer " + TOKEN, "Accept": "application/json, text/event-stream"}) as client:
                yield client, app

    async def rpc(self, client, method, params=None, *, identifier=1, headers=None):
        payload = {"jsonrpc": "2.0", "method": method}
        if identifier is not None:
            payload["id"] = identifier
        if params is not None:
            payload["params"] = params
        return await client.post(MCP_PATH, json=payload, headers=headers)

    async def initialize(self, client):
        response = await self.rpc(client, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
            "clientInfo": {"name": "paperclip-synthetic", "version": "1"}})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn("mcp-session-id", response.headers)
        version = response.json()["result"]["protocolVersion"]
        self.assertEqual(version, "2025-06-18")
        client.headers["MCP-Protocol-Version"] = version
        notified = await self.rpc(client, "notifications/initialized", {}, identifier=None)
        self.assertEqual(notified.status_code, 202, notified.text)
        return response.json()["result"]

    async def test_paperclip_wire_handshake_list_and_both_tools(self):
        async with self.remote() as (client, app):
            initialized = await self.initialize(client)
            self.assertIn("tools", initialized["capabilities"])
            self.assertNotIn("resources", initialized["capabilities"])
            self.assertNotIn("prompts", initialized["capabilities"])
            listed = await self.rpc(client, "tools/list", {})
            self.assertEqual(listed.status_code, 200, listed.text)
            tools = listed.json()["result"]["tools"]
            self.assertEqual([row["name"] for row in tools], [TOOL_NAME, BREAKDOWN_TOOL, AMOUNTS_DUE_TOOL, PAYROLL_TOOL])
            self.assertTrue(all(row["annotations"]["readOnlyHint"] for row in tools))
            self.assertEqual(self.db.treatment_plans.reads + self.db.doctors.reads + self.db.appointments.reads, [])
            for name, key, expected in ((TOOL_NAME, "gross_recorded_receipts_kzt", "0.00"),
                                        (PAYROLL_TOOL, "accrued_kzt", "125.00")):
                response = await self.rpc(client, "tools/call", {"name": name, "arguments": PERIOD})
                self.assertEqual(response.status_code, 200, response.text)
                result = response.json()["result"]
                self.assertFalse(result.get("isError", False), result)
                report = json.loads(result["content"][0]["text"])
                self.assertEqual(report[key], expected)
                self.assertNotIn("PRIVATE", response.text)
                self.assertNotIn("synthetic-owner", response.text)
                self.assertNotIn("synthetic-clinic", response.text)
                self.assertEqual(response.headers.get("cache-control"), "no-store")
            self.assertTrue(app.state.mcp_manager.stateless)

    async def test_anonymous_and_invalid_credentials_do_not_read_business_or_identity(self):
        async with self.remote() as (client, _):
            del client.headers["Authorization"]
            for headers in ({}, {"Authorization": "Bearer wrong"}, {"Authorization": "Bearer mcr_" + "Z" * 43}):
                response = await self.rpc(client, "initialize", {}, headers=headers)
                self.assertIn(response.status_code, (401, 403))
                self.assertEqual(response.headers.get("cache-control"), "no-store")
        self.assertEqual(self.db.users.reads + self.db.staff.reads + self.db.treatment_plans.reads, [])

    async def test_scope_controls_discovery_and_call_for_each_tool(self):
        for authorized, denied, row in ((TOOL_NAME, PAYROLL_TOOL, grant()),
                                       (PAYROLL_TOOL, TOOL_NAME, grant(PAYROLL_SCOPE))):
            self.store.grants = (row,)
            async with self.remote() as (client, _):
                await self.initialize(client)
                listed = (await self.rpc(client, "tools/list", {})).json()["result"]["tools"]
                self.assertEqual([tool["name"] for tool in listed], [authorized])
                result = (await self.rpc(client, "tools/call", {"name": denied, "arguments": PERIOD})).json()["result"]
                self.assertTrue(result["isError"])
                self.assertEqual(result["content"][0]["text"], "FORBIDDEN")
                allowed = (await self.rpc(client, "tools/call", {"name": authorized, "arguments": PERIOD})).json()["result"]
                self.assertFalse(allowed.get("isError", False), allowed)

    async def test_revocation_expiry_owner_and_agent_changes_take_effect_without_session_cache(self):
        async with self.remote() as (client, _):
            await self.initialize(client)
            initial = tuple(self.store.grants)
            for changes in ({"active": False}, {"agent_id": "foreign"}, {"owner_id": "foreign"},
                            {"clinic_id": "foreign"}, {"expires_at": datetime(2000, 1, 1, tzinfo=timezone.utc)}):
                self.store.grants = tuple(replace(row, **changes) for row in initial)
                response = await self.rpc(client, "tools/call", {"name": TOOL_NAME, "arguments": PERIOD})
                self.assertEqual(response.status_code, 403, response.text)
            self.store.grants = initial
            self.db.users.rows[0]["is_active"] = False
            self.assertEqual((await self.rpc(client, "tools/list", {})).status_code, 403)
        self.assertEqual(self.db.treatment_plans.reads, [])

    async def test_server_rechecks_tool_scope_after_discovery_probe(self):
        original = self.backend_transport
        class RevokeAfterProbe(httpx.AsyncBaseTransport):
            async def handle_async_request(inner, request):
                response = await original.handle_async_request(request)
                if request.url.path == ACCESS_PATH:
                    self.store.grants = ()
                return response
        app = create_http_app(BINDING, api_transport=RevokeAfterProbe())
        async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
            base_url=API_ORIGIN, headers={"Authorization": "Bearer " + TOKEN,
            "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18"}) as client:
            result = (await self.rpc(client, "tools/call", {"name": TOOL_NAME, "arguments": PERIOD})).json()["result"]
            self.assertTrue(result["isError"])
            self.assertEqual(result["content"][0]["text"], "FORBIDDEN")
        self.assertEqual(self.db.treatment_plans.reads, [])

    async def test_unknown_tools_extra_identity_and_bad_period_never_reach_source(self):
        async with self.remote() as (client, _):
            for name, arguments, code in (("run_mongo", PERIOD, "UNKNOWN_TOOL"),
                ("get_patients", PERIOD, "UNKNOWN_TOOL"),
                (TOOL_NAME, {**PERIOD, "agent_id": "foreign"}, "INVALID_ARGUMENTS"),
                (PAYROLL_TOOL, {**PERIOD, "clinic_id": "foreign"}, "INVALID_ARGUMENTS"),
                (TOOL_NAME, {**PERIOD, "date_to": "2026-01-01"}, "INVALID_PERIOD")):
                response = await self.rpc(client, "tools/call", {"name": name, "arguments": arguments})
                result = response.json()["result"]
                self.assertTrue(result["isError"])
                self.assertEqual(result["content"][0]["text"], code)
        self.assertEqual(self.db.treatment_plans.reads + self.db.doctors.reads + self.db.appointments.reads, [])

    async def test_host_origin_duplicate_headers_and_caller_session_are_rejected(self):
        async with self.remote() as (client, _):
            for headers, expected in (({"Host": "evil.invalid"}, 421), ({"Origin": "https://evil.invalid"}, 403),
                ({"Mcp-Session-Id": "foreign-session"}, 400),
                ([("Host", "medcrm.duckdns.org"), ("Origin", "https://paperclips.duckdns.org"),
                  ("Origin", "https://evil.invalid"), ("Authorization", "Bearer " + TOKEN)], 400)):
                response = await self.rpc(client, "tools/list", {}, headers=headers)
                self.assertEqual(response.status_code, expected, response.text)
            self.assertEqual((await self.rpc(client, "tools/list", {}, headers={"Origin": "https://paperclips.duckdns.org"})).status_code, 200)
            for method in ("GET", "DELETE"):
                self.assertEqual((await client.request(method, MCP_PATH)).status_code, 405)
        self.assertEqual(self.db.treatment_plans.reads + self.db.doctors.reads + self.db.appointments.reads, [])

    async def test_invalid_content_accept_protocol_and_body_bounds(self):
        async with self.remote() as (client, _):
            self.assertEqual((await client.post(MCP_PATH, content=b"{}", headers={"Content-Type": "text/plain"})).status_code, 400)
            response = await client.post(MCP_PATH, content=b"x" * (MAX_REQUEST_BYTES + 1), headers={"Content-Type": "application/json"})
            self.assertEqual(response.status_code, 413)
            self.assertEqual((await self.rpc(client, "tools/list", {}, headers={"Accept": "application/json"})).status_code, 406)
            self.assertEqual((await self.rpc(client, "tools/list", {}, headers={"MCP-Protocol-Version": "1900-01-01"})).status_code, 400)
        self.assertEqual(self.db.treatment_plans.reads, [])

    async def test_parallel_credentials_and_scopes_never_share_request_context(self):
        other = "mcr_" + "B" * 43
        self.store.grants = (grant(), replace(grant(PAYROLL_SCOPE), token_sha256=sha256(other.encode()).hexdigest()))
        async with self.remote() as (client, _):
            async def listed(token, expected):
                response = await self.rpc(client, "tools/list", {}, headers={"Authorization": "Bearer " + token})
                self.assertEqual([row["name"] for row in response.json()["result"]["tools"]], [expected])
            await asyncio.gather(*(listed(token, name) for _ in range(8)
                for token, name in ((TOKEN, TOOL_NAME), (other, PAYROLL_TOOL))))

    async def test_default_app_has_no_access_even_with_bearer_looking_fixture(self):
        async with self.remote(binding=False) as (client, _):
            self.assertEqual((await self.rpc(client, "tools/list", {})).status_code, 503)
        self.assertEqual(self.db.users.reads + self.db.treatment_plans.reads, [])

    async def test_metadata_probe_cannot_replace_scope_or_add_unapproved_tools(self):
        cases = [dict(scope=dict(subject_id="other", agent_id=BINDING.agent_id, clinic_id=BINDING.clinic_id),
                      allowed_tools=[TOOL_NAME]),
                 dict(scope=dict(subject_id=BINDING.owner_id, agent_id=BINDING.agent_id, clinic_id=BINDING.clinic_id),
                      allowed_tools=["get_patients"]),
                 dict(scope=dict(subject_id=BINDING.owner_id, agent_id=BINDING.agent_id, clinic_id=BINDING.clinic_id),
                      allowed_tools=[TOOL_NAME], patient_name="PRIVATE")]
        for payload in cases:
            app = create_http_app(BINDING, api_transport=httpx.MockTransport(lambda req: httpx.Response(200, json=payload)))
            async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                base_url=API_ORIGIN, headers={"Authorization": "Bearer " + TOKEN,
                "Accept": "application/json, text/event-stream"}) as client:
                response = await self.rpc(client, "tools/list", {})
                self.assertIn(response.status_code, (403, 502))
                self.assertNotIn("PRIVATE", response.text)
                self.assertNotIn("tools", response.json())

    async def test_no_resources_prompts_or_session_state_are_exposed(self):
        async with self.remote() as (client, _):
            for method in ("resources/list", "prompts/list", "resources/read"):
                response = await self.rpc(client, method, {})
                self.assertIn("error", response.json())
                self.assertNotIn("PRIVATE", response.text)
                self.assertNotIn("mcp-session-id", response.headers)
        self.assertEqual(self.db.treatment_plans.reads + self.db.doctors.reads + self.db.appointments.reads, [])

    async def test_invalid_rpc_is_not_echoed_or_logged_with_private_input(self):
        async with self.remote() as (client, _):
            for body in (b'{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_finance_summary","arguments":"PRIVATE"}}',
                         b'{"jsonrpc":"2.0","id":1,"method":"tools/list","method":"PRIVATE"}',
                         b'{"jsonrpc":"2.0","id":{"PRIVATE":1},"method":"tools/list"}', b'PRIVATE'):
                with self.assertNoLogs(level="WARNING"):
                    response = await client.post(MCP_PATH, content=body, headers={"Content-Type": "application/json"})
                self.assertEqual(response.status_code, 400, response.text)
                self.assertNotIn("PRIVATE", response.text)
            response = await self.rpc(client, "PRIVATE", {})
            self.assertEqual(response.json()["error"]["code"], -32601)
            self.assertNotIn("PRIVATE", response.text)
        self.assertEqual(self.db.treatment_plans.reads, [])

    async def test_grant_probe_cannot_be_used_to_read_reports_or_override_identity(self):
        async with httpx.AsyncClient(transport=self.backend_transport, base_url=API_ORIGIN,
            headers={"Authorization": "Bearer " + TOKEN}) as client:
            response = await client.get(ACCESS_PATH)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["allowed_tools"], [TOOL_NAME, PAYROLL_TOOL])
            self.assertNotIn("PRIVATE", response.text)
            self.assertEqual((await client.get(ACCESS_PATH, params={"clinic_id": "foreign"})).status_code, 422)
        self.assertEqual(self.db.treatment_plans.reads + self.db.doctors.reads + self.db.appointments.reads, [])

    async def test_real_sdk_client_over_owned_tcp_http(self):
        app = create_http_app(BINDING, api_transport=self.backend_transport, allowed_hosts=["127.0.0.1:*"])
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.bind(("127.0.0.1", 0))
        url = "http://127.0.0.1:" + str(listener.getsockname()[1]) + MCP_PATH
        server = uvicorn.Server(uvicorn.Config(app, log_level="critical", access_log=False, ws="none"))
        thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        thread.start()
        try:
            deadline = time.monotonic() + 5
            while not server.started and thread.is_alive() and time.monotonic() < deadline:
                await asyncio.sleep(.01)
            self.assertTrue(server.started)
            async with streamablehttp_client(url, headers={"Authorization": "Bearer " + TOKEN}, timeout=5) as (read, write, session_id):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    self.assertIsNone(session_id())
                    self.assertEqual([tool.name for tool in (await session.list_tools()).tools], [TOOL_NAME, PAYROLL_TOOL])
                    result = await session.call_tool(PAYROLL_TOOL, PERIOD)
                    self.assertFalse(result.isError)
                    self.assertEqual(json.loads(result.content[0].text)["accrued_kzt"], "125.00")
        finally:
            server.should_exit = True
            await asyncio.to_thread(thread.join, 5)
            listener.close()
        self.assertFalse(thread.is_alive())

    async def test_fresh_asgi_import_without_pythonpath_starts_closed(self):
        code = '''
import asyncio
import httpx
from tools.finance_mcp.http_server import app, MCP_PATH
async def check():
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://medcrm.duckdns.org") as client:
            response = await client.post(MCP_PATH, json={"jsonrpc":"2.0","id":1,"method":"tools/list"})
            assert response.status_code == 401
asyncio.run(check())
print("CLOSED_ASGI_IMPORT_OK")
'''
        environment = {"PYTHONUTF8": "1", "PYTHONDONTWRITEBYTECODE": "1", "PYTHONNOUSERSITE": "1"}
        if sys.platform == "win32":
            environment["SystemRoot"] = os.environ["SystemRoot"]  # Required by Windows socket initialization.
        process = await asyncio.create_subprocess_exec(sys.executable, "-B", "-c", code, cwd=str(ROOT),
            env=environment,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=15)
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()
        self.assertEqual(process.returncode, 0, stderr.decode("utf-8", errors="replace"))
        self.assertEqual(stdout.decode().strip(), "CLOSED_ASGI_IMPORT_OK")

    async def test_http_mcp_import_does_not_require_fastapi(self):
        code = '''
import importlib.abc
import sys
from pathlib import Path
root = Path.cwd()
sys.path.insert(0, str(root))
sys.path.insert(0, str(root / "backend"))
class BlockFastAPI(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname == "fastapi" or fullname.startswith("fastapi."):
            raise ModuleNotFoundError("FastAPI is unavailable in the MCP sidecar", name=fullname)
sys.meta_path.insert(0, BlockFastAPI())
import tools.finance_mcp.http_server
assert not any(name == "fastapi" or name.startswith("fastapi.") for name in sys.modules)
print("NO_FASTAPI_IMPORT_OK")
'''
        environment = {"PYTHONUTF8": "1", "PYTHONDONTWRITEBYTECODE": "1", "PYTHONNOUSERSITE": "1"}
        if sys.platform == "win32":
            environment["SystemRoot"] = os.environ["SystemRoot"]
        process = await asyncio.create_subprocess_exec(sys.executable, "-B", "-c", code, cwd=str(ROOT),
            env=environment,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=15)
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()
        self.assertEqual(process.returncode, 0, stderr.decode("utf-8", errors="replace"))
        self.assertEqual(stdout.decode().strip(), "NO_FASTAPI_IMPORT_OK")


if __name__ == "__main__":
    unittest.main()
