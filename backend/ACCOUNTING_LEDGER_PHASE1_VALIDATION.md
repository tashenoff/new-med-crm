# Phase 1 continuation: local, database-forbidden validation

## Scope and changed paths

Existing branch: `fix/doctor-compensation-backend`. The worktree already contained
doctor-compensation and ordinary-ledger changes. They were retained, not reset.
This continuation changes only:

- `backend/routers/treatment_plans.py`
- `backend/services/accounting_ledger_service.py`
- `backend/services/treatment_plan_service.py`
- `backend/tests/mock_only/test_accounting_ledger.py`
- `backend/tests/mock_only/README.md`
- `backend/ACCOUNTING_LEDGER_SLICE.md`
- This validation report.

No model/config edits, branch changes, database access, application server,
DB-backed tests, frontend edits, migration/backfill, commit/push or deployment.
Frontend contract and active ordinary-service writers were read locally, not run.

## Vertical TDD evidence

Every new test was added and run alone before its corresponding implementation.
All focused runs use the ledger-suite command below with `-k <selector>` appended.

| Selector | Actual RED | Actual GREEN |
| --- | --- | --- |
| `frontend_cash_receipt` | 1 failed, 55 deselected, 34 warnings in 1.37s; HTTP 422 unknown command fields | 1 passed, 55 deselected, 34 warnings in 1.10s |
| `frontend_completion` | 1 failed, 56 deselected, 34 warnings in 1.26s; DID NOT RAISE HTTPException for the prospective naked-counter writer | 1 passed, 56 deselected, 34 warnings in 1.07s |
| `frontend_deposit` | 1 failed, 57 deselected, 34 warnings in 1.33s; old writer queried appointments instead of appending an advance | 1 passed, 57 deselected, 34 warnings in 1.05s |
| `frontend_advance_allocation` | 1 failed, 58 deselected, 34 warnings in 1.36s; HTTP 422 allocation not implemented | 1 passed, 58 deselected, 34 warnings in 1.07s |
| `plan_reads_expose` | 1 failed, 59 deselected, 35 warnings in 1.27s; KeyError advance_balance_kzt | 1 passed, 59 deselected, 37 warnings in 1.06s |
| `canonical_receipt_returns` | 1 failed, 60 deselected, 34 warnings in 1.38s; HTTP 422 body identity rejected | 1 passed, 60 deselected, 34 warnings in 1.05s |
| `completion_projects_execution` | 1 failed, 61 deselected, 34 warnings in 1.28s; KeyError status | 1 passed, 61 deselected, 34 warnings in 1.07s |

The first completion RED run also exposed missing required display fields in the
mock plan (Pydantic ValidationError, 1 failed in 1.33s). The test fixture was
completed and rerun RED before implementation; the meaningful failure is recorded
in the table. An intermediate whole-ledger run returned 1 failed, 56 passed,
36 warnings in 1.50s: the unchanged legacy-counter protection test expected 409,
not 422, for an event-owned document. Guard ordering was corrected without changing
that existing test. The next whole-ledger run returned 59 passed, 36 warnings in
1.28s, before the final three behaviors were added individually.

## Final mock-only commands and complete output

