# Code review: MedCRM `ref-2`

Static review of the backend on `ref-2` (reporting, finance MCP, authz around those paths, deploy). Frontend was read only where it calls report or auth APIs. No production host was called, no grant file was opened, and no secret value is copied into this document.

Reviewed surface: `backend/reporting/`, `tools/finance_mcp/`, `.github/workflows/deploy.yml`, CRM services report in `backend/routers/services_router.py`, auth in `backend/routers/auth.py` and `backend/server.py`, and the chat/webhook paths that sit next to those controls. Payroll payout accounting is noted and left closed.

This PR also removes a committed Metabase embedding key from `backend/routers/chat.py` (separate commit). Rotate that key in Metabase. It remains in git history.

## Executive summary

The finance MCP is built to fail closed: exact one-scope grants, hashed bearers, fixed origins, closed DTOs, and no patient fields in the reporting projections. That part is in good shape. The clinic data around it is not.

Two issues should be treated as urgent. A Metabase embed signing key was committed in `backend/routers/chat.py` (removed here; rotate the old key). `POST /api/auth/register` still issues a live patient JWT with no invite, and several report and chat routes accept any active user. A self-registered account can read patient names on the services-report detail API and can cause recent patient names and phones to be sent to OpenRouter.

Finance math for ledger receipts (summary and breakdown, Asia/Bishkek, half-open UTC bounds) is consistent and tested. `get_services_rendered` is not: `payment_status == "paid"` and proportional `paid_amount` are added together, so paid cash is overstated. The same formula is copied in the CRM UI report, which also filters calendar years in naive UTC rather than Asia/Bishkek. `get_amounts_due` ignores the requested period and returns current plan balances; the MCP client will also reject a realistic plan list because of a 32 KiB cap.

Paperclip grants and Grok OAuth do not see the same tools. Deploy clones one Paperclip token hash onto the three new finance scopes. Grok’s stored scopes stay `finance.summary.read` and `payroll.summary.read`. `LiveResolver` still unions role presets with custom permissions and ignores `permission_mode="explicit"`, which an in-repo test currently locks in.

## Critical

### C1. Metabase embed key was committed

- **Location:** `backend/routers/chat.py` (`METABASE_SECRET_KEY`, `generate_metabase_token`). Previously a literal HS256 key. This PR reads `METABASE_SECRET_KEY` from the environment and refuses to sign when it is unset. `backend/.env.example` documents the variable with an empty placeholder.
- **Why it matters:** Anyone with the repository can mint Metabase embed JWTs for the questions this server embeds (patient stats call `get_metabase_iframe_url(38)`). History still contains the old value, so deleting it from HEAD does not revoke it.
- **Suggested fix:** Rotate the key in Metabase, set `METABASE_SECRET_KEY` on the VPS, redeploy. Do not paste the old value into tickets or logs. Treat git history as exposed.

### C2. Open registration plus unscoped report and chat reads

- **Location:**
  - `backend/routers/auth.py` `register` — public `POST /api/auth/register`. The handler forces `UserRole.PATIENT` and returns a bearer JWT. No invite, staff approval, or clinic allow-list.
  - `backend/routers/services_router.py` `get_services_report`, `get_service_detail_report`, `get_services_report_filters` — dependency is only `get_current_active_user`. No `finance_view`, no role check.
  - `get_service_detail_report` loads treatment plans and returns `patient_id` and `patient_name` (from `patients.full_name` / first+last) plus expected and paid amounts.
  - `backend/routers/chat.py` `chat_with_ai` / `get_crm_context_for_ai` — any active user. The comment says recent patients are fetched without sensitive data; the projection is `full_name`, `phone`, `created_at`, and that payload is sent to OpenRouter. Doctor phone and email are included on doctor questions.
  - Frontend: `frontend/src/components/reports/ServicesReport.jsx` and `frontend/src/components/modals/ServiceDetailModal.jsx` call these routes with the stored bearer and do not check `finance_view`.
