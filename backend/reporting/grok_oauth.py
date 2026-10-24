"""Fixed Grok public client and separate, hash-only, single-grant revocation state.

No Paperclip records are read or written here. Provisioning is an operator action
after deployment; this module never creates an absent grant file.
"""
from contextlib import contextmanager
from datetime import datetime, timezone
from hashlib import sha256
from hmac import compare_digest
import json
import os
from pathlib import Path
import re
import stat

from .access import AccessContext, AgentGrant, UserIdentity
from .binding_config import reject_constant, unique_object
from .contract import ReportError
from .live_access import ROUTES, bounded_find, utc

CLIENT_ID = "https://grok.com/oauth/mcp-client.json"
# Published Grok CIMD; this server permits only the web callback.
REDIRECT_URI = "https://grok.com/connectors-oauth-exchange-code/"
SCOPES = ("finance.summary.read", "payroll.summary.read")
LIFETIME = 30 * 86400
MAX_BYTES = 4096
STATE_NAME = "grok-oauth.json"
RESOURCE_PATH = "/.well-known/oauth-protected-resource/api/reporting/mcp"
FIELDS = frozenset({"version", "client_id", "clinic_id", "owner_id", "owner_login", "scopes", "active",
    "consented_at", "expires_at", "code_hash", "code_expires_at", "code_challenge", "token_hash"})


class OAuthError(Exception):
    def __init__(self, code="invalid_request", status=400):
        self.code, self.status = code, status
        super().__init__(code)


def validate_state(row):
    try:
        if (type(row) is not dict or set(row) != FIELDS or type(row["version"]) is not int
                or row["version"] != 1 or row["client_id"] != CLIENT_ID or row["clinic_id"] != "curai"
                or row["owner_login"] != "alex" or type(row["owner_id"]) is not str
                or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", row["owner_id"], re.ASCII)
                or type(row["scopes"]) is not list or row["scopes"] != list(SCOPES)
                or type(row["active"]) is not bool):
            raise ValueError
        for key in ("consented_at", "expires_at", "code_expires_at"):
            if row[key] is not None and (type(row[key]) is not int or not 0 < row[key] < 2**53):
                raise ValueError
        for key in ("code_hash", "token_hash"):
            if row[key] is not None and (type(row[key]) is not str or not re.fullmatch(r"[0-9a-f]{64}", row[key])):
                raise ValueError
        if row["consented_at"] is None:
            if any(row[k] is not None for k in ("expires_at", "code_hash", "code_expires_at", "code_challenge", "token_hash")):
                raise ValueError
        elif row["expires_at"] != row["consented_at"] + LIFETIME:
            raise ValueError
        if row["code_hash"] is not None:
            if (row["token_hash"] is not None or type(row["code_challenge"]) is not str
                    or not re.fullmatch(r"[A-Za-z0-9_-]{43}", row["code_challenge"], re.ASCII)
                    or row["code_expires_at"] != row["consented_at"] + 120):
                raise ValueError
        elif row["code_challenge"] is not None or row["code_expires_at"] is not None:
            raise ValueError
        return row
    except (ValueError, TypeError, KeyError):
        raise OAuthError("temporarily_unavailable", 503) from None


def bound_state(row, binding, *, require_active=True):
    validate_state(row)
    if (binding.clinic_id != "curai" or row["clinic_id"] != binding.clinic_id
            or row["owner_id"] != binding.owner_id or require_active and row["active"] is not True):
        raise OAuthError("access_denied", 403)
    return row