Executed from the repository root, with:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'
$env:PYTHONPATH=(Join-Path (Get-Location) 'backend')
python -m pytest --noconftest -p no:cacheprovider backend/tests/mock_only/test_payment_crm_sync.py -q --tb=short --disable-warnings
python -m pytest --noconftest -p no:cacheprovider backend/tests/mock_only/test_doctor_compensation.py -q --tb=short --disable-warnings
python -m pytest --noconftest -p no:cacheprovider backend/tests/mock_only/test_accounting_ledger.py -q --tb=short --disable-warnings
```

Complete stdout/stderr for that final three-command run (each exits 0):

```text
...................................................................      [100%]
67 passed, 113 warnings in 1.67s
.................................................                        [100%]
49 passed, 24 warnings in 0.75s
..............................................................           [100%]
62 passed, 39 warnings in 1.32s
```

Total: **178 passed**. These are in-memory mocks, not Mongo deployment/integration
tests. No backend build/app entry point was run. No frontend build/test was run
here: the user's independently supplied 238 frontend passes and build exit 0
were not reverified or claimed as this continuation's output.

## Static validation output

AST parsing includes all 12 dirty/untracked Python files, including earlier work.
It performs no module imports or database configuration loading.

```text
AST syntax: 12 changed/untracked Python files passed (no imports)
backend/routers/doctors.py:5:1: 'fastapi.status' imported but unused
backend/routers/treatment_plans.py:5:1: 'fastapi.status' imported but unused
backend/routers/treatment_plans.py:6:1: 'typing.List' imported but unused
Pyflakes exit: 1
git diff --check exit: 0
```

Those three unused imports also exist in `git show HEAD:<path>`; they are unrelated
to this continuation and were not removed. A narrower Pyflakes run on the ledger,
treatment-plan service and ledger tests returns 0 with no diagnostics. Whitespace
checks of the untracked ledger and test files with `git diff --no-index --check --
NUL <path>` produce no diagnostics; exit 1 denotes the differing/new file.

## Final worktree status and tracked diff

`git status --short` (includes preserved earlier changes):

```text
 M backend/models/doctor.py
 M backend/models/treatment_plan.py
 M backend/routers/doctors.py
 M backend/routers/treatment_plans.py
 M backend/services/consultation_service.py
 M backend/services/doctor_service.py
 M backend/services/salary_service.py
 M backend/services/treatment_plan_service.py
 M backend/tests/mock_only/README.md
?? backend/ACCOUNTING_LEDGER_PHASE1_VALIDATION.md
?? backend/ACCOUNTING_LEDGER_SLICE.md
?? backend/DOCTOR_COMPENSATION.md
?? backend/compensation.py
?? backend/services/accounting_ledger_service.py
?? backend/tests/mock_only/test_accounting_ledger.py
?? backend/tests/mock_only/test_doctor_compensation.py
```

Tracked diff statistics include earlier work; untracked files are not included by
`git diff`. Review tracked changes with `git diff`; review the full untracked
ledger/test sources with `git diff --no-index -- NUL <path>`.

Final `git diff --stat` output:

```text
 backend/models/doctor.py                   |  29 +-
 backend/models/treatment_plan.py           |  27 +-
 backend/routers/doctors.py                 |   8 +-
 backend/routers/treatment_plans.py         |  76 ++++-
 backend/services/consultation_service.py   |  12 +
 backend/services/doctor_service.py         |  37 ++-
 backend/services/salary_service.py         | 500 +++++++++++------------------
 backend/services/treatment_plan_service.py |  29 +-
 backend/tests/mock_only/README.md          |  30 +-
 9 files changed, 401 insertions(+), 347 deletions(-)
```

## Precise unsupported paths: stop at Phase 1

- Course payment still uses the legacy integer `session_index` URL and does not
  consume stable session IDs or actual receipt/operation bodies. Neither course
  completion variant creates atomic session ledger events. Event-owned plans
  reject these old writers, including mixed plans with newly recorded advances.
- Component payments, component occurrence completion, complex `pay-remaining`,
  and any aggregate remaining-payment mapping remain unimplemented as ledger
  commands. No equal amount/discount allocation was invented. Event-owned plans
  reject legacy component/remaining writers.
- Appointment create/update/status and later receipts still have no appointment-
  owned consultation/advance events, purpose classification, tariff snapshot or
  atomic idempotent consultation completion. Old deposit/distribution behavior is
  not approved event evidence and was not converted. Appointment-to-plan advance
  transfer has no exact atomic/recovery protocol and is not supported here.
- Global payroll is not cut over: supported ordinary plan events (including
  allocations) are event-based, but legacy plan diagnostic previews and old
  appointment calculations remain. Legacy plan reports have existing blockers;
  do not treat appointment/legacy diagnostic salaries as approved event payroll.
- Initial-payment create, no-event generic PUT, internal object-call deposit,
  unidentified legacy completion/payment, and consultation-sheet legacy writers
  still retain earlier compatibility behavior. They create no ledger evidence.
  Event-owned plan edits/deletes are guarded; cross-document sheet-only edit/delete
  versus first plan event remains an unresolved race.
- No backfill/identity migration or DB-backed verification is supplied. Duplicate
  catalog rows require an explicit stable row ID; the unmodified frontend omits
  it, so ambiguous targets fail closed rather than selecting an array position.

This is **not** a full ledger rollout and is not deployment authorization.
