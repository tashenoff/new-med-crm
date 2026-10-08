# Doctor-compensation ledger: ordinary, course, component and plan-advance slices

## Scope and rollout status

This is a partial backend implementation, not a completed rollout. It adds a
forward-only ordinary-service, stable course-session and complex-component
receipt/allocation/completion and same-plan advance paths through atomic source
persistence and ledger-based payroll. No database connection, migration, backfill,
server launch, frontend modification, commit, push or deployment is required or
performed. The pre-existing compensation changes are retained.

Events live exclusively in the owning treatment plan's `accounting_events` array.
A command uses one conditional update containing `$push` for the event and `$set`
for source/payment/completion state. It does not use transactions, another event
collection or payment-log inserts. CRM synchronization occurs after persistence;
a retry does not reapply a receipt or change its tariff snapshot.

## Ordinary-service API contract

- `POST /treatment-plans/{plan_id}/service-rows/{service_row_id}/receipts`
- `POST /treatment-plans/{plan_id}/service-rows/{service_row_id}/occurrences/{occurrence_id}/complete`
- Existing `POST /treatment-plans/{plan_id}/services/{service_id}/mark-paid` accepts
  the receipt command plus the stable `service_row_id` in its body. It also maps
  frontend `amount`, `discount_amount`, `funding_source`, `payment_method_id` and
  `payment_method_name` without discarding dictionary identity. The catalog
  `service_id` must match that row. If the frontend omits row identity, only one
  matching prospectively identified catalog row can resolve it; ambiguous or legacy
  targets are rejected. A prospectively identified row cannot use the
  old mark-paid body without an operation UUID.

Receipt body:

```json
{
  "operation_id": "76a0a9b7-62c5-4dba-9a5d-310f4ed8701f",
  "amount_kzt": 300,
  "discount_amount_kzt": 200,
  "payment_source": "cash",
  "payment_method": "cash"
}
```

`amount_kzt` is the **actual net amount received in this command**, not a gross
price, cumulative balance or inferred deposit. `discount_amount_kzt` is the total
discount against this row's stored total price, not a discount applied again on
every partial receipt. It defaults to zero on the first receipt and is locked
after that receipt; repeat its same total on subsequent receipts. For a 1,000 KZT
row discounted by 200 KZT, receipts of 300 and 500 KZT settle 800 KZT and accrue
percentage compensation on 800 KZT exactly once. Overpayments and nonpositive,
nonfinite, boolean or sub-cent amounts are rejected with 422.

The `cash` source means newly received money, including a bank/card receipt whose
method is explicitly named. It does not mean a deduction from a plan balance.
`plan_credit` is still rejected. `plan_advance` explicitly allocates event-backed
same-plan credit instead; it never uses appointment deposits or legacy balances.

The stable completion route accepts `{"operation_id": "<caller UUID>"}` plus
optional matching `service_row_id` and `occurrence_id` body identities. Its occurrence ID
comes from the row's prospectively generated `occurrence_ids`; it is not an array
index or an ad-hoc caller completion counter. The frontend's deterministic
`occurrence:<encoded plan:service:ordinal>` alias resolves to an existing prospective
occurrence ID, never to a historical completed counter. Both spellings deduplicate
the same occurrence. The existing `services/{service_id}/mark-completed` route
requires an operation and occurrence for prospective rows and calls the atomic
ledger service. It does not increment an unprotected counter. A second operation UUID cannot
complete the same occurrence. Completions accrue only the fixed part and never
accrue a percentage on price, paid status or a cumulative balance.

Accounting routes return `{"event": <persisted event>, "plan": <updated plan>}`.
Retries preserve the immutable event and return the current plan projection.
Operation IDs are scoped to the
owning source document. Canonical target/body equality returns the same event;
reuse with a different body/target/kind is 409. Integer/decimal-equivalent KZT
amounts and UUID spellings normalize before hashing. A request cannot supply
doctor, event timestamps, compensation, currency or other unknown fields.

