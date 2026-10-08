# Doctor compensation contract and accounting blockers

## API settings

- Payroll amounts are KZT. New settings and effective compensation updates reject
  other currencies, negative/non-finite values, and percentages outside 0..100.
- `payment_type`: `percentage`, `fixed`, or `hybrid`.
- `payment_value`: percent for percentage; KZT **per completed occurrence** for
  fixed and the fixed part of hybrid. It is never a monthly salary.
- `hybrid_percentage_value`: hybrid percent of actual receipts after discounts.
- `payment_mode`: `general` uses the main tariff; `individual` uses each service's
  `commission_type` (`fixed` or `percentage`), `commission_value`, and KZT
  `commission_currency`. Explicit mode wins over structure-based legacy detection.
- Doctor creation requires `consultation_compensation_mode`: `none`, `inherit`,
  or `separate`. Separate mode requires explicit `consultation_payment_type` and
  `consultation_payment_value`; hybrid additionally requires
  `consultation_hybrid_percentage_value`. Their semantics match the main tariff.
- Inherit always uses the main fields, even when plan commissions are individual.
  None never accrues consultation compensation.
- Partial updates validate the merged stored/requested compensation before a
  write. Changing compensation on a legacy doctor without a mode requires an
  explicit selection. Personal-data-only edits do not change compensation.

Examples:

```json
{"full_name":"Doctor","payment_type":"hybrid","payment_value":5000,"hybrid_percentage_value":20,"currency":"KZT","consultation_compensation_mode":"inherit"}
```

```json
{"full_name":"Doctor","payment_mode":"individual","services":[{"service_id":"service","commission_type":"percentage","commission_value":20,"commission_currency":"KZT"}],"consultation_compensation_mode":"separate","consultation_payment_type":"fixed","consultation_payment_value":3000,"consultation_currency":"KZT"}
```

## Evidence and period attribution

Calculations never use appointment `price`, service list/gross price, planned
quantity, plan `total_cost`, or fully-paid plan status as accounting evidence.
Partially paid plans are included. Percentage accrual uses identified
service/component/session `paid_amount`, without subtracting discounts twice.
It does not require the corresponding unit to be complete. Fixed accrual is
independent of payment, but requires an explicit completed unit in the period.

The existing completion/receipt paths were inspected:

| Existing path | Evidence | Limitation |
| --- | --- | --- |
| Completed appointments (`models/appointment.py`) | `status=completed`, `appointment_date` | Supports one fixed consultation occurrence; no identified consultation receipt amount. `deposit` may be a percentage or money and is allocated to plans. |
| Course `/treatment-plans/{id}/service/{service_id}/complete` | `sessions[].completed`, `date`, performer | Dated completed sessions support fixed units. Missing session dates are blockers. |
| `/services/{service_id}/mark-completed` | `quantity_completed`, service status | Counter only; no occurrence history/date. Cannot assign these units to a payroll month, nor substitute plan `completed_at`. |
| Ordinary `/services/{service_id}/mark-paid` | Actual discounted `paid_amount` | Does not persist a service receipt date/history. |
| Complex component payment / pay-remaining (`TreatmentPlanService`) | Allocated actual component `paid_amount`, including payment discounts | No component receipt dates; no explicit component completion records in the standard writer. Parent completion cannot be multiplied across components. |
| Course-session `mark-paid` | `paid`, `paid_at` | Does not persist actual `paid_amount`; the existing plan recalculator falls back to price, which payroll deliberately does not do. |
| Plan initial/PUT payments, appointment/deposit allocation, add-deposit | Plan cumulative `paid_amount` / deposits | Not an actual per-service/consultation receipt ledger. No proportional allocation is invented. |

For an explicitly stored service/component receipt, its `paid_at` or
`payment_date` attributes that amount to the period. Existing standard ordinary
and component writers currently lack both. A plan-level payment date is not a
substitute: it is set when fully paid and cleared for partial plans, and cannot
date earlier component receipts. Neither creation nor last-update timestamps
are receipt/completion dates. No new receipts, completion records, timestamps,
backfills, conversions, or migrations are manufactured by this change.

An explicitly assigned component doctor owns the component. Without that
assignment, only the plan's assigned doctor can own it; matching an eligible
service ID alone must not pay multiple doctors. A missing owner is a blocker.

## Reports, consumers, and legacy reads

- `SalaryService` is the only runtime payroll calculator. It returns known
  accruals plus `accounting_blockers` (doctor/plan/service/appointment context),
  `compensation_complete`, and `compensation_currency=KZT`. Missing evidence
  is not represented as a trustworthy zero salary.
- `/api/doctors/salary-report` is its runtime HTTP consumer. It returns HTTP 409
  with `detail.accounting_blockers` if incomplete, rather than letting an older
  UI display partial totals as final payroll. Complete reports keep existing
  `salary_data`, `summary`, and salary/revenue keys, with additive metadata.
- `frontend/src/components/finance/salaries/SalariesView.js` is the only located
  frontend salary-report consumer. The separately scoped frontend implementation
  adds explicit consultation mode selection, inherited main tariff editing even
  in individual mode, per-occurrence labels, KZT-only controls, and visible
  409/accounting-blocker and 422 error handling. These changes are in the local
  feature branch `fix/doctor-compensation-frontend` in the isolated worktree
  `E:/crm-doctor-compensation-frontend`; tests and build passed as reported.
  **The frontend changes are not yet deployed or integrated.** No frontend files
  are modified here. Old create requests without a mode now receive 422.
- CRUD list/detail reads preserve legacy stored currencies and use `mode=null`
  for omitted modes, without inferring intent from old consultation defaults.
  `Doctor` now retains consultation hybrid percentage on create/read roundtrips.
  `DoctorWithSchedule` and available-doctor serialization preserve the same
  compensation fields instead of dropping them.
- Deprecated `hybrid_fixed_amount` is never substituted for `payment_value`.
  Conflicting legacy aliases block accrual; conflicting writes are rejected.
  A legacy currency is preserved in settings/report metadata, not converted to
  KZT; its tariff is blocked. Missing individual tariffs also block accrual.
- Doctor statistics and service revenue reports are not payroll calculators and
  remain unchanged. Repository searches found no payroll consumer in Metabase
  or Superset configuration. `backend/debug_salary.py` and root diagnostic/API
  scripts and older DB-backed payroll tests contain obsolete gross/full-paid
  or salary-like examples: they are not runtime consumers, must not be used as
  payroll authorities, and were not executed or changed.

The accounting blockers above remain unresolved by the frontend changes and
require a separately approved data-model decision, not a guessed salary,
legacy-record mutation, or silent conversion.

## Safe validation

Use only the mock-only commands in `tests/mock_only/README.md`. The focused
compensation tests stub database modules and block Mongo constructors/network
connections before importing backend modules. Do not run the parent test suite,
`clean_db` fixtures, application startup, migration, or diagnostic DB scripts.
