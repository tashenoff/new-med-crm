# MedCRM read-only reporting MCP

The scoped Grok OAuth implementation and synthetic verification are documented in
[GROK-OAUTH-OPERATIONS.md](GROK-OAUTH-OPERATIONS.md). This is a local candidate:
production deployment, the current alex identity and the actual Grok callback
round-trip have **not** been verified. Existing Paperclip binding, credential and
grant-file format are preserved. Grok uses the published CIMD URL
`https://grok.com/oauth/mcp-client.json` as client_id, only its web callback,
and 30-day explicit consent with no refresh or automatic renewal. Nginx/forwarded
header changes below are an operations contract to apply and verify later.

Configuration-driven activation is implemented locally; see
[HTTP-DEPLOYMENT-REVIEW.md](HTTP-DEPLOYMENT-REVIEW.md) for the Streamable HTTP sidecar
and remaining deployment/access approvals. Production activation is not verified;
the default configuration remains closed.

Five stdio tools, one local MCP process. This release is deliberately **unconnected**
to production data. Deploying these source files does not install an agent, issue a
credential, grant access, or start a persistent MCP service.

| Tool | Fixed GET endpoint | Required agent scope | Current owner permission |
| --- | --- | --- | --- |
| `get_finance_summary` | `/api/reporting/finance/summary` | `finance.summary.read` | `finance_view` |
| `get_finance_breakdown` | `/api/reporting/finance/breakdown` | `finance.breakdown.read` | `finance_view` |
| `get_amounts_due` | `/api/reporting/finance/amounts-due` | `finance.amounts_due.read` | `finance_view` |
| `get_services_rendered` | `/api/reporting/finance/services-rendered` | `finance.services_rendered.read` | `finance_view` |
| `get_payroll_summary` | `/api/reporting/payroll/summary` | `payroll.summary.read` | `payroll_view` (new reporting contract; no existing rights changed) |

Both accept **only** `date_from` and `date_to`, exact `YYYY-MM-DD`, inclusive dates
in `Asia/Bishkek`, 1–366 days. Local midnight bounds are converted to a half-open
UTC interval. A trusted server-side resolver must supply the current owner, agent,
clinic membership and unexpired grant on every call. The model cannot supply those
identities, a URL, headers, SQL, Mongo queries, scope or timezone. This slice requires
separately resolved, exactly scoped grants for the five reports; broad extra scopes
are rejected. The existing live resolver is selected only by explicit backend
configuration below. Only the separately provisioned Grok public client has an
OAuth issuer; no Paperclip credential issuer is added.

## Explicit activation configuration

| Process | Variable | Required value |
| --- | --- | --- |
| Existing CRM backend | `REPORTING_BINDING_FILE` | Absolute path to the separately provisioned non-secret binding JSON |
| Existing CRM backend | `REPORTING_GRANT_FILE` | Absolute path to the separately provisioned protected grant file |
| Separate HTTP MCP sidecar | `FINANCE_MCP_BINDING_FILE` | The exact same absolute binding-file path as `REPORTING_BINDING_FILE`; copies are not supported |

The binding must be UTF-8 JSON, at most 16 KiB, with **exactly** these four fields.
This example is synthetic, not a real deployment binding:

```json
{
  "clinic_id": "synthetic-clinic",
  "owner_id": "synthetic-owner",
  "database_namespace": "synthetic-database",
  "single_clinic_confirmed": true
}
```

Clinic and owner must satisfy `DeploymentBinding` identifiers; the database namespace
must be a nonempty string and match the existing backend database. Confirmation must
be the JSON boolean `true`. Missing/extra/duplicate fields, coercible types, non-JSON
constants, invalid UTF-8 and malformed/oversized JSON are rejected. Fixed API origin,
agent and Paperclip runtime come from existing code; the file cannot override them.
Never put credentials, tokens or grants in this binding file.

