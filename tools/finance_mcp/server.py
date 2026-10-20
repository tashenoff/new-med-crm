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
from tools.finance_mcp.core import Adapter, FinanceApi, PayrollApi, INPUT_SCHEMA, TOOL_NAME, PAYROLL_TOOL
from reporting.payroll import SCOPE as PAYROLL_SCOPE, PERMISSION as PAYROLL_PERMISSION


def build_server(adapter, demo=False, *, connected=False):
    server = Server("new-med-finance-readonly", version="0.1.0")

    @server.list_tools()
    async def list_tools():
        prefix = "SYNTHETIC DEMO ONLY. " if demo else ("SERVER AUTHORIZED READ-ONLY. " if connected else "UNCONNECTED. Real access is disabled. ")
        tools = [types.Tool(name=TOOL_NAME,
            description=prefix
                + "Gross recorded direct service receipts and plan advances in KZT by occurred_at, inclusive local dates in Asia/Bishkek. "
                + "Not total clinic cashflow, profit, refunds or payroll. Missing source coverage returns an error without amounts.",
            inputSchema=INPUT_SCHEMA,
            annotations={"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False}),
            types.Tool(name=PAYROLL_TOOL,
                description=prefix
                    + "Accrued doctor compensation using existing SalaryService with inclusive Asia/Bishkek dates. "
                    + "Separate payroll scope required. Doctor IDs and accrued KZT only; paid/outstanding are unavailable, never inferred.",
                inputSchema=INPUT_SCHEMA,
                annotations={"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True, "openWorldHint": False})]
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
            adapter = Adapter(FinanceApi(client, authorize(DEMO_CONTEXT), synthetic_only=True),
                PayrollApi(client, authorize(PAYROLL_CONTEXT, required_scope=PAYROLL_SCOPE,
                    required_permission=PAYROLL_PERMISSION), synthetic_only=True))
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
