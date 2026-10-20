"""Read a separately provisioned revocation file; never create grants/credentials."""
from datetime import datetime
import json
import os
from pathlib import Path
import re
import stat

from .contract import ReportError
from .live_access import ROUTES, StoredGrant

MAX_BYTES = 16_384
FIELDS = frozenset(StoredGrant.__dataclass_fields__)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError
        result[key] = value
    return result


def decode_grants(raw):
    try:
        if len(raw) > MAX_BYTES:
            raise ValueError
        data = json.loads(raw, object_pairs_hook=unique_object)
        if type(data) is not dict or set(data) != {"version", "grants"} or type(data["version"]) is not int or data["version"] != 1:
            raise ValueError
        if type(data["grants"]) is not list or len(data["grants"]) > 2:
            raise ValueError
        result, seen = [], set()
        for row in data["grants"]:
            if type(row) is not dict or set(row) != FIELDS:
                raise ValueError
            if (any(type(row[key]) is not str for key in FIELDS - {"active"}) or type(row["active"]) is not bool
                    or not re.fullmatch(r"[0-9a-f]{64}", row["token_sha256"])
                    or row["scope"] not in {scope for scope, _ in ROUTES.values()}):
                raise ValueError
            expiry = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
            if expiry.tzinfo is None or (row["token_sha256"], row["scope"]) in seen:
                raise ValueError
            seen.add((row["token_sha256"], row["scope"]))
            result.append(StoredGrant(**{**row, "expires_at": expiry}))
        return tuple(result)
    except (ValueError, TypeError, KeyError, UnicodeError):
        raise ReportError("REPORTING_UNCONFIGURED") from None


class JsonGrantStore:
    def __init__(self, absolute_path):
        self.path = Path(absolute_path)

    def read(self):
        # Linux production only. No guessing Windows ACLs or accepting a relative config.
        if os.name != "posix" or not self.path.is_absolute():
            raise ReportError("REPORTING_UNCONFIGURED")
        try:
            fd = os.open(self.path, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, "rb") as stream:
                metadata = os.fstat(stream.fileno())
                if (not stat.S_ISREG(metadata.st_mode) or metadata.st_mode & 0o077
                        or metadata.st_uid not in {0, os.geteuid()} or metadata.st_size > MAX_BYTES):
                    raise ReportError("REPORTING_UNCONFIGURED")
                return decode_grants(stream.read(MAX_BYTES + 1))
        except ReportError:
            raise
        except OSError:
            raise ReportError("REPORTING_UNCONFIGURED") from None
