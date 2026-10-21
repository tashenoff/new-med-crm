# Streamable HTTP MCP — local implementation, not activated

This change follows and preserves `8a74337b7ef8ff186e1bbfa36cb374626a60004d`.
No push/deployment, production requests, real credentials/grants, service/network
configuration or Paperclip changes were performed in this phase.

## Implemented

`http_server.py` uses the official MCP SDK `StreamableHTTPSessionManager` in
**stateless, JSON-response Streamable HTTP** mode, not the legacy SSE transport.
Path: `/api/reporting/mcp`. Default `app` has no live binding and always refuses
access; importing the module starts no listener and reads no config/credential.

The only tools are `get_finance_summary` and `get_payroll_summary`. Discovery is
filtered to current scopes. Every HTTP request calls protected metadata endpoint
`GET /api/reporting/access` against the fixed MedCRM API; it resolves current
owner/staff/grants without reading financial/medical records. Every actual tool
call then reaches its fixed report endpoint, which repeats authorization before
reading data. No arbitrary URL/query/clinic/agent/scope is accepted from the model.

Bearer credentials are forwarded per request over the fixed verified HTTPS
origin, held transiently and never stored by the sidecar. The backend keeps only
the approved hash and revocation metadata. There is no credential cache or shared
HTTP client across callers. Concurrent requests use isolated ContextVars.

SDK DNS-rebinding protection is enabled. Production defaults allow exactly Host
`medcrm.duckdns.org` and, when supplied, Origin `https://paperclips.duckdns.org`.
Machine requests without Origin are supported. No wildcard CORS/cookie auth is
enabled. Test-only host overrides are injected by trusted test construction.
Both MCP Accept media types are required. Actual body size is capped at 16 KiB.

No session IDs or event store are issued. Incoming `Mcp-Session-Id` is rejected;
GET/DELETE are 405, because this bounded read-only server needs no SSE push or
session termination. Initialize and initialized notification remain supported.
The SDK validates supported RPC models; unsupported methods, malformed requests
and unauthorized/unknown tools receive bounded fixed errors without reflecting
their input. No resources, prompts, generic HTTP/Mongo or task-control tools exist.
All endpoint responses use `Cache-Control: no-store`.

The backend now uses `select_reporting_routers(db, os.environ)` to select exactly
one router set at the original registration position. `REPORTING_BINDING_FILE`
and `REPORTING_GRANT_FILE` must both be absolute paths. Valid binding metadata
and the existing database validation select `build_bound_routers`; absent, partial
or invalid configuration retains the original two closed routes without access
metadata or a CRM startup failure. The helper logs no config or exception details.
The protected grant file is read/validated by the existing store at request time;
an absent/unusable grant never enables access.