The earner is resolved from the row doctor, otherwise the plan's assigned doctor;
the authenticated recorder is stored separately. Missing identity, doctor or
invalid tariff fails closed. General and existing individual fixed/percentage
tariffs resolve at command time. Hybrid records the percentage only on receipts
and the fixed KZT amount only on completed occurrences. Later doctor edits do not
rewrite events. Occurrence and recording times are server UTC, with BSON
millisecond precision; reads/retries normalize BSON's naive UTC datetimes without
rewriting storage. There is no caller-supplied historical timestamp.

Concurrency uses the original services, event array, plan payment state, doctor
assignment and update timestamp as an optimistic condition, together with UUID
exclusion. On conflict it rereads and retries up to five attempts, then returns a
retryable 409. Events and source changes are never written separately.

## Same-plan advances (Phase 1)

`POST /treatment-plans/{plan_id}/add-deposit` accepts an explicit dictionary body:

```json
{
  "operation_id": "76a0a9b7-62c5-4dba-9a5d-310f4ed8701f",
  "amount": 500,
  "payment_purpose": "plan_advance",
  "payment_method": "card-dictionary-id",
  "payment_method_id": "card-dictionary-id",
  "payment_method_name": "Card",
  "note": "Unallocated advance"
}
```

It appends one `plan_advance` in the owning plan document, without a doctor,
service attribution, salary, appointment query, payment-log insert, or automatic
distribution. It does not change service paid state. Missing purpose/operation,
nonpositive actual amounts, unknown fields and conflicting method identities are
rejected. The old `AddDepositPayment` object remains only for internal legacy
call compatibility; HTTP requests use the explicit dictionary contract.

Ordinary payment with `funding_source=plan_advance` sends the actual `amount` and
total `discount_amount`, but no new-receipt method. It appends a
`service_advance_allocation` for the exact stable row and amount atomically with
the row and plan projections. It requires a positive balance backed by validated
prior `plan_advance` events in this same document, less preceding allocations.
Malformed/cross-plan advances and overdraw fail closed. Aggregate legacy balances
are not converted into events and cannot authorize an allocation.

`advance_balance_kzt` is recalculated from these events on single-plan and patient
plan-list reads and accounting responses; stored balance projections and historical
appointment deposits are never substituted. Legacy deposit fields remain read-only
display data. Allocations snapshot the earning tariff once at allocation time and
accrue only its percentage part. Advance receipt itself accrues nothing. Ordinary
ledger payroll counts the allocated amount once in the allocation UTC period,
not at advance receipt time. Cash receipts and allocations share the same locked
total-discount semantics; payment and execution projections derive from events.

## Source protection and payroll

Plan creation generates stable row/occurrence IDs, nested component/occurrence
IDs and session IDs. Both consultation-created-plan insert paths also generate
IDs. Reads do not backfill missing IDs. Generic PUT rejects replacement of known
stable row/occurrence/component/session identities. Create/PUT schemas reject
client-supplied top-level and nested accounting-event arrays.

Once any event exists, legacy ordinary/course/component/deposit writers, generic
plan PUT, plan deletion and linked consultation-sheet edits/deletes fail with 409.
Plan writers also condition their write/delete on the absence of events so a
concurrent first append cannot be erased. This is a conservative whole-plan lock,
not a granular edit policy. The shared payment hook also guards appointment
deposit-distribution writes into event-bearing plans.

For event-bearing plans the salary service selects by event earner, independently
of current doctor service eligibility, assignment or tariff, and sums only
verified event amounts in the inclusive requested UTC interval. It verifies event
identities, canonical request hash, currency, occurrence uniqueness and arithmetic
against the stored snapshot. Invalid events and uncovered/unlinked plan rows
remain report blockers; uncovered rows are not silently dropped. Existing HTTP
409 report protection remains in place.

**Important remaining legacy behavior:** the older no-event calculations are
retained as diagnostic previews to preserve the existing compensation regression
suite. Every selected no-event plan now adds `legacy_ledger_unavailable`, so that
preview is not an approved payroll report and the normal report endpoint blocks
it. The diagnostic service still calculates legacy balances/completion dates from
mutable state; it has NOT been fully converted to event-only reporting. No-event
appointment reporting is also still the pre-existing implementation. A global
event-only payroll cutover is therefore unfinished.