- **Why it matters:** A patient JWT is enough. Registration does not require an existing patient record (`patient_id` stays empty). The detail report is a clinic-wide patient list filtered only by service name. The chat path is an exfiltration route to a third party, and the model reply can echo the same names and phones back to the caller. Staff who are not finance users have the same report access today; the patient JWT makes it remote and unauthenticated in practice.
- **Suggested fix:** Disable public `register`, or require an already-authenticated staff user with an explicit permission. On the three services-report handlers, require `finance_view` (detail should require it as well, since it returns names). Stop putting names and phones in the LLM context; counts only. `GET /api/chat/test` is unauthenticated and should be removed. Do this in its own PR and smoke the services report with a finance user so the UI does not break.

## High

### H1. Paperclip `LiveResolver` ignores explicit permissions

- **Location:** `backend/reporting/live_access.py` `LiveResolver.__call__` builds permissions as `ROLE_PERMISSIONS[role] | custom_permissions`. It never reads `permission_mode`. `backend/reporting/grok_oauth.py` `current_owner` uses `permission_policy.effective_permissions`, which replaces the role preset when `permission_mode="explicit"`.
- **Locked in by:** `tests/finance_readonly/test_permission_compatibility.py` `test_known_explicit_admin_mismatch_is_conditional_on_a_separate_valid_grant`. An admin or super_admin whose explicit list is only `crm_view` still gets `authorize()` to succeed for `finance.summary.read` when a matching grant exists. `docs/permissions/REVIEW-RISKS.md` already marks this P1. It is still the code on `ref-2`.
- **Why it matters:** Revoking `finance_view` on the bound owner in the CRM does not revoke Paperclip finance MCP. Payroll is safer only because `payroll_view` is not in any role preset (`backend/models/staff.py`). Marketer with `crm_view` is denied, so this is specifically the admin/super_admin explicit case plus a live grant.
- **Suggested fix:** In `LiveResolver`, load `permission_mode` and call `effective_permissions`. Keep the active-user, clinic, agent, origin, and expiry checks. Update the compatibility test so the explicit admin without `finance_view` is `FORBIDDEN`. Do not widen grants in that PR.

### H2. `payment_status == "paid"` is added on top of proportional `paid_amount`

- **Location:** `backend/reporting/services_rendered.py` `calculate`. Lines that are `payment_status == "paid"` add the full `total_price` to `total_paid`. The same plan then adds `paid_amount * (service_total / total_cost)` for every other line that is not `"paid"`. The proportion uses the full plan `paid_amount`, not the residual after lines already marked paid.
- **Locked in by:** `tests/finance_readonly/test_p0_extensions.py` `test_multi_service_proportional_paid_and_paid_status`. Plan `paid_amount=100`, `total_cost=300`, Cleaning 100 paid, Filling 200 unpaid. The test expects Cleaning paid `100.00` and Filling paid `66.67` (`100 * 200/300`, half-up). Reported paid is `166.67` against `100` collected.
- **Why it matters:** `get_services_rendered` overstates cash and understates outstanding whenever a plan mixes a paid line with unpaid lines and `paid_amount` already includes the paid line. Negative outstanding is explicitly allowed (`LIMITATIONS`). The MCP tool description repeats this formula, so an agent will treat the numbers as collected revenue.
- **Suggested fix:** Pick one attribution. Either mark `payment_status == "paid"` at `total_price` and spread only `max(0, paid_amount - already_attributed)` across unpaid lines, or ignore `payment_status` and spread `paid_amount` once. Quantize per line, then check that the sum of `total_paid` for a plan does not exceed `paid_amount` unless the limitation is intentionally “over-allocated”. Replace the current test; do not keep the 166.67 expectation. The CRM copy of this formula is H3.

### H3. CRM services report disagrees with the MCP report and returns names

