"""Stateless, unprivileged MCP transport; OAuth state belongs to the backend."""
from contextlib import asynccontextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

import httpx
from mcp import types
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecurityMiddleware, TransportSecuritySettings
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from reporting.contract import ReportError, parse_period
from reporting.live_access import AGENT_ID, API_ORIGIN, PAPERCLIP_RUNTIME
from .core import PAYROLL_TOOL, TOOL_NAME, unique_object
from .live_client import bound_adapter
from .remote_access import check_access
from .server import build_server
from reporting.grok_oauth import RESOURCE_PATH

MCP_PATH = "/api/reporting/mcp"
MAX_REQUEST_BYTES = 16_384


@dataclass(frozen=True)
class ActiveCall:
    credential: str = field(repr=False)
    allowed_tools: tuple[str, ...]


active_call = ContextVar("medcrm_http_call", default=None)


class RequestAdapter:
    def __init__(self, binding, transport):
        self.binding, self.transport = binding, transport

    async def list_names(self):
        context = active_call.get()
        if context is None:
            raise ReportError("AUTH_REQUIRED")
        return context.allowed_tools

    async def call(self, name, arguments):
        if name not in (TOOL_NAME, PAYROLL_TOOL):
            raise ReportError("UNKNOWN_TOOL")
        parse_period(arguments)
        context = active_call.get()
        if context is None:
            raise ReportError("AUTH_REQUIRED")
        if name not in context.allowed_tools:
            raise ReportError("FORBIDDEN")
        # The backend resolver rechecks the current grant/owner for this exact tool.
        # Each HTTP request owns its client/token; there is no shared credential/session.
        async with bound_adapter(self.binding, context.credential, transport=self.transport) as adapter:
            return await adapter.call(name, arguments)