The backend passes its existing `db` and environment to `select_reporting_routers`.
The helper reads only the two `REPORTING_*` keys above. Absent, partial, relative,
unreadable, malformed or invalid binding configuration (including a namespace
mismatch) selects the original two closed routers: anonymous requests get 401,
bearer-looking requests get 503 `REPORTING_UNCONFIGURED`, and
`/api/reporting/access` is absent. Configuration failures emit no values or exception
text and do not prevent general CRM startup. Valid configuration replaces those
registrations with finance, breakdown, amounts-due, services-rendered, payroll, access and backend OAuth
routers, in their original position. The root-running backend owns authorization, token, revocation and discovery;
the unprivileged sidecar serves only `/api/reporting/mcp`. It creates no new Mongo client and changes no database lifecycle.

The grant path is validated as absolute at startup; grant contents are **not** read
until a request. The existing `JsonGrantStore` then enforces Linux ownership, mode,
size and no-symlink requirements on every read. Missing/invalid/inaccessible grants
still refuse access, even when the three bound routes are registered. No Windows
ACL fallback or permission/authentication policy change is introduced.

The sidecar entrypoint is `tools.finance_mcp.http_bootstrap:app`. It reads only
`FINANCE_MCP_BINDING_FILE` for configuration and calls `create_http_app(binding)`.
Absent/invalid metadata refuses sidecar import/startup with the fixed
`REPORTING_UNCONFIGURED` error; the separate `tools.finance_mcp.http_server:app`
entrypoint remains unconfigured by default. Neither import starts a listener,
imports the CRM server, reads `.env` or DB credentials, nor requires FastAPI.
Uvicorn owns the listener. Example Linux launch after separate provisioning and
review (the shown loopback port must first be checked):

```sh
env -i PATH=/usr/bin:/bin FINANCE_MCP_BINDING_FILE=/etc/medcrm/finance-mcp/binding.json \
  /opt/medcrm/finance-mcp/venv/bin/python -m uvicorn tools.finance_mcp.http_bootstrap:app \
  --app-dir /opt/medcrm/new-med-crm --host 127.0.0.1 --port 8766 \
  --proxy-headers --forwarded-allow-ips=127.0.0.1
```

Use the separate sidecar venv and reviewed HTTP requirements/lockfile. Never inherit
the backend environment, pass `MONGO_URL`, CRM credentials, a static bearer token,
`REPORTING_GRANT_FILE`, or mount the Paperclip grant file into the sidecar. Grok uses
its own root-only hash state at `<binding parent>/grok-oauth/grok-oauth.json`,
read and written only by the backend, as detailed in the OAuth operations document.
The shared binding path must be exact, not an identical copy elsewhere. Request credentials continue to be transiently forwarded by the HTTP transport. No service,
proxy, key, grant or production connection is installed by this implementation.


`get_services_rendered` aggregates treatment-plan service lines by trimmed `service_name` for plans whose `created_at` falls in the requested period. Paid uses per-line `payment_status` and proportional `paid_amount`/`total_cost`; it does **not** require ledger completeness (unlike amounts due).

## What the numbers mean

Finance is **gross recorded direct treatment-plan receipts**, not total cashflow,
profit, net receipts or revenue. It adds explicit `service_receipt`,
`component_receipt`, `session_receipt` and `plan_advance` amounts by `occurred_at`.
It excludes allocations of existing money, patient-deposit assignments, list
prices, plan `paid_amount`, completions, booking deposits, refunds and expenses.
Unknown event kinds, contradictory duplicate IDs, invalid money, missing clinic
identity or incomplete source coverage return an error without amounts. Empty
results are zero only when complete source coverage has been independently proven.

Payroll projects the **existing** `SalaryService` calculation onto clinic-scoped,
detached records. Tariff formulas, stored snapshot verification and earning rules
are unchanged. Only period selection receives explicit UTC bounds (inclusive end
minus one microsecond for the existing engine). Output contains opaque doctor IDs
and accrued KZT; no names, specialties, contacts, bank details, rates, patients or
raw accounting blockers. Existing accounting gaps return an error without amounts.
This remains the existing engine's doctor selection (`is_active=True`) and earning
policy; it is not proof of all historical/inactive-doctor liabilities.

No verified salary payout ledger or opening liability balance was found in the
inspected backend. Consequently `paid_kzt` and `outstanding_kzt` are **null**, with
`payout_status=unavailable_no_verified_payout_ledger`. Zero payments or a debt are
never inferred. This is accrued compensation under existing rules, not proof that
money was paid to a doctor.