- **Location:** `backend/routers/services_router.py` `get_services_report` duplicates H2 with `float`. `get_service_detail_report` does not use `payment_status` at all; it always adds `paid_amount * (line / total_cost)`, including lines already marked paid. Summary and detail for the same service will not match.
- **Period:** The CRM filter is `datetime(year, 1, 1)` through the next year or month, naive. Plan `created_at` is `datetime.utcnow` (`backend/models/treatment_plan.py`). MCP `parse_period` (`backend/reporting/contract.py`) converts inclusive Asia/Bishkek dates to a half-open UTC interval, and `services_rendered.created_at_utc` treats naive timestamps as UTC. A plan created at 2026-01-01 02:00 in Bishkek is 2025-12-31 20:00 UTC: the MCP year 2026 includes it; the CRM `year=2026` filter excludes it. The first six hours of each Bishkek month move the same way.
- **Why it matters:** Staff using `ServicesReport.jsx` and an agent using `get_services_rendered` will quote different totals for the same month, and the detail modal’s patient-level paid figure is a third formula. Authz is C2.
- **Suggested fix:** One function for “paid on a service line”, shared by the CRM route and `services_rendered.calculate`. Build CRM bounds with `parse_period` (or the same `ZoneInfo("Asia/Bishkek")` conversion). Keep patient names on the CRM detail route only, behind `finance_view`. Leave ledger completeness out of this report; the limitation that it is not amounts-due is correct.

### H4. Amounts due ignores the period, then the MCP client drops the body

- **Location:** `backend/reporting/amounts_due.py` `calculate`. After `aggregate()` checks coverage, every in-clinic plan is included. There is no `created_at` or `occurred_at` filter. `date_basis` is `point_in_time_plan_balances`. The tool schema in `tools/finance_mcp/server.py` is still only `date_from` / `date_to`, same as the cash reports. The tool text does not say the dates do not select plans.
- **Size:** `tools/finance_mcp/core.py` `AmountsDueApi.max_bytes` is `32_768`. Each `PlanDue` is on the order of 120–150 bytes, so a few hundred plans (including fully paid ones; nothing drops `due_kzt == 0`) exceed the cap. The HTTP route does not enforce that cap. The MCP adapter then raises `SOURCE_CONTRACT_INVALID` and the tool returns an error with no amounts. `LiveReadAdapter.records` also stops at `MAX_RECORDS` (5000) and fails the whole snapshot.
- **Why it matters:** An agent that asks for “amounts due in October” receives every current plan balance, or a hard error once the clinic is large enough. Summary and breakdown do not have this problem; their payloads stay small and their windows are real.
- **Suggested fix:** State in the tool description and `LIMITATIONS` that the dates only prove coverage, not which plans are listed — or filter plans on a declared field and test it. Omit zero-due rows or paginate. Size the MCP cap to the declared `MAX_PLANS`, or fail in the API with `INCOMPLETE_ACCOUNTING` before the sidecar calls it a contract error. Do not invent a historical balance from `paid_amount` when the ledger is missing; the current refusal in `verify_finance_plan` is right.

### H5. One Paperclip bearer is cloned onto every new finance scope; Grok never receives those scopes

- **Location:** `tools/finance_mcp/ensure_p0_finance_grants.py` copies the active `finance.summary.read` row onto `finance.amounts_due.read`, `finance.breakdown.read`, and `finance.services_rendered.read`, including `token_sha256`. `.github/workflows/deploy.yml` runs that script on every push to `ref-2` before restart. `JsonGrantStore.decode_grants` allows the same hash on different scopes (`seen` is `(token_sha256, scope)`). `LiveResolver` matches hash and scope, so one `mcr_` secret passes all four finance routes.
- **Grok:** `backend/reporting/grok_oauth.py` `SCOPES` is only `finance.summary.read` and `payroll.summary.read`. Consent UI lists those two. `GrokResolver` requires `self.scope in row["scopes"]`. `configured.build_bound_routers` still mounts Grok resolvers for breakdown, amounts due, and services rendered, so those calls 403 for an `mgo_` token. `tools/finance_mcp/remote_access.py` `check_access` then omits those tools from `tools/list`.
- **Why it matters:** Deploy widens an existing summary credential without a new consent. Deactivating the summary row leaves the cloned rows live, so “revoke summary” does not revoke the token. Grok, which is the OAuth client this stack was built for, cannot call the P0 tools the recent commits added. Payroll is correctly left alone.
- **Suggested fix:** Stop cloning hashes on deploy. Issue distinct grants, or store one row with an explicit scope set and revoke that row as a unit. If Grok should see P0, extend `SCOPES`, the consent screen, and the state file in a migration that forces a new consent. If Grok should not, remove the unused Grok resolvers for those paths so a future scopes edit cannot turn them on silently.

