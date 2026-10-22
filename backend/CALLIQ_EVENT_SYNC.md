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

Provider-confirmed `answered` requires the exact external ID plus an answered
row on a configured/staff/observed real internal extension or an exact known
recording on a nonzero numeric extension. `sip=0` is never treated as a human
answer or a whole-call result. An unattributed answer blocks a negative decision.
Answered remains sticky; negative attempts cannot overwrite it.

An anonymized real sample C001 contains two answered rows (including sip=0) and
four failed attempts. C005 contains two no-answer rows and four failed attempts;
the user independently confirmed C005 was missed. The committed fixtures replace
IDs and internal numbers and contain no customer phone/time/credentials. These
samples support a practical local policy, not universal finality for every route.

### Proposed derived policy: approval still pending

`CALLIQ_DERIVED_MISSED_ENABLED=false` by default, independently of the main worker
flag. No agreement or deployment enablement is implied by these local tests.
The proposed `inbound_settled_v1` decision requires all of:

1. Known inbound direction, a terminal NOTIFY_END, exact permanent pbx_call_id.
2. Successful complete pagination, all matching rows acquired in the window.
   The window uses original provider wall-clock dates through the following day
   for midnight-crossing legs; no UTC offset is invented.
3. Real target extension established by explicit ZADARMA_SIP_INTERNAL or staff
   configuration; no default extension 100. Targets must occur in the rows.
4. A provider no-answer row on a real target; every matching row is no-answer or
   call-failed with seconds=0 and an explicitly false recording flag. Unknown,
   busy/cancel, contradictory/missing fields, recordings or observed real ANSWER
   evidence block automatic missed. This policy does not label outbound calls
   missed and does not settle unfamiliar routing shapes automatically.
5. A quiet period after the last unique event and two identical complete row
   snapshots at least the configured stability interval apart.

Evidence is `state=derived, scope=pbx_group`, with policy name, actual elapsed
times, configured thresholds and completeness/terminal markers. It is not
`confirmed/whole_call`: the provider supplied leg results; the application applied
the documented policy. CallIQ validates this distinction and exposes outcome_basis.
The UI says “Пропущен · расчёт по статистике” and warns it can be refined.

### Timing, bounds and explicit review

All waits are operational assumptions, not a Zadarma SLA. Public defaults:

| Environment variable | Default | Accepted range |
| --- | ---: | --- |
| CALLIQ_EVENT_SYNC_ENABLED | false | true/false |
| CALLIQ_DERIVED_MISSED_ENABLED | false | true/false; separate approval required |
| CALLIQ_MISSED_QUIET_SECONDS | 900 | 900–7200 |
| CALLIQ_MISSED_STABLE_SECONDS | 600 | 600–3600 |
| CALLIQ_RECONCILE_INTERVAL_SECONDS | 600 | 600–3600 |
| CALLIQ_RECONCILE_INITIAL_DELAY_SECONDS | 90 | 0–3600 |
| CALLIQ_REVIEW_AFTER_SECONDS | 14400 | at least quiet+stable+interval; up to 86400 |
| CALLIQ_MISSED_FOLLOWUP_SECONDS | 3600 | 600–86400 |

With defaults and a healthy API/worker/queue, the first scan occurs 1.5–11.5
minutes after the terminal activity. Fixed 10-minute scans while waiting for the
quiet/stability conditions produce the derived result in roughly 15–25 minutes.
Tests exercise five scheduler phases including threshold boundaries. This is a
local scheduling estimate, not an end-to-end guarantee: API delay, queue load,
failures, new activity and downtime extend it. A larger configured wait changes
the estimate; no generic “15 minutes” promise is made.

Expected quiet/stability waits do not consume the six-error/unresolved-result
budget. Other unresolved successful responses use 10-to-60-minute backoff;
request failures retry on the configured interval. Six unresolved/error attempts
or the review deadline stop automatic reconciliation and export review_required
(“Нужна проверка”), distinct from pending (“Статус уточняется”). An eligible
negative pattern with derived disabled also ends in review, never missed.

A derived miss schedules one extra check an hour later (configurable). A later
real answered row upgrades it. Any new unique webhook reopens derived/review
decisions, resets stability and queues a fresh check; duplicate replays do not.
No universal protection against all provider updates after that follow-up is
claimed. Unfamiliar routes need review or further controlled validation.

The worker processes only explicitly queued new events (50 documents/pass),
shares successful/failed window+direction requests within a batch and caps scans
at 20 pages; hitting the cap is incomplete, never evidence for missed. Metadata
delivery is persisted with six attempts per snapshot; exhausted delivery leaves
an explicit CRM sync error for operator recovery. A disconnected CallIQ cannot
receive a new review label until transport recovers/retry is requested. No
historical scan, automatic backfill or audio retranscription is performed.

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
5. Only after separate deployment authorization and staging checks, enable
   CALLIQ_EVENT_SYNC_ENABLED for new events. Keep CALLIQ_DERIVED_MISSED_ENABLED
   false until the user separately accepts the proposed derived policy. Observe delivery/reconciliation markers and bounded retry
   exhaustion. Enabling starts reconciliation API requests; none were run here.
6. To stop the new export/worker, set the flag false. Legacy audio export remains.
   Full code rollback requires coordinated UI/backend review because new no-audio
   rows may exist. No old calls are automatically reprocessed or backfilled.

This rollout enables infrastructure and line attribution. The optional derived
policy is locally tested but remains unapproved and disabled; broader routing
semantics and actual provider publication delay remain limitations.

## Recording flag audit

Read-only PBX statistics observed on 2026-10-22 returned `is_recorded` as strings.
The audited MedCRM/CallIQ paths do not call `bool()` on that field: the typed
TelephonyCall model already parses `"0"`/`"false"` as false and `"1"`/`"true"`
as true. `bool(recording_url)` checks an actual recording reference instead.
No application normalization fix was required. Added regressions cover strings,
booleans and 0/1, and exercise the real webhook/exporter/CallIQ bridge to ensure
that an availability flag alone never creates audio, a transcript or analysis.
Observed repeated statistics snapshots are evidence for those samples only,
not proof of universal provider finality. Recognition details for the potential
missed call are kept outside Git in the task's redacted diagnostic artifacts.
