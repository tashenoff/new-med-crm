# Monthly doctor salary

The fourth main `payment_type` is `monthly`. It reuses `payment_value` and
`currency=KZT`; there is no new collection, salary account, payout or migration.
The amount must be explicitly supplied when selecting this type (zero is valid).
120000 in the tests is synthetic example data, never a default.

The existing DoctorCreate/DoctorUpdate/Doctor read path retains the type and
amount. The UI writes general mode and consultation mode none for a monthly
doctor. The main monthly type always owns the salary even if an API caller
retained older individual overrides or separate consultation settings.
It is not offered as a separate consultation tariff.

SalaryService includes every active monthly doctor, including doctors with no
appointments, patients or configured services. For a range within one calendar
month, `calculated_salary`, `total_salary` and the summary include the configured
amount once. The range/history limits below describe other periods. Per-service receipts,
completions and consultations add zero compensation under this type. Existing
ledger snapshots retain their identities; new monthly snapshots produce zero
service compensation. The three previous formulas and snapshots are unchanged.

Revenue and appointment columns stay visible and use their existing calculation.
Incomplete patient accounting is surfaced as `revenue_accounting_blockers` and
`revenue_complete=false` on the monthly row, visibly qualified in the salary UI.
It does not prevent displaying an independent monthly amount. Invalid monthly
tariff/currency still blocks salary through the existing 409 report mechanism.
The common permission resolver controls read/write/report access, including its
existing active super_admin override; no new role or permission is introduced.

## Exact period/history limits

- The existing UI retains its two arbitrary date inputs, date-from and date-to;
  the report is for all active doctors, not one selected doctor. The default is
  the first day of the current local month through today. Existing percentage,
  fixed and hybrid rows keep their previous selected-period calculation.
- A range within **one calendar month** displays the full current monthly amount,
  including a shorter range inside that month. For cross-month/reversed ranges,
  the current `monthly_salary` and tariff stay visible, while only that row's
  `calculated_salary`/`total_salary` are null. No new period-related 409 is raised.
  The summary sums the other computed rows, with `salary_total_complete=false`;
  UI labels it as a subtotal and explicitly states monthly salaries are excluded.
  Thus a monthly doctor cannot block the existing three schemes for arbitrary
  ranges. No multi-month multiplier, day/hour proration, attendance or schedule
  rule is invented. Existing accounting/settings 409 behavior stays intact.
- Doctor profile tariffs have no effective-date history. The amount is explicitly
  marked `salary_settings_basis=current_doctor_profile` and the UI explains this.
  Selecting an older month displays the **current configured monthly amount**;
  changing that amount changes such a preview. This is not a historical snapshot
  or a record of an actual payout. Switching payment types has the same missing
  monthly history limitation. No historic monthly accruals are reconstructed or
  added to old service event snapshots.
- The default UI range uses the shared `localDateKey` helper. This avoids the
  previous local-midnight/UTC shift into the prior month in Asia/Almaty.

## Safe QA

Only isolated mock tests with `--noconftest`, Mongo constructor/network guards,
and a localhost synthetic UI harness are used. No application startup, live DB,
real patient data, production calls, push, deploy or payouts are part of this work.
See `tests/mock_only/README.md` for the safe test pattern. Include
`test_doctor_monthly.py`, `test_doctor_compensation.py`, and
`test_accounting_ledger.py`, with `CRM_FRONTEND_CHECKOUT` pointing at the frontend
checkout for the real modal -> HTTP -> persistence -> modal readback contract.

Frontend: `node --test tests/doctorCompensation.test.mjs tests/doctorCreate.test.mjs
tests/doctorPermissions.test.mjs tests/financeAccess.test.mjs` and `npm run build`.
For visual QA, run `node tests/browser/doctorMonthlyPreview.mjs`, then
`python tests/browser/doctorMonthly.py --out <task-evidence-directory>`.
The latter uses already installed Chrome on desktop and mobile viewports.