`tools.finance_mcp.http_bootstrap:app` is the configured Uvicorn entrypoint. It
requires `FINANCE_MCP_BINDING_FILE`, an absolute path to non-secret UTF-8 JSON with
exactly `clinic_id`, `owner_id`, `database_namespace`, `single_clinic_confirmed`.
Both processes use the same bounded strict parser and existing binding validation.
Duplicate/extra/missing fields, malformed values and non-JSON constants are refused.
Invalid/missing sidecar metadata refuses startup; no config values are reported.
The sidecar never reads backend `.env`/Mongo credentials or the grant file and
does not require FastAPI. Import starts no listener and issues no credential.
See [README.md](README.md#explicit-activation-configuration) for exact variables,
synthetic JSON and the isolated-environment launch command. These are local source
changes, with no production activation or deployment performed.
Old stdio remains available with SDK 1.5; compatibility registration avoids the
new SDK echoing argument-validation details instead of the fixed contract errors.

## Dependency isolation and tests

Official registry used: `https://pypi.org/simple`, explicit `--isolated` and
`--only-binary=:all:`. Selected official SDK 1.30.0, the stable 1.x API line, rather
than changing the existing low-level server to the new major API. A new venv was
created at `../reporting-http-runtime`; neither the old prototype venv nor CRM
production requirements were modified. `pip check` reports no broken requirements.

`requirements-http.lock.txt` records the exact tested runtime dependency set.
Use it only in a separate sidecar venv. `requirements-http-test.txt` additionally
provides Motor/PyMongo/email imports for the synthetic suite. PyMongo 4.5 has no
official Python 3.13 wheel; the new test venv uses Motor 3.7.1/PyMongo 4.13.2, while
the old environment is preserved. These imports do not establish real Mongo
compatibility. No production driver upgrade is proposed by this sidecar change.

Final modern-runtime result: **84 passed, 0 failed**, including 16 HTTP-specific
tests. Tests cover the Paperclip-shaped protocol 2025-06-18 handshake, SDK client
over an owned real loopback TCP listener, discovery and both reports, auth/scopes,
revocation after discovery, expired/wrong identities, no extra tools/private
records, parallel credential separation, Host/Origin/session limits, invalid RPC
redaction, size/content/Accept/protocol rejection, fresh ASGI startup without
PYTHONPATH and unconfigured defaults.
The prior SDK 1.5 runtime separately passed all 68 non-HTTP tests; HTTP tests are
intentionally unavailable there. All records/tokens/grants were synthetic fixtures.

Official Paperclip source uses the same transport/handshake:
https://github.com/paperclipai/paperclip/blob/master/server/src/services/mcp-http.ts
This is source compatibility evidence, not a test of the installed Paperclip version.

## Known identities and remaining metadata

User supplied existing CRM login **alex**, clinic name **curai**, and confirmed one
clinic in this database. Exact Paperclip target is agent **Финансист**,
`7923c1ec-bf35-4cc4-adff-91c85fe660f1`, organization MedCrm/MED:
`https://paperclips.duckdns.org/MED/agents/7923c1ec-bf35-4cc4-adff-91c85fe660f1/runtime`.

1. Review and publish the isolated reporting/MCP implementation and configuration-driven activation on current production `ref-2`. No schema migration is needed.
2. The production audit confirmed one active CRM login `alex`, mapped to one active staff record. `finance_view` is present and `payroll_view` is absent. The user separately approved adding only explicit `payroll_view` to that staff record; do not change role defaults.
3. The live database namespace is `clinic`; MongoDB `rs0` snapshot reads passed. Relevant source documents have no `clinic_id` field, so `curai` is bound at the database level based on the user's confirmation that this is a single-clinic CRM. Do not generalize this binding if the database becomes multi-clinic.
4. Paperclip's current agent `7923c1ec-bf35-4cc4-adff-91c85fe660f1` has zero active tools/profile. The installed UI supports custom remote MCP and agent access profiles. The MCP port `8766` is free; the Nginx `/api/` prefix currently forwards to the backend and has no exact MCP route.
5. Approved access is limited to `get_finance_summary` / `finance.summary.read` and `get_payroll_summary` / `payroll.summary.read`, for the financier agent and clinic `curai`, under owner `alex`, for 30 days with no auto-renewal. This does not approve any broader tool access.

## Exact staged deployment plan

1. Publish the isolated reporting/MCP implementation and activation commits on current `ref-2`, after final review. No schema migration is needed.
2. Provision the approved non-secret binding and protected grant file; supply `REPORTING_BINDING_FILE` and `REPORTING_GRANT_FILE` only to the backend. Do not append live routers: `select_reporting_routers` replaces the two closed routers and falls back to them on absent/invalid config.
3. Reuse the separate `/opt/medcrm/finance-mcp/venv` and locked Python 3.14 sidecar requirements; run `tools.finance_mcp.http_bootstrap:app` with only `FINANCE_MCP_BINDING_FILE`. Keep the sidecar loopback-only, with no Mongo URI, grant file or credential.
4. Add the exact HTTPS proxy location `/api/reporting/mcp` on MedCRM, preserve Host/path, publish no port, run `nginx -t`, and verify CRM health before/after.
5. After the approved 30-day scope/term confirmation, create one agent-specific opaque bearer (`mcr_` + 43 URL-safe characters); store only its SHA-256 in the protected revocation file and put the raw credential only into Paperclip's managed secret store. Create exactly two active grant records, one scope each, with the same owner/clinic/agent and fixed 30-day expiry.
6. Connect the MCP URL through Paperclip's managed custom remote-MCP connector. Create an access profile containing only these two read actions and bind it only to the «Финансист» agent. Keep writes/destructive actions Off. Do not attach it organization-wide or through adapter-level raw MCP configuration.
7. Verify actual agent execution, not only the HTTP endpoint: inspect the target agent's effective tool list, run one bounded read-only task for each summary, verify the Paperclip run's tool-call audit and output scope, and test expired/other-agent/wrong-scope denial. If accounting source coverage is incomplete, verify the agent reports that refusal rather than inventing totals.

Source verification for this activation stage uses the pre-existing isolated
Python 3.13 environment (no backend or sidecar dependency changes):

```text
C:/Users/alex/AppData/Local/Temp/medcrm-finance-mcp-test-313/Scripts/python.exe -m pytest tests/finance_readonly -q
```

New tests exercise closed/default/invalid configurations, live synthetic reports
and access metadata, exact global server registration and route order without
importing production startup, fixed bootstrap identities, and fresh-process import
with FastAPI/backend imports and credential/network/listener access guarded.
All records, tokens and grants remain synthetic. This does not verify production
startup, Mongo topology or financial totals.

Rollback: remove the two backend reporting config variables and restart to restore
the closed router set; revoke both server grant records and disable the individual Paperclip
connection/profile; stop the sidecar/remove its exact proxy route; restore the
closed backend routers. Revert only the isolated commits if required. No payment,
salary, document or data rollback/migration is involved.
