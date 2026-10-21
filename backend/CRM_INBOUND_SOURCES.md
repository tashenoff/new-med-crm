# Incoming clinic numbers and existing CRM sources

Mappings live in `crm_inbound_source_mappings` in the same database as
`crm_sources`. The existing application has no tenant/clinic ID on these models;
its CRM isolation is the installation database. Native Mongo `_id` uniqueness
on the normalized international phone number enforces one source per number,
including concurrent/formatted-alias inserts, within that scope. There is no new
source catalog, migration, live backfill, index job or provider configuration.

The source create/edit UI reveals an optional clinic-number field for phone
sources. Legacy phone sources without a binding are valid. Existing bindings
survive source name/type edits. A binding must be explicitly removed before its
number can be replaced; source deletion rejects still-bound numbers.

## API and rights

All endpoints below are under `/api/crm/inbound-source-mappings`.

| Method/path | Purpose | Access |
| --- | --- | --- |
| GET (root) | Phone/source-ID pairs | Active clinic staff, excluding patient |
| POST `/validate` | Normalize/check a free number before creating a source | Admin/super-admin |
| POST (root) | Bind `{phone_number, source_id}` | Admin/super-admin |
| PUT `/{phone}` | Reassign to `{source_id}` | Admin/super-admin |
| DELETE `/{phone}` | Unbind for future calls | Admin/super-admin |

Create/update requires an existing active source. UI/API numbers must explicitly
include `+` and country code; `phonenumbers` parses without a default region,
validates assigned international numbering structure and canonicalizes formatting.
National trunk prefixes, extensions, letters and ambiguous local numbers are
rejected. Formatted aliases conflict with HTTP 409. Missing/invalid/inactive source
or invalid number returns 422; missing mapping returns 404. Delete returns 204.
The UI retains a created source ID if a later concurrent binding insert fails,
preventing duplicate catalog entries when the user retries.

## Webhook attribution and history

[Zadarma's official contract](https://zadarma.com/ru/support/api/) supplies
`called_did` for `NOTIFY_START` and `NOTIFY_END`; `caller_id` is the caller.
Only `called_did` is used for incoming source attribution. Provider DID digits
may omit `+`, but are still parsed as a complete country-code-prefixed number;
there is no 8→7, local-prefix or caller-number fallback. Missing/unmapped/invalid
DIDs and missing/inactive sources stay unattributed. New unknown-source leads
keep the pre-existing generic `phone` source and null `source_id`.

Each new call reserves a deterministic native `_id` from its PBX call ID before
creating/linking a CRM card. Its DID/source ID/name/type snapshot is frozen with
that reservation. An atomic capture claim prevents duplicate card creation on
concurrent retries. Events without a stable PBX/call ID are acknowledged without
creating calls/cards. Recording events use the same reservation and may arrive
before START; the first real call event supplies caller/DID data.

An existing patient's call stores the new call's attribution but does not create
a new patient card or change its original source. An existing active lead is
linked unchanged, including manually chosen sources. Only a newly created lead
receives mapped `source_id` and the catalog's current source type. Outgoing calls
never acquire incoming attribution or create incoming leads. Map changes affect
future calls; replaying a captured or legacy call does not rewrite history.
Normal statuses, recording links and durations continue updating independently.
Call responses expose `called_did`, `source_id`, `source_name`, `source_type`.

CRM linkage retains the existing best-effort behavior: errors are logged, the
call reservation remains, and a retry cannot create another card for that call.
There is no automatic repair of historical or failed links in this change.

## Mock-only checks

Install the declared `phonenumbers>=9.0,<10` dependency in the execution runtime.
Do not run the integration fixtures against a real database. From repo root:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'
$env:PYTHONPATH=(Join-Path (Get-Location) 'backend')
python -m pytest --noconftest -p no:cacheprovider backend/tests/mock_only/test_inbound_sources.py -q --tb=short --disable-warnings
```

The suite forbids Mongo clients and network connection helpers, uses an in-memory
ASGI app, and stubs recording downloads/tasks. It covers international format,
aliases, permissions, legacy inactive sources, uniqueness/isolation, form JSON
and URL-encoded provider payloads, caller versus DID, existing patients/manual
sources, unknowns, outgoing calls, concurrent replays, recording-before-START,
and unchanged history after mapping changes.