Commands reject legacy source balances/completion state rather than infer events.
Legacy rows lacking stable IDs cannot use these commands. No reconciliation or
backfill operation is provided.

## Precise unresolved route gaps — do not deploy as full ledger

| Existing path | Current slice status / required next work |
| --- | --- |
| Ordinary `mark-paid` | UUID + stable-row command implemented; old unidentified-row compatibility path still writes mutable state without events and produces blocked legacy reports. |
| Ordinary counter completion | Prospective rows require operation/occurrence and call the atomic ledger service; unidentified no-event legacy rows retain the old blocked-payroll compatibility path. |
| Component `mark-paid` | Actual cash receipts and explicit same-plan advance allocations implemented for one stable component; catalog-ID frontend targets resolve only when the prospective row/component is unique. Missing/ambiguous identities and unknown doctor/service links fail closed. |
| Complex `pay-remaining` | Deliberately not ledger-enabled: prospective rows and all event-bearing plans reject this blind aggregate writer. Use explicit individual component/session/service targets, each with its own operation UUID. Unidentified no-event legacy rows retain the old blocked-payroll compatibility path. |
| Explicit component-occurrence completion | Implemented on the stable row/component/occurrence route and `services/{service_id}/mark-completed` with `component_id` + `occurrence_id`. Each prospective occurrence earns one fixed part; another UUID cannot complete it again. The frontend handoff does not document a dedicated component-completion writer; browser integration is not claimed. |
| Course-session `mark-paid` and completion | Stable session receipt/allocation and both documented completion routes implemented and mock-tested. Integer-index/append compatibility remains only for unidentified no-event legacy rows; prospective and event-bearing rows cannot use it. |
| Treatment-plan create with initial payment | Still stores the old cumulative initial payment and runs the existing CRM hook; it does not create a plan-advance event. A subsequent ledger command rejects the unverified balance. |
| Generic PUT payment/execution updates | Still allowed on no-event documents; event-bearing documents are locked. They are not event evidence. New-row addition via PUT is not a complete prospective identity workflow. |
| `add-deposit` | Explicit HTTP plan-advance command implemented; internal old object-call compatibility still uses mutable legacy deposits on no-event documents and is not ledger evidence. |
| Appointment create/deposit distribution | No payment-purpose command, appointment-owned advance/consultation events or atomic appointment receipt; plan writes are protected by the shared hook but distribution remains a legacy writer. |
| Appointment update/status completion | Not converted or tested as ledger writers. Classification/link validation and consultation/service double-count prevention remain unfinished. |
| Additional consultation receipts | No endpoint in this slice. |
| Consultation none/inherit/separate | Existing tariff tests remain green, but no consultation receipt/completion snapshots or appointment ledger persistence are implemented. |
| Explicit plan-advance allocation | Implemented for individual ordinary services, stable course sessions and stable components within the same plan only. Appointment-to-plan transfer remains unsupported. `plan_credit` remains rejected. |
| Consultation-sheet plan edits before first event | Existing reconstruction still needs full stable-ID preservation for ordinary rows; only inserts generate IDs in this slice. Event-bearing linked plan edits/deletes are guarded. |
| Concurrent sheet-only edit/delete vs first plan event | Cross-document preflight is not an atomic sheet/plan lock. The guarded plan update cannot erase events, but a racing sheet-only edit/delete can occur after preflight. Resolving that workflow without assuming transactions remains open. |
| Payroll for all sources | Ordinary/course/component plan events are verified with immutable event-time tariffs and stable child identities. Uncovered complex components are blockers, not silently omitted. Legacy plan previews remain blocked; global no-event/appointment cutover is incomplete and untouched by these slices. |

## Course-session API contract (Slice A)

- `POST /treatment-plans/{plan_id}/services/{service_id}/sessions/{session_id}/mark-paid`
- `POST /treatment-plans/{plan_id}/service/{service_id}/complete` (schedule)
- `POST /treatment-plans/{plan_id}/services/{service_id}/mark-completed` (procedure)

