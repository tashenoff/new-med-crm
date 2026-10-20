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

The backend metadata router is included only by explicit `build_bound_routers`.
`backend/server.py` is unchanged, so published/default routes stay closed.
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

Still verify without secrets/medical documents:

1. Resolve only login alex to its canonical user ID and matching active staff UUID,
   current finance/payroll permissions and expiry. Do not infer owner ID from the
   login or create/repair staff records automatically.
2. Confirm the actual database namespace and Mongo version/topology supports
   snapshot sessions. Name curai is not a DB namespace. Choose/approve the clinic
   binding ID explicitly; no real binding config has been populated.
3. Check server Python version, service account, protected grant-file ownership,
   proxy routing and a free loopback port for the sidecar. Production Linux wheels
   and startup must be verified on that platform before enabling the service.
4. Verify the installed Paperclip version's remote credential references and
   per-agent profile behavior. Current UI showed zero tools/apps/profile; discovery
   or health alone does not prove target-agent access or credential forwarding.

## Exact staged deployment plan — all future actions

1. Review this commit plus 8a74337 against current production ref-2. Publish only
   those isolated changes after approval and checks. No schema migration is needed.
2. In the existing backend, **replace**, do not append to, the two closed router
   registrations with `build_bound_routers(existing_db, approved_binding,
   JsonGrantStore(approved_absolute_path))`. This includes the protected metadata
   route. Retain closed defaults whenever the approved config is absent. Duplicate
   route registration would leave the earlier closed handlers shadowing the live ones.
3. Provision a separate sidecar venv from the official registry and locked versions.
   Run a reviewed ASGI bootstrap that explicitly calls `create_http_app(binding)`.
   Binding file/bootstrap contains non-secret metadata only. Do not inject the
   MedCRM Mongo URI, owner password or service credential into this process/env.
4. Bind the sidecar only to a verified free loopback port (proposed 8766, not yet
   checked). Add an exact HTTPS proxy location `/api/reporting/mcp` on the existing
   MedCRM host, preserving the path and Host. No new public port. Keep the existing
   report endpoints on the CRM backend. Review service/proxy changes separately;
   no such configuration is installed now.
5. Only after explicit access approval, provision one agent-specific opaque bearer
   (`mcr_` plus 43 URL-safe characters) through the normal secret mechanism; server
   stores SHA-256 only in the protected revocation file. Two exact grant records,
   same approved owner/clinic/agent, one scope each, expire seven days after issue.
   No issuer or actual grant/credential exists in this change.
6. In Paperclip, create the remote connection for the actual MCP URL
   `https://medcrm.duckdns.org/api/reporting/mcp`, attach the secret by credential
   reference, and review **only these two tool catalog entries**. Select only the
   financier agent's individual installation/grant/profile; no organization-wide
   installation/grant, broad risk-level include or automatic grant to other agents.
   If the UI cannot keep access individual, stop before saving and choose a safer path.
7. Verify HTTPS handshake/list, anonymous and wrong-agent denial, target-agent
   credential forwarding, each scope, immediate revocation and expected worker SHA.
   Do not equate connector discovery/health with a working authorized report. Real
   report totals still require approved accounting validation; legacy source gaps
   return an explicit refusal. No patient detail retrieval is part of verification.

Approval request after metadata is resolved: allow only the specified financier
to read finance and accrued-payroll reports for curai under the verified alex owner,
on the fixed MedCRM MCP URL, with two scopes `finance.summary.read` and
`payroll.summary.read`, seven-day expiry and immediate revocation. Persist the raw
credential only in Paperclip's secret store. Include explicit `payroll_view`
assignment to that owner if needed; no role/default-permission changes. Salaries
remain total plus doctor-ID rows; paid/outstanding stay unavailable, with no write
or payment/payout capability.

Rollback: revoke both server grant records and disable the individual Paperclip
connection/profile; stop the sidecar/remove its exact proxy route; restore the
closed backend routers. Revert only the isolated commits if required. No payment,
salary, document or data rollback/migration is involved.
