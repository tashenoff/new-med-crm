# Patient terms frontend

Branch `codex/patient-terms-frontend`, based on `main` at `684cd18`.
Requires companion backend `codex/patient-terms-backend` based on `ref-2`.
Apply each branch to its own deployment; do not merge entire main/ref-2 trees.
The backend companion's `docs/PATIENT_TERMS.md` describes storage, authorization,
rotation, notification idempotency, provider limitations and the release procedure.

The standalone mobile page is `/consent/#<bearer>`. The fragment keeps the token
out of HTTP page URLs/access logs. index.jsx lazily loads this page without the
CRM App/auth/API shell. Its fetch requests omit credentials and use no-referrer
and no-store. There are no patient/medical identifiers or third-party requests.
Vercel headers protect `/consent/:path*`; configure equivalent headers on any
other frontend host and disable API-body logging/APM for public token requests.

Use existing `VITE_BACKEND_URL` for the API. Backend generates links only from
validated `CONSENT_PUBLIC_BASE_URL` configuration with `CONSENT_ENABLED=1`,
never from Host. Issuance defaults off. Disabled/missing/bad configuration keeps
the ordinary booking message without a link, records a non-secret reason and
never fabricates an acceptance. Admin GET `/api/patient-terms/readiness` returns
503 for invalid/incomplete opt-in configuration; status/history reads still work. Read-only
verification on 2026-10-21 found curai.asia serves Medical CRM on Vercel. No DNS,
hosting, external templates, push or deployment were changed.

API contract:

* POST `/api/public/patient-terms/lookup`, body `{token}`: read-only document and
  state (`pending`/`accepted`) with server timestamp; never a patient identifier.
* POST `/api/public/patient-terms/accept`, body `{token, acknowledged:true}`:
  atomic, idempotent acknowledgement of that immutable version.
* Authenticated GET `/api/patients/{id}/terms-status`: current version status,
  accepted_at, version, demonstration flag and immutable version history.

The checkbox starts unchecked; explicit checked submit is required. Errors
distinguish invalid, expired and revoked links. Already used links show their
original acknowledgement. Changing a link fragment in the same tab resets the
checkbox and ignores responses for a previous token.

The WhatsApp status row is directly below the selected contact/appointment
header. Its close button only updates a per-patient in-memory set for this tab.
PatientModal always displays status/date/version/history. Both instances poll
the server every 5 seconds while visible/open, abort stale requests, clean up
timers/listeners and refresh on visibility. No browser-local event is used to
simulate another browser's confirmation. No calendar indicators were added.

Verification: full sequential suite **542/542 passed**, including eight focused
tests for the new components. Scoped ESLint and production build passed. Default
`npm run lint` cannot start because the original repository has no ESLint config;
no repository-wide lint success is claimed. The codebase has no typecheck script
or tsconfig, so no independent typecheck was run. A parallel test run hit a Node
test-runner serialization error; selected regressions and the complete sequential
run passed. Reproduce:

```powershell
node --test --test-concurrency=1 tests/*.test.mjs
node node_modules/eslint/bin/eslint.js --no-eslintrc --config tests/patientTerms.eslint.cjs src/components/patients/PatientTermsStatus.jsx src/pages/PatientTermsPage.jsx src/index.jsx
npm run build
```

The companion backend has 22 passing real-Mongo isolated tests and a local
browser fixture serving this actual production build, real consent endpoints
and synthetic unrelated CRM data on 127.0.0.1:18763. The own Chromium browser
check passed all 7 groups: 390px page/unchecked/GET, correct widget placement,
separate-context acceptance refreshing the open widget and card without reload,
used/invalid/expired/revoked links, close/switch/card persistence, and no public
CRM/auth/patient calls or bearer in HTTP URLs/headers. PNG and JSON evidence is
in the backend checkout's local `consent-evidence/` folder. Existing patient data,
real WhatsApp sends/calls, finance, MCP and Hermes changes were not modified.

Before release choose/approve the actual policy text and version, configure a
trusted HTTPS public origin and backend CORS, verify live Wazzup channel/template
compatibility, and review both branch changes. The included text is explicitly
a demonstration and makes no claim of legal sufficiency.

Production smoke additionally verified both /consent and /consent/. The real
Vercel route matcher requires an explicit /consent/ header rule for that empty
trailing segment; both forms load the public entrypoint without CRM/auth.
The entrypoint regression mounts the real index for both canonical forms.

Local refresh hardening: status GETs time out after 5 seconds, use a fresh query
key, and refetch on focus/pageshow. See CONSENT_REFRESH_REVIEW.md for the
reproduced published-build scenario, patient-card spacing and regression results.
