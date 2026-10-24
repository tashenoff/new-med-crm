"""Unmounted real resolver. No credential issuance, config discovery or DB creation."""
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from hmac import compare_digest
import re

from .access import AccessContext, AgentGrant, UserIdentity
from .amounts_due import PATH as AMOUNTS_DUE_PATH, SCOPE as AMOUNTS_DUE_SCOPE
from .breakdown import PATH as BREAKDOWN_PATH, SCOPE as BREAKDOWN_SCOPE
from .contract import PATH as FINANCE_PATH, SCOPE as FINANCE_SCOPE, ReportError
from .payroll import PATH as PAYROLL_PATH, SCOPE as PAYROLL_SCOPE
from .services_rendered import PATH as SERVICES_RENDERED_PATH, SCOPE as SERVICES_RENDERED_SCOPE

API_ORIGIN = "https://medcrm.duckdns.org"
PAPERCLIP_RUNTIME = "https://paperclips.duckdns.org/MED/agents/7923c1ec-bf35-4cc4-adff-91c85fe660f1/runtime"
AGENT_ID = "7923c1ec-bf35-4cc4-adff-91c85fe660f1"
ROUTES = {
    FINANCE_PATH: (FINANCE_SCOPE, "finance_view"),
    BREAKDOWN_PATH: (BREAKDOWN_SCOPE, "finance_view"),
    AMOUNTS_DUE_PATH: (AMOUNTS_DUE_SCOPE, "finance_view"),
    SERVICES_RENDERED_PATH: (SERVICES_RENDERED_SCOPE, "finance_view"),
    PAYROLL_PATH: (PAYROLL_SCOPE, "payroll_view"),
}


@dataclass(frozen=True)
class DeploymentBinding:
    # Values must come from an approved server config, never a request or model.
    clinic_id: str
    owner_id: str
    database_namespace: str
    single_clinic_confirmed: bool
    api_origin: str = API_ORIGIN
    paperclip_runtime: str = PAPERCLIP_RUNTIME
    agent_id: str = AGENT_ID

    def verify(self, db):
        if (self.single_clinic_confirmed is not True or self.api_origin != API_ORIGIN
                or self.paperclip_runtime != PAPERCLIP_RUNTIME or self.agent_id != AGENT_ID
                or any(type(value) is not str or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", value)
                       for value in (self.clinic_id, self.owner_id))
                or type(self.database_namespace) is not str or not self.database_namespace
                or db.name != self.database_namespace):
            raise ReportError("REPORTING_UNCONFIGURED")


@dataclass(frozen=True)
class StoredGrant:
    token_sha256: str
    owner_id: str
    clinic_id: str
    agent_id: str
    api_origin: str
    paperclip_runtime: str
    scope: str
    active: bool
    expires_at: datetime


def utc(value):
    if not isinstance(value, datetime):
        raise ReportError("FORBIDDEN")
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


async def bounded_find(collection, query, projection, *, limit, session=None, overflow_code="INCOMPLETE_ACCOUNTING"):
    options = {"session": session} if session is not None else {}
    rows = await collection.find(query, projection, **options).max_time_ms(2000).limit(limit + 1).to_list(limit + 1)
    if type(rows) is not list or len(rows) > limit:
        raise ReportError(overflow_code)
    return rows


class LiveResolver:
    def __init__(self, db, binding, grant_store, path):
        if path not in ROUTES:
            raise ReportError("REPORTING_UNCONFIGURED")
        self.db, self.binding, self.store = db, binding, grant_store
        self.scope, self.permission = ROUTES[path]

    async def __call__(self, request):
        self.binding.verify(self.db)
        headers = request.headers.getlist("authorization")
        if not headers:
            raise ReportError("AUTH_REQUIRED")
        if len(headers) != 1 or not re.fullmatch(r"Bearer mcr_[A-Za-z0-9_-]{43}", headers[0], re.ASCII):
            raise ReportError("AUTH_REQUIRED")
        digest = sha256(headers[0][7:].encode("ascii")).hexdigest()
        # Re-read revocable grants every call; store returns metadata and one-way hashes only.
        grants = self.store.read()
        matches = [grant for grant in grants if isinstance(grant, StoredGrant)
                   and grant.scope == self.scope and compare_digest(grant.token_sha256, digest)]
        if len(matches) != 1:
            raise ReportError("FORBIDDEN")
        grant = matches[0]
        b = self.binding
        now = datetime.now(timezone.utc)
        if (grant.active is not True or grant.owner_id != b.owner_id or grant.clinic_id != b.clinic_id
                or grant.agent_id != b.agent_id or grant.api_origin != b.api_origin
                or grant.paperclip_runtime != b.paperclip_runtime or utc(grant.expires_at) <= now):
            raise ReportError("FORBIDDEN")
        # Inclusion projections deliberately exclude hashes, names, email and contact data.
        users = await bounded_find(self.db.users, {"$or": [{"id": b.owner_id}, {"_id": b.owner_id}]},
            {"_id": 1, "id": 1, "is_active": 1, "password_expires_at": 1}, limit=1, overflow_code="FORBIDDEN")
        staff = await bounded_find(self.db.staff, {"$or": [{"_id": b.owner_id}, {"user_id": b.owner_id}]},
            {"_id": 1, "user_id": 1, "is_active": 1, "role": 1, "custom_permissions": 1}, limit=1, overflow_code="FORBIDDEN")
        if len(users) != 1 or len(staff) != 1:
            raise ReportError("FORBIDDEN")
        user, member = users[0], staff[0]
        if (str(user.get("id") or user.get("_id")) != b.owner_id
                or member.get("_id") != b.owner_id or member.get("user_id") not in (None, b.owner_id)
                or user.get("is_active") is not True or member.get("is_active") is not True):
            raise ReportError("FORBIDDEN")
        if user.get("password_expires_at") is not None and utc(user["password_expires_at"]) <= now:
            raise ReportError("FORBIDDEN")
        from models.staff import Permission, ROLE_PERMISSIONS, StaffRole
        try:
            role = StaffRole(member["role"])
            custom = member.get("custom_permissions", [])
            if type(custom) is not list:
                raise ValueError
            permissions = frozenset(p.value for p in ROLE_PERMISSIONS.get(role, [])) | frozenset(Permission(p).value for p in custom)
        except (ValueError, KeyError, TypeError):
            raise ReportError("FORBIDDEN") from None
        return AccessContext(UserIdentity(b.owner_id, True, permissions, frozenset({b.clinic_id})),
            AgentGrant(b.agent_id, b.owner_id, b.clinic_id, True, frozenset({self.scope}), utc(grant.expires_at)))
