"""Uninstalled host factory. Call only after separately approved credential provisioning."""
from contextlib import asynccontextmanager
import re

import httpx

from reporting.contract import ReportError, Scope
from reporting.live_access import API_ORIGIN, AGENT_ID, PAPERCLIP_RUNTIME
from reporting.grok_oauth import CLIENT_ID
from .core import Adapter, AmountsDueApi, BreakdownApi, FinanceApi, PayrollApi


@asynccontextmanager
async def bound_adapter(binding, credential, *, transport=None):
    if (binding.api_origin != API_ORIGIN or binding.agent_id != AGENT_ID or binding.paperclip_runtime != PAPERCLIP_RUNTIME
            or not re.fullmatch(r"(?:mcr|mgo)_[A-Za-z0-9_-]{43}", credential, re.ASCII)):
        raise ReportError("REPORTING_UNCONFIGURED")
    scope = Scope(subject_id=binding.owner_id, agent_id=CLIENT_ID if credential.startswith("mgo_") else binding.agent_id,
                  clinic_id=binding.clinic_id)
    async with httpx.AsyncClient(base_url=API_ORIGIN, headers={"Authorization": "Bearer " + credential},
            timeout=10, trust_env=False, follow_redirects=False, transport=transport) as client:
        yield Adapter(FinanceApi(client, scope), PayrollApi(client, scope),
                      BreakdownApi(client, scope), AmountsDueApi(client, scope))
