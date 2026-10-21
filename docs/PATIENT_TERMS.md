# Patient terms acknowledgement (local preparation)

Backend branch: `codex/patient-terms-backend`, based on `ref-2` at `892de9f`.
Frontend branch: `codex/patient-terms-frontend`, based on `main` at `684cd18`.
These branches must be reviewed/applied separately; do not merge the entire
backend branch into the frontend branch (or the reverse). No push/deploy is part
of this work. The old `production-reporting-readonly` checkout was not modified.
No repository AGENTS.md or .agents/skills were present in either remote branch
or the workspace ancestry inspected for this task.

## Behaviour and security

The public entry point is `/consent/#<random bearer>`, outside the CRM shell.
Using the URL fragment is intentional: the token never enters page GET URLs,
access logs or Referer headers. API lookup is a read-only POST carrying the
token in the request body; only POST `/api/public/patient-terms/accept` with a
strict boolean `acknowledged: true` can accept. No identity, phone, medical data,
CRM auth credentials, analytics or third-party assets are loaded by this page.
Vercel headers provide no-store, no-referrer, noindex and a restrictive CSP.
Equivalent headers are required if another host serves the frontend. Do not
enable request-body capture for the two public API endpoints in APM/proxy logs.

Links are 256 random bits (`secrets.token_urlsafe(32)`). Only SHA-256 hashes are
stored. WhatsApp history/chat previews and nested webhook data redact links;
the original text exists transiently for submission to Wazzup and naturally in
the recipient/provider's WhatsApp copy. Admin APIs never return bearer links.
The action records the acknowledgement of a link holder, not a verified person
and not medical consent. The included document is explicitly a demonstration.

Mongo collections, all scoped to `CONSENT_CLINIC_ID`:

* `patient_terms_documents`: immutable version, title, exact text, SHA-256 and
  demonstration flag. Reusing a version with changed text fails closed.
* `patient_terms_tokens`: hash, separate acceptance binding, revocation epoch,
  issue/expiry time. No patient status or raw bearer.
* `patient_terms_acceptances`: deterministic clinic/patient/version identity,
  exact document snapshot, revocation epoch and server `accepted_at`. One atomic
  Mongo CAS checks the epoch and expiry with `$$NOW`, and writes `$$NOW`. This
  works on standalone MongoDB without transactions. Repeated/concurrent POSTs
  return the same accepted timestamp. Each version has its own immutable event;
  accepted versions are never overwritten. Status means accepted *current*
  version; history includes previous versions.
* `appointment_notifications`: one unique `_id` per stored appointment event,
  submission state and provider message ID. It contains neither body nor bearer.

GET/lookup never creates or updates an acceptance. Invalid links return 404,
expired/revoked pending links 410. A used, non-revoked link shows its original
acknowledgement and cannot create another event. Already used links may continue
to show that non-personal receipt after expiry; expiry only permits/prevents a
new acknowledgement. A deleted/moved patient cannot be acknowledged.

There is no general multi-clinic tenant model in the current auth/patient
schemas. The existing deployment boundary is one database per clinic. Configure
a stable consent clinic ID for that database; never reuse one shared database
as a multi-tenant rollout without a broader authorization design. Explicit
patient/user `clinic_id` mismatches fail closed. Admin, super_admin and
administrator can read status/revoke pending links; doctors can read only for
patients with their own appointment. Marketers/patient accounts cannot query
this staff endpoint. Public responses contain no patient identifiers.

## Configuration and rotation

Set backend `CONSENT_PUBLIC_BASE_URL=https://curai.asia` (or a separately hosted
trusted origin). It must be an HTTPS origin without path, query, fragment,
credentials, private IP or malformed port. It is never constructed from `Host`.
It defaults to empty: no link is submitted until configured. Explicit
`CONSENT_ALLOW_LOCALHOST=1` permits HTTP localhost for isolated development only;
leave unset in production. `CONSENT_TOKEN_TTL_HOURS` defaults to 168 (7 days),
bounded to 1–2160. `CONSENT_CLINIC_ID` defaults to `clinic`; set it deliberately
once before use and do not change it after acceptances exist.

Frontend `VITE_BACKEND_URL` is the existing backend API origin. The public page
uses fetch with credentials omitted and no-referrer. CORS must allow its chosen
origin (curai.asia/www.curai.asia are already in the backend allowlist).
Read-only HTTPS check on 2026-10-21 returned 200, server Vercel and title
`Medical CRM | HMS + CRM` from curai.asia; repository SPA rewrite supports this
public route. No DNS, custom domain, provider template or hosting was changed.

To publish a new document, add a new version in the server document definition
and retain the old persisted snapshots. Old links keep their exact old text;
accepting an old version does not mark a new version accepted. The next booking
automatically includes a link for an unaccepted current version.

`POST /api/patients/{id}/terms/revoke-links` invalidates all outstanding pending
versions for that patient by atomically increasing their epochs; accepted events
are untouched. After revocation/expiry, a *new appointment event* can issue a new
link. Replaying an already submitted appointment must never send another message.
There is intentionally no separate reminder/resend UI or background sender.
For support-driven resend, first reconcile the original provider outcome and
design an explicit new event; do not delete notification locks to force a retry.

