# Administrator bonuses — final local handoff

Final backend checkout: `backend-final`, base `ref-2` at
`69e604eeac8d3e41179fa3b477632e3bc9d54170`.
Final frontend checkout: `frontend-final`, base `main` at
`7a9e1c0ba57027c3a6bf0f6920126fa24bc2e94e`.
These were the remote branch heads verified during preparation. Both include
the published permission fixes and the earlier import fixes (`a188e0a` /
`cea87b3`). The published staff-service and StaffManagementPage files remain
unchanged by this diff. The implementation and tests used isolated synthetic
storage. The user subsequently authorized publication to these branches and
production, and explicitly confirmed `ADMIN_BONUS_TIMEZONE=Asia/Almaty`.

## Final agreed scope

One global fixed OR percentage rate for all services and analyses. No default
price is invented before a manager saves a setting. Bonuses are recorded only
on new direct payments attributed to a concrete service/component/session.

The recipient is the authenticated server receipt `recorded_by`; arbitrary
client recipient IDs are rejected by the existing canonical receipt commands.
The responsible/assigned doctor field is unrelated to this bonus and unchanged.
Percentage uses the actual amount of each position payment. Fixed is awarded
once on its first positive payment, including when different employees collect
later installments. Stable patient-specific position IDs prevent confusing two
performances of the same catalog service. Existing paid history is not backfilled.

Each bonus stores the setting revision and rate used at accrual. Changing the
setting does not rewrite prior amounts. Rounding is half up to cents. Accrual
is appended inside the existing receipt's MongoDB CAS, so retries and concurrent
payments cannot leave orphan or duplicate bonuses. Aggregate payments keep
separate paid bases per position and share one setting snapshot per command.

Advances, deposit returns, payment cancellations/refunds and replacement bonuses
after cancellation are outside this release by the user's final instruction.
Only additions made by this task for those flows were removed: internal reversal
handler, adjustment storage, preview, waiting-rule states and unused UI/tests.
Existing CRM funding/deposit/cancellation mechanisms and physician compensation
formulas are not changed. These excluded flows are not release blockers.

## UI and permissions

Finance > Administrator bonuses (`Финансы → Бонусы администраторам`), route
`/finance-admin-bonuses`. The same page contains `Единая ставка для всех услуг
и анализов` and the register with month/employee filters, patient, concrete
position, receipt, historical rate and bonus amount. It uses the normal sidebar
and search. There are no refund/advance/preview controls or unresolved-rule alerts.

Active `super_admin` has full access to the menu, page, setting and register,
including an empty stored permissions list. This is resolved once through the
existing shared `permission_policy.has_permission` / frontend `hasPermission`
helpers, and the installed API permission guard. The bonus router and page do
not add their own super-admin exceptions or duplicate endpoint scope guards.
Stored grants and role presets are not rewritten. For all other roles, the new
grants have no default role assignment:

* `admin_bonus_manage`: configure the global rate. A manager can use settings
  without access to the patient register.
* `admin_bonus_view` plus `patients_view`: read the detailed employee register.

Normal clinical API responses hide bonus snapshots from users without view
authorization through the same shared helper. Global setting writes use revision CAS and retain setting
history and server author/date. Missing or invalid permissions fail closed.
The existing published protection against failed doctor-permission loading is
preserved and tested.

## APIs and integration

`GET /api/admin-bonuses/settings`, `PUT /api/admin-bonuses/settings`, and
`GET /api/admin-bonuses?month=YYYY-MM&employee_id=...&offset=0&limit=100`.
`GET /api/admin-bonuses/context` supplies the server's configured report zone
and current clinic-local month; the browser does not select them from its clock.
The report filters and paginates in MongoDB and returns per-employee totals.
Account name resolution supports the `id`, string `_id` and ObjectId identities
used by server authentication, plus staff records retained without a user row.

Accrual integration is in `AccountingLedgerService._payment_append` and the
existing staged aggregate-payment path in `PaymentCompletionService`. Existing
receipts, doctor snapshot amounts, clinical completion and CRM synchronization
logic are preserved. No new money-handling subsystem, payout or cash transfer.

## Intentional limits

