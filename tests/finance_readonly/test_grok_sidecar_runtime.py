"""Linux root backend store and unprivileged MCP runtime; synthetic data only."""
import asyncio
from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "backend")]
import httpx
from fastapi import FastAPI
from reporting.configured import build_bound_routers
from reporting.grok_oauth import CLIENT_ID, OAuthFileStore
from reporting.oauth_server import OAuthServer, TOKEN_PATH, REVOKE_PATH
import test_grok_oauth as fixtures


@unittest.skipUnless(os.name == "posix" and os.geteuid() == 0, "requires isolated Linux root test container")
class BackendStoreRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_backend_root_store_pkce_revocation_reconsent_and_report_boundary(self):
        harness = fixtures.GrokOAuthTests()
        harness.setUp()
        self.addCleanup(harness.doCleanups)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "grok-oauth.json"
            path.write_text(json.dumps(harness.oauth.data), encoding="utf-8")
            path.chmod(0o600)
            store = OAuthFileStore(path)
            harness.oauth = store
            backend = FastAPI()
            for router in build_bound_routers(harness.db, harness.binding, harness.paperclip, oauth_store=store):
                backend.include_router(router)
            harness.backend = httpx.ASGITransport(backend)
            for route in backend.routes:
                server = getattr(route.endpoint, "__self__", None)
                if isinstance(server, OAuthServer):
                    server.transport = harness.transport
                    server.clock = lambda: harness.clock
            harness.clock = int(fixtures.time.time())
            await harness.asyncSetUp()
            try:
                async def issue():
                    consent = await harness.consent()
                    self.assertEqual(consent.status_code, 303, consent.text)
                    code = parse_qs(urlsplit(consent.headers["location"]).query)["code"][0]
                    self.assertNotIn(code, path.read_text())
                    response = await harness.exchange(code)
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertNotIn("refresh_token", response.json())
                    token = response.json()["access_token"]
                    self.assertEqual(store.read()["token_hash"], sha256(token.encode()).hexdigest())
                    self.assertEqual((await harness.exchange(code)).status_code, 400)
                    self.assertNotIn(token, path.read_text())
                    self.assertNotIn("synthetic-password", path.read_text())
                    self.assertNotIn("jwt", path.read_text())
                    return token
                old = await issue()
                self.assertEqual((await harness.rpc(old)).status_code, 200)
                self.assertEqual((await harness.client.post(REVOKE_PATH,
                    data=dict(client_id=CLIENT_ID, token=old))).status_code, 200)
                self.assertEqual((await harness.rpc(old)).status_code, 403)
                new = await issue()
                self.assertEqual((await harness.rpc(old)).status_code, 403)
                self.assertEqual((await harness.rpc(new)).status_code, 200)
                store.update(lambda row: row.update(consented_at=1, expires_at=1 + 30 * 86400))
                self.assertEqual((await harness.rpc(new)).status_code, 403)
                latest = await issue()
                self.assertEqual((await harness.rpc(new)).status_code, 403)
                self.assertEqual((await harness.rpc(latest)).status_code, 200)
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            finally:
                await harness.asyncTearDown()

    async def test_sidecar_as_unprivileged_uid_never_opens_root_oauth_state(self):
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            os.chown(parent, 0, 65534)
            parent.chmod(0o750)
            binding = parent / "binding.json"
            binding.write_text(json.dumps(dict(clinic_id="curai", owner_id="synthetic-owner",
                database_namespace="synthetic-db", single_clinic_confirmed=True)), encoding="utf-8")
            os.chown(binding, 0, 65534)
            binding.chmod(0o640)
            state_dir = parent / "grok-oauth"
            state_dir.mkdir(mode=0o700)
            state_file = state_dir / "grok-oauth.json"
            state_file.write_text("synthetic-root-only", encoding="utf-8")
            state_file.chmod(0o600)
            code = r'''
import asyncio, os
from pathlib import Path
import sys
sys.path[:0] = [str(Path.cwd()), str(Path.cwd() / "backend")]
from reporting.grok_oauth import OAuthFileStore, RESOURCE_PATH

def forbidden(*a, **kw):
    raise AssertionError("Sidecar must not construct/access an OAuth store")
OAuthFileStore.__init__ = forbidden
from tools.finance_mcp.http_bootstrap import app
assert os.geteuid() == 65534
assert [route.path for route in app.routes] == ["/api/reporting/mcp"]
try:
    Path(sys.argv[1]).read_bytes()
except PermissionError:
    pass
else:
    raise AssertionError("Unprivileged sidecar could read root-only state")
import httpx
async def check():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="https://medcrm.duckdns.org") as client:
        for path in ("/api/reporting/oauth/authorize", "/api/reporting/oauth/token",
                     "/api/reporting/oauth/revoke", RESOURCE_PATH, "/.well-known/oauth-authorization-server"):
            assert (await client.get(path)).status_code == 404
        response = await client.post("/api/reporting/mcp", json={})
        assert response.status_code == 401
        assert RESOURCE_PATH in response.headers["www-authenticate"]
asyncio.run(check())
print("UNPRIVILEGED_MCP_ONLY_OK")
'''
            def demote():
                os.setgroups([])
                os.setgid(65534)
                os.setuid(65534)
            result = await asyncio.to_thread(subprocess.run,
                [sys.executable, "-B", "-c", code, str(state_file)], cwd=ROOT,
                env={**os.environ, "FINANCE_MCP_BINDING_FILE": str(binding)},
                preexec_fn=demote, capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), "UNPRIVILEGED_MCP_ONLY_OK")
