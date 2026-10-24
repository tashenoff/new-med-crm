"""Bounded HTTP adapter reusing the report contract; no duplicated calculation."""
import json

import httpx
from pydantic import ValidationError

from reporting.amounts_due import AmountsDueEnvelope, PATH as AMOUNTS_DUE_PATH, MAX_RESPONSE_BYTES as AMOUNTS_DUE_MAX
from reporting.breakdown import FinanceBreakdownEnvelope, PATH as BREAKDOWN_PATH, MAX_RESPONSE_BYTES as BREAKDOWN_MAX
from reporting.contract import Envelope, MAX_RESPONSE_BYTES, PATH, ReportError, parse_period
from reporting.payroll import PayrollEnvelope, PATH as PAYROLL_PATH
from reporting.services_rendered import (
    ServicesRenderedEnvelope, PATH as SERVICES_RENDERED_PATH,
    MAX_RESPONSE_BYTES as SERVICES_RENDERED_MAX,
)

TOOL_NAME = "get_finance_summary"
BREAKDOWN_TOOL = "get_finance_breakdown"
AMOUNTS_DUE_TOOL = "get_amounts_due"
SERVICES_RENDERED_TOOL = "get_services_rendered"
PAYROLL_TOOL = "get_payroll_summary"
ALL_TOOLS = (TOOL_NAME, BREAKDOWN_TOOL, AMOUNTS_DUE_TOOL, SERVICES_RENDERED_TOOL, PAYROLL_TOOL)
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
    max_bytes = MAX_RESPONSE_BYTES
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
                    if len(raw) + len(chunk) > self.max_bytes:
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


class BreakdownApi(FinanceApi):
    path = BREAKDOWN_PATH
    envelope_type = FinanceBreakdownEnvelope
    max_bytes = BREAKDOWN_MAX


class AmountsDueApi(FinanceApi):
    path = AMOUNTS_DUE_PATH
    envelope_type = AmountsDueEnvelope
    max_bytes = AMOUNTS_DUE_MAX


class ServicesRenderedApi(FinanceApi):
    path = SERVICES_RENDERED_PATH
    envelope_type = ServicesRenderedEnvelope
    max_bytes = SERVICES_RENDERED_MAX


class Adapter:
    def __init__(self, api=None, payroll_api=None, breakdown_api=None, amounts_due_api=None,
                 services_rendered_api=None):
        self.api = api
        self.payroll_api = payroll_api
        self.breakdown_api = breakdown_api
        self.amounts_due_api = amounts_due_api
        self.services_rendered_api = services_rendered_api

    async def list_names(self):
        names = []
        if self.api is not None:
            names.append(TOOL_NAME)
        if self.breakdown_api is not None:
            names.append(BREAKDOWN_TOOL)
        if self.amounts_due_api is not None:
            names.append(AMOUNTS_DUE_TOOL)
        if self.services_rendered_api is not None:
            names.append(SERVICES_RENDERED_TOOL)
        if self.payroll_api is not None:
            names.append(PAYROLL_TOOL)
        return tuple(names) if names else ALL_TOOLS

    async def call(self, name, arguments):
        if name not in ALL_TOOLS:
            raise ReportError("UNKNOWN_TOOL")
        period = parse_period(arguments)
        apis = {
            TOOL_NAME: self.api,
            BREAKDOWN_TOOL: self.breakdown_api,
            AMOUNTS_DUE_TOOL: self.amounts_due_api,
            SERVICES_RENDERED_TOOL: self.services_rendered_api,
            PAYROLL_TOOL: self.payroll_api,
        }
        api = apis[name]
        if api is None:
            raise ReportError("REPORTING_UNCONFIGURED")
        return await api.read(period)
