"""Backend-only authorization server for the allowlisted Grok public CIMD client.

Uses existing CRM authentication directly. No CRM JWT is issued or retained.
"""
from collections import deque
from dataclasses import dataclass, field
import base64
from hashlib import sha256
from hmac import compare_digest
from html import escape
import json
import logging
import re
import secrets
import time
from urllib.parse import parse_qsl, urlencode

from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse
from starlette.routing import Route

from reporting.binding_config import unique_object
from reporting.grok_oauth import (CLIENT_ID, REDIRECT_URI, SCOPES, LIFETIME, RESOURCE_PATH,
                                  OAuthError, bound_state, current_owner)
from reporting.contract import ReportError
from reporting.live_access import API_ORIGIN

AUTHORIZE_PATH = "/api/reporting/oauth/authorize"
TOKEN_PATH = "/api/reporting/oauth/token"
REVOKE_PATH = "/api/reporting/oauth/revoke"
MAX_BODY = 8192
COOKIE = "__Host-medcrm-grok-oauth"
logger = logging.getLogger(__name__)
# Operator-pinned snapshot of the single approved public Grok client, used because
# production egress to its metadata URL is blocked (403). Never fetched at runtime.
# The official document includes console/refresh support; our request validation
# still permits only REDIRECT_URI and authorization_code, with no refresh tokens.
PINNED_GROK_CLIENT_METADATA = {
    "client_id": "https://grok.com/oauth/mcp-client.json",
    "client_name": "Grok",
    "client_uri": "https://grok.com",
    "logo_uri": "https://grok.com/icon-512x512.png",
    "redirect_uris": ["https://grok.com/connectors-oauth-exchange-code/",
                      "https://console.x.ai/connectors-oauth-exchange-code/"],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none",
}
SECURITY = {"Cache-Control": "no-store", "Pragma": "no-cache", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    "Strict-Transport-Security": "max-age=31536000"}


def digest(value):
    return sha256(value.encode("ascii")).hexdigest()


def parameters(raw):
    try:
        if len(raw) > MAX_BODY:
            raise OAuthError("invalid_request", 413)
        value = raw.decode("ascii")
        if re.search(r"%(?![0-9A-Fa-f]{2})", value):
            raise ValueError
        pairs = parse_qsl(value, keep_blank_values=True, strict_parsing=True, max_num_fields=16,
                          encoding="utf-8", errors="strict")
        result = unique_object(pairs)
        if any(not key or not val or len(val) > 1024 or any(ord(c) < 32 or ord(c) == 127 for c in key + val)
               for key, val in result.items()):
            raise ValueError
        return result
    except (ValueError, UnicodeError, TypeError):
        raise OAuthError() from None


@dataclass
class Transaction:
    state: str
    challenge: str
    created: int
    revision: str = field(repr=False)
    owner_id: str | None = None


class Limits:
    def __init__(self):
        self.clients = {}
        self.global_requests = deque()
        self.logins = deque()

    def check(self, address, now, *, login=False):
        for queue in (self.global_requests, self.logins):
            while queue and queue[0] <= now - 60:
                queue.popleft()
        self.clients = {key: queue for key, queue in self.clients.items() if queue and queue[-1] > now - 60}
        if (len(self.global_requests) >= 120 or len(self.clients) >= 256 and address not in self.clients
                or login and len(self.logins) >= 5):
            raise OAuthError("temporarily_unavailable", 429)
        queue = self.clients.setdefault(address, deque())
        while queue and queue[0] <= now - 60:
            queue.popleft()
        if len(queue) >= 40:
            raise OAuthError("temporarily_unavailable", 429)
        queue.append(now)
        self.global_requests.append(now)
        if login:
            self.logins.append(now)


