# Live notifications for CRM lead cards

Worktree: `E:/new-med-crm-deal-ws`, branch
`feat/deal-websocket-notifications`, based on `origin/ref-2` at
`fb067b0f276757c60528e2c39b9d5c2c28d36426`.

## Creation path and scope

The active `App.jsx` mounts `EnhancedLeadsView` for `crm-leads`.
`useCrmApi.leads.create` posts to `POST /api/crm/leads/`, whose route passes
`LeadCreate` to `LeadService.create_lead`, then calls `lead_to_response`.
The service allocates a UUID and creation timestamps, validates a `Lead`, awaits
`crm_leads.insert_one`, and then creates the existing initial follow-up task.

Immediately after the successful lead insert, the service publishes a typed v1
`CRMCardCreated` event. The service guards publication failures; the event bus also
isolates and logs subscriber failures. Notification errors preserve the successful
HTTP response. Delivery is awaited with a bounded timeout rather than an unmanaged
background task. Failed inserts emit nothing. Updates, status changes and
conversions do not publish creation events.

Persistence is the event boundary, not completion of all HTTP work: an existing
initial-task failure or later response-enrichment failure can still fail the
request after a lead was stored and its creation event published. This change
preserves that existing behavior; there is no transaction or rollback.

Other callers of the same service include:

- `routers/telephony.py`: new inbound-call leads (`telephony_webhook`).
- `routers/wazzup.py`: new inbound-message leads (`wazzup_webhook`); existing active
  leads and consumed feedback replies return without creation.
- `crm/services/integration_service.py`: creation from an HMS patient
  (`hms_integration`).

These creations also notify. Although callers pass `created_by` markers, there is
no separate UI-card creation event or channel contract to filter on. Business
`source` values overlap channels; no source/creator heuristics were added.
`routers/appointments.py` also inserts `crm_leads` directly when synchronizing an
appointment. That path bypasses `LeadService.create_lead` and does not notify in
this slice. The board's existing first-touch projection can group multiple lead
records by patient/phone; notifications identify the newly persisted lead ID and
do not attempt to infer whether a visually distinct grouped card appeared.

The dormant `/api/crm/deals/` API does not publish notifications. Both its route
and service were restored to HEAD, including removal of the unrelated change to
the route's argument type. Its pre-existing `.dict()` mismatch remains outside
this slice.

## Shared transport and authentication

One app-lifespan subscription connects the reusable `EventBus` and
`WebSocketManager`. The manager broadcasts to every currently connected,
authenticated client, including the creator and multiple tabs for the same user.
There are no recipient/role/source filters. Concurrent sends have per-socket
serialization and timeouts; failed clients are removed without stopping healthy
clients. Shutdown unsubscribes and closes sockets.

Connect to `/api/ws/events` and send this text JSON frame within five seconds:

```json
{"type":"authenticate","token":"<access token>"}
```

The token never appears in the URL. Before registration, the endpoint calls the
existing HTTP JWT validator and active-user/password checks. Existing user-ID and
legacy email/login JWT subjects are supported. No application events are sent
before authentication. Success returns:

```json
{"type":"connection.ready","version":1}
```

Invalid, missing or expired credentials close with `1008`. Connections are
unregistered on disconnect and JWT expiry. Use HTTPS/WSS in production.

Example creation event:

```json
{
  "version": 1,
  "event_id": "crm.card.created:lead:<lead_id>",
  "type": "crm.card.created",
  "entity_type": "lead",
  "card_id": "<lead_id>",
  "title": "Card name",
  "timestamp": "2026-10-15T10:00:00Z"
}
```

The title is the lead's display name. No phone, email, IIN, amount, description,
source or creator fields are sent. `entity_type` currently accepts `lead`; future
card types can extend that typed field and the frontend mapper while reusing the
same dispatcher, endpoint and socket connection.

## Session UI

One `LiveNotifications` owner follows `AuthContext` user/token state. It derives
the URL from `VITE_BACKEND_URL`, sends the JWT in the first frame, and waits for
`connection.ready` before handling application events. Reconnect delays are
1, 2, 4, 8, 16, then at most 30 seconds. A ten-second handshake timer closes stalled
connections. Authentication rejection stops retries until auth state changes;
logout/unmount/token changes close the connection and cancel timers.

