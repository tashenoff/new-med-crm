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