### H6. Default JWT signing key and ~100-year remember-me tokens

- **Location:** `backend/routers/auth.py` and `backend/server.py` both use `os.environ.get("SECRET_KEY", "fallback-secret-key")` with `python-jose` HS256. `login` sets `expires_delta` to 36500 days when `remember_me` is true. Default access lifetime is 30 minutes (`ACCESS_TOKEN_EXPIRE_MINUTES`).
- **Why it matters:** If the VPS `.env` omits `SECRET_KEY`, anyone who can read this repo can forge staff JWTs. A stolen remember-me token is valid until the password-expiry check happens to fail (`get_current_active_user` compares `password_expires_at`, which is a separate clock from the JWT `exp`). There is no server-side revocation list.
- **Suggested fix:** Refuse to boot when `SECRET_KEY` is missing or equal to the historical default. Cap remember-me (days, not decades) and keep the password-expiry check. Confirm production is already overriding the default before the boot change, so deploy does not start a process with no key.

### H7. Telephony and Wazzup webhooks accept unauthenticated events

- **Location:** `backend/routers/telephony.py` `_handle_webhook_events` is documented as public. No HMAC or shared secret is checked (no `signature` / `hmac` use in that module). The handler logs the raw payload, matches phones to patients, and creates leads. `_download_call_record` GETs the link returned by the Zadarma API for a caller-supplied `call_id`; the host of that link is not allowlisted. `backend/routers/wazzup.py` `webhook_incoming_message` accepts an arbitrary JSON body and creates leads. `docs/permissions/REVIEW-RISKS.md` already lists both as P1.
- **Why it matters:** A spoofed call or WhatsApp event can write CRM leads and attach names to existing patients. The recording fetch is an outbound GET triggered by an anonymous request.
- **Suggested fix:** Verify the provider signature (Zadarma’s documented header, Wazzup’s secret) before any write. Allowlist the recording host. Do not log full payloads (phone numbers). Keep `/telephony/callbacks` authenticated as it is now.

## Medium

### M1. Snapshot reads assume a single clinic by rewriting missing `clinic_id`

- **Location:** `backend/reporting/live_source.py` `LiveReadAdapter.records`. The query is `{}` with `limit=MAX_RECORDS`. A row whose `clinic_id` is neither `None` nor the binding clinic raises `INCOMPLETE_ACCOUNTING` for the whole report. A row with no `clinic_id` is copied and stamped with `binding.clinic_id`. `DeploymentBinding.verify` requires `single_clinic_confirmed is True`.
- **Why it matters:** One foreign plan disables finance, amounts due, services rendered, and payroll together. Plans that never stored `clinic_id` are reported as this clinic. That matches a strict single-clinic deploy and breaks quietly if the database is mixed. `docs/permissions/REVIEW-RISKS.md` describes the same tenant gap for the main API.
- **Suggested fix:** Keep fail-closed on foreign ids. Log only a count, not ids, when the snapshot refuses. Do not stamp missing `clinic_id` until a one-off audit shows those rows are this clinic. No backfill in the reporting PR.

### M2. Service aggregation keeps the first category and the first unit price

- **Location:** `services_rendered.calculate` keys `groups` by stripped `service_name` only. Later rows with the same name add into that bucket and leave `category` and `price` as first seen. Empty names are skipped; names longer than 256 characters fail the report.
- **Why it matters:** Two consultations with the same label and different prices show one price and a blended total. Free-text `service_name` can also carry a patient name into the MCP payload even though the projection drops `patient_id`. The CRM report has the same key.
- **Suggested fix:** Key by `(service_name, category)` or by catalog id when present. Omit `price` when unit prices disagree, or return min/max. Reject or redact `service_name` values that match a patient-name pattern only if you already have a reliable signal; otherwise document the residual.