Valid lead-card events add an existing `NotificationContext`/`NotificationCenter`
entry titled **Новая карточка CRM**, showing the brief name, and a dismissible
six-second toast (`role="status"`). At most three toasts appear together. Stable
`crm.card.created:lead:<lead_id>` notification IDs deduplicate within a login
session, including across reconnects and after dismissing/clearing notifications.
The event's transport ID is validated, while the notification ID is derived from
event type, entity type and card ID so replay with another event ID stays deduped.
Logout/account changes clear notifications, toasts and seen IDs. No offline
notification persistence or replay is implemented.

## Delivery and deployment limits

Delivery is best effort and process-local. **One backend worker/process/replica is
required** for all connected users to receive events. With several workers, only
clients in the creating process receive them; sticky sessions do not solve this.
There is no broker, Redis, queue, outbox, push or offline delivery. Events during
disconnects/restarts are lost. Persistence remains the source of truth.

The repository deployment workflow restarts `medcrm-backend`; its actual systemd
ExecStart, worker count and reverse-proxy settings are not in the repository and
were not verified in production. The production proxy must forward WebSocket
Upgrade/Connection headers on `/api/ws/events` and allow long-lived connections.
The existing Vite `/api` proxy enables `ws: true`.
`backend/requirements.txt` retains `websockets>=12,<16`, since bare Uvicorn does not
install a WebSocket protocol driver.

## Verification

Backend command, from `backend`:

```powershell
$env:MONGO_URL = 'mongodb://localhost:27017'
..\.venv\Scripts\python.exe -B -m pytest tests/test_crm_card_live_events.py -q -p no:cacheprovider --disable-warnings
```

Result: `31 passed, 134 warnings in 1.91s`, exit 0. Only this focused module was
run. Tests use fake collections and signed JWTs, with no MongoDB operations. They
cover authentication/subject formats, invalid/expired/inactive accounts, handshake
timeout, JWT expiry, all-client broadcast including creator, disconnect/shutdown
cleanup, persistence ordering, insert failure, publication/subscriber failure,
successful HTTP responses despite delivery errors, shared automation creation,
existing initial-task failure, no events for updates/conversions, slow/dead sockets,
subscriber isolation, and actual Uvicorn/WebSocket transport on an ephemeral
loopback port.

Local isolated tooling is the worktree `.venv` with host Python libraries and
local FastAPI-compatible Starlette 0.37.2, HTTPX 0.27.2 and Uvicorn 0.25.0 overrides.
No shared Python environment was changed. Warnings are dependency/model
deprecations.

Frontend command, from the worktree root:

```powershell
node --test frontend/tests/liveEvents.test.js
```

Result: `tests 8`, `pass 8`, `fail 0`, exit 0. Coverage includes schema/message,
stable IDs, the dedup helper used by NotificationContext, session reset,
authentication gating, URL derivation, reconnect and cleanup. The first run caught
a test-fixture Cyrillic encoding error; the corrected UTF-8 fixture passed. There
is no React DOM runner: rendered toast/panel integration, accessibility and
StrictMode UI behavior were not browser-tested.

Build command, from `frontend`: `npm run build`.
Result: `2619 modules transformed`, `built in 7.36s`, exit 0. Warnings: Browserslist
data is nine months old and the main bundle exceeds 500 kB.

Main-server import smoke check with local-only DB settings and an inert Wazzup
key returned `Mounted WebSocket routes: ['/api/ws/events']` and
`Active lead creation route: True`, exit 0. This checks route mounting, not the
full application against a real database.

Full tracked diff and all new files were reviewed. `git diff --check` and
`git diff --no-index --check` for each untracked file returned no errors.
The two dormant deal files have an empty diff against HEAD. Final
`git status --short --untracked-files=all` contains only the files listed below;
HEAD remains `fb067b0f276757c60528e2c39b9d5c2c28d36426` on the requested branch.

No commit, push, deployment or production writes were performed. All edits stay
in this worktree; the original checkout's files and Git state were left untouched.

## Final changed files

- `backend/crm/services/lead_service.py`
- `backend/events.py`
- `backend/routers/live_events.py`
- `backend/services/websocket_manager.py`
- `backend/server.py`
- `backend/requirements.txt`
- `backend/tests/test_crm_card_live_events.py` (replaces the untracked deal tests)
- `frontend/src/App.jsx`
- `frontend/src/api/liveEvents.js`
- `frontend/src/components/notifications/LiveNotifications.jsx`
- `frontend/src/components/notifications/NotificationToasts.jsx`
- `frontend/src/context/NotificationContext.jsx`
- `frontend/src/utils/notificationIds.js`
- `frontend/vite.config.js`
- `frontend/tests/liveEvents.test.js`
- `docs/crm-card-live-notifications.md` (replaces the untracked deal document)