Receipt bodies require the matching stable `session_id`, UUID `operation_id`,
actual positive `amount_kzt` and explicit `funding_source: cash|plan_advance`.
Cash receipts require a method; frontend dictionary `payment_method_id` and
`payment_method_name` are preserved. Advance allocations omit method fields and
spend only verified same-plan advance events. An optional `service_row_id` must
match; if omitted, exactly one prospective catalog row must resolve. Integer
session indices never resolve to stable IDs. IDs come from existing prospective
plan creation (`session_id`, with existing `id` supported as an identity alias).

Partial receipts update `paid_amount`, `amount_due_kzt`, `paid` and
`payment_status` on that session, together with row/plan payment projections.
The upper bound is the recorded session `amount_due_kzt`, otherwise session
`price` / row `session_price` / `price_per_unit` minus **event** receipts and
allocations. These prices/due amounts establish obligations only; they never
create payment evidence or compensation. Session discounts are not supported.
Missing/invalid amounts, sources and methods fail closed, with no inferred defaults.

Both completion routes require `session_id` and `operation_id`; schedule bodies
may also supply the session's existing `date`, which must match and is hashed
into that command. Completion updates the existing session, never appends an
anonymous session or uses a completed counter as identity. A completion earns
only the fixed part; a receipt/allocation earns only the percentage part.
The earning doctor resolves from session, row, then assigned plan doctor at
each event. Every event snapshots that doctor's tariff for the course service.
Canonical replay returns the immutable event and current plan. Changed UUID
reuse or another operation completing the same session returns 409.

## Complex-component API contract (Slice B)

- `POST /treatment-plans/{plan_id}/complex-services/{service_id}/components/{component}/mark-paid`
- `POST /treatment-plans/{plan_id}/service-rows/{service_row_id}/components/{component_id}/occurrences/{occurrence_id}/complete`
- `POST /treatment-plans/{plan_id}/services/{service_id}/mark-completed` also
  accepts `component_id`, `occurrence_id`, `operation_id` and optional matching
  `service_row_id`; `{service_id}` is the owning complex catalog service.

Component receipts accept ordinary frontend payment fields (`amount`,
`discount_amount`, dictionary method ID/name, `funding_source`, `operation_id`),
or their KZT canonical equivalents, plus optional explicit `service_row_id` and
`component_id`. The URL accepts either the concrete catalog component ID the
frontend currently sends or its stable `component_id`. Omitted body identities
resolve only to a unique prospective row/component; missing stable storage IDs,
ambiguous rows/components and contradictory identities are rejected, not guessed.
The catalog link and earning doctor must exist. The event records the component
catalog service, not the parent complex, and snapshots its tariff for the doctor
resolved from component, row, then assigned plan doctor.

Each command targets **one** component. Nominal component obligations use the
stored complex total and component price/quantity weights, retaining the existing
whole-KZT versus cent rounding rule with the residual on the largest weight.
Prices determine bounds only, never actual receipts. `discount_amount_kzt` is
the explicitly requested total discount on that component, locked after its first
receipt/allocation and repeated unchanged on later partial receipts. Unpaid
remainders are not discounts. Only actual event amounts enter `paid_amount` and
percentage compensation. Overpayments and insufficient advances are rejected.
Source updates, component `paid`/payment state and the event are atomic on the
owning plan. No equal discount/advance distribution or blind batch is implemented.

Component `occurrence_ids` are generated prospectively alongside `component_id`
in shared create paths, one per component quantity. Existing identities cannot
be rewritten by a pre-event edit. Completion requires an existing occurrence,
accrues one fixed part, and does not require a receipt price or imply payment.
Canonical receipt/completion retries retain their event-time tariff; changed
operation reuse and duplicate occurrence completion return 409. Complex and
mixed-plan execution/payment projections derive from recorded events. Generic
and legacy event-owned plan writes remain locked.

Payroll verifies `session_receipt`, `session_advance_allocation`,
`session_completion`, `component_receipt`, `component_advance_allocation`, and
`component_completion`, including their target identities, command hashes,
snapshots, amounts and completion uniqueness. It does not substitute mutable
prices, flags or counters for events. Uncovered complex components remain report
blockers. Appointment event persistence and global salary cutover are unchanged.

## Individual RED/GREEN record