### M3. Credentialed CORS list is wider than the production UI

- **Location:** `backend/server.py` `CORSMiddleware`, `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`. Origins include `http://89.218.15.72:5173`, several localhost ports, and the literal string `https://*.emergentagent.com` (Starlette does not glob that). `allow_origin_regex` is `https?://localhost(:\d+)?`.
- **Why it matters:** Any browser origin on that public IP and port can make credentialed calls if a token is sent. The regex does not cover the DuckDNS site; production is presumably same-origin via the reverse proxy, so the extra origins are leftover dev entries. MCP CORS is separate and tighter (`tools/finance_mcp/http_server.py` allows `https://paperclips.duckdns.org` and `https://grok.com`, DNS-rebinding protection on).
- **Suggested fix:** Drop the IP and Emergent origins from the production process. Keep localhost only when an env flag is set.

### M4. Deploy restarts even when dependency install fails, and the API probe does not check status

- **Location:** `.github/workflows/deploy.yml`. `pip install -q -r backend/requirements.txt || true` swallows install failure. `systemctl is-active` after `sleep 3` is the backend gate. `curl` to `https://medcrm.duckdns.org/api/doctors` prints the code and does not assert it (`curl` without `-f` exits 0 on HTTP 500). The MCP loop is better: it requires HTTP 401 and a `WWW-Authenticate: Bearer` header on `POST /api/reporting/mcp` with `Origin: https://grok.com`. `appleboy/ssh-action@v1.2.0` is a moving tag. The workflow only deploys backend `ref-2`; frontend `main` is untouched.
- **Grant writer:** `ensure_p0_finance_grants.py` reads and replaces the grant file without `O_NOFOLLOW`. `JsonGrantStore.read` refuses symlinks and mode `o+rwx`. A symlink planted at `REPORTING_GRANT_FILE` would be followed by the deploy script and rejected by the reader, or worse, written through. The script’s path is taken from systemd or `backend/.env` on the server.
- **Why it matters:** A bad requirements change still restarts the old environment and the job stays green if the process binds. A 500 on `/api/doctors` still deploys. Grant integrity depends on the SSH user and the file mode, not on the same checks as the reader.
- **Suggested fix:** Remove `|| true`. Fail the job on pip error. Assert a cheap authenticated-less ready route (or `401` on `/api/doctors` if that is the intended liveness signal) and keep the MCP 401 check. Pin `appleboy/ssh-action` to a commit SHA. Open the grant file with `O_NOFOLLOW`, same as `JsonGrantStore`.

### M5. Grok OAuth state is single-process and pinned to one person

- **Location:** `backend/reporting/oauth_server.py`. Transactions and `Limits` live on the `OAuthServer` instance. Consent CSRF is the unguessable transaction id in the form (good; the `__Host-medcrm-grok-oauth` cookie is only deleted, not used as the secret). `request.client.host` is the rate-limit key. Behind one reverse proxy every caller shares that bucket (40/min per address, 5 logins/min globally). `validate_state` / `check_owner` require clinic `curai`, login `alex`, and both `finance_view` and `payroll_view`.
- **Why it matters:** Two uvicorn workers drop consent posts that land on the other worker (`transactions` is memory). A shared proxy IP locks the owner out after a few failures. A renamed login or a second clinic cannot use this client; failure is closed, which is safe and brittle.
- **Suggested fix:** Run the API as one worker until transactions are server-side and short-lived in the same root-only store as the grant. Key the limiter on the transaction after login, not only on the proxy address. Keep the pinned client id and PKCE checks.

### M6. Payroll reporting is intentionally incomplete

