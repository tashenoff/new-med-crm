# Payment / CRM regressions (no database)

From the repository root in PowerShell:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'
$env:PYTHONPATH=(Join-Path (Get-Location) 'backend')
python -m pytest --noconftest -p no:cacheprovider backend/tests/mock_only/test_payment_crm_sync.py -q --tb=short --disable-warnings
```

`--noconftest` is mandatory: the parent test fixtures import Mongo clients.
These tests use only in-memory mocks, stub both database dependency modules
before importing routes, and reject Mongo client creation and `socket.create_connection`.
They do not load database configuration or use `clean_db`.

Payment persistence shares `TreatmentPlanService.sync_persisted_payment`
(updates use `persist_payment_update`):
- Treatment-plan creation carrying an initial payment.
- Treatment-plan PUT payment updates.
- Ordinary-service and course-session `mark-paid` endpoints.
- Complex-component `mark-paid` and complex `pay-remaining` endpoints.
- Treatment-plan `add-deposit` and appointment-creation deposit allocation.

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
