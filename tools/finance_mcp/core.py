"""Bounded HTTP adapter reusing the report contract; no duplicated calculation."""
import json

import httpx
from pydantic import ValidationError

from reporting.contract import Envelope, MAX_RESPONSE_BYTES, PATH, ReportError, parse_period
from reporting.payroll import PayrollEnvelope, PATH as PAYROLL_PATH

TOOL_NAME = "get_finance_summary"
PAYROLL_TOOL = "get_payroll_summary"
MARKER = "new-med-finance-synthetic-v1"
INPUT_SCHEMA = {"type": "object", "additionalProperties": False,
    "properties": {"date_from": {"type": "string", "format": "date"},
                   "date_to": {"type": "string", "format": "date"}},
    "required": ["date_from", "date_to"]}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


class FinanceApi:
    path = PATH
    envelope_type = Envelope
    def __init__(self, client, binding, *, synthetic_only=False):
        # client/binding may only be supplied by trusted host code, never model arguments.
        self.client, self.binding, self.synthetic_only = client, binding, synthetic_only

    async def read(self, period):
        try:
            async with self.client.stream("GET", self.path,
                    params={"date_from": period.date_from, "date_to": period.date_to}, follow_redirects=False) as response:
                errors = {401: "AUTH_REQUIRED", 403: "FORBIDDEN", 409: "INCOMPLETE_ACCOUNTING"}
                if response.status_code in errors:
                    raise ReportError(errors[response.status_code])
                if response.status_code != 200:
                    raise ReportError("SOURCE_UNAVAILABLE")
                if response.headers.get("content-type", "").split(";")[0].strip() != "application/json":
                    raise ReportError("SOURCE_CONTRACT_INVALID")
                if self.synthetic_only and response.headers.get("x-finance-synthetic") != MARKER:
                    raise ReportError("SOURCE_CONTRACT_INVALID")
                raw = bytearray()
                async for chunk in response.aiter_bytes():
                    if len(raw) + len(chunk) > MAX_RESPONSE_BYTES:
                        raise ReportError("SOURCE_CONTRACT_INVALID")
                    raw.extend(chunk)
            payload = json.loads(raw, object_pairs_hook=unique_object)
            envelope = self.envelope_type.model_validate_json(json.dumps(payload))
            if envelope.scope != self.binding:
                raise ReportError("FORBIDDEN")
            if envelope.report.period != period:
                raise ReportError("SOURCE_CONTRACT_INVALID")
            if self.synthetic_only and envelope.report.data_source != "synthetic_demo":
                raise ReportError("SOURCE_CONTRACT_INVALID")
            return envelope.report.model_dump(mode="json")
        except ReportError:
            raise
        except (ValidationError, ValueError, TypeError, UnicodeError):
            raise ReportError("SOURCE_CONTRACT_INVALID") from None
        except Exception:
            raise ReportError("SOURCE_UNAVAILABLE") from None


class PayrollApi(FinanceApi):
    path = PAYROLL_PATH
    envelope_type = PayrollEnvelope


class Adapter:
    def __init__(self, api=None, payroll_api=None):
        self.api, self.payroll_api = api, payroll_api

    async def list_names(self):
        return (TOOL_NAME, PAYROLL_TOOL)

    async def call(self, name, arguments):
        if name not in (TOOL_NAME, PAYROLL_TOOL):
            raise ReportError("UNKNOWN_TOOL")
        period = parse_period(arguments)
        api = self.api if name == TOOL_NAME else self.payroll_api
        if api is None:
            raise ReportError("REPORTING_UNCONFIGURED")
        return await api.read(period)
