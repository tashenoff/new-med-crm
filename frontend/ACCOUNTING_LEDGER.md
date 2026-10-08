# Accounting ledger frontend handoff

The frontend sends accounting commands, not physician payroll calculations. Fixed compensation, net-receipt percentage compensation, tariff snapshots, and exact advance allocations remain backend responsibilities. All amounts are KZT.

## Writers and request contract

All accounting writes below include a UUID `operation_id`. An unchanged failed request retains its ID and body; concurrent submissions share one request. A changed amount/purpose/funding source gets a different operation. Acknowledged batch targets are not posted again when retrying a later failed target. Retry state is held in the running frontend, not a durable/offline transaction journal.

| Frontend writer | Existing route | Accounting fields |
| --- | --- | --- |
| `AppointmentModal`, `useAppointments`, `useApi`, `appointmentsApi` create/update | `POST /api/appointments`, `PUT /api/appointments/{id}` | `payment_purpose: consultation\|plan_advance`, `actual_amount_kzt`, `payment_method`, `operation_id` |
| Both appointment status APIs | `PATCH /api/appointments/{id}/status` | `status: completed`, `operation_id` |
| Ordinary service payment | `POST /api/treatment-plans/{plan}/services/{service}/mark-paid` | Existing `amount`, `discount_amount`, `payment_method_id`, `payment_method_name`; explicit `funding_source`, `operation_id` |
| Component payment | `POST /api/treatment-plans/{plan}/complex-services/{service}/components/{component}/mark-paid` | Same service-payment fields, for the selected concrete component |
| Complex remaining / plan remaining | Individual service/component/session routes above and below | Required amount per target; separate discount per service/component; separate operation per target. No automatic equal discount or advance distribution. The ambiguous aggregate `pay-remaining` command is no longer used. |
| Add deposit | `POST /api/treatment-plans/{plan}/add-deposit` | Existing `amount`, chosen `payment_method`, method ID/name, `note`; `payment_purpose: plan_advance`, `operation_id` |
| Course payment, both treatment views | `POST /api/treatment-plans/{plan}/services/{service}/sessions/{session_id}/mark-paid` | `session_id`, actual `amount_kzt`, `operation_id`; service-payment view also sends chosen method and explicit funding source |
| Course completion, schedule | `POST /api/treatment-plans/{plan}/service/{service}/complete` | `session_id`, session's existing `date`, `operation_id` |
| Procedure completion, treatment view | `POST /api/treatment-plans/{plan}/services/{service}/mark-completed` | `occurrence_id`, `operation_id`; for courses, `session_id` instead of anonymous occurrence |

Appointment receipts require an explicit Russian purpose selection. Historical deposit fields are displayed read-only and are not replayed on appointment edits. No purpose is inferred from an existing deposit. Consultation amounts are bounded by a positive recorded appointment price; plan advances are not bounded by the consultation price.

Service funding choices use `cash` for a **new receipt** (including noncash methods), and `plan_advance` for an **explicit allocation**. Advance allocation does not send new-receipt method fields, even if a method was previously selected. A plan balance never marks a service paid or hides its allocation action.

## Backend dependencies / integration checks

- Confirm the funding-source enum values `cash` and `plan_advance`; the approved shared description specifies the field but not its enum. `cash` is independent of the selected payment method.
- Appointment methods currently offered are `cash`, `card`, and `transfer`. Service methods retain dictionary IDs/names. Add-deposit sends the selected dictionary ID as `payment_method` alongside ID/name: its existing route must accept that chosen method, not assume cash.
- The session route must accept a stable session identifier in the URL, **not an array index**, plus `session_id` in its body. Both existing completion route variants must support course `session_id`. If a server session lacks `session_id` or `id`, the UI blocks the command with a Russian explanation rather than inventing identity from a date/index. Calendar sessions also need their scheduled `date`.
- Service completion prefers `occurrences[].occurrence_id` / `id`. If unavailable, it sends a deterministic string `occurrence:{encoded plan:service:completed-count}`, stable across remounts; the route must accept this stable client occurrence key and deduplicate it. Session IDs always come from the server.
- Explicit advance allocation needs the server's **unallocated** `advance_balance_kzt` (or existing `deposit_balance`). The UI deliberately does not substitute cumulative `deposit_amount`. Missing/insufficient unallocated balance blocks advance allocation; a new receipt remains available.
- Session amount bounds prefer `amount_due_kzt` (remaining amount), otherwise session `price` / service `session_price` / `price_per_unit` minus recorded `paid_amount`. Payment summaries use recorded receipt amounts, never paid-session-count times tariff as received money.
- Payment/completion routes must record the ledger atomically and return the updated plan (either directly or as `{ plan }`); replaying the same operation must return the same result without another receipt, allocation, or fixed completion accrual. Service routes must distinguish an explicit discount from the unpaid remainder of a partial receipt.
- No backend or database was accessed from this worktree. Existing route compatibility and backend event/payroll behavior require integration verification after the ref-2 implementation is available. Full browser reload/offline recovery is not implemented; do not treat resubmission after a lost draft as a guaranteed same-operation replay.

## Regression commands

Run from `frontend`:

```sh
node --test tests/accountingLedger.test.mjs tests/accountingWriters.test.mjs tests/doctorCompensation.test.mjs
npm test
npm run build
git diff --check
```

The ledger tests cover validation/purpose, UUID reuse and changed-body separation, concurrent/acknowledged duplicates, stable occurrence/session IDs, appointment form and all active appointment API paths, ordinary/component batch payments, partial batch retry, explicit advance bounds, advance-only deposits, actual session receipts, and both completion types. The existing doctor compensation and salary-blocker tests remain unchanged.
