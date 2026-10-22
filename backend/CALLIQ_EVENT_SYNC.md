# CallIQ event metadata and provider reconciliation

This change is local and has not been published. `CALLIQ_EVENT_SYNC_ENABLED`
defaults to `false`. Existing CallIQ URL/login/password and Zadarma credentials
are reused; no new account, token or provider is required.

## Contract

- The stable external identity is the exact `pbx_call_id`, scoped to the configured
  `CALLIQ_PROJECT_ID` and source `medcrm_zadarma`. Recording IDs remain separate.
- Sanitized events preserve `internal`, `last_internal`, `transfer_from`, event
  kind and disposition. Channels accept trimmed strings/integers; no default 100.
  The aggregate channel has a separate role (`target`, `answered`, `unknown`).
  Multiple unresolvable answering extensions produce an ambiguous channel.
- Webhooks do not confirm telephone outcomes. New START/ANSWER/END/RECORD and
  callback documents remain `pending` until provider verification. Direction is
  independent. A negative leg or absence of recording is never `missed`.
- Authenticated `POST /calls/metadata` exports a monotonically versioned snapshot,
  even without audio. Replays are idempotent, old versions are ignored and an
  equal version with different content conflicts. JWT owner/project checks remain.
- With the flag enabled, recording upload additionally sends the external and
  recording IDs. RECORD before ANSWER attaches to the same call; late metadata
  does not retranscribe it. Different recording IDs remain separate attachments
  under one logical call. With the flag disabled, legacy audio export is retained.
- Calls without audio have processing status `no_audio` and no transcript,
  analysis or metrics. Telephone outcome is a different field.

## Provider evidence and unresolved missed

Official reference, checked 2026-10-22:
https://zadarma.com/en/support/api/#api_statistics_pbx

`GET /v1/statistics/pbx/` version 2 documents paginated rows (`skip`, `limit`
up to 1000), permanent external `pbx_call_id`, recording-specific `call_id`,
`sip`, `disposition`, `seconds` and `is_recorded`. It discourages minute polling.
It does not document a final whole-call negative flag or a completeness/finality
guarantee after transfers and parallel ringing. Repeated negative pages cannot
prove that another answered leg will not arrive later.

The implementation confirms only `answered`: exact external ID plus an answered
row tied to an observed answering extension or an exact known recording ID.
Unrelated IDs, unrelated legs, empty results, busy/no-answer rows and failed or
incomplete pagination stay unknown/pending. Confirmed answers cannot be downgraded
by a later webhook or incomplete statistics snapshot. Negative outcomes in the
receiver schema are reserved for a future established whole-call contract; this
producer never emits confirmed negative outcomes.

The worker runs every 10 minutes, only for records explicitly queued by newly
observed events. Initial eligibility is 90 seconds after an event, not a promise
of provider finality. A batch shares daily paginated results by the provider's
original `call_start` wall-clock date. Missing/conflicting dates do not trigger
phone/time guessing. At most 20 pages, 50 queued documents per pass and six
reconciliation attempts; backoff is bounded from 10 to 60 minutes. Failed
metadata delivery is persisted and bounded to six attempts. Exhaustion retains
unknown and an error marker for review; no automatic historical scan/backfill.

Draft question to Zadarma support (not sent):

> For a permanent pbx_call_id, what documented API field or method authoritatively
> confirms that the entire external call ended unanswered, including parallel
> ringing, queues and transfers? Does statistics/pbx return legs or a whole-call
> result, how can completeness/finality be identified, what delay is guaranteed,
> and how should recording IDs and SIP extensions be correlated after transfer?

## Local validation and limits

`tests/calliq_events` uses mongomock and rejects real HTTP transports. The bridge
uses the actual CRM webhook, CalliqClient and CallIQ ASGI API, a temporary file
SQLite database and a synthetic ASR stub. It never submits real recordings or
calls paid ASR. Existing regression tests are imported into the same mock fixture,
including signing, legacy audio export, operator lookup, call history, protected
reads and mixed-clinic rejection. Run with a compatible environment containing
both applications' requirements; do not replace deployed dependencies in place.

Existing webhook authentication behavior is unchanged. This does not add signature
verification to a route that did not previously verify it. Existing signed
Zadarma API transport and CallIQ's authenticated/project-scoped paths are retained.
Real provider timing, live Mongo concurrency and audio recognition quality remain
outside these local mock checks. Desktop UI validation passed with already
installed Python Playwright and Chromium 134, headless at 1440x1000. The browser
loaded a separate loopback-only build and synthetic API fixtures: no-audio list
and detail, unknown/pending, answered operator/line, filters, two recordings and
synthetic WAV playback. Console/page errors and external requests were zero;
one request cancellation during filter changes was expected. Results, screenshots
and exit code 0 are preserved in the task workspace under browser-qa/. The
application code did not change during this QA follow-up. The computer-use
connector exposed no browser surfaces; the explicitly requested installed
Playwright path supplied the browser instead, without installing software.

## Future compatible rollout (not executed)

1. Review runtime drift and back up the existing CallIQ database/media. The prior
   auto-language deployment updated only selected files; do not assume the whole
   server tree equals a clean main checkout.
2. Upgrade the full CallIQ backend to the reviewed revision first. Its additive,
   repeatable migration runs through normal DB initialization; verify owner
   checks, health, metadata endpoint and unchanged legacy uploads using mocks.
   Keep additive columns/indexes on rollback; never remove or rewrite history.
3. Upgrade CallIQ UI to understand `no_audio`, unknown/pending and attachments.
   Repeat the browser smoke on the intended staging release before acceptance.
4. Deploy CRM with `CALLIQ_EVENT_SYNC_ENABLED=false`. Its backend writes pending
   outcomes, so every consuming CRM view must tolerate/display pending. Verify
   the existing configured project explicitly; do not select an arbitrary project.
5. Only after separate deployment authorization and staging checks, enable the
   flag for new events. Observe delivery/reconciliation markers and bounded retry
   exhaustion. Enabling starts reconciliation API requests; none were run here.
6. To stop the new export/worker, set the flag false. Legacy audio export remains.
   Full code rollback requires coordinated UI/backend review because new no-audio
   rows may exist. No old calls are automatically reprocessed or backfilled.

This rollout enables infrastructure and line attribution. It does not declare
the final missed classification complete while the provider contract is unresolved.
