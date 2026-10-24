"""Grok OAuth contract: synthetic owner/API only, never production credentials."""
import asyncio
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timezone
from hashlib import sha256
import base64
import json
from pathlib import Path
import re
import sys
import socket
import threading
import time
import unittest
from urllib.parse import parse_qs, urlencode, urlsplit
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "backend")]
import httpx
from fastapi import FastAPI

from reporting.grok_oauth import CLIENT_ID, REDIRECT_URI, SCOPES, OAuthError, validate_state
from reporting.configured import build_bound_routers
from reporting.live_access import API_ORIGIN
from tools.finance_mcp.http_server import MCP_PATH, create_http_app
from reporting.oauth_server import AUTHORIZE_PATH, TOKEN_PATH, REVOKE_PATH, OAuthServer
from tools.finance_mcp.synthetic import load_synthetic_salary
from test_live_adapters import BINDING, TOKEN, Store, database, PERIOD

VERIFIER = "v" * 43
CHALLENGE = base64.urlsafe_b64encode(sha256(VERIFIER.encode()).digest()).rstrip(b"=").decode()
NOW = 1792800000


class MemoryOAuthStore:
    """Same transaction interface as the root-only store; data has no raw secrets."""
    def __init__(self):
        self.data = dict(version=1, client_id=CLIENT_ID, clinic_id="curai", owner_id=BINDING.owner_id,
            owner_login="alex", scopes=list(SCOPES), active=True, consented_at=None, expires_at=None,
            code_hash=None, code_expires_at=None, code_challenge=None, token_hash=None)

    def read(self):
        validate_state(self.data)
        return deepcopy(self.data)

    def update(self, callback):
        row = self.read()
        result = callback(row)
        validate_state(row)
        self.data = row
        return result


class GrokOAuthTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        load_synthetic_salary()
        self.db, self.paperclip, self.oauth = database(), Store(), MemoryOAuthStore()
        self.binding = replace(BINDING, clinic_id="curai")
        self.db.users.rows[0].update(login="alex", clinic_id="curai", role="admin")
        self.db.staff.rows[0].update(clinic_id="curai", permission_mode="explicit",
                                   custom_permissions=["finance_view", "payroll_view"])
        class NoClinicalRows:
            def find(self, *args, **kwargs):
                raise AssertionError("OAuth/MCP must not read patients or clinical records")
            async def find_one(self, *args, **kwargs):
                raise AssertionError("OAuth/MCP must not read patients or clinical records")
        for name in ("patients", "diagnoses", "medical_records"):
            setattr(self.db, name, NoClinicalRows())
        import bcrypt
        self.db.users.rows[0].update(full_name="Synthetic", email="synthetic@example.com",
            hashed_password=bcrypt.hashpw(b"synthetic-password", bcrypt.gensalt(rounds=4)).decode())
        self.identity = self.db.users.rows[0]
        for collection in (self.db.users, self.db.staff):
            async def find_one(query, c=collection):
                from test_live_adapters import query_matches
                return next((deepcopy(row) for row in c.rows if query_matches(row, query)), None)
            collection.find_one = find_one
        environment = patch.dict("os.environ", {"APP_CLINIC_ID": "curai"})
        environment.start()
        self.addCleanup(environment.stop)
        self.auth_calls = []
        self.metadata_calls = []
        self.client_metadata = dict(client_id="https://grok.com/oauth/mcp-client.json",
            client_name="Grok", client_uri="https://grok.com", logo_uri="https://grok.com/icon-512x512.png",
            redirect_uris=[REDIRECT_URI, "https://console.x.ai/connectors-oauth-exchange-code/"],
            token_endpoint_auth_method="none", response_types=["code"],
            grant_types=["authorization_code", "refresh_token"])
        self.metadata_response = None
        self.revoke_on_probe = False
        self.clock = NOW
        backend = FastAPI()
        for router in build_bound_routers(self.db, self.binding, self.paperclip, oauth_store=self.oauth):
            backend.include_router(router)
        self.backend = httpx.ASGITransport(app=backend)

        async def upstream(request):
            if str(request.url) == "https://grok.com/oauth/mcp-client.json":
                self.metadata_calls.append(request)
                return self.metadata_response or httpx.Response(200, json=self.client_metadata)
            if request.url.path.startswith("/api/auth/"):
                self.auth_calls.append(request.url.path)
                raise AssertionError("OAuth must call CRM helpers directly, never its public API")
            response = await self.backend.handle_async_request(request)
            if self.revoke_on_probe and request.url.path == "/api/reporting/access":
                self.oauth.data["active"] = False
            return response

        self.transport = httpx.MockTransport(upstream)
        self.app = create_http_app(self.binding, api_transport=self.transport)
        for route in self.backend.app.routes:
            server = getattr(route.endpoint, "__self__", None)
            if isinstance(server, OAuthServer):
                self.oauth_server = server
                # Keep the former fetch seam mocked to catch reintroduced HTTP lookups.
                server.transport = self.transport
                server.clock = lambda: self.clock


    async def asyncSetUp(self):
        ready, self.stop = asyncio.Event(), asyncio.Event()
        async def lifespan():
            async with self.app.router.lifespan_context(self.app):
                ready.set()
                await self.stop.wait()
        self.life = asyncio.create_task(lifespan())
        await ready.wait()
        async def public(request):
            target = httpx.ASGITransport(app=self.app) if request.url.path == MCP_PATH else self.backend
            return await target.handle_async_request(request)
        self.client = httpx.AsyncClient(transport=httpx.MockTransport(public), base_url=API_ORIGIN)

    async def asyncTearDown(self):
        await self.client.aclose()
        self.stop.set()
        await self.life

    def params(self, **changes):
        return dict(response_type="code", client_id=CLIENT_ID, redirect_uri=REDIRECT_URI,
                    scope=" ".join(SCOPES), state="synthetic-state", code_challenge=CHALLENGE,
                    code_challenge_method="S256", **changes)

    async def begin(self, params=None):
        response = await self.client.get(AUTHORIZE_PATH, params=params or self.params())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn("synthetic-short-crm-jwt", response.text)
        return re.search(r'name="transaction" value="([A-Za-z0-9_-]+)"', response.text)[1]

    async def consent(self, *, decision="approve", password="synthetic-password"):
        tx = await self.begin()
        login = await self.client.post(AUTHORIZE_PATH, data=dict(transaction=tx, action="login",
                                                               username="alex", password=password),
                                       headers={"Origin": API_ORIGIN})
        if login.status_code != 200:
            return login
        for text in ("curai", "alex", *SCOPES, "30", "автоматического продления"):
            self.assertIn(text, login.text)
        tx = re.search(r'name="transaction" value="([A-Za-z0-9_-]+)"', login.text)[1]
        return await self.client.post(AUTHORIZE_PATH, data=dict(transaction=tx, action=decision),
                                      headers={"Origin": API_ORIGIN})

    async def exchange(self, code, **changes):
        data = dict(grant_type="authorization_code", client_id=CLIENT_ID, redirect_uri=REDIRECT_URI,
                    code=code, code_verifier=VERIFIER)
        data.update(changes)
        return await self.client.post(TOKEN_PATH, data=data)

    async def token(self):
        redirect = await self.consent()
        self.assertEqual(redirect.status_code, 303, redirect.text)
        parts = urlsplit(redirect.headers["location"])
        self.assertEqual(parts.scheme + "://" + parts.netloc + parts.path, REDIRECT_URI)
        query = parse_qs(parts.query)
        self.assertEqual(query["state"], ["synthetic-state"])
        response = await self.exchange(query["code"][0])
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(set(payload), {"access_token", "token_type", "scope", "expires_in"})
        self.assertEqual(payload["expires_in"], 30 * 86400)
        self.assertEqual(payload["scope"], " ".join(SCOPES))
        self.assertRegex(payload["access_token"], r"^mgo_[A-Za-z0-9_-]{43}$")
        self.assertNotIn(payload["access_token"], json.dumps(self.oauth.data))
        self.assertNotIn("synthetic-short-crm-jwt", json.dumps(self.oauth.data))
        self.assertEqual(response.headers["cache-control"], "no-store")
        replay = await self.exchange(query["code"][0])
        self.assertEqual(replay.status_code, 400)
        return payload["access_token"]

    async def rpc(self, token, method="tools/list", params=None):
        return await self.client.post(MCP_PATH, json=dict(jsonrpc="2.0", id=1, method=method, params=params or {}),
            headers={"Authorization": "Bearer " + token, "Accept": "application/json, text/event-stream",
                     "MCP-Protocol-Version": "2025-06-18"})

    async def test_backend_owns_exact_oauth_routes_and_sidecar_only_mcp(self):
        paths = {route.path for route in self.backend.app.routes}
        required = {AUTHORIZE_PATH, TOKEN_PATH, REVOKE_PATH,
                    "/.well-known/oauth-authorization-server",
                    "/.well-known/oauth-protected-resource/api/reporting/mcp",
                    "/.well-known/oauth-protected-resource"}
        self.assertTrue(required <= paths, required - paths)
        self.assertEqual([route.path for route in self.app.routes], [MCP_PATH])

    async def test_authorize_uses_pinned_client_when_metadata_upstream_returns_403(self):
        self.metadata_response = httpx.Response(403, content=b"<html>Forbidden</html>",
                                               headers={"content-type": "text/html"})
        await self.begin()
        self.assertEqual(self.metadata_calls, [])
        self.assertEqual(self.auth_calls, [])
        self.assertIsNone(self.oauth.data["consented_at"])
        self.assertIsNone(self.oauth.data["token_hash"])

    async def test_pinned_client_only_exact_id_and_validated_snapshot_before_login(self):
        from reporting.oauth_server import PINNED_GROK_CLIENT_METADATA
        self.assertEqual(PINNED_GROK_CLIENT_METADATA, self.client_metadata)
        await self.begin()
        for client in ("https://evil.invalid/client.json", "http://grok.com/oauth/mcp-client.json",
                       "https://grok.com/oauth/mcp-client.json?x=1", "grok-medcrm"):
            params = self.params()
            params["client_id"] = client
            self.assertEqual((await self.client.get(AUTHORIZE_PATH, params=params)).status_code, 400)
        for change in (dict(client_id="other"), dict(redirect_uris=["https://console.x.ai/connectors-oauth-exchange-code/"]),
                       dict(token_endpoint_auth_method="client_secret_post"), dict(response_types=["token"]),
                       dict(grant_types=["refresh_token"]), dict(redirect_uris=REDIRECT_URI)):
            with self.subTest(change=change), patch("reporting.oauth_server.PINNED_GROK_CLIENT_METADATA",
                                                   {**self.client_metadata, **change}):
                self.assertEqual((await self.client.get(AUTHORIZE_PATH, params=self.params())).status_code, 503)
        for key in ("redirect_uris", "response_types", "grant_types"):
            for value in ([], None, [1], self.client_metadata[key] * 2):
                with self.subTest(key=key, value=value), patch("reporting.oauth_server.PINNED_GROK_CLIENT_METADATA",
                                                             {**self.client_metadata, key: value}):
                    self.assertEqual((await self.client.get(AUTHORIZE_PATH, params=self.params())).status_code, 503)
        self.assertEqual(self.metadata_calls, [])
        self.assertIsNone(self.oauth.data["consented_at"])

    async def test_malformed_external_parameters_fail_before_login(self):
        for raw in (b"state=%", b"state=%GG", b"state=%FF", b"state=%00", b"state=%7F",
                    b"state=\xff", b"=value", b"state", b"state=one&state=two"):
            with self.subTest(raw=raw):
                response = await self.client.post(AUTHORIZE_PATH, content=raw,
                    headers={"Content-Type": "application/x-www-form-urlencoded", "Origin": API_ORIGIN})
                self.assertEqual(response.status_code, 400)
        response = await self.client.post(AUTHORIZE_PATH, content=b"state=" + b"x" * 8192,
            headers={"Content-Type": "application/x-www-form-urlencoded", "Origin": API_ORIGIN})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.metadata_calls, [])
        self.assertEqual(self.auth_calls, [])
        self.assertIsNone(self.oauth.data["consented_at"])

    async def test_expired_grant_requires_new_login_consent_and_old_token_stays_denied(self):
        self.clock = int(datetime.now(timezone.utc).timestamp())
        old = await self.token()
        self.oauth.data.update(consented_at=1, expires_at=1 + 30 * 86400)
        self.assertEqual((await self.rpc(old)).status_code, 403)
        new = await self.token()
        self.assertNotEqual(old, new)
        self.assertEqual((await self.rpc(old)).status_code, 403)
        self.assertEqual((await self.rpc(new)).status_code, 200)

    async def test_revoked_grant_requires_new_consent_old_token_cannot_revoke_new(self):
        self.clock = int(datetime.now(timezone.utc).timestamp())
        old = await self.token()
        self.assertEqual((await self.client.post(REVOKE_PATH,
            data=dict(client_id=CLIENT_ID, token=old))).status_code, 200)
        self.assertEqual((await self.rpc(old)).status_code, 403)
        new = await self.token()
        self.assertEqual((await self.rpc(old)).status_code, 403)
        self.assertEqual((await self.rpc(new)).status_code, 200)
        await self.client.post(REVOKE_PATH, data=dict(client_id=CLIENT_ID, token=old))
        self.assertEqual((await self.rpc(new)).status_code, 200)

    async def test_reconsent_invalidates_old_unexchanged_code(self):
        response = await self.consent()
        old = parse_qs(urlsplit(response.headers["location"]).query)["code"][0]
        self.clock += 121
        # An expired authorization code must not permanently lock the owner out.
        response = await self.consent()
        self.assertEqual(response.status_code, 303, response.text)
        new = parse_qs(urlsplit(response.headers["location"]).query)["code"][0]
        self.assertEqual((await self.exchange(old)).status_code, 400)
        self.assertEqual((await self.exchange(new)).status_code, 200)

    async def test_https_required_forwarded_header_alone_is_not_trusted(self):
        for headers in ({}, {"X-Forwarded-Proto": "https"},
                        {"X-Forwarded-Proto": "https", "X-Forwarded-Host": "medcrm.duckdns.org"}):
            response = await self.client.get("http://medcrm.duckdns.org" + AUTHORIZE_PATH,
                                             params=self.params(), headers=headers)
            self.assertEqual(response.status_code, 400)
        for headers in ({"Host": "medcrm.duckdns.org:443"}, {"Origin": "https://evil.invalid"}):
            response = await self.client.post(AUTHORIZE_PATH, data={"action": "approve"}, headers=headers)
            self.assertIn(response.status_code, (400, 403))

    async def test_documented_uvicorn_trusts_proto_from_localhost_proxy_only(self):
        from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
        backend = ProxyHeadersMiddleware(self.backend.app, trusted_hosts="127.0.0.1")
        for address, expected in (("127.0.0.1", 200), ("198.51.100.9", 400)):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(backend, client=(address, 1234)),
                    base_url="http://medcrm.duckdns.org") as client:
                response = await client.get("/.well-known/oauth-authorization-server",
                                            headers={"X-Forwarded-Proto": "https"})
                self.assertEqual(response.status_code, expected)

    async def test_stale_logged_in_transaction_cannot_grant_after_another_grant_is_revoked(self):
        tx = await self.begin()
        response = await self.client.post(AUTHORIZE_PATH, data=dict(transaction=tx, action="login",
            username="alex", password="synthetic-password"), headers={"Origin": API_ORIGIN})
        stale = re.search(r'name="transaction" value="([A-Za-z0-9_-]+)"', response.text)[1]
        cookie = response.cookies.get("__Host-medcrm-grok-oauth")
        token = await self.token()
        await self.client.post(REVOKE_PATH, data=dict(client_id=CLIENT_ID, token=token))
        self.client.cookies.clear()
        response = await self.client.post(AUTHORIZE_PATH, data=dict(transaction=stale, action="approve"),
            headers={"Origin": API_ORIGIN, "Cookie": "__Host-medcrm-grok-oauth=" + cookie})
        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.oauth.data["active"])

    async def test_discovery_public_client_no_registration_no_refresh(self):
        meta = await self.client.get("/.well-known/oauth-authorization-server")
        self.assertEqual(meta.status_code, 200)
        data = meta.json()
        self.assertEqual(CLIENT_ID, "https://grok.com/oauth/mcp-client.json")
        self.assertIs(data["client_id_metadata_document_supported"], True)
        self.assertEqual(data["issuer"], API_ORIGIN)
        self.assertEqual(data["authorization_endpoint"], API_ORIGIN + AUTHORIZE_PATH)
        self.assertEqual(data["token_endpoint"], API_ORIGIN + TOKEN_PATH)
        self.assertEqual(data["token_endpoint_auth_methods_supported"], ["none"])
        self.assertEqual(data["code_challenge_methods_supported"], ["S256"])
        self.assertEqual(data["grant_types_supported"], ["authorization_code"])
        self.assertNotIn("registration_endpoint", data)
        resource = await self.client.get("/.well-known/oauth-protected-resource/api/reporting/mcp")
        self.assertEqual(resource.json()["resource"], API_ORIGIN + MCP_PATH)
        denied = await self.client.post(MCP_PATH, json={})
        self.assertEqual(denied.status_code, 401)
        self.assertIn("resource_metadata=", denied.headers["www-authenticate"])

    async def test_existing_crm_auth_helpers_no_self_http_or_password_or_jwt_store(self):
        from routers import auth
        with patch.object(auth, "authenticate_user", wraps=auth.authenticate_user) as authenticate, patch.object(
                auth, "hydrate_access", wraps=auth.hydrate_access) as hydrate, patch.object(
                auth, "create_access_token", side_effect=AssertionError("No CRM JWT issuance")):
            await self.token()
        authenticate.assert_awaited_once_with("alex", "synthetic-password", self.db)
        self.assertGreaterEqual(hydrate.await_count, 3)
        self.assertEqual(self.auth_calls, [])
        self.assertNotIn("synthetic-password", json.dumps(self.oauth.data))
        self.assertNotIn("hashed_password", json.dumps(self.oauth.data))
        self.assertNotIn("crm_token", repr(self.oauth_server.transactions))

    async def test_grok_token_cannot_accept_paperclip_probe_identity_or_origin(self):
        self.clock = int(datetime.now(timezone.utc).timestamp())
        token = await self.token()
        response = await self.client.post(MCP_PATH, json=dict(jsonrpc="2.0", id=1, method="tools/list"),
            headers={"Authorization": "Bearer " + TOKEN, "Origin": "https://grok.com",
                     "Accept": "application/json, text/event-stream"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual((await self.rpc("mcr_" + token[4:])).status_code, 403)
        for changes in ({"owner_id": "foreign"}, {"clinic_id": "foreign"}, {"active": False}):
            saved = self.oauth.data.copy()
            self.oauth.data.update(changes)
            self.assertEqual((await self.rpc(token)).status_code, 403)
            self.oauth.data = saved

    async def test_consent_rechecks_owner_after_login_and_cannot_be_replayed(self):
        tx = await self.begin()
        response = await self.client.post(AUTHORIZE_PATH, data=dict(transaction=tx, action="login",
            username="alex", password="synthetic-password"), headers={"Origin": API_ORIGIN})
        tx = re.search(r'name="transaction" value="([A-Za-z0-9_-]+)"', response.text)[1]
        self.identity["is_active"] = False
        for _ in range(2):
            denied = await self.client.post(AUTHORIZE_PATH, data=dict(transaction=tx, action="approve"),
                                            headers={"Origin": API_ORIGIN})
            self.assertEqual(denied.status_code, 403)
        self.assertIsNone(self.oauth.data["consented_at"])

    async def test_revocation_is_idempotent_and_cannot_revoke_paperclip(self):
        token = await self.token()
        for _ in range(2):
            response = await self.client.post(REVOKE_PATH, data=dict(client_id=CLIENT_ID, token=token))
            self.assertEqual(response.status_code, 200)
        self.assertEqual((await self.client.post(REVOKE_PATH, data=dict(client_id=CLIENT_ID, token=TOKEN))).status_code, 400)
        self.assertTrue(all(row.active for row in self.paperclip.grants))

    async def test_current_owner_staff_and_clinic_binding_are_rechecked_before_reading_reports(self):
        self.clock = int(datetime.now(timezone.utc).timestamp())
        token = await self.token()
        for collection, change in ((self.db.users, {"login": "other"}), (self.db.users, {"clinic_id": "foreign"}),
            (self.db.users, {"password_expires_at": datetime(2000, 1, 1, tzinfo=timezone.utc)}),
            (self.db.staff, {"is_active": False}), (self.db.staff, {"role": "super_admin"}),
            (self.db.staff, {"_id": "other"}), (self.db.staff, {"clinic_id": "foreign"}),
            (self.db.staff, {"permission_mode": "explicit", "custom_permissions": []})):
            original = deepcopy(collection.rows)
            collection.rows[0].update(change)
            self.assertEqual((await self.rpc(token)).status_code, 403)
            collection.rows = original
        self.assertEqual(self.db.treatment_plans.reads + self.db.doctors.reads + self.db.appointments.reads, [])

    async def test_anonymous_consent_method_confusion_and_no_dynamic_registration(self):
        tx = await self.begin()
        response = await self.client.post(AUTHORIZE_PATH, data=dict(transaction=tx, action="approve"),
                                          headers={"Origin": API_ORIGIN})
        self.assertEqual(response.status_code, 403)
        for path in ("/register", "/api/reporting/oauth/register"):
            self.assertEqual((await self.client.post(path, json={})).status_code, 404)
        params = self.params()
        params["code_challenge_method"] = "s256"
        self.assertEqual((await self.client.get(AUTHORIZE_PATH, params=params)).status_code, 400)
        for headers in ({"Host": "evil.invalid"}, {"Authorization": "Bearer synthetic"},
                        [("Host", "medcrm.duckdns.org"), ("Host", "evil.invalid")]):
            response = await self.client.get(AUTHORIZE_PATH, params=self.params(), headers=headers)
            self.assertEqual(response.status_code, 400)
        self.assertIsNone(self.oauth.data["consented_at"])

    async def test_real_sdk_loopback_mcp_with_grok_principal_and_synthetic_backend(self):
        import uvicorn
        from mcp import ClientSession
        from mcp.client.streamable_http import streamable_http_client
        self.clock = int(datetime.now(timezone.utc).timestamp())
        token = await self.token()
        app = create_http_app(self.binding, api_transport=self.transport,
                              allowed_hosts=["127.0.0.1:*"])
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
            async with httpx.AsyncClient(headers={"Authorization": "Bearer " + token}, timeout=5) as http:
                async with streamable_http_client(url, http_client=http) as (read, write, session_id):
                    async with ClientSession(read, write) as session:
                        await session.initialize()
                        self.assertIsNone(session_id())
                        self.assertEqual([tool.name for tool in (await session.list_tools()).tools],
                                         ["get_finance_summary", "get_payroll_summary"])
                        for name in ("get_finance_summary", "get_payroll_summary"):
                            result = await session.call_tool(name, PERIOD)
                            self.assertFalse(result.isError)
                            self.assertNotIn("PRIVATE", result.content[0].text)
        finally:
            server.should_exit = True
            await asyncio.to_thread(thread.join, 5)
            listener.close()
        self.assertFalse(thread.is_alive())

    async def test_grok_revocation_between_probe_and_call_never_reads_business_rows(self):
        self.clock = int(datetime.now(timezone.utc).timestamp())
        token = await self.token()
        self.revoke_on_probe = True
        response = await self.rpc(token, "tools/call", dict(name="get_finance_summary", arguments=PERIOD))
        self.assertTrue(response.json()["result"]["isError"])
        self.assertEqual(response.json()["result"]["content"][0]["text"], "FORBIDDEN")
        self.assertEqual(self.db.treatment_plans.reads, [])

    async def test_backend_paperclip_principal_cannot_be_substituted_for_grok(self):
        app = create_http_app(self.binding, api_transport=httpx.MockTransport(lambda request: httpx.Response(200,
            json=dict(scope=dict(subject_id=self.binding.owner_id, clinic_id="curai", agent_id=BINDING.agent_id),
                      allowed_tools=["get_finance_summary", "get_payroll_summary"]))))
        async with app.router.lifespan_context(app), httpx.AsyncClient(transport=httpx.ASGITransport(app),
                base_url=API_ORIGIN) as client:
            response = await client.post(MCP_PATH, json=dict(jsonrpc="2.0", id=1, method="tools/list"),
                headers={"Authorization": "Bearer mgo_" + "A" * 43, "Accept": "application/json, text/event-stream"})
            self.assertEqual(response.status_code, 403)

    async def test_exact_redirect_client_scope_pkce_state_and_duplicate_validation(self):
        cases = [dict(client_id="other"), dict(client_id=self.binding.agent_id),
            dict(client_id="grok-medcrm"),
            dict(redirect_uri="https://console.x.ai/connectors-oauth-exchange-code/"),
            dict(redirect_uri=REDIRECT_URI.rstrip("/")), dict(redirect_uri=REDIRECT_URI + "?evil=1"),
            dict(redirect_uri="https://evil.invalid/"), dict(scope=SCOPES[0]),
            dict(scope=" ".join(SCOPES) + " patients.read"), dict(scope=" ".join(SCOPES + (SCOPES[0],))),
            dict(code_challenge_method="plain"), dict(code_challenge="bad"), dict(state=""),
            dict(state="x" * 513), dict(response_type="token"), dict(client_secret="secret")]
        cases += [dict(owner_id=self.binding.owner_id), dict(clinic_id="curai")]
        for change in cases:
            with self.subTest(change=change):
                params = self.params()
                params.update(change)
                response = await self.client.get(AUTHORIZE_PATH, params=params)
                self.assertEqual(response.status_code, 400, response.text)
                self.assertNotIn("location", response.headers)
        for missing in ("state", "code_challenge", "code_challenge_method", "client_id", "redirect_uri"):
            params = self.params()
            del params[missing]
            self.assertEqual((await self.client.get(AUTHORIZE_PATH, params=params)).status_code, 400)
        duplicate = urlencode(self.params()) + "&client_id=" + CLIENT_ID
        self.assertEqual((await self.client.get(AUTHORIZE_PATH + "?" + duplicate)).status_code, 400)
        self.assertIsNone(self.oauth.data["consented_at"])

    async def test_authenticated_explicit_consent_denial_and_no_anonymous_tokens(self):
        denied = await self.consent(decision="deny")
        self.assertEqual(denied.status_code, 303)
        self.assertEqual(parse_qs(urlsplit(denied.headers["location"]).query),
                         {"error": ["access_denied"], "state": ["synthetic-state"]})
        self.assertIsNone(self.oauth.data["consented_at"])
        self.assertEqual((await self.consent(password="wrong")).status_code, 403)
        self.assertEqual((await self.exchange("random")).status_code, 400)
        self.assertEqual(self.auth_calls, [])

    async def test_wrong_password_logs_safe_stage_and_keeps_generic_denial(self):
        password = "synthetic-wrong-password-log-canary"
        tx = await self.begin()
        with self.assertLogs(level="WARNING") as captured:
            response = await self.client.post(AUTHORIZE_PATH,
                data=dict(transaction=tx, action="login", username="alex", password=password),
                headers={"Origin": API_ORIGIN})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.text, '{"error":"access_denied"}')
        self.assertEqual(captured.output,
            ["WARNING:reporting.oauth_server:grok_oauth_consent_rejected stage=credentials_rejected"])
        self.assertEqual(captured.records[0].stage, "credentials_rejected")
        self.assertIsNone(captured.records[0].exc_info)
        self.assertIsNone(captured.records[0].stack_info)
        self.assertNotIn(password, repr([record.__dict__ for record in captured.records]))

    async def test_origin_rejection_logs_only_fixed_stage(self):
        tx = await self.begin()
        for origin in ("https://synthetic-origin-canary.invalid", "null", "", None):
            with self.subTest(origin=origin), self.assertLogs(level="WARNING") as captured:
                response = await self.client.post(AUTHORIZE_PATH,
                    data=dict(transaction=tx, action="login", username="alex", password="synthetic-password"),
                    headers={} if origin is None else {"Origin": origin})
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.text, '{"error":"access_denied"}')
            self.assertEqual(captured.output,
                ["WARNING:reporting.oauth_server:grok_oauth_consent_rejected stage=origin"])
            self.assertEqual(captured.records[0].args, ("origin",))
            self.assertEqual(captured.records[0].stage, "origin")
            self.assertNotIn(tx, repr([record.__dict__ for record in captured.records]))
            self.assertNotIn("synthetic-origin-canary", repr([record.__dict__ for record in captured.records]))
        self.assertIn(tx, self.oauth_server.transactions)

    async def test_transaction_cookie_rejection_logs_only_fixed_stage(self):
        from reporting.oauth_server import COOKIE
        for case in ("missing", "mismatch", "duplicate", "unknown_transaction"):
            with self.subTest(case=case):
                tx = await self.begin()
                self.client.cookies.clear()
                headers = {"Origin": API_ORIGIN}
                if case == "mismatch":
                    headers["Cookie"] = COOKIE + "=synthetic-cookie-canary"
                elif case == "duplicate":
                    headers["Cookie"] = f"{COOKIE}={tx}; {COOKIE}={tx}"
                elif case == "unknown_transaction":
                    tx = "synthetic-unknown-transaction-canary"
                    headers["Cookie"] = COOKIE + "=" + tx
                with self.assertLogs(level="WARNING") as captured:
                    response = await self.client.post(AUTHORIZE_PATH,
                        data=dict(transaction=tx, action="login", username="alex", password="synthetic-password"),
                        headers=headers)
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.text, '{"error":"access_denied"}')
                self.assertEqual(captured.output,
                    ["WARNING:reporting.oauth_server:grok_oauth_consent_rejected stage=transaction_cookie"])
                self.assertEqual(captured.records[0].args, ("transaction_cookie",))
                self.assertEqual(captured.records[0].stage, "transaction_cookie")
                payload = repr([record.__dict__ for record in captured.records])
                for value in (tx, COOKIE, "synthetic-cookie-canary", "synthetic-password"):
                    self.assertNotIn(value, payload)

    async def test_crm_auth_exception_logs_stage_without_exception_details(self):
        from fastapi import HTTPException
        from routers import auth
        tx = await self.begin()
        canary = "synthetic-private-exception-canary"
        with patch.object(auth, "authenticate_user", side_effect=HTTPException(401, canary)), self.assertLogs(
                level="WARNING") as captured:
            response = await self.client.post(AUTHORIZE_PATH,
                data=dict(transaction=tx, action="login", username="alex", password="synthetic-password"),
                headers={"Origin": API_ORIGIN})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.text, '{"error":"access_denied"}')
        self.assertEqual(captured.output,
            ["WARNING:reporting.oauth_server:grok_oauth_consent_rejected stage=crm_auth_exception"])
        self.assertIsNone(captured.records[0].exc_info)
        self.assertNotIn(canary, repr([record.__dict__ for record in captured.records]))

    async def test_login_cannot_authorize_other_inactive_or_permissionless_owner(self):
        for change in ({"id": "other"}, {"login": "other"}, {"is_active": False},
                       {"clinic_id": "other"}, {"password_expires_at": datetime(2000, 1, 1, tzinfo=timezone.utc)}):
            with self.subTest(change=change):
                self.clock += 61  # Each case has an independent login-rate window.
                old = self.identity.copy()
                self.identity.update(change)
                self.assertEqual((await self.consent()).status_code, 403)
                self.identity.clear()
                self.identity.update(old)
        self.clock += 61
        self.db.staff.rows[0]["custom_permissions"] = ["finance_view"]
        self.assertEqual((await self.consent()).status_code, 403)
        self.assertIsNone(self.oauth.data["consented_at"])

    async def test_csrf_cookie_origin_and_expired_transaction(self):
        tx = await self.begin()
        data = dict(transaction=tx, action="login", username="alex", password="synthetic-password")
        for origin in ("https://evil.invalid", "null", ""):
            self.assertEqual((await self.client.post(AUTHORIZE_PATH, data=data, headers={"Origin": origin})).status_code, 403)
        self.client.cookies.clear()
        self.assertEqual((await self.client.post(AUTHORIZE_PATH, data=data, headers={"Origin": API_ORIGIN})).status_code, 403)
        tx = await self.begin()
        self.clock += 601
        data["transaction"] = tx
        self.assertEqual((await self.client.post(AUTHORIZE_PATH, data=data, headers={"Origin": API_ORIGIN})).status_code, 403)

    async def test_code_verifier_expiry_wrong_client_and_replay(self):
        redirect = await self.consent()
        code = parse_qs(urlsplit(redirect.headers["location"]).query)["code"][0]
        for changes in ({"code_verifier": "bad"}, {"code_verifier": "z" * 43},
                        {"client_id": "other"}, {"redirect_uri": REDIRECT_URI.rstrip("/")},
                        {"grant_type": "refresh_token"}, {"client_secret": "anything"}):
            self.assertEqual((await self.exchange(code, **changes)).status_code, 400)
        self.clock += 121
        self.assertEqual((await self.exchange(code)).status_code, 400)

    async def test_token_expiry_is_from_consent_and_no_second_grant(self):
        redirect = await self.consent()
        code = parse_qs(urlsplit(redirect.headers["location"]).query)["code"][0]
        self.clock += 60
        response = await self.exchange(code)
        self.assertEqual(response.json()["expires_in"], 30 * 86400 - 60)
        self.assertEqual((await self.client.get(AUTHORIZE_PATH, params=self.params())).status_code, 403)

    async def test_grok_exact_tools_calls_permission_revocation_expiry_and_paperclip_isolation(self):
        # Synthetic expiry must be after the resolver's real UTC clock.
        self.clock = int(datetime.now(timezone.utc).timestamp())
        token = await self.token()
        listed = await self.rpc(token)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual([x["name"] for x in listed.json()["result"]["tools"]],
                         ["get_finance_summary", "get_payroll_summary"])
        for name in ("get_finance_summary", "get_payroll_summary"):
            result = await self.rpc(token, "tools/call", dict(name=name, arguments=PERIOD))
            self.assertFalse(result.json()["result"].get("isError"), result.text)
            self.assertNotIn("PRIVATE", result.text)
        for name in ("get_patients", "run_mongo", "http_request"):
            result = await self.rpc(token, "tools/call", dict(name=name, arguments=PERIOD))
            self.assertTrue(result.json()["result"]["isError"])
        old = self.db.staff.rows[0]["custom_permissions"]
        self.db.staff.rows[0]["custom_permissions"] = ["finance_view"]
        listed = await self.rpc(token)
        self.assertEqual([x["name"] for x in listed.json()["result"]["tools"]], ["get_finance_summary"])
        result = await self.rpc(token, "tools/call", dict(name="get_payroll_summary", arguments=PERIOD))
        self.assertTrue(result.json()["result"]["isError"])
        self.db.staff.rows[0]["custom_permissions"] = old
        self.db.users.rows[0]["is_active"] = False
        self.assertEqual((await self.rpc(token)).status_code, 403)
        self.db.users.rows[0]["is_active"] = True
        expiry = self.oauth.data["expires_at"]
        self.oauth.data["consented_at"] = 1
        self.oauth.data["expires_at"] = 1 + 30 * 86400
        self.assertEqual((await self.rpc(token)).status_code, 403)
        self.oauth.data["expires_at"] = expiry
        self.oauth.data["consented_at"] = expiry - 30 * 86400
        self.oauth.data["client_id"] = self.binding.agent_id
        self.assertIn((await self.rpc(token)).status_code, (403, 503))
        self.oauth.data["client_id"] = CLIENT_ID
        response = await self.client.post(REVOKE_PATH, data=dict(client_id=CLIENT_ID, token=token))
        self.assertEqual(response.status_code, 200)
        self.assertEqual((await self.rpc(token)).status_code, 403)
        # Existing Paperclip rows remain exact and separate (adapt synthetic clinic only).
        self.paperclip.grants = tuple(replace(g, clinic_id="curai") for g in self.paperclip.grants)
        self.assertEqual((await self.rpc(TOKEN)).status_code, 200)
        self.assertEqual((await self.rpc("mcr_" + token[4:])).status_code, 403)

    async def test_bounds_methods_auth_confusion_and_security_headers(self):
        for path in (AUTHORIZE_PATH, TOKEN_PATH, REVOKE_PATH):
            response = await self.client.post(path, content=b"x" * 8193,
                headers={"Content-Type": "application/x-www-form-urlencoded"})
            self.assertEqual(response.status_code, 413)
            self.assertEqual(response.headers["cache-control"], "no-store")
            self.assertEqual(response.headers["referrer-policy"], "no-referrer")
        self.assertEqual((await self.client.get(TOKEN_PATH)).status_code, 405)
        self.assertEqual((await self.client.post(TOKEN_PATH, json={})).status_code, 400)
        duplicate = urlencode(dict(grant_type="authorization_code", client_id=CLIENT_ID,
            redirect_uri=REDIRECT_URI, code="random", code_verifier=VERIFIER)) + "&code=other"
        self.assertEqual((await self.client.post(TOKEN_PATH, content=duplicate,
            headers={"Content-Type": "application/x-www-form-urlencoded"})).status_code, 400)
        self.assertEqual((await self.client.post(TOKEN_PATH, data={},
            headers={"Authorization": "Basic synthetic"})).status_code, 400)

    async def test_abuse_limits_fail_closed_and_are_bounded(self):
        codes = [(await self.client.get(AUTHORIZE_PATH, params=self.params())).status_code for _ in range(45)]
        self.assertIn(429, codes)
        self.assertIsNone(self.oauth.data["token_hash"])


class StateValidationTests(unittest.TestCase):
    def test_closed_binding_scope_and_no_plaintext_state(self):
        original = MemoryOAuthStore().data
        for change in ({"client_id": "paperclip"}, {"clinic_id": "foreign"}, {"owner_login": "other"},
                       {"scopes": [SCOPES[0]]}, {"active": 1}, {"access_token": "raw"},
                       {"expires_at": 1}, {"token_hash": "raw"}, {"code_challenge": "plain"}):
            with self.subTest(change=change), self.assertRaises(OAuthError):
                validate_state({**original, **change})
