"""Two-tool stdio MCP. Default is unconnected; --demo owns a synthetic HTTP stand."""
import argparse
import asyncio
import json
import logging
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

import httpx
from mcp import types
from mcp.server import Server
from mcp.server.stdio import stdio_server

from reporting.access import authorize
from reporting.contract import ReportError
from tools.finance_mcp.core import (Adapter, AmountsDueApi, BreakdownApi, FinanceApi, PayrollApi,
    ServicesRenderedApi, INPUT_SCHEMA, ALL_TOOLS, TOOL_NAME, BREAKDOWN_TOOL, AMOUNTS_DUE_TOOL,
    SERVICES_RENDERED_TOOL, PAYROLL_TOOL)
from reporting.payroll import SCOPE as PAYROLL_SCOPE, PERMISSION as PAYROLL_PERMISSION


def build_server(adapter, demo=False, *, connected=False):
    server = Server("new-med-finance-readonly", version="0.1.0")

    @server.list_tools()
    async def list_tools():
        prefix = "SYNTHETIC DEMO ONLY. " if demo else ("SERVER AUTHORIZED READ-ONLY. " if connected else "UNCONNECTED. Real access is disabled. ")
        tools = [
            types.Tool(name=TOOL_NAME,
                description=prefix
                    + "Gross recorded direct service receipts and plan advances in KZT by occurred_at, inclusive local dates in Asia/Bishkek. "
                    + "Not total clinic cashflow, profit, refunds or payroll. Missing source coverage returns an error without amounts.",
                inputSchema=INPUT_SCHEMA,
                annotations={"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False}),
            types.Tool(name=BREAKDOWN_TOOL,
                description=prefix
                    + "Same gross recorded receipts metric as get_finance_summary, broken down by Asia/Bishkek day and event kind. "
                    + "Missing source coverage returns an error without amounts.",
                inputSchema=INPUT_SCHEMA,
                annotations={"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False}),
            types.Tool(name=AMOUNTS_DUE_TOOL,
                description=prefix
                    + "Clinic-level treatment-plan amounts due in KZT. Opaque plan ids only; no patient PII. "
                    + "Legacy or incomplete plan balances return an error without amounts.",
                inputSchema=INPUT_SCHEMA,
                annotations={"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False}),
            types.Tool(name=SERVICES_RENDERED_TOOL,
                description=prefix
                    + "Clinic services rendered aggregated by service_name for inclusive Asia/Bishkek dates by plan created_at. "
                    + "Uses payment_status and proportional paid_amount; no patient PII; does not require ledger completeness.",
                inputSchema=INPUT_SCHEMA,
                annotations={"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False}),
            types.Tool(name=PAYROLL_TOOL,
                description=prefix
                    + "Accrued doctor compensation using existing SalaryService with inclusive Asia/Bishkek dates. "
                    + "Separate payroll scope required. Doctor IDs and accrued KZT only; paid/outstanding are unavailable, never inferred.",
                inputSchema=INPUT_SCHEMA,
                annotations={"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False}),
        ]
        allowed = await adapter.list_names()
        return [tool for tool in tools if tool.name in allowed]

    # Our closed contract validates input and emits fixed errors on both SDK versions.
    try:
        tool_handler = server.call_tool(validate_input=False)
    except TypeError:  # SDK 1.5 has no validate_input option.
        tool_handler = server.call_tool()

    @tool_handler
    async def call_tool(name, arguments):
        try:
            report = await adapter.call(name, arguments)
        except ReportError as error:
            raise ValueError(error.code) from None
        except Exception:
            raise ValueError("SOURCE_UNAVAILABLE") from None
        return [types.TextContent(type="text", text=json.dumps(report, ensure_ascii=False, separators=(",", ":")))]

    return server


async def run(demo=False):
    logging.getLogger("httpx").setLevel(logging.CRITICAL)
    client, stand = None, None
    adapter = Adapter()
    try:
        if demo:
            from tools.finance_mcp.synthetic import DEMO_CONTEXT, PAYROLL_CONTEXT, SyntheticHttpStand, load_synthetic_salary
            load_synthetic_salary()
            stand = SyntheticHttpStand().start()
            client = httpx.AsyncClient(base_url=stand.origin, trust_env=False, timeout=5, follow_redirects=False)
            from dataclasses import replace
            from reporting.amounts_due import SCOPE as AMOUNTS_DUE_SCOPE
            from reporting.breakdown import SCOPE as BREAKDOWN_SCOPE
            from reporting.services_rendered import SCOPE as SERVICES_RENDERED_SCOPE
            finance_scope = authorize(DEMO_CONTEXT)
            breakdown_scope = authorize(replace(DEMO_CONTEXT, grant=replace(DEMO_CONTEXT.grant, scopes=frozenset({BREAKDOWN_SCOPE}))),
                required_scope=BREAKDOWN_SCOPE)
            amounts_scope = authorize(replace(DEMO_CONTEXT, grant=replace(DEMO_CONTEXT.grant, scopes=frozenset({AMOUNTS_DUE_SCOPE}))),
                required_scope=AMOUNTS_DUE_SCOPE)
            services_scope = authorize(replace(DEMO_CONTEXT, grant=replace(DEMO_CONTEXT.grant, scopes=frozenset({SERVICES_RENDERED_SCOPE}))),
                required_scope=SERVICES_RENDERED_SCOPE)
            payroll_scope = authorize(PAYROLL_CONTEXT, required_scope=PAYROLL_SCOPE,
                    required_permission=PAYROLL_PERMISSION)
            adapter = Adapter(FinanceApi(client, finance_scope, synthetic_only=True),
                PayrollApi(client, payroll_scope, synthetic_only=True),
                BreakdownApi(client, breakdown_scope, synthetic_only=True),
                AmountsDueApi(client, amounts_scope, synthetic_only=True),
                ServicesRenderedApi(client, services_scope, synthetic_only=True))
        server = build_server(adapter, demo)
        async with stdio_server() as (read, write):
            await server.run(read, write, server.create_initialization_options())
    finally:
        if client:
            await client.aclose()
        if stand:
            stand.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo", action="store_true", help="Only synthetic identities/events and an owned ephemeral loopback HTTP server.")
    asyncio.run(run(parser.parse_args().demo))