No automatic retention cleanup is enabled. A future reviewed retention policy
may delete expired token rows (then links return invalid instead of expired),
but must retain accepted document snapshots/events and notification dedup keys.
For expected growth add non-unique indexes to the new collections during the
publication maintenance procedure: acceptances `(clinic_id, patient_id,
accepted_at)`, tokens `(acceptance_id)`. Correctness uses Mongo's default unique
`_id` indexes and does not depend on these performance indexes.

## Appointment/WhatsApp integration

All four insert paths are covered: calendar POST `/appointments`, lead scheduling,
lead-to-HMS conversion, client-to-HMS conversion. The existing created-message
text contains the booking date/time and appends the link in that *same* message.
If several created rules are active, the first rule sorted by rule ID is used;
only one message is submitted. With no active rule, notification remains disabled
as before. This change does not enable any notification rule automatically.

The current code calls Wazzup `POST message` with plain `text`, not `send_template`.
No externally approved template is changed. Live account/channel type and
provider policy were not queried: no real credentials or sending were used in
tests. Before publication verify that the selected live channel accepts this
plain-text booking message with a URL. If that channel requires an approved
provider template, its booking template needs a URL parameter and approval;
that external configuration remains a publication prerequisite.

Preparation errors happen before the durable submission claim and may safely be
retried. After the claim, only one provider request can run, including concurrent
replays for that appointment. Provider acknowledgement with message ID records
`submitted`, never `delivered`. Transport/API error records `unknown`; a crash
may leave `submitting`. Both suppress automatic resubmission because the existing
provider integration offers no verified idempotency contract. Operator/provider
reconciliation is necessary for these states. This is at-most-once submission,
not a promise of exactly-once external delivery. Existing appointment conflict
checks still reject sequential duplicate bookings; this feature does not redesign
the legacy appointment-creation transaction or add financial idempotency logic.

## Interface and refresh

The dismissible narrow row is a direct sibling beneath the selected-chat header
in WhatsAppInbox, never in the chat list. Dismissal is a per-patient in-memory
set for this tab/session; it does not write to the API. The patient card always
shows current status/date/version and expandable acceptance history.
Both surfaces fetch server status every 10 seconds while visible/open. They
abort/ignore old requests on patient changes, clean timers/listeners on unmount,
pause in a hidden tab and refresh on visibility. Separate browsers therefore
observe acceptance without a page reload or local-only browser event.

## Verification and reproducibility

Use a dedicated disposable MongoDB on `127.0.0.1:27163`; never the clinic's port
or DB. `tests/patient_terms/test_patient_terms.py` pins that endpoint and creates
a unique `consent_synthetic_<uuid>` per test, drops only that synthetic database,
and mocks Wazzup submissions. Run from repo root:

```powershell
python -m unittest discover -s tests/patient_terms -v
```

17 tests passed on real standalone MongoDB 7.0.24: unchecked/missing/string
confirmation; GET/read-only lookup; invalid/expired/revoked/deleted patients;
24 concurrent acceptance calls; revocation/expiry race CAS; patient/version
separation; immutable history; hash storage and redacted actual transport persistence; authentication/role/clinic isolation; one message
despite duplicate rules and concurrent/retried dispatch; accepted patient without
link; uncertain provider failure; safe preparation retry; all four creation paths.

Frontend full suite passed sequentially: **542/542**. A parallel run encountered
Node test-runner `Unable to deserialize cloned data` in patientLifecycle; its
selected tests and the complete sequential run passed. Commands:

```powershell
node --test --test-concurrency=1 tests/*.test.mjs
node node_modules/eslint/bin/eslint.js --no-eslintrc --config tests/patientTerms.eslint.cjs src/components/patients/PatientTermsStatus.jsx src/pages/PatientTermsPage.jsx src/index.jsx
npm run build
```

New scoped ESLint and production build pass. Repository `npm run lint` cannot
start because the baseline has no ESLint configuration; no baseline-wide lint
success is claimed. This is JavaScript/JSX with no typecheck script/tsconfig;
an independent typecheck was not run. Python compileall passes. Broader backend
tests using the shared `medcrm_test` cleanup fixture were deliberately not run.

`browser_fixture.py` serves the actual built frontend + actual consent router
against a unique synthetic DB, with canned unrelated CRM GETs and no outgoing
providers. Build with `VITE_BACKEND_URL=http://127.0.0.1:18763`, then run it and
`browser_check.py`. All 7 browser check groups passed with no JavaScript errors. The checker launches its own Chromium with separate private
CRM/mobile contexts, blocks all non-local requests, and writes PNG/JSON evidence
to `consent-evidence/`. Its checks include 390px layout, unchecked/button gating,
GET unchanged, another-context acceptance refreshing both actual UI surfaces,
used/expired/revoked/invalid links, close/switch/card persistence and absence of
CRM bundle/auth/patient requests or token leakage from the public page.

Before publishing: review/approve real policy text/version, pick public HTTPS
origin and backend CORS, verify same-origin no-store/privacy headers, verify live
Wazzup channel/template compatibility, review role permissions and retention,
apply the backend/frontend changes to their respective branch deployments,
and smoke-test with explicitly synthetic recipients in a provider sandbox.
