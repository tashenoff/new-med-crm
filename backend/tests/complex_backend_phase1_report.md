# Complex services: backend correction phase 1

Worktree: `E:\crm-complex-services-backend-fix`; branch: `fix/complex-services-backend`.

## Safety and scope

- Tests ran serially against the validated local MongoDB endpoint, with `DB_NAME=medcrm_test`.
- Test setup now rejects other endpoints, replica-set configuration, and an unexpected database name before collection cleanup.
- No credentials or environment values were printed. No production database, migration, deployment, commit, push, or Codex model/provider change was performed.
- Salary calculation is unchanged.
- Only the four test modules listed below were run, not the entire backend suite. The root-level hybrid-payment script was inspected but not run: it bypasses the backend test conftest and also tests salary behavior.

## Implemented corrections

1. Consultation updates find plans by `consultation_sheet_id`, not patient/doctor/date text. Existing complex financial/component/execution snapshots survive edits. Paid complex rows cannot be removed, and preserved row prices determine updated plan cost.
2. Ordinary row/session payments and generic plan payment updates cannot pay complexes without component settlement. New complex rows cannot inject pre-paid component data. Appointment deposit funding no longer marks a complex-containing plan paid without settling its components.
3. Component, ordinary-row, and course-session payment paths use the same receipt/discount plan calculation. Partial complex receipts count; discounted regular receipts are not replaced with nominal prices. Discounts settle balances without becoming cash receipts.
4. Complex shares use the entire line price, including multiple package units. Both `quantity` and consultation-style `quantity_total` are supported.
5. Remaining-payment discounts are distributed in cents, evenly where possible and capped by each share. Remainders are conserved, including zero receipts and highly uneven shares. Fractional package prices do not become extra receipts. Percentage discounts are retained in monetary settlement, and tiny rounded components cannot have negative monetary discounts.
6. A component payment or whole remaining payment is one atomic plan-document update. Compare-and-set retries preserve concurrent component payments; retries of already settled components do not rewrite receipts or spend deposits again. Covered stale consultation/generic/ordinary/session payment writers reject conflicts with HTTP 409.
7. New plan and catalog component names/prices are hydrated from canonical catalog entries. Catalog edits cannot clear a complex's composition or convert an empty regular service into a complex. Missing, invalid, duplicate, or all-zero snapshot weights fail closed rather than recording zero-share payments.
8. Component receipts consume existing plan deposit balance, or initialize it from appointment deposits plus `extra_deposit`. Explicit zero balances are respected. Component and parent `paid_from_deposit` amounts are tracked and discounts do not consume deposit funds.

Existing routes and document keys remain in use; no schema migration was added. Financially unsafe mutations now return HTTP 400, while covered conflicting edits return HTTP 409.

## Focused TDD commands and results

All commands ran from `E:\crm-complex-services-backend-fix\backend`. For each table row, `<test>` is the exact test selector in that row:

```powershell
# A
python -m pytest tests/test_complex_integrity.py::<test> -q
# B
python -m pytest tests/test_complex_integrity.py::<test> -q --disable-warnings
# C
python -m pytest tests/test_complex_integrity.py::<test> -q --disable-warnings --tb=short
```

Each new regression was run before its corresponding fix and then rerun green before proceeding. Parameterized cases within each command were also serial. The concurrency regression coordinates two coroutines within one test/fixture; it does not run fixtures or tests in parallel.

