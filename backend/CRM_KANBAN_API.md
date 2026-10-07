# Shared CRM Kanban columns

All clinic staff share one settings document: `system_settings._id =
"crm_kanban_columns"`. No per-user configuration, migration, model changes, or
cleanup is required. Defaults are inserted on first access, using MongoDB's
unique `_id`; configuration writes use a revision compare-and-swap.

## HTTP contract

The server mounts CRM at `/api/crm`. The new endpoints use the existing active-user
and role authentication dependencies, allowing all clinic staff roles but not
patient accounts. Requests use JSON and reject extra fields.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/api/crm/kanban/columns` | — | Ordered array of columns |
| POST | `/api/crm/kanban/columns` | `{"name":"Callback"}` | Created column, HTTP 201 |
| PATCH | `/api/crm/kanban/columns/{column_id}` | `{"name":"Follow up"}` | Renamed custom column |
| PUT | `/api/crm/kanban/columns/order` | `{"column_ids":["new","custom_…","contacted","in_progress","converted","closed"]}` | Ordered array of columns |
| DELETE | `/api/crm/kanban/columns/{column_id}` | — | `{"id":"custom_…","affected_count":3}` |
| PATCH | `/api/crm/leads/{lead_id}/kanban-column` | `{"column_id":"custom_…"}` or `{"column_id":"new"}` | `{"lead_id":"canonical-first-touch-id","column_id":"custom_…","status":"new"}` |

Column shape:

```json
{
  "id": "new",
  "name": "Неразобранные",
  "is_system": true,
  "manual_move_allowed": true,
  "affected_count": 3
}
```

`affected_count` on GET is the current number of canonical cards in a column,
for pre-delete confirmation. It is a snapshot, not a reservation: DELETE returns
the actual count committed by its transaction. Custom columns append at the end
and have stable `custom_<uuid>` IDs. Names are trimmed, case-insensitively unique
across system/custom columns, and limited to 1–100 characters without Unicode
control/format characters. System metadata is reconstructed from fixed constants,
not trusted from stored configuration; malformed configuration falls back safely.

## Stage semantics

| System ID | Protected title | Manual destination |
| --- | --- | --- |
| `new` | Неразобранные | Yes |
| `contacted` | Записан на прием | No — booking event |
| `in_progress` | Запись подтверждена | No — confirmation event |
| `converted` | Пациент пришел | No — arrival event |
| `closed` | Оплачено | No — payment event |

Order must contain every current ID exactly once, with no unknown IDs; system
identities and names are immutable, but their positions can change. The stored
`rejected`, `qualified`, and `lost` statuses are not column IDs. Their records
are not migrated, deleted, or reassigned by this feature. The existing board
data endpoint retains these records; the frontend should render only configured
columns, not synthesize columns for legacy statuses.

Manual moves are allowed only when the canonical first touch has status `new`
and is in Unparsed or a currently configured custom column. The first touch
stores `kanban_column_id`; custom movement does not change the underlying `new`
status. Targeting a duplicate inquiry resolves to its canonical first touch and
leaves duplicate history unchanged. Moving to Unparsed unsets the assignment.
`GET /api/crm/leads/kanban` exposes `kanban_column_id` on canonical cards; use
that field only with status `new`, otherwise use the system status. System events
target canonical first touches and atomically clear custom assignments when
writing their status. Legacy lead PUT/status PATCH routes cannot bypass the
manual destination restrictions.

## Atomicity and operational requirement

Moves and deletion use MongoDB transactions with snapshot read concern and
majority write concern. Both write the same settings revision, so concurrent
configuration edits/deletion/moves conflict rather than orphaning assignments.
DELETE removes the configuration and returns its canonical custom cards to
Unparsed, clearing assignments, in the same transaction. An event-driven status
write races on the same lead document and clears assignment with its status
update, rather than restoring an obsolete custom stage.

MongoDB must support transactions (replica set or mongos). Unsupported transaction
operations return HTTP 503; there is deliberately no non-atomic fallback. This
phase does not modify MongoDB topology or contact any live/dev database.

Validation errors return 422; protected system edits and disallowed moves return
400; missing leads/columns return 404; exhausted configuration retries return
409. Reads/create/rename/reorder do not require a multi-document transaction.

## Database-free validation

From `backend`, use an unreachable MongoDB URL and run only mock-backed tests:

```powershell
$env:MONGO_URL = 'mongodb://127.0.0.1:1'
$env:PYTHONPATH = (Get-Location).Path
python -m pytest tests/test_crm_kanban_columns.py tests/test_crm_first_touch.py tests/test_crm_lead_calls.py -q --disable-warnings
```

These tests never request `clean_db`. The existing integration-test fixture is
not used, and no MongoDB reads/writes or collection cleanup are performed.