Each row below was added and run alone using the documented mock-only command
with a single `-k` selector, observed RED before its implementation, then rerun
GREEN (one focused test passed) before the next test was added. Existing tests
were preserved; no bulk test matrix was introduced. Two initial fixture-only
failures (schedule user fields and component legacy balance) were corrected and
rerun to observe the intended missing-ledger failure before implementation.

| Focused test (`test_` prefix omitted) | Observed RED | GREEN |
| --- | --- | --- |
| `stable_session_receipt_records_actual_partial_amount_atomically` | Session route had no command body/stable-ID interface | 1 passed |
| `session_receipt_payroll_verifies_stable_identity` | Session event rejected by payroll verifier | 1 passed |
| `schedule_session_completion_accrues_fixed_once_and_replays` | Legacy completion returned no ledger event | 1 passed |
| `procedure_route_completes_course_by_session_not_counter` | Session body rejected as ordinary completion | 1 passed |
| `session_advance_partial_settlement_retries_conflicts_and_bounds` | Explicit advance source rejected | 1 passed |
| `session_explicit_unsettled_amount_is_receipt_bound_not_payment_evidence` | Receipt exceeded explicit due without rejection | 1 passed |
| `course_final_completion_projects_status_from_events` | Final course stayed in progress | 1 passed |
| `component_receipt_targets_stable_child_and_snapshots_component_tariff` | Legacy component receipt returned no event | 1 passed |
| `component_frontend_catalog_target_retries_as_canonical_stable_identity` | Frontend catalog target lacked stable-body resolution | 1 passed |
| `complex_create_generates_stable_component_occurrences_prospectively` | Component occurrence IDs absent | 1 passed |
| `component_occurrence_completion_pays_one_fixed_part` | Stable component completion endpoint absent | 1 passed |
| `component_procedure_completion_retries_and_blocks_duplicate_occurrence` | Component body rejected by procedure adapter | 1 passed |
| `component_hybrid_payroll_splits_actual_receipt_and_fixed_occurrence` | Component events rejected by payroll verifier | 1 passed |
| `complex_execution_requires_every_stable_component_occurrence` | Fully completed complex stayed in progress | 1 passed |
| `component_explicit_advance_allocation_settles_only_selected_discounted_share` | Component advance source rejected | 1 passed |
| `prospective_complex_cannot_use_legacy_payment_or_blind_remaining` | Legacy payment accepted on prospective complex | 1 passed |
| `component_occurrence_identity_cannot_be_rewritten_before_first_event` | Edit accepted rewritten component occurrence identity | 1 passed |
| `course_legacy_counter_is_not_evidence_for_new_session_receipt` | Counter-only legacy row accepted a receipt | 1 passed |
| `mixed_course_and_component_receipts_preserve_event_only_plan_total` | Session receipt discarded component amount in plan total | 1 passed |
| `component_completion_does_not_require_a_receipt_price` | Fixed completion unnecessarily required pricing | 1 passed |
| `payroll_does_not_hide_an_uncovered_complex_component` | Uncovered component silently omitted from blockers | 1 passed |

## Safe validation

Run only the three explicit mock-only commands in `tests/mock_only/README.md`,
with `--noconftest`, plugin autoload disabled, and bytecode writes disabled.
Mongo client construction and network connection helpers are forbidden by the
test fixtures; all documents and writes are in-memory mocks. BSON encode/decode
tests operate on memory bytes, not a database. These tests cannot prove actual
Mongo deployment behavior or provide DB-backed route coverage.

Syntax validation can use `ast.parse` over the changed Python files, which does
not import routes or database configuration. Run Pyflakes on those same files and
`git diff --check`. Do not run app/server entry points, parent conftest fixtures,
database-backed tests, migration scripts or any backfill.

Local validation for these slices: payment/CRM mock suite **67 passed**, doctor
compensation mock suite **49 passed**, ledger mock suite **83 passed** (**199 total**).
All four touched Python files pass AST syntax validation, and `git diff --check`
passes. Scoped Pyflakes is clean for the ledger service, treatment-plan service
and ledger tests; the router retains two unchanged unused-import findings
(`fastapi.status`, `typing.List`). Those unrelated imports were preserved.
No database connection/access/write, server, DB-backed suite, frontend change,
model/config change, branch change, commit, push or deployment was performed.
