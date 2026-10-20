# MedCRM read-only reporting MCP

Local, not activated follow-up: see [HTTP-DEPLOYMENT-REVIEW.md](HTTP-DEPLOYMENT-REVIEW.md)
for the implemented Streamable HTTP sidecar, verified tests and remaining metadata/
access approvals. The deployed/default configuration described below remains closed.

Two stdio tools, one local MCP process. This release is deliberately **unconnected**
to production data. Deploying these source files does not install an agent, issue a
credential, grant access, or start a persistent MCP service.

| Tool | Fixed GET endpoint | Required agent scope | Current owner permission |
| --- | --- | --- | --- |
| `get_finance_summary` | `/api/reporting/finance/summary` | `finance.summary.read` | `finance_view` |
| `get_payroll_summary` | `/api/reporting/payroll/summary` | `payroll.summary.read` | `payroll_view` (new reporting contract; no existing rights changed) |

Both accept **only** `date_from` and `date_to`, exact `YYYY-MM-DD`, inclusive dates
in `Asia/Bishkek`, 1–366 days. Local midnight bounds are converted to a half-open
UTC interval. A trusted server-side resolver must supply the current owner, agent,
clinic membership and unexpired grant on every call. The model cannot supply those
identities, a URL, headers, SQL, Mongo queries, scope or timezone. This slice requires
separately resolved, exactly scoped grants for the two reports; broad extra scopes
are rejected. There is no credential issuer or live grant resolver in this release.

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
2. Implement an audited current-owner/grant resolver and read-only source adapter
   that prove coverage and legacy completeness. The current injected interfaces
   are contracts, not proof of source isolation. Payroll must reuse SalaryService
   over the bounded, verified clinic snapshot; never call the broad legacy salary
   route as an authorization shortcut. Do not expose patient records to the MCP.
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
