# Standalone-safe Kanban operations

Move and delete use single-document compare-and-set updates, not MongoDB
sessions or transactions. Kanban writes explicitly request journaled majority
acknowledgement (`w=majority, j=true`); on standalone MongoDB the majority is
the single server. This is a per-operation write concern, not a server change.
No database configuration, indexes, migrations,
API/Pydantic schemas, or frontend changes are required. Internal recovery
metadata is written lazily to the existing collections:

- `system_settings.crm_kanban_columns.pending_operation` holds one operation.
- Separate `system_settings` documents hold immutable completion receipts,
  keyed by operation ID. Delete uses the column ID for repeatable retries.
- The canonical lead's internal `_kanban_operation` field is a fencing token
  and write receipt. It is not exposed by the lead response schemas. Existing
  status-event updates preserve it while clearing `kanban_column_id`.

## Ordering and safety

1. Reserve an operation by matching the settings revision and the absence of
   a pending operation, then atomically increment the revision and publish
   the intent. All configuration edits use the same revision/absence guard.
   Other requests finish pending work before reserving their own operation.
2. A move matches the canonical lead ID, `new` status, original assignment,
   and original fencing token. Assignment and new token change atomically.
   Replaying that update cannot apply twice. If a status event wins, a second
   CAS invalidates the original token without changing status or assignment.
   This also fences an already-paused worker if the status later becomes
   `new` again. The caller receives 409 rather than overriding the event.
3. Delete retains the custom column while returning canonical `new` cards to
   Unparsed. Each lead update matches its current assignment, status and
   token, unsets only the assignment, and stores the delete operation token.
   Historical inquiries and event-driven/legacy statuses are not changed.
   A fresh canonical scan must find no remaining assigned cards before
   finalization. Status-event updates can win these CAS updates and are not
   counted as cards returned by deletion.
4. Before releasing the reservation, persist an immutable result receipt.
   Delete counts the leads bearing its operation token, including writes
   whose acknowledgements were lost. Manual moves are still excluded by the
   reservation, and events preserve these tokens. Removing the column and
   releasing its reservation is one settings-document CAS. A helper that
   finishes after another helper reads the same immutable receipt.

A delayed move cannot resurrect an assignment after deletion: successful
and cancelled moves both invalidate the original token before releasing
their reservation. A delayed delete matches the removed column's exact ID,
so it cannot erase a subsequent move to a different column. Custom IDs are
generated afresh and never reused.

## Failure and recovery

Write errors are propagated, not suppressed. Intent stays pending until its
receipt and final settings update succeed. Recovery runs on the next column
read or configuration/move/delete request, including from another process;
it does not depend on an in-memory lock, a lease, or a background worker.
An interrupted delete may have partially returned cards to Unparsed, but its
column remains present until cleanup completes. Interrupted moves retain
their original or requested visible assignment. Unknown acknowledgement
outcomes are resolved by the fencing token or immutable completion receipt.
Repeated deletion returns the original actual count, not zero or 404.

Recovery is bounded to five contention attempts per request; continuing
contention returns 409 with the intent intact. Persistent storage failures
continue to fail requests and require storage health to be restored before
recovery can finish. Receipts are intentionally retained; garbage collection
is not introduced here because deleting them would invalidate replay safety.
Recovery scans the existing first-touch projection, as the original code
did; this change does not add a lead-group identity lock or rewrite inquiry
history. Out-of-band writes must not remove fencing tokens or reuse custom
column IDs.

## Validation scope

The unit tests use in-memory collections and force `start_session` to raise
MongoDB `OperationFailure` code 20. They cover failures before/after lead and
settings writes, recovery by a fresh service, actual counts, status-event
races, concurrent helpers/configuration edits, delayed workers (including
cancelled moves), and BSON millisecond datetime precision. No production
database or data is needed or accessed. Live MongoDB integration and
durability under database/server power loss are not exercised by these tests.
