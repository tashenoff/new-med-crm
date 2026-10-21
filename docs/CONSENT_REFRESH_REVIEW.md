# Consent status refresh and patient-card spacing (local review)

Base: main `facd25f39a35757e0b824b4c36f77a88b65837b2`, including the published
sales-funnel and source-editor work. Backend `f5f73dc460be16e082f7518cca532f0acbbf7674`
is unchanged. This patch is LOCAL ONLY; no push/deploy or runtime env change.

## Evidence and cause

The user's Library screenshot `libfile_445a922033f481919bd547fd79c1ee58` was read
and its original pixels materialized and inspected. No real identifiers from it
are reproduced in this document or committed. It shows expanded terms history
touching the first input: 0px gap, while ordinary fields have a 16px gap.

The actual published frontend assets were loaded in an independent Chromium
context (App-85673f85.js, index-dd4bd4cf.js). ALL API requests were intercepted
with synthetic fixtures before reaching a backend; no real patient, consent,
message or authentication write occurred. Real PatientModal and WhatsAppInbox
components, their real polling and their real HTTP client rendered the UI.
The fixture only changed the HTTP response state, never React state/DOM.

Normal published polling works, updating both surfaces in about 10 seconds.
The reported symptom was reproduced under a stalled status request followed by
focus returning to an already-visible window: there is no focus refetch, the
shared HTTP timeout is 30 seconds and the next poll waits another 10 seconds.
Both surfaces remained stale; reloading fetched the accepted state immediately.
This is a demonstrated failure scenario, not a claim that the user's exact live
network timing was observed. No authenticated live session was inspected.
HTTP cache was not proven to be the cause; fresh query keys additionally prevent
reuse by intermediary/client caches.

## Minimal production change

Only two production files change:

* `PatientTermsStatus.jsx`: poll every 5 seconds; bound each status GET to 5
  seconds; add a non-secret `_consent_refresh` query timestamp; refetch on focus
  and pageshow as well as visibility. The same callback aborts an old request;
  the existing request-identity/patient guards reject late responses. Cleanup
  removes every listener/timer and aborts the request. Hidden tabs remain paused.
* `patientTerms.css`: one scoped `margin-bottom: 1rem` for the patient-card status
  panel. It equals the form's existing `space-y-4` gap. Compact WhatsApp spacing,
  appointment status and business logic are untouched.

## Verification

* Full frontend suite on the current main base: **564/564 passed**.
* Focused status/page/entrypoint suite: **8/8 passed**. New regression holds an
  old GET, refocuses the visible window, verifies fresh GET options and accepted
  rendering, then resolves the old GET to verify it cannot overwrite the result.
  It also checks pageshow, inactive cleanup and the existing patient-switch guard.
* Scoped ESLint, production build, Python syntax and git diff checks passed.
* The actual local production build, with all API fixtures isolated, updated
  both real surfaces by normal HTTP polling in **5.92s**. Focus recovered both
  stalled requests within the **1.3s** check, without reload. Old/other-patient
  state could not replace the selected patient's status.
* Measured desktop status/form gap **16px**, ordinary field gap **16px**;
  expanded history/form gap **16px**; mobile 390px gaps **16px / 16px**.
  Desktop and mobile screenshots were visually inspected.

Reproduce the browser regression against an isolated locally served production
build (for example `npm run preview -- --host 127.0.0.1 --port 18767` after build):

```powershell
python frontend/tests/browser/patientTermsPolling.py --base http://127.0.0.1:18767 --expect-fixed
```

Without `--expect-fixed`, the script is a diagnostic for the old published
behaviour and requires the old assets. It never sends an API write and uses a
fresh synthetic auth placeholder solely inside the isolated browser context.
Live acceptance/delivery and production deployment are outside this local fix.