class OAuthServer:
    def __init__(self, binding, store, db, clock=None):
        self.binding, self.store = binding, store
        self.db = db
        self.clock = clock or time.time
        self.transactions, self.limits = {}, Limits()

    def state(self):
        if self.store is None or self.binding is None:
            raise OAuthError("temporarily_unavailable", 503)
        self.binding.verify(self.db)
        return bound_state(self.store.read(), self.binding, require_active=False)

    @staticmethod
    def revision(row):
        return digest(json.dumps(row, sort_keys=True, separators=(",", ":")))

    @staticmethod
    def available(row, now):
        # One token or live code at a time. Expiry/revocation require new login/consent.
        if (row["active"] and row["expires_at"] is not None and row["expires_at"] > now
                and (row["token_hash"] is not None
                     or row["code_hash"] is not None and row["code_expires_at"] > now)):
            raise OAuthError("access_denied", 403)

    async def endpoint(self, request):
        try:
            if (request.url.scheme != "https" or request.headers.getlist("host") != ["medcrm.duckdns.org"]
                    or len(request.headers.getlist("origin")) > 1
                    or len(request.headers.getlist("content-type")) > 1
                    or len(request.headers.getlist("content-length")) > 1
                    or request.headers.getlist("authorization")):
                raise OAuthError()
            now = int(self.clock())
            self.transactions = {key: tx for key, tx in self.transactions.items() if tx.created > now - 600}
            address = request.client.host if request.client else "unknown"
            self.limits.check(address, now)
            path, method = request.url.path, request.method
            if path.startswith("/.well-known/"):
                if method != "GET":
                    raise OAuthError("invalid_request", 405)
                if request.query_params:
                    raise OAuthError()
                return self.metadata(path)
            if method == "GET" and path == AUTHORIZE_PATH:
                return await self.begin(parameters(request.scope["query_string"]), now)
            if method != "POST":
                raise OAuthError("invalid_request", 405)
            if request.query_params:
                raise OAuthError()
            body = bytearray()
            async for chunk in request.stream():
                if len(body) + len(chunk) > MAX_BODY:
                    raise OAuthError("invalid_request", 413)
                body.extend(chunk)
            if request.headers.get("content-type", "").lower() not in (
                    "application/x-www-form-urlencoded", "application/x-www-form-urlencoded; charset=utf-8"):
                raise OAuthError()
            data = parameters(body)
            if path == AUTHORIZE_PATH:
                return await self.consent(request, data, now, address)
            if path == TOKEN_PATH:
                return self.exchange(data, now)
            if path == REVOKE_PATH:
                return self.revoke(data)
            raise OAuthError()
        except OAuthError as error:
            return JSONResponse({"error": error.code}, status_code=error.status, headers=SECURITY)
        except Exception:
            # Never serialize/log upstream errors, request data or credentials.
            return JSONResponse({"error": "temporarily_unavailable"}, status_code=503, headers=SECURITY)

    def metadata(self, path):
        if path == "/.well-known/oauth-authorization-server":
            payload = dict(issuer=API_ORIGIN, authorization_endpoint=API_ORIGIN + AUTHORIZE_PATH,
                token_endpoint=API_ORIGIN + TOKEN_PATH, revocation_endpoint=API_ORIGIN + REVOKE_PATH,
                response_types_supported=["code"], grant_types_supported=["authorization_code"],
                code_challenge_methods_supported=["S256"], token_endpoint_auth_methods_supported=["none"],
                revocation_endpoint_auth_methods_supported=["none"], scopes_supported=list(SCOPES))
            payload["client_id_metadata_document_supported"] = True
        else:
            payload = dict(resource=API_ORIGIN + "/api/reporting/mcp", authorization_servers=[API_ORIGIN],
                           scopes_supported=list(SCOPES), bearer_methods_supported=["header"])
        return JSONResponse(payload, headers=SECURITY)

    async def begin(self, data, now):
        expected = {"response_type", "client_id", "redirect_uri", "scope", "state",
                    "code_challenge", "code_challenge_method"}
        # RFC 8707 resource is optional but, if supplied, must be this exact MCP.
        if (set(data) not in (expected, expected | {"resource"}) or data["response_type"] != "code"
                or data["client_id"] != CLIENT_ID or data["redirect_uri"] != REDIRECT_URI
                or data["scope"].split(" ") not in (list(SCOPES), list(reversed(SCOPES)))
                or data["code_challenge_method"] != "S256"
                or not re.fullmatch(r"[A-Za-z0-9_-]{43}", data["code_challenge"], re.ASCII)
                or not 1 <= len(data["state"]) <= 512
                or data.get("resource", API_ORIGIN + "/api/reporting/mcp") != API_ORIGIN + "/api/reporting/mcp"):
            raise OAuthError()
        row = self.state()
        self.available(row, now)
        self.validate_client_metadata()
        if len(self.transactions) >= 128:
            raise OAuthError("temporarily_unavailable", 429)
        tx = secrets.token_urlsafe(32)
        self.transactions[tx] = Transaction(data["state"], data["code_challenge"], now, self.revision(row))
        return self.page(tx, authenticated=False)

    def page(self, tx, *, authenticated):
        if authenticated:
            content = f"""<h1>Доступ Grok к отчётам MedCRM</h1>
<p>Владелец: alex. Клиника: curai.</p>
<ul><li>Финансовая сводка — {SCOPES[0]}</li><li>Сводка начислений зарплаты — {SCOPES[1]}</li></ul>
<p>Только чтение. Срок: 30 дней с согласия, без автоматического продления.
Пациенты, диагнозы, медицинские записи и изменение данных недоступны.</p>
<button name="action" value="approve">Разрешить на 30 дней</button>
<button name="action" value="deny">Отказать</button>"""
        else:
            content = """<h1>Вход владельца MedCRM для Grok</h1><p>Клиника curai. Войдите как alex.
Пароль вводится только на MedCRM. После входа потребуется отдельное согласие.</p>
<label>Логин <input name="username" value="alex" autocomplete="username" required maxlength="64"></label>
<label>Пароль <input type="password" name="password" autocomplete="current-password" required maxlength="1024"></label>
<button name="action" value="login">Войти</button>"""
        response = HTMLResponse(f'<!doctype html><html lang="ru"><meta charset="utf-8">'
            f'<title>MedCRM — Grok</title><body><form method="post" action="{AUTHORIZE_PATH}">'
            f'<input type="hidden" name="transaction" value="{escape(tx, quote=True)}">{content}</form></body></html>',
            headers=SECURITY)
        return response

    def validate_client_metadata(self):
        document = PINNED_GROK_CLIENT_METADATA
        if (document.get("client_id") != CLIENT_ID
                or document.get("token_endpoint_auth_method") != "none"
                or any(type(document.get(key)) is not list
                       or not document[key] or any(type(v) is not str for v in document[key])
                       or len(document[key]) != len(set(document[key]))
                       for key in ("redirect_uris", "response_types", "grant_types"))
                or REDIRECT_URI not in document["redirect_uris"]
                or "code" not in document["response_types"]
                or "authorization_code" not in document["grant_types"]):
            raise OAuthError("temporarily_unavailable", 503)

    def check_owner(self, user):
        if (user.get("id") != self.binding.owner_id or user.get("login") != "alex"
                or user.get("clinic_id", self.binding.clinic_id) != self.binding.clinic_id
                or user.get("is_active") is not True or type(user.get("permissions")) is not list
                or not {"finance_view", "payroll_view"} <= set(user["permissions"])):
            raise OAuthError("access_denied", 403)

    async def owner(self):
        from fastapi import HTTPException
        from routers.auth import hydrate_access
        try:
            user, _ = await current_owner(self.db, self.binding)
            # Same staff/clinic/active/permission semantics as the normal CRM login.
            user["id"] = str(user.get("id") or user["_id"])
            await hydrate_access(user, self.db)
            self.check_owner(user)
            return user["id"]
        except (HTTPException, ReportError):
            raise OAuthError("access_denied", 403) from None

    async def consent(self, request, data, now, address):
        # Temporary diagnostics: only fixed stages, never request values or exceptions.
        stage = "transaction"
        try:
            # The server-held 256-bit, one-time form transaction is the synchronizer
            # CSRF token. Only the same-origin form exposes it; no cookie is required.
            tx = data.get("transaction", "")
            if tx not in self.transactions:
                raise OAuthError("access_denied", 403)
            transaction = self.transactions.pop(tx)  # Each POST consumes its CSRF transaction.
            stage = "transaction_expired"
            if transaction.created <= now - 600:
                raise OAuthError("access_denied", 403)
            stage = "state_binding"
            row = self.state()
            stage = "grant_available"
            self.available(row, now)
            stage = "state_revision"
            if not compare_digest(transaction.revision, self.revision(row)):
                raise OAuthError("access_denied", 403)
            action = data.get("action")
            if action == "login":
                from fastapi import HTTPException
                from routers.auth import authenticate_user
                stage = "login_form"
                if set(data) != {"transaction", "action", "username", "password"} or data["username"] != "alex":
                    raise OAuthError("access_denied", 403)
                stage = "login_limit"
                self.limits.check(address, now, login=True)
                stage = "crm_auth_exception"
                try:
                    user = await authenticate_user("alex", data["password"], self.db)
                except HTTPException:
                    raise OAuthError("access_denied", 403) from None
                stage = "credentials_rejected"
                if not user:
                    raise OAuthError("access_denied", 403)
                stage = "owner_profile"
                self.check_owner(user.model_dump())
                stage = "owner_recheck"
                owner_id = await self.owner()
                stage = "login_page"
                new_tx = secrets.token_urlsafe(32)
                self.transactions[new_tx] = Transaction(transaction.state, transaction.challenge,
                    transaction.created, transaction.revision, owner_id)
                return self.page(new_tx, authenticated=True)
            stage = "approval_owner"
            if (set(data) != {"transaction", "action"} or action not in {"approve", "deny"}
                    or transaction.owner_id != self.binding.owner_id):
                raise OAuthError("access_denied", 403)
            if action == "deny":
                return self.redirect({"error": "access_denied", "state": transaction.state})
            stage = "owner_recheck"
            await self.owner()
            stage = "grant_update"
            code = secrets.token_urlsafe(32)

            def grant(row):
                nonlocal stage
                stage = "state_binding"
                bound_state(row, self.binding, require_active=False)
                stage = "grant_available"
                self.available(row, now)
                stage = "state_revision"
                if not compare_digest(transaction.revision, self.revision(row)):
                    raise OAuthError("access_denied", 403)
                stage = "grant_update"
                row.update(active=True, consented_at=now, expires_at=now + LIFETIME, code_hash=digest(code),
                           code_expires_at=now + 120, code_challenge=transaction.challenge, token_hash=None)
            self.store.update(grant)
            stage = "approval_redirect"
            return self.redirect({"code": code, "state": transaction.state})
        except Exception:
            logger.warning("grok_oauth_consent_rejected stage=%s", stage, extra={"stage": stage})
            raise

    def redirect(self, params):
        response = RedirectResponse(REDIRECT_URI + "?" + urlencode(params), status_code=303, headers=SECURITY)
        response.delete_cookie(COOKIE, path="/", secure=True, httponly=True, samesite="lax")
        return response

    def exchange(self, data, now):
        expected = {"grant_type", "client_id", "redirect_uri", "code", "code_verifier"}
        if (set(data) not in (expected, expected | {"resource"}) or data["grant_type"] != "authorization_code"
                or data["client_id"] != CLIENT_ID or data["redirect_uri"] != REDIRECT_URI
                or data.get("resource", API_ORIGIN + "/api/reporting/mcp") != API_ORIGIN + "/api/reporting/mcp"
                or not re.fullmatch(r"[A-Za-z0-9._~-]{43,128}", data["code_verifier"], re.ASCII)
                or not re.fullmatch(r"[A-Za-z0-9_-]{43}", data["code"], re.ASCII)):
            raise OAuthError()
        token = "mgo_" + secrets.token_urlsafe(32)
        challenge = base64.urlsafe_b64encode(sha256(data["code_verifier"].encode()).digest()).rstrip(b"=").decode()

        def exchange(row):
            bound_state(row, self.binding)
            if (row["code_hash"] is None or row["code_expires_at"] <= now or row["expires_at"] <= now
                    or not compare_digest(row["code_hash"], digest(data["code"]))
                    or not compare_digest(row["code_challenge"], challenge) or row["token_hash"] is not None):
                raise OAuthError("invalid_grant")
            row.update(code_hash=None, code_expires_at=None, code_challenge=None, token_hash=digest(token))
            return row["expires_at"] - now
        remaining = self.store.update(exchange)
        return JSONResponse(dict(access_token=token, token_type="Bearer", scope=" ".join(SCOPES), expires_in=remaining),
                            headers=SECURITY)

    def revoke(self, data):
        if (set(data) not in ({"client_id", "token"}, {"client_id", "token", "token_type_hint"})
                or data["client_id"] != CLIENT_ID or data.get("token_type_hint", "access_token") != "access_token"
                or not re.fullmatch(r"mgo_[A-Za-z0-9_-]{43}", data["token"], re.ASCII)):
            raise OAuthError()
        def revoke(row):
            bound_state(row, self.binding, require_active=False)
            if row["token_hash"] is not None and compare_digest(row["token_hash"], digest(data["token"])):
                row.update(active=False, token_hash=None, code_hash=None, code_expires_at=None, code_challenge=None)
        self.store.update(revoke)
        return JSONResponse({}, headers=SECURITY)

    def routes(self):
        # Backend routes only; never mount this server in the unprivileged sidecar.
        paths = (AUTHORIZE_PATH, TOKEN_PATH, REVOKE_PATH,
                 "/.well-known/oauth-authorization-server", RESOURCE_PATH, "/.well-known/oauth-protected-resource")
        return [Route(path, self.endpoint, methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
                for path in paths]


def create_oauth_router(db, binding, store):
    from fastapi import APIRouter
    router = APIRouter()
    router.routes.extend(OAuthServer(binding, store, db).routes())
    return router
