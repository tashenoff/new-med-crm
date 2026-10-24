"""Idempotently add P0 finance grant scopes from the existing finance.summary.read row.

Reads REPORTING_GRANT_FILE. Never prints token hashes. Clones owner/clinic/agent/
expiry from the active finance.summary.read grant onto finance.amounts_due.read
and finance.breakdown.read when missing. Does not touch payroll grants.
"""
from __future__ import annotations

import json
import os
import stat
import sys
import tempfile
from pathlib import Path

TEMPLATE_SCOPE = "finance.summary.read"
EXTRA_SCOPES = ("finance.amounts_due.read", "finance.breakdown.read")
MAX_GRANTS = 4
FIELDS = frozenset(
    {
        "token_sha256",
        "owner_id",
        "clinic_id",
        "agent_id",
        "api_origin",
        "paperclip_runtime",
        "scope",
        "active",
        "expires_at",
    }
)


def main() -> int:
    path_value = os.environ.get("REPORTING_GRANT_FILE")
    if not path_value or not path_value.startswith("/"):
        print("ensure_p0_finance_grants: REPORTING_GRANT_FILE missing or not absolute", file=sys.stderr)
        return 2
    path = Path(path_value)
    if not path.is_file():
        print("ensure_p0_finance_grants: grant file not found", file=sys.stderr)
        return 2
    metadata = path.stat()
    if metadata.st_mode & 0o077:
        print("ensure_p0_finance_grants: grant file mode too open", file=sys.stderr)
        return 2
    raw = path.read_bytes()
    if len(raw) > 16_384:
        print("ensure_p0_finance_grants: grant file too large", file=sys.stderr)
        return 2
    data = json.loads(raw.decode("utf-8"))
    if type(data) is not dict or set(data) != {"version", "grants"} or data.get("version") != 1:
        print("ensure_p0_finance_grants: invalid grant document", file=sys.stderr)
        return 2
    grants = data["grants"]
    if type(grants) is not list:
        print("ensure_p0_finance_grants: grants must be a list", file=sys.stderr)
        return 2
    for row in grants:
        if type(row) is not dict or set(row) != FIELDS:
            print("ensure_p0_finance_grants: unexpected grant fields", file=sys.stderr)
            return 2
    templates = [row for row in grants if row["scope"] == TEMPLATE_SCOPE and row["active"] is True]
    if len(templates) != 1:
        print(
            f"ensure_p0_finance_grants: expected one active {TEMPLATE_SCOPE}, got {len(templates)}",
            file=sys.stderr,
        )
        return 2
    template = templates[0]
    seen = {(row["token_sha256"], row["scope"]) for row in grants}
    added = 0
    for scope in EXTRA_SCOPES:
        key = (template["token_sha256"], scope)
        if key in seen:
            continue
        clone = dict(template)
        clone["scope"] = scope
        grants.append(clone)
        seen.add(key)
        added += 1
    if len(grants) > MAX_GRANTS:
        print("ensure_p0_finance_grants: would exceed max grants", file=sys.stderr)
        return 2
    if added == 0:
        print("ensure_p0_finance_grants: already present")
        return 0
    payload = (json.dumps({"version": 1, "grants": grants}, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    if len(payload) > 16_384:
        print("ensure_p0_finance_grants: rewritten file too large", file=sys.stderr)
        return 2
    fd, tmp_name = tempfile.mkstemp(prefix="grants.", suffix=".json", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp_name, stat.S_IMODE(metadata.st_mode))
        os.chown(tmp_name, metadata.st_uid, metadata.st_gid)
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
    print(f"ensure_p0_finance_grants: added {added} scope(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
