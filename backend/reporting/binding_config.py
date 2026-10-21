"""Bounded, strict non-secret deployment metadata shared with the MCP sidecar.

No environment discovery, CRM imports or credential/grant-file reads.
"""
import json
from pathlib import Path
from types import SimpleNamespace

from .contract import ReportError
from .live_access import DeploymentBinding

MAX_BYTES = 16_384
FIELDS = frozenset({"clinic_id", "owner_id", "database_namespace", "single_clinic_confirmed"})


def absolute_path(value):
    if type(value) is not str or not value or not Path(value).is_absolute():
        raise ReportError("REPORTING_UNCONFIGURED")
    return Path(value)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError


def read_binding(path):
    try:
        with absolute_path(path).open("rb") as stream:
            raw = stream.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError
        data = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object, parse_constant=reject_constant)
        if type(data) is not dict or set(data) != FIELDS:
            raise ValueError
        binding = DeploymentBinding(**data)
        # Reuse the binding's identity/fixed-target validation without a DB client.
        # Backend construction separately verifies against the actual existing db.
        binding.verify(SimpleNamespace(name=binding.database_namespace))
        return binding
    except Exception:
        # Paths, JSON fragments and exception details must never escape this boundary.
        raise ReportError("REPORTING_UNCONFIGURED") from None