| Exact `<test>` selector | Red command/result | Green command/result |
| --- | --- | --- |
| `test_consultation_update_preserves_linked_complex_state` | A: 1 failed; wrong plan selected | B: 1 passed |
| `test_ordinary_payment_rejects_complex_rows` | B: 3 failed; no rejection in row/session/plan flows | B: 3 passed |
| `test_mixed_plan_counts_receipts_and_discounts` | B: 3 failed; receipts overcounted or partial components omitted | B: 3 passed |
| `test_multi_unit_complex_charges_all_units` | B: 2 failed; only one package unit charged | B: 2 passed |
| `test_remaining_uneven_shares_record_exact_receipt` | B: 3 failed; recorded 92.34/100/32.34 for receipts 90/99.99/0 | B: 3 passed |
| `test_concurrent_component_payments_keep_both_receipts` | B: 1 failed; one component receipt lost | B: 1 passed |
| `test_component_details_hydrated_from_catalog` | B: 3 failed; zero/forged catalog snapshot details retained | B: 3 passed |
| `test_component_payment_consumes_deposit_by_receipt` | B: 3 failed; missing/unchanged deposit accounting | B: 3 passed |
| `test_component_payment_retry_preserves_receipt_and_deposit` | B: 1 failed; receipt overwritten and deposit spent again | B: 1 passed |
| `test_new_plan_complex_components_use_catalog` | B: 3 failed; consultation/create-plan paths copied zero prices | B: 3 passed |
| `test_component_percentage_discounts_settle_nominal_price` | B: 1 failed; percentage discounts absent from settlement | B: 1 passed |
| `test_remaining_payment_cannot_persist_half_a_receipt` | B: 1 failed; injected second-write failure left 35 of a 90 receipt | B: 1 passed |
| `test_invalid_receipt_is_rejected_without_mutation` | C: 12 failed; invalid amounts silently accepted | C: 12 passed |
| `test_invalid_composition_cannot_create_zero_share_package` | C: 8 failed; invalid/zero compositions accepted | C: 8 passed |
| `test_appointment_deposit_does_not_settle_complex_components` | C: 1 failed; funding alone marked plan paid | C: 1 passed |
| `test_generic_plan_edit_cannot_overwrite_complex_receipts` | C: 3 failed; parent/component/removal edits overwrote receipts | C: 3 passed |
| `test_fractional_package_price_is_not_rounded_into_extra_receipts` | C: 1 failed; 101 recorded for a 100.60 package | C: 1 passed |
| `test_stale_plan_writer_cannot_erase_component_payment` | C: 3 failed; stale consultation/row/session writers overwrote payment | C: 3 passed |
| `test_new_complex_row_cannot_bypass_catalog_or_payment_flow` | C: 3 failed, 1 passed; added rows bypassed hydration/payment guards | C: 4 passed |
| `test_catalog_edit_cannot_create_empty_complex` | C: 2 failed; empty composition edits/conversions accepted | C: 2 passed |
| `test_consultation_edit_keeps_paid_complex_financial_snapshot` | C: 2 failed; paid removal allowed and preserved row cost replaced by 200 instead of 100 | C: 2 passed |
| `test_percentage_discount_cannot_overpay_tiny_rounded_share` | C: 1 failed; negative component discount | C: 1 passed |

Two assertion refinements were made during TDD, not hidden production fixes: the uneven-share test initially inherited an unrelated expected total of 200 after insertion; the consultation financial-snapshot test was narrowed to financial fields instead of rejecting harmless added display defaults. The consultation test was rerun red after that refinement before implementation. The retry test compares persisted snapshots because MongoDB normalizes datetime precision.

## Serial relevant-test validation

Exact command (run several times as regressions were added):

```powershell
python -m pytest tests/test_complex_integrity.py tests/test_complex_payment.py tests/test_complex_services.py tests/test_complex_scheduling.py -q --disable-warnings --tb=short
```

Results, in execution order:

- 73 passed, 201 warnings, 11.40 seconds; exit 0.
- 81 passed, 204 warnings, 11.99 seconds; exit 0.
- 85 passed, 203 warnings, 12.54 seconds; exit 0.
- Final: **86 passed, 203 warnings, 13.53 seconds; exit 0** (62 new parameterized regression cases and 24 existing cases).

Warnings include existing Pydantic/Starlette deprecations. No broader suite pass is claimed.

Additional validation from the worktree root:

```powershell
git diff --check
```

Result: exit 0, no whitespace errors.

## Files changed

- `backend/routers/appointments.py`: complex-plan deposit funding safeguard.
- `backend/routers/treatment_plans.py`: ordinary-flow guards, shared receipt calculation, stale-write checks.
- `backend/services/consultation_service.py`: stable plan link, snapshot preservation, paid-removal guard, stale-write check.
- `backend/services/service_price_service.py`: canonical hydration and composition validation.
- `backend/services/treatment_plan_service.py`: receipt calculation, payment/edit guards, quantity/shares/discounts, atomic payments, deposit accounting.
- `backend/tests/conftest.py`: fail-closed local test database safeguards.
- `backend/tests/test_complex_integrity.py`: 22 focused regression functions, 62 parameterized cases.
- `backend/tests/complex_backend_phase1_report.md`: commands, results, scope and outstanding limitations.

## Unresolved / deliberately deferred

- Salary calculation/business policy remains untouched as requested.
- No legacy records were repaired or consultation links backfilled. An unlinked old plan is not matched by patient/date text; malformed historical component snapshots are rejected, not silently repaired or repriced.
- Concurrency protection is bounded to the covered payment/edit paths. This is not global hardening of every execution-status or other array writer. Compare-and-set retries are bounded to eight attempts, after which component payment returns HTTP 409.
- Consultation-sheet and treatment-plan writes remain separate operations, not a multi-document transaction; a consultation sheet can already be updated when plan synchronization rejects an invalid edit or detects a conflict. Plan receipts remain protected, but cross-document transactional consistency requires separate work.
- Deposit accounting preserves the existing plan-local/patient-appointment contract. Cross-plan shared-deposit reconciliation, deposit top-up races, and a redesign of patient-level funding allocation were not implemented or claimed tested.
- No frontend, HTTP end-to-end, production-data reconciliation, or entire-suite validation was performed.