class GuardedEndpoint:
    def __init__(self, manager, security, binding, transport):
        self.manager, self.security = manager, TransportSecurityMiddleware(security)
        self.binding, self.transport = binding, transport

    async def __call__(self, scope, receive, send):
        request = Request(scope, receive)

        async def send_no_store(message):
            if message["type"] == "http.response.start":
                message = {**message, "headers": [pair for pair in message.get("headers", [])
                           if pair[0].lower() != b"cache-control"] + [(b"cache-control", b"no-store")]}
            await send(message)

        async def refuse(status, code):
            headers = {"WWW-Authenticate": 'Bearer resource_metadata="' + API_ORIGIN + RESOURCE_PATH + '"'} if status == 401 else None
            await JSONResponse({"code": code}, status_code=status, headers=headers)(scope, receive, send_no_store)

        if len(request.headers.getlist("host")) != 1 or len(request.headers.getlist("origin")) > 1:
            return await refuse(400, "INVALID_HEADERS")
        invalid = await self.security.validate_request(request, is_post=request.method == "POST")
        if invalid is not None:
            return await refuse(invalid.status_code, "TRANSPORT_REJECTED")
        authorization = request.headers.getlist("authorization")
        if len(authorization) != 1 or not re.fullmatch(r"Bearer (?:mcr|mgo)_[A-Za-z0-9_-]{43}", authorization[0], re.ASCII):
            return await refuse(401, "AUTH_REQUIRED")
        if request.headers.get("origin") == "https://grok.com" and not authorization[0].startswith("Bearer mgo_"):
            return await refuse(403, "FORBIDDEN")
        if self.binding is None:
            return await refuse(503, "REPORTING_UNCONFIGURED")
        if request.query_params or request.headers.get("mcp-session-id"):
            return await refuse(400, "STATELESS_REQUEST_REQUIRED")
        if request.method != "POST":
            return await refuse(405, "METHOD_NOT_ALLOWED")
        accepted = {value.split(";")[0].strip().lower() for value in request.headers.get("accept", "").split(",")}
        if not {"application/json", "text/event-stream"} <= accepted:
            return await refuse(406, "MCP_ACCEPT_REQUIRED")
        # Stateless transport has no resumable event store, SSE GET stream or session ID.
        # Reject caller-supplied session identity rather than treating it as authorization.
        body = bytearray()
        try:
            async for chunk in request.stream():
                if len(body) + len(chunk) > MAX_REQUEST_BYTES:
                    return await refuse(413, "REQUEST_TOO_LARGE")
                body.extend(chunk)
            credential = authorization[0][7:]
            async with httpx.AsyncClient(base_url=API_ORIGIN, headers={"Authorization": authorization[0]},
                    timeout=10, trust_env=False, follow_redirects=False, transport=self.transport) as client:
                names = await check_access(client, self.binding, grok=credential.startswith("mgo_"))
        except ReportError as error:
            return await refuse(error.status, error.code)
        except Exception:
            return await refuse(503, "SOURCE_UNAVAILABLE")

        # Validate using SDK models before its logging path can echo malformed inputs.
        # Expose only this server's narrow methods; no resources/prompts/task controls.
        try:
            message = json.loads(body, object_pairs_hook=unique_object)
            if (type(message) is not dict or set(message) - {"jsonrpc", "id", "method", "params"}
                    or message.get("jsonrpc") != "2.0" or type(message.get("method")) is not str
                    or ("id" in message and (type(message["id"]) not in (str, int)
                        or (type(message["id"]) is str and len(message["id"]) > 128)))):
                raise ValueError
            method = message["method"]
            supported = {"initialize", "ping", "tools/list", "tools/call", "notifications/initialized", "notifications/cancelled"}
            if method not in supported:
                if "id" not in message:
                    return await JSONResponse(None, status_code=202)(scope, receive, send_no_store)
                return await JSONResponse({"jsonrpc": "2.0", "id": message["id"],
                    "error": {"code": -32601, "message": "Method not found"}})(scope, receive, send_no_store)
            if "id" in message:
                types.ClientRequest.model_validate(message)
            else:
                types.ClientNotification.model_validate(message)
            if method == "tools/call":
                name = message["params"]["name"]
                code = "UNKNOWN_TOOL" if name not in (TOOL_NAME, PAYROLL_TOOL) else ("FORBIDDEN" if name not in names else None)
                if code:
                    return await JSONResponse({"jsonrpc": "2.0", "id": message["id"],
                        "result": {"isError": True, "content": [{"type": "text", "text": code}]}})(scope, receive, send_no_store)
        except (ValueError, TypeError, KeyError, UnicodeError):
            return await refuse(400, "INVALID_RPC")

        replayed = False

        async def replay_body():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        marker = active_call.set(ActiveCall(credential, tuple(names)))
        try:
            await self.manager.handle_request(scope, replay_body, send_no_store)
        finally:
            active_call.reset(marker)


def create_http_app(binding=None, *, api_transport=None, allowed_hosts=None, allowed_origins=None):
    if binding is not None and (binding.api_origin != API_ORIGIN or binding.agent_id != AGENT_ID
            or binding.paperclip_runtime != PAPERCLIP_RUNTIME or not binding.owner_id or not binding.clinic_id):
        raise ReportError("REPORTING_UNCONFIGURED")
    security = TransportSecuritySettings(enable_dns_rebinding_protection=True,
        allowed_hosts=list(allowed_hosts) if allowed_hosts is not None else ["medcrm.duckdns.org"],
        allowed_origins=list(allowed_origins) if allowed_origins is not None else ["https://paperclips.duckdns.org", "https://grok.com"])
    server = build_server(RequestAdapter(binding, api_transport), connected=True)
    manager = StreamableHTTPSessionManager(server, json_response=True, stateless=True,
        security_settings=security, max_request_body_size=MAX_REQUEST_BYTES, max_sessions=1)

    @asynccontextmanager
    async def lifespan(app):
        async with manager.run():
            yield

    app = Starlette(routes=[Route(MCP_PATH, GuardedEndpoint(manager, security, binding, api_transport),
                                methods=["POST", "GET", "DELETE"])], lifespan=lifespan)
    app.state.mcp_manager = manager
    return app


# Importing the module never enables real access or starts a listening socket.
app = create_http_app()
