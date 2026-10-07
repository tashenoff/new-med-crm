# Lead modal: history and data

The `История и данные` modal loads the existing read-only
`GET /api/crm/leads/kanban` projection when opened. It finds the selected lead
either as a canonical card or inside `linked_inquiries`, so later inquiries
show the same identity history. The regular lead listing is unchanged.

## Telephony findings

`backend/models/telephony.py` describes `patient_id`, `lead_id`, a legacy
`client_id` (patient or lead), `phone_number`, direction, status, duration,
timestamps and recording metadata. The webhook in `backend/routers/telephony.py`
writes `patient_id` or `lead_id`, plus `normalized_phone`. Its normalization
retains **only the last ten digits**, unlike the full-phone normalization used
by the first-touch Kanban. Webhook lifecycle events normally update the existing
document by `pbx_call_id`, rather than create a new document for each event.

These findings come from repository schemas and readers/writers, not inspection
of a live database. No database operations or migrations are required.

## API additions

Each `KanbanLeadResponse` includes:

- `call_count`: the number of associated persisted `telephony_calls` documents,
  counted once per document, independent of the inquiry's channel or number of
  linked inquiries. It is not a count of leads, contact attempts, or recordings.
- `call_timeline`: at most the latest 100 associated call documents, containing
  string ID, phone, direction, status, disposition, duration, creation time and
  notes. Raw webhook payloads and recording URLs are not exposed here.
- `call_timeline_truncated`: whether the exact count exceeds the timeline limit.

The count is computed before the timeline limit. Missing/invalid dates sort
after dated calls; ties use document ID. Naive telephony timestamps are treated
as UTC, consistent with the webhook's `datetime.utcnow()` writes.

## Association rules

1. Existing patient links on any inquiry in the group take priority. Unlinked
   groups may resolve a patient only through a unique full normalized phone
   match in `patients`, including the legacy patient `_id` fallback.
2. Calls use explicit `patient_id`, then `lead_id`, then an unambiguous legacy
   `client_id`. Conflicting patient/lead links are excluded. Unknown explicit
   links do not fall back to a different identity's phone.
3. Calls with no explicit links may match an unambiguous full normalized
   `phone_number`. Formatting and the regional eleven-digit `8`/`7` prefix are
   normalized. Country-code differences, invalid and placeholder phones, and
   shared-phone groups are not conflated.
4. `normalized_phone` helps retrieve candidates, but its legacy ten-digit
   suffix alone is **not proof of identity**. A normalized-only call is matched
   only if it contains a full number longer than ten digits. Records with only
   a suffix and no explicit link/full phone remain unattributed, rather than
   inflate the count or leak another patient's history.

Call association uses batched patient and call reads rather than a call query
per card; existing HMS/manager enrichment may still query per card. All matching
call documents are loaded for the exact count; the timeline limit bounds
response size, not query cost. At large scale, indexed identity
projection and paginated history should replace full-board modal loading.

The modal displays separate call and inquiry sections, retaining HMS treatment
plans, appointments and tasks. HMS uses the server-resolved or explicitly linked
patient ID, not a client-side ten-digit suffix lookup. History fetch errors are
shown as unavailable, not misrepresented as zero calls. Out-of-order modal
responses cannot overwrite a newer selected lead's data.

## Database-free verification

`backend/tests/test_crm_lead_calls.py` uses in-memory query evaluation and mocks,
covering count semantics, multiple association paths, conflicts, shared phones,
country-code/suffix collisions, invalid numbers, patient resolution, timeline
ordering/truncation, safe serialization and Kanban response integration.
`test_crm_first_touch.py` retains first-touch and scheduling regression coverage.
Do not run tests using the `clean_db` fixture when database access is prohibited;
that fixture drops test collections.
