# Local resolver/read-adapter review — not deployed or activated

Follow-up: Streamable HTTP is now implemented and tested locally; see
[HTTP-DEPLOYMENT-REVIEW.md](HTTP-DEPLOYMENT-REVIEW.md). User supplied login alex and
clinic name curai after this resolver review; canonical owner ID/database namespace
remain unverified. Historical transport TODOs below are superseded by that follow-up.

Base: published `be7f09d26cd5ae02638c2d991005ac86c0ee3997`.
Local branch: `feat/reporting-live-adapters`. Existing `server.py` registration is
unchanged: production/default routes remain closed. No credentials, grant files,
service accounts, app connections, access profiles or runtime configuration were
created. No production database or business endpoint was contacted in this phase.

## Verified identity and clinic assumptions

The user confirmed this MedCRM deployment serves exactly one clinic. API target:
`https://medcrm.duckdns.org`. Confirmed Paperclip target:
`https://paperclips.duckdns.org/MED/agents/7923c1ec-bf35-4cc4-adff-91c85fe660f1/runtime`.
Parent's UI verification identified organization MedCrm (slug MED), agent Финансист,
Codex/ACP runtime, zero permitted tools/apps and no active access profile. The
organization's display name is not assumed to be the clinic's legal name or ID.

Still unknown and intentionally unset: existing CRM owner ID, clinic ID/name and
actual database namespace. `DeploymentBinding` requires those explicit values,
the single-clinic confirmation and the exact API/Paperclip/agent anchors. It
rejects a namespace mismatch on every call. Legacy records without clinic labels
can be bound only after that server-side single-database binding is verified;
an explicitly different clinic label is always refused.

## What is implemented locally

- `backend/reporting/live_access.py`: actual request resolver. Checks an opaque
  bearer against separately provisioned one-way token hashes, then reads fresh
  current owner/staff/grant status for every call. Identity and scope are never
  taken from model/query/identity headers. Each fixed report selects one exact
  scope. Two grant records may refer to the same single-agent credential.
- Owner linkage follows the real `StaffService.create_staff_member` path:
  `users._id` and `staff._id` share one UUID. Canonical `users.id` is supported
  when present, but conflicting/duplicate users or staff links are refused.
  `staff.user_id`, if populated, must agree. No name/email matching, synthesized
  staff, migration, admin bypass or implicit permission fallback exists.
- Only projected identity metadata is read: IDs, active status, password expiry,
  staff role and custom permissions. Password hashes, names and contacts are
  excluded. Effective rights use current `ROLE_PERMISSIONS + custom_permissions`.
  New enum `PAYROLL_VIEW` permits an explicit future assignment; no role is granted
  it by default and no actual owner record is changed.
- `grant_store.py`: real bounded JSON revocation-store reader, exact schema,
  duplicate-key rejection, no issuance/writes. Linux file must be a regular,
  non-symlink file, owned by root/effective service UID with no group/other bits.
  The file path and contents are not provisioned. Windows fails closed.
- `live_source.py`: fixed projected reads from treatment plans, doctors and
  appointments using the supplied existing backend DB object. No client creation,
  patient collection, arbitrary queries, writes or credential/config discovery.
  Requires `start_session(snapshot=True)`; unsupported topology yields a sanitized
  refusal, never a fallback to inconsistent reads. Deployment support remains
  unverified. Reads are capped at 5,000 documents per collection, 2 seconds per
  query, bounded nested content and 50,000 financial events.
- Finance scans the declared recorded-ledger source, converts naive BSON UTC
  timestamps explicitly, verifies known stored paid/funding balances and target
  coverage, rejects unknown events, contradictory IDs, foreign clinic labels,
  legacy receipt arrays and ambiguous deposit aliases. It does not infer missing
  receipts from prices, created_at or paid_amount. Historic inconsistencies may
  conservatively refuse the whole requested report, even outside its dates.
- Payroll projects only accounting/compensation data into the existing salary
  engine. Doctor names are not fetched; an internal constant satisfies its old
  DTO. Output remains total accrued plus per-doctor IDs/accrual, not merely an
  anonymous clinic total. Paid and outstanding remain unavailable/null: payout
  events, matching liabilities and opening balances are not established.
- `configured.py`: explicit factory for bound routers, deliberately unmounted.
  `tools/finance_mcp/live_client.py`: fixed-target authenticated REST client factory,
  deliberately uninstalled. It is not a remote MCP server or a URL transport.

## Tests and evidence limits

68 tests passed, 0 failed. New tests execute the actual resolver/source classes
against projected in-memory collections, synthetic grants and a synthetic token.
They cover both tools end-to-end through ASGI, live revocation, current owner/staff
rights, absence of implicit payroll rights, ambiguous mappings, target and namespace
mismatch, unknown snapshot support, shared snapshot identity, BSON boundaries,
advance totals, legacy refusal, collection bounds, no writes/PII, closed grant schema
and protected-file metadata checks. No real grant file is written; Linux permission
checks use mocked file descriptors. Earlier real stdio → synthetic loopback tests
also remain green. This does not establish live Mongo compatibility, accounting
completeness or an installed Paperclip tool connection.

## Remote transport and individual access

The current server is stdio-only. The verified MCP SDK 1.5.0 has legacy HTTP+SSE,
not Streamable HTTP. Paperclip's current public source explicitly uses Streamable
HTTP with initialize → initialized notification and per-request protocol headers:
https://github.com/paperclipai/paperclip/blob/master/server/src/services/mcp-http.ts

Choose **Streamable HTTP** for the next remote endpoint implementation. That HTTP
server and a compatible isolated MCP runtime still need implementation/testing;
the installed Paperclip version's compatibility also remains to be verified.
No existing REST report URL is an MCP URL. A proposed future route is
`https://medcrm.duckdns.org/api/reporting/mcp`; it does not exist in this release.

Before granting anything, test the HTTP handshake, tools/list and tools/call on
synthetic data, authentication/expiry/revocation on every request, exactly the two
tools, and explicit denials for another agent. Do not treat connection discovery
or connector health as a successful call by the target agent. Paperclip must bind
credential references and an explicit two-tool access profile only to Финансист;
do not create an organization-wide grant or a broad risk-level include. If its
connection flow cannot avoid widening access, stop for a different setup choice.

## Next information and eventual approval

One information question: which existing MedCRM account owns the agent's rights
(non-secret login/ID), and which clinic name/ID should the confirmed single-clinic
deployment be bound to? Database namespace and snapshot capability must then be
verified through non-secret deployment metadata, without reading `.env` or records.
If that owner lacks an unambiguous active staff link, stop rather than create or
repair identity records automatically.

After the transport/review and identity details are complete, a concrete action-time
approval should name:

- only agent `7923c1ec-bf35-4cc4-adff-91c85fe660f1` in MedCrm/MED at the runtime URL
  above, the confirmed CRM owner and clinic, and the fixed MedCRM API/MCP target;
- one opaque service credential, server-side hash only, secret stored through the
  normal Paperclip secret mechanism and accessible only through this agent's profile;
- two revocable exact scopes `finance.summary.read` and `payroll.summary.read`,
  proposed seven-day expiry; current owner must have `finance_view` and explicitly
  approved `payroll_view` (any permission assignment is itself part of approval);
- only `get_finance_summary` and `get_payroll_summary`; no patient details,
  salary payouts/debt claims, old APIs, direct Mongo, payment changes or other tools;
- the exact server binding/revocation-file location and individual Paperclip
  connection/profile settings. No issuer, credential value or real grant exists now.

No new publication is authorized by this review document. Finish the HTTP transport
and inspect the concrete diff before requesting real activation approval.
