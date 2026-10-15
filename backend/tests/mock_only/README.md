# Payment / CRM and compensation regressions (no database)

From the repository root in PowerShell:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'
$env:PYTHONPATH=(Join-Path (Get-Location) 'backend')
python -m pytest --noconftest -p no:cacheprovider backend/tests/mock_only/test_payment_crm_sync.py -q --tb=short --disable-warnings
python -m pytest --noconftest -p no:cacheprovider backend/tests/mock_only/test_doctor_compensation.py -q --tb=short --disable-warnings
python -m pytest --noconftest -p no:cacheprovider backend/tests/mock_only/test_accounting_ledger.py -q --tb=short --disable-warnings
```

`--noconftest` is mandatory: the parent test fixtures import Mongo clients.
These tests use only in-memory mocks, stub both database dependency modules
before importing routes, and reject Mongo client creation and `socket.create_connection`.
They do not load database configuration or use `clean_db`.

The compensation suite covers general/individual tariffs, consultation modes,
discounted/partial receipts, completed versus incomplete units, period evidence,
KZT/range validation, merged updates, legacy reads, and fail-closed reports.
See `backend/DOCTOR_COMPENSATION.md` for the contract and unresolved data/UI gaps.

The forward-only ordinary/course/component event slices are described in
`backend/ACCOUNTING_LEDGER_SLICE.md`. Its DB-forbidden tests cover actual net
receipts, event-time general/individual fixed/percent/hybrid snapshots, completion
occurrences, canonical UUID retries/conflicts, concurrent commands and legacy
writer races, UTC/BSON round trips, ledger payroll periods, invalid events,
unresolved rows, and generic/sheet write protection. This is **not** a complete
appointment ledger rollout or global event-only payroll cutover. Phase 1 covers the
frontend ordinary cash-field adapter with dictionary method identity, stable
completion/body identity and deterministic occurrence aliasing, atomic same-plan
advance receipts and explicit allocations, event-time allocation tariffs, insufficient
credit rejection, event-only balance reads, and event-derived execution projections.
Each new behavior was introduced one failing test at a time before implementation.
Slices A/B add stable course-session partial cash receipts and advance allocations,
both schedule/procedure completion adapters, concrete component receipt/allocation
targets and prospective component-occurrence completions. Their focused tests
verify atomic owning-plan event/source persistence, actual KZT amounts, stable
identities, canonical replay/conflicts, duplicate completion rejection, component
tariff and event-time hybrid splits, due/discount bounds, individual-target-only
payments, protected identities, legacy counter rejection, mixed-plan projections,
and uncovered-component payroll blockers. The individual RED/GREEN record and
exact routes/contracts are in `backend/ACCOUNTING_LEDGER_SLICE.md`.
Component catalog-ID payment payloads are mock-tested; the frontend handoff does
not document a dedicated component-completion writer. No browser or live Mongo
integration is claimed. Appointment receipt/status routes, appointment-to-plan
advance transfer and global legacy payroll cutover remain unimplemented here.

Existing consultation tariff
tests exercise the older tariff rules, not consultation event persistence.

Payment persistence shares `TreatmentPlanService.sync_persisted_payment`
(updates use `persist_payment_update`):
- Treatment-plan creation carrying an initial payment.
- Treatment-plan PUT payment updates.
- Ordinary-service and course-session `mark-paid` endpoints.
- Complex-component `mark-paid` and complex `pay-remaining` endpoints.
- Internal legacy deposit top-ups and appointment-creation deposit allocation.

The explicit HTTP `add-deposit` ledger command only appends unallocated credit;
it does not mark services paid or invoke the paid-plan CRM hook. Explicit ordinary
advance allocations invoke that hook after their atomic service payment update.
Course-session and component ledger receipts/allocations also invoke it only
after successful atomic persistence. `pay-remaining` is legacy-only: prospective
complex rows and every event-bearing plan reject its ambiguous aggregate write.

There is no standalone medical-analysis payment endpoint. Laboratory services
are catalog entries paid through treatment-plan services or complex components,
so they use the same hook. Loyalty calculation and explicit CRM deal-resync
endpoints do not persist treatment-plan payments.

The hook preserves deal synchronization and separately invokes card synchronization.
Only a patient with at least one plan and **all** plans marked `paid` can close a
card. Card selection uses the existing Kanban first-touch grouping and explicit
patient / linked CRM-client identity; no patient-phone or regex fallback is used.
Unlinked cards, multiple matching groups, and terminal cards are left unchanged.
CRM synchronization failures are logged without undoing a persisted payment.

## Completed and paid policy (prospective only)

New treatment plans, including consultation-created plans, receive the server-owned
`compensation_policy=completed_paid_v1`. The existing fixed/percentage/hybrid
formula, net target price and full-payment threshold are retained. Payroll releases
that target only after all its stable occurrences are completed (one session for a
course target), in the period of the later condition. Other components, doctors,
sessions and the containing plan need not be finished or paid. Replays do not
create additional earnings. Revenue remains the actual receipt revenue.

Unversioned plans retain the historical calculation. No records or past reports are
migrated/reinterpreted. Applying this rule to an already existing plan is blocked on
an explicit history/cutover decision: previous paid-only fixed accrual may already
have been reported. Generic plan completion without ledger evidence still cannot
be used as proof; existing legacy blockers are not hidden. Refunds, reassignment
and referral/cashback policy are unchanged.

Server-verified catalog snapshots allow untouched doctorless laboratory targets to
stay outside doctor payroll, both inside a complex and standalone. A plan's doctor
is not inherited by a doctorless lab under the new policy. Client lab flags alone
are not sufficient evidence.

For the cross-stack modal test, set `CRM_FRONTEND_CHECKOUT` to the separate main
frontend checkout root (the directory containing `frontend`). Run only the mock
files with the isolation flags above; never collect parent Mongo fixtures.

## Automatic completion from full payment (new plans)

New plans also receive the server-owned `payment_completion_policy=full_payment_v1`.
An ordinary/component/session cash receipt or identified credit allocation appends
missing completion events in the same owning-plan update when its exact target is
fully funded. Partial funding and unallocated credit do not complete anything.
Existing manual completion events and already settled targets retain their IDs,
dates and accruals. Doctorless catalog-confirmed analyses complete with zero doctor
compensation. The salary formulas and full-target payment threshold are unchanged.

`POST /api/treatment-plans/{plan_id}/settle-remaining` takes an operation UUID,
actual cash amount, method and optionally a stable `service_row_id` for a complex
or course. It stages the existing exact-target ledger commands on a private copy,
disables payment hooks during staging, then uses one compare-and-set update for
all payments and completions. The normal synchronization hook runs once after
that real update. A failure while preparing any child leaves the whole plan intact.
Retries retain their operation identity; stale amounts and unknown earning doctors
are rejected. A whole course must have session prices matching its total; prices
are never silently reallocated. Aggregate discounts must be established through
individual target payments, not guessed across a batch.

Older plans are not opted in or backfilled. Refunds and historical recalculation
are not added. Run `test_auto_payment_completion.py` with the same DB-forbidden
pytest flags as the other mock suites.
