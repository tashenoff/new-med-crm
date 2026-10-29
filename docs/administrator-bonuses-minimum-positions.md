# Minimum source positions and stages

Backend base: `139b7af1d8c5472c765481bb741c71a46709105f` (`ref-2`).
Frontend base: `f94c3d4b29195a61257c8b11f0adf4645c0a97e1` (`main`).
No publication, production configuration, migrations or historical rewrites.

## Confirmed rule

Count existing payment units of the whole source plan/assignment, including
still unpaid units. An ordinary service/analysis row is one position. Each
complex component and each course session is one stage: a five-session course
counts as five. The parent row is not counted again alongside its stages.
A source with fewer than two units receives no bonus in either rate mode.
An ordinary row's quantity, today's payment targets and the patient's other
plans do not contribute a different source count.

Two or more source positions keep the existing per-receipt calculation and
fixed-on-first-payment deduplication. An aggregate payment still creates one
receipt and bonus per position. September's urine payment of 3000 and October's
remaining 10500 qualify because all three positions belong to the same plan.

For ineligible new receipts, no `admin_bonus` snapshot is added. There is no new
persistent status, collection or entity. Existing snapshots remain unchanged
and remain in their historical monthly register; there is no recalculation,
retroactive award, deletion or reversal.

Consultation assignments already create a `treatment_plan` with `services` and
`consultation_sheet_id` (`ConsultationService._create_treatment_plan_from_consultation`).
After the first ledger event, the existing `reject_ledger_writer` prevents
generic edits to the plan and its linked sheet. The receipt's existing CAS
includes the service rows, so a concurrent edit cannot publish a stale decision.

## Shared implementation

`payment_positions` in `services/payment_completion_service.py` is the existing
payment-unit traversal extracted from `payable_targets`. Settlement adds its
unchanged price validation via `payable_targets`; eligibility counts the same
identities in `_insufficient_source_positions`. Counting does not introduce
price validation for a different unpaid sibling. No compound/course exception,
deferred branch, unresolved policy or persistent policy switch remains.

For 13500 = 7000 + 3500 + 3000 at 5%, the register retains three bonuses:
350, 175 and 150. The employee summary of 675 does not replace those entries.
The authenticated recipient, rate history and receipt CAS remain shared.

Synthetic tests cover one session/component, five sessions paid separately or
together, a three-stage complex, a mixed source, fixed/percentage partial
payments and retries, distinct source plans, the September/October example,
and preservation of pre-rule bonuses. No new model or status is introduced.