class OAuthFileStore:
    """Linux root-only directory/file, no symlinks, flock, fsync + atomic replace.

    The parent is a separately provisioned dedicated 0700 root-owned directory.
    Only the root-running backend reads/writes OAuth state. The sidecar never opens it.
    """
    def __init__(self, path):
        self.path = Path(path)

    @contextmanager
    def directory(self):
        if os.name != "posix" or not self.path.is_absolute():
            raise OAuthError("temporarily_unavailable", 503)
        fd = None
        try:
            fd = os.open(self.path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            info = os.fstat(fd)
            if info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
                raise OAuthError("temporarily_unavailable", 503)
            yield fd
        except OSError:
            raise OAuthError("temporarily_unavailable", 503) from None
        finally:
            if fd is not None:
                os.close(fd)

    def _read(self, directory):
        fd = os.open(self.path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        with os.fdopen(fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600
                    or info.st_nlink != 1 or info.st_size > MAX_BYTES):
                raise OAuthError("temporarily_unavailable", 503)
            raw = stream.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise OAuthError("temporarily_unavailable", 503)
        try:
            return validate_state(json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object,
                                             parse_constant=reject_constant))
        except (ValueError, UnicodeError, TypeError):
            raise OAuthError("temporarily_unavailable", 503) from None

    def read(self):
        with self.directory() as directory:
            return self._read(directory)

    def update(self, callback):
        import fcntl  # Linux only; no permission fallback on Windows.
        with self.directory() as directory:
            # Existing grant is mandatory even when the lock file does not exist yet.
            self._read(directory)
            fd = os.open(self.path.name + ".lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK,
                         0o600, dir_fd=directory)
            with os.fdopen(fd, "rb+") as lock:
                info = os.fstat(lock.fileno())
                if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0
                        or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
                    raise OAuthError("temporarily_unavailable", 503)
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                row = self._read(directory)
                result = callback(row)
                validate_state(row)
                raw = json.dumps(row, separators=(",", ":"), allow_nan=False).encode()
                if len(raw) > MAX_BYTES:
                    raise OAuthError("temporarily_unavailable", 503)
                temporary = ".grok-" + os.urandom(16).hex()
                try:
                    out = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                                  0o600, dir_fd=directory)
                    with os.fdopen(out, "wb") as stream:
                        stream.write(raw)
                        stream.flush()
                        os.fsync(stream.fileno())
                    os.replace(temporary, self.path.name, src_dir_fd=directory, dst_dir_fd=directory)
                    os.fsync(directory)
                finally:
                    try:
                        os.unlink(temporary, dir_fd=directory)
                    except FileNotFoundError:
                        pass
                return result


class GrokResolver:
    """Current exact user/staff identity + effective permissions on every call."""
    def __init__(self, db, binding, store, path):
        self.db, self.binding, self.store = db, binding, store
        self.scope, self.permission = ROUTES[path]

    async def __call__(self, request):
        self.binding.verify(self.db)
        headers = request.headers.getlist("authorization")
        if len(headers) != 1 or not re.fullmatch(r"Bearer mgo_[A-Za-z0-9_-]{43}", headers[0], re.ASCII):
            raise ReportError("AUTH_REQUIRED")
        try:
            row = bound_state(self.store.read(), self.binding)
        except OAuthError:
            raise ReportError("FORBIDDEN") from None
        now = datetime.now(timezone.utc)
        if (row["token_hash"] is None or not compare_digest(row["token_hash"], sha256(headers[0][7:].encode()).hexdigest())
                or row["expires_at"] is None or row["expires_at"] <= now.timestamp() or self.scope not in row["scopes"]):
            raise ReportError("FORBIDDEN")
        user, permissions = await current_owner(self.db, self.binding)
        b = self.binding
        return AccessContext(UserIdentity(b.owner_id, True, permissions, frozenset({b.clinic_id})),
            AgentGrant(CLIENT_ID, b.owner_id, b.clinic_id, True, frozenset({self.scope}),
                       datetime.fromtimestamp(row["expires_at"], timezone.utc)))


async def current_owner(db, binding):
    binding.verify(db)
    now = datetime.now(timezone.utc)
    b = binding
    users = await bounded_find(db.users, {"$or": [{"id": b.owner_id}, {"_id": b.owner_id}]},
        {"_id": 1, "id": 1, "login": 1, "role": 1, "clinic_id": 1, "is_active": 1, "password_expires_at": 1},
        limit=1, overflow_code="FORBIDDEN")
    members = await bounded_find(db.staff, {"$or": [{"_id": b.owner_id}, {"user_id": b.owner_id}]},
        {"_id": 1, "user_id": 1, "clinic_id": 1, "is_active": 1, "role": 1,
         "custom_permissions": 1, "permission_mode": 1}, limit=1, overflow_code="FORBIDDEN")
    if len(users) != 1 or len(members) != 1:
        raise ReportError("FORBIDDEN")
    user, member = users[0], members[0]
    if (str(user.get("id") or user.get("_id")) != b.owner_id or user.get("login") != "alex"
            or member.get("_id") != b.owner_id or member.get("user_id") not in (None, b.owner_id)
            or user.get("is_active") is not True or member.get("is_active") is not True
            or user.get("role") != member.get("role")
            or any(x.get("clinic_id", b.clinic_id) != b.clinic_id for x in (user, member))
            or (user.get("password_expires_at") is not None and utc(user["password_expires_at"]) <= now)):
        raise ReportError("FORBIDDEN")
    from permission_policy import effective_permissions
    permissions = frozenset(effective_permissions(member))
    return user, permissions


class PrincipalResolver:
    def __init__(self, paperclip, grok):
        self.paperclip, self.grok = paperclip, grok

    async def __call__(self, request):
        headers = request.headers.getlist("authorization")
        if len(headers) == 1 and headers[0].startswith("Bearer mgo_"):
            if self.grok is None:
                raise ReportError("FORBIDDEN")
            return await self.grok(request)
        return await self.paperclip(request)
