"""Fixed MedCRM metadata probe, no report reads for MCP discovery/initialization."""
import json

from reporting.access_contract import ACCESS_PATH, ALL_TOOLS, AccessEnvelope
from reporting.contract import ReportError, Scope
from reporting.grok_oauth import CLIENT_ID
from .core import unique_object


async def check_access(client, binding, *, grok=False):
    async with client.stream("GET", ACCESS_PATH, follow_redirects=False) as response:
        if response.status_code in (401, 403):
            raise ReportError("AUTH_REQUIRED" if response.status_code == 401 else "FORBIDDEN")
        if response.status_code != 200:
            raise ReportError("SOURCE_UNAVAILABLE")
        if response.headers.get("content-type", "").split(";")[0].strip() != "application/json":
            raise ReportError("SOURCE_CONTRACT_INVALID")
        raw = bytearray()
        async for chunk in response.aiter_bytes():
            if len(raw) + len(chunk) > 4096:
                raise ReportError("SOURCE_CONTRACT_INVALID")
            raw.extend(chunk)
    try:
        envelope = AccessEnvelope.model_validate_json(json.dumps(json.loads(raw, object_pairs_hook=unique_object)))
        expected = Scope(subject_id=binding.owner_id, agent_id=CLIENT_ID if grok else binding.agent_id, clinic_id=binding.clinic_id)
        if envelope.scope != expected:
            raise ReportError("FORBIDDEN")
        names = envelope.allowed_tools
        if not names or len(names) != len(set(names)) or set(names) - set(ALL_TOOLS):
            raise ValueError
        return names
    except ReportError:
        raise
    except (ValueError, TypeError, UnicodeError):
        raise ReportError("SOURCE_CONTRACT_INVALID") from None