- **Location:** `backend/reporting/payroll.py`. `paid_kzt` and `outstanding_kzt` are `None`. `payout_status` is `unavailable_no_verified_payout_ledger`. Doctors with only `consultation_mode_unavailable` and proven zero accrual are omitted. Anything else incomplete raises `INCOMPLETE_ACCOUNTING`. `BoundedSalaryService` strips the UTC window to naive datetimes and calls `SalaryService`. `compensation.in_period` is inclusive on both ends (`start <= parsed <= end`); the reporting wrapper subtracts one microsecond from the exclusive end before that call. Appointment dates stored as calendar strings are parsed as naive midnights and compared to those UTC bounds.
- **Why it matters:** Accrual can move by hours at the Bishkek day boundary when the source timestamp is a date string rather than a UTC instant. Paid and outstanding must stay null. The omission of idle consultation rows is a product choice already encoded in `SAFE_IDLE`.
- **Suggested fix:** Document the date-string boundary next to `LIMITATIONS`. Add a test with an appointment on the Bishkek midnight that the summary window would exclude. Do not add a payout ledger, and do not infer debt from accruals minus unrelated payments.

## Low

### L1. Amounts-due payable can diverge from `total_cost` and then refuse

- **Location:** `amounts_due.plan_payable`. When every service has `total_price`, payable is `sum(max(0, total_price - discount))`, and `total_cost` is ignored. `funded()` counts receipts and `*_advance_allocation` / `*_deposit_allocation`. If that sum exceeds payable, or disagrees with `paid_amount`, the plan raises `INCOMPLETE_ACCOUNTING`.
- **Why it matters:** A discount already baked into `total_price` is subtracted again and the report goes blank for the clinic, not just that plan. Fail-closed is preferable to a silent total. The behavior should be visible in the limitation text.
- **Suggested fix:** If `total_cost` is present and disagrees with the service-row payable, refuse that plan with a distinct code in logs (count only). Do not fall back to `paid_amount` as cash.

### L2. JWT `sub` lookup order and password errors

- **Location:** `get_current_user` tries `users.id`, then `users._id` as a string, then `ObjectId`. `verify_password` prints the exception. `staff_service._hash_password` prints the password byte length.
- **Why it matters:** Low direct risk. Exception text and lengths do not belong in process logs next to auth. The dual id lookup is legacy and makes it harder to reason about which document a token hits.
- **Suggested fix:** Log a fixed message. Keep the lookup order until a migration collapses `id` and `_id`.

### L3. Reporting activation failure is silent

- **Location:** `backend/reporting/activation.py` `select_reporting_routers`. Any exception while reading `REPORTING_BINDING_FILE` / `REPORTING_GRANT_FILE` mounts the closed routers. It does not log the code `REPORTING_UNCONFIGURED`. The MCP sidecar (`tools/finance_mcp/http_bootstrap.py`) does refuse to start without a binding, so a bad grant file looks like “backend up, MCP 503/401” depending on which process failed.
- **Why it matters:** Operators can think deploy succeeded (MCP 401 only proves the sidecar is listening and rejecting bad bearers) while the API resolvers are the closed stubs.
- **Suggested fix:** Log a single static reason code at startup (no path, no JSON). Extend the deploy probe with an unauthenticated metadata check that returns 503 when reporting is unconfigured, if that can be done without creating a grant oracle.

## What’s solid