* Prospective accrual only: no bulk retrospective bonuses for old payments.
* Report months require explicit `ADMIN_BONUS_TIMEZONE` (IANA identifier). There
  is no silent UTC, Bishkek, server-local or browser-local fallback. An absent
  or invalid value returns a clear configuration error; it does not block
  recording real payments. The proposed Kazakhstan value is `Asia/Almaty`.
  Only the commented example was added to `.env.example`. The user confirmed
  `Asia/Almaty` for deployment, independently of rate data; no other production
  configuration, personal permissions or existing payment records are changed.
* No shared configurable clinic timezone was found in the available settings
  model/router or checked local configuration. `reporting/contract.py` hard-codes
  `Asia/Bishkek`; appointment helpers also hard-code UTC+6. These are not changed
  or inherited as a clinic setting. The bonus parameter affects this module only.
* Month bounds are clinic-local midnight, inclusive start/exclusive next-month
  start, converted to UTC for the Mongo query. Receipt/snapshot timestamps remain
  UTC; display uses the explicitly returned clinic zone. Existing `tzdata>=2024.2`
  dependency supplies the Kazakhstan rules. Reference: IANA Asia source,
  https://data.iana.org/time-zones/tzdb/asia (Asia/Almaty represents Astana and
  most Kazakhstan locations; UTC+5 since March 2024).
* For ordinary roles, granular grants must be assigned to authorized managers
  and viewers. Ordinary `admin` does not receive bonus management automatically;
  active `super_admin` has full access through the canonical permission check.
  No current account permissions were read from or written to production.
  Ordinary settings-only access needs `admin_bonus_manage`; the detailed
  register needs `admin_bonus_view` and `patients_view`.
* No payout/export or excluded cancellation/deposit functionality is claimed.

## Verification

The final backend regression slice passed 680 tests, including the new bonus
suite, published legacy-email permission tests, real React-modal/HTTP doctor
compensation contract, existing payment/funding/CRM synchronization guards and
permission boundaries. Real MongoDB tests use only `127.0.0.1:27198`, task-owned
data files and randomly named `admin_bonus_synthetic_<uuid>` databases that are
dropped after each test. No production environment or medical data was copied.

Coverage includes a shared payment for several positions, partial/repeated
payments, two months (September base 3000, October 10500 rather than 13500),
two collectors, fixed without duplicates, percentage, rate history, concurrent
same-event retries and distinct-event payments, settings concurrency, protected
UI and API, and account-identity variants. Excluded funding paths remain intact.

Final logs are in the task workspace: `logs/backend-superadmin-handoff.log`,
`logs/frontend-superadmin-final.log`, `logs/frontend-current-baseline.log`,
and `logs/frontend-superadmin-build.log`. The Vite production build passed.
Final focused frontend checks passed 129 tests, including the newly published
doctor-permission-load guard. Log: `logs/frontend-superadmin-focused-final.log`.
The complete modified frontend run passed 720 tests and failed 16; the unchanged
current `7a9e1c0` baseline passed 708 and failed the same 16. Failure-name sets
are identical, so this diff adds twelve passing checks and no new failing
tests. The pre-existing failures concern calendar booking/status, CRM naming and
two DoctorsPage payload checks; see `logs/confirmed-baseline-failures.txt`.
These unrelated baseline failures remain visible in the handoff; the excluded
advance/cancellation flows are not implementation or release blockers.

Timezone coverage includes local month start/end and unchanged UTC BSON storage,
December/year rollover, leap February, a DST-changing test zone, missing/invalid
explicit configuration, server context differing from host timezone, and a
browser with America/New_York and a deliberately incorrect clock. No global CRM
timezone or real permissions were modified for these checks.

Access coverage uses real JWT authentication and stored roles: active
`super_admin` with no scopes can read and save; inactive super-admin is denied;
ordinary admin/doctor with no scopes is denied, including a forged token role;
explicit manager/viewer grants retain their separate existing scope checks.
Frontend tests cover the actual App route, menu, setting form and register.
Old negative fixtures labeled super-admin now use ordinary admin, preserving
their denial assertions rather than adding component-specific exceptions.