KZT amounts are exact two-decimal strings. Coverage and data-source provenance are
explicit. Sources exceeding the bounded contract fail closed. HTTP responses use
`Cache-Control: no-store`; the MCP validates bounded closed DTOs and strips internal
owner/agent/clinic identity before returning tool content. No generic HTTP or
database tool exists.


## P0 additions

`get_finance_breakdown` reuses the same period rules and coverage proof as
`get_finance_summary`, returning Asia/Bishkek day buckets and event-kind buckets
that sum to the summary totals.

`get_amounts_due` reports current clinic treatment-plan amounts due: opaque
`plan_id` plus payable/funded/due KZT. Patient PII is never projected. Legacy or
contradictory plan balances fail closed with `INCOMPLETE_ACCOUNTING`.

`get_payroll_summary` still never invents `paid_kzt` / `outstanding_kzt`. Doctors
whose only gap is an idle `consultation_mode_unavailable` with zero period activity
no longer poison an otherwise complete clinic accrual.

## Synthetic verification

From the repository root, using the already verified Python environment:

```text
python -B -m unittest discover -s tests/finance_readonly -v
python -B tools/finance_mcp/server.py
python -B tools/finance_mcp/server.py --demo
```

Default stdio lists both tools but refuses calls with `REPORTING_UNCONFIGURED`.
`--demo` owns an ephemeral `127.0.0.1` HTTP stand and uses synthetic identities,
events and doctors only. It does not connect to an existing CRM port, Mongo or
production URL. Synthetic fixed-tariff consultations demonstrate 250.00 accrued
KZT; the finance fixture demonstrates 280.00 KZT (200 receipts + 80 advances).
The test suite also verifies a real stored treatment-plan compensation snapshot.

Verified runtime: Python 3.13, MCP SDK 1.5.0, Pydantic 2.10.6, HTTPX 0.28.1,
FastAPI 0.100.0, Uvicorn 0.23.0, existing Motor/PyMongo import dependencies.
The backend's production requirements already provide FastAPI/Pydantic/tzdata;
no backend dependency changes or database migrations are introduced. Optional MCP
runtime requirements are in `requirements-demo.txt`; they are not installed by
the backend deployment workflow. The old 19 October appointment-summary prototype
is preserved; this server follows its stdio → HTTP boundary with separate contracts.

## Before real access

Current production defaults are intentional: anonymous GET returns 401; a bearer-
looking value cannot authenticate and returns 503 `REPORTING_UNCONFIGURED`.
Neither path reads business records. A denial or successful demo is not evidence
of functioning production reporting.

1. Establish an auditable clinic boundary. Current CRM source lacks a trustworthy
   clinic identifier/membership filter. Either prove the configured database is
   exclusively the named clinic and bind it on the server, or design a verified
   record-to-clinic mapping. Do not label all records from an agent-supplied ID.
2. Review the implemented current-owner/grant resolver and read-only source adapter
   against the approved deployment and verify coverage and legacy completeness.
   Synthetic tests are not proof of production source isolation. Payroll reuses
   SalaryService over the bounded clinic snapshot; do not substitute the broad
   legacy salary route or expose patient records to the MCP.
3. Separately approve any real service identity, credential, membership mapping,
   grant/scope and persistent host configuration at action time. None are created
   or modified here. A grant must be revocable and checked on every tool request.
4. Verify business totals against an approved accounting reference. Establish a
   payout ledger and comparable opening/closing balances before adding paid/debt.

## Release and rollback

Publish only this slice on current `ref-2`, through the existing GitHub Actions
`Deploy MedCRM to VPS` workflow. The base for this change is
`c48cdc3704b24a09d797ccefd12bb271c08f9e1a`. Changes are new reporting/MCP/tests/docs
plus router registration in `backend/server.py`. No database shape, payment writer,
salary formula, old endpoint, existing permissions or deployment settings change.

Rollback is a normal revert of the isolated release commit on the latest `ref-2`,
followed by the same workflow; preserve any intervening commits. No data rollback
or migration is required. Confirm workflow server HEAD/restart, anonymous access
boundary and public frontend availability. CI success and anonymous 401 prove
deployment/reachability, not active financial integration or worker-SHA attestation.