- **Bearer and grant shape.** `LiveResolver` accepts only `Bearer mcr_` plus 43 URL-safe characters, SHA-256, `compare_digest`, one matching row, active flag, owner/clinic/agent/origin/runtime equality, and expiry. `JsonGrantStore` is POSIX, absolute path, `O_NOFOLLOW`, regular file, mode with no group/other bits, 16 KiB, duplicate JSON keys rejected. Missing config becomes `REPORTING_UNCONFIGURED`, not an empty dataset.
- **Scope equality.** `access.authorize` requires `grant.scopes == frozenset({required_scope})` and `finance_view` or `payroll_view`. Tool arguments cannot supply clinic or subject. `GuardedEndpoint` rechecks access on every POST and rejects `mcp-session-id`, query strings, extra methods, oversized bodies, and unknown JSON-RPC methods.
- **MCP transport.** Fixed `API_ORIGIN`, `trust_env=False`, `follow_redirects=False` on the sidecar’s API client. Grok’s browser origin must present `mgo_`. Allowed hosts/origins are explicit. Report responses are `Cache-Control: no-store`. Error bodies are codes, not traces.
- **Grok OAuth.** Pinned client metadata (no runtime fetch), exact redirect URI, S256 PKCE, no refresh token, authorization-code only, one live code or token, consent transaction consumed on POST, owner re-read from CRM before the code is issued. The unprivileged sidecar does not open the OAuth file (`http_bootstrap.py`).
- **Receipt math.** `contract.parse_period` and `service.aggregate` use Asia/Bishkek inclusive dates as a half-open UTC window. Bishkek has no DST. Duplicate `event_id` with the same fingerprint is ignored; a contradictory duplicate is `SOURCE_DATA_INVALID`. Non-receipts (allocations, deposits, completions) are not counted as gross receipts. `breakdown` reuses `aggregate` totals and buckets the same events by local day. Tests cover the boundary (`test_finance_reporting.py`, `test_p0_extensions.py` breakdown).
- **Amounts-due ledger gate.** `verify_finance_plan` refuses legacy plans with `paid_amount` and no `accounting_events`. The MCP projection does not request patient names. Payroll sets `full_name` to `"withheld"` and does not infer payouts.
- **Default routers.** Importing reporting without the binding files mounts resolvers that always return `REPORTING_UNCONFIGURED`. A bearer-looking header is not treated as authentication there.
- **Deploy secret handling.** SSH key, host, and Telegram token are GitHub Actions secrets. The workflow does not echo the grant path or token hashes. The P0 script’s prints are counts and static errors.
- **Document download.** `documents.download_file` rejects path escape and checks patient ownership for `UserRole.PATIENT`. Raw `/uploads` is not mounted (`server.py`).

## Suggested next PRs

1. **Authz on reports and registration.** Close or staff-gate `POST /api/auth/register`. Require `finance_view` on `/api/reports/services-report` and the detail and filters routes. Remove patient names and phones from `get_crm_context_for_ai`. Delete `GET /api/chat/test`. Rotate the Metabase key and set `METABASE_SECRET_KEY` (the code change is already in this PR).
2. **`LiveResolver` uses `effective_permissions`.** Flip `test_known_explicit_admin_mismatch_is_conditional_on_a_separate_valid_grant` to expect `FORBIDDEN` for an explicit admin without `finance_view`. Re-run `tests/finance_readonly/`.
3. **Services paid formula.** Fix H2/H3 in one helper. New tests: mixed paid/unpaid lines cannot exceed plan `paid_amount`; Bishkek New Year boundary matches between CRM and MCP. Do not require a complete ledger for this report.
4. **Amounts due contract.** Either document point-in-time in the MCP tool text and drop zero-due rows, or define a real period field and test it. Align `MAX_RESPONSE_BYTES` with `MAX_PLANS` so a full clinic returns a report or a clear `INCOMPLETE_ACCOUNTING`.
5. **Grant model.** Stop hash cloning in `ensure_p0_finance_grants.py`. Decide whether Grok’s `SCOPES` include the P0 tools; if yes, new consent. Writer uses `O_NOFOLLOW`.
6. **Deploy probe.** Fail on `pip install`. Assert API and MCP status codes. Pin the SSH action. One-line startup log when reporting stays closed.
7. **Webhook signatures.** Zadarma and Wazzup, as already sketched in `docs/permissions/REVIEW-RISKS.md`. Allowlist recording hosts.
8. **JWT boot check.** No default `SECRET_KEY`. Shorten `remember_me`. Confirm the VPS env before merging.
9. **Tests still missing:** explicit-mode denial on the Paperclip resolver for breakdown, amounts due, and services rendered (not only summary); Grok token denied for P0 scopes; services-rendered total paid versus `paid_amount`; amounts-due period semantics; MCP response over 32 KiB; deploy grant script refuses a symlink. Payroll stays a refusal test, not a payout implementation.

## Coverage note

`tests/finance_readonly/` is strong for synthetic grants, OAuth, closed routers, and receipt boundaries. It does not protect the production permission resolver from explicit mode (it records the mismatch). It encodes the services-rendered over-count as success. CRM `get_services_report` has no twin test next to the MCP calculator. This review did not execute the suite.
