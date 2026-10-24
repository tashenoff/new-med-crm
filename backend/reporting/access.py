"""Server-resolved identities/grants, never tool arguments or trusted HTTP headers."""
from dataclasses import dataclass
from datetime import datetime, timezone
import re

from .contract import ReportError, SCOPE, Scope


@dataclass(frozen=True)
class UserIdentity:
    subject_id: str
    active: bool
    permissions: frozenset[str]
    clinics: frozenset[str]


@dataclass(frozen=True)
class AgentGrant:
    agent_id: str
    owner_subject_id: str
    clinic_id: str
    active: bool
    scopes: frozenset[str]
    expires_at: datetime


@dataclass(frozen=True)
class AccessContext:
    user: UserIdentity
    grant: AgentGrant


def authorize(context, now=None, *, required_scope=SCOPE, required_permission="finance_view"):
    if context is None:
        raise ReportError("AUTH_REQUIRED")
    if not isinstance(context, AccessContext):
        raise ReportError("FORBIDDEN")
    user, grant = context.user, context.grant
    if (not isinstance(user, UserIdentity) or not isinstance(grant, AgentGrant)
            or not isinstance(user.permissions, frozenset) or not isinstance(user.clinics, frozenset)
            or not isinstance(grant.scopes, frozenset) or not isinstance(grant.expires_at, datetime)):
        raise ReportError("FORBIDDEN")
    now = now or datetime.now(timezone.utc)
    identifiers = (user.subject_id, grant.owner_subject_id, grant.clinic_id)
    if any(type(value) is not str or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", value) for value in identifiers):
        raise ReportError("FORBIDDEN")
    # CIMD uses a URL as the principal. Only this exact approved URL is accepted;
    # the existing Paperclip identifier rules and grant checks remain unchanged.
    from .grok_oauth import CLIENT_ID
    if (type(grant.agent_id) is not str or grant.agent_id != CLIENT_ID
            and not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", grant.agent_id)):
        raise ReportError("FORBIDDEN")
    if (user.active is not True or grant.active is not True
            or grant.owner_subject_id != user.subject_id
            or required_permission not in user.permissions
            or grant.scopes != frozenset({required_scope})
            or grant.clinic_id not in user.clinics
            or grant.expires_at.tzinfo is None or grant.expires_at <= now):
        raise ReportError("FORBIDDEN")
    return Scope(subject_id=user.subject_id, agent_id=grant.agent_id, clinic_id=grant.clinic_id)
