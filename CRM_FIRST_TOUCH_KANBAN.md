# CRM first-touch Kanban

> **Read-only projection is NOT physical cleanup.** All original `crm_leads`
> documents remain, including subsequent touches and their original references.
> Physical deletion is destructive and would currently remove application
> history: the readers have no archived-lead fallback. The offline preparation
> artifact `migrate_crm_lead_duplicates.py` always refuses destructive execution.
> See `docs/CRM_LEAD_DUPLICATE_PREPARATION.md` for blockers, conservative preview
> rules, exact-export backups, phased requirements and rollback/restore guidance.

`GET /api/crm/leads/kanban` is a read-only projection of all inquiry documents.
The regular lead listing and individual document endpoints remain unchanged.
No documents are deleted, merged, or rewritten by the projection.

## Identity and ordering

- Prefer `converted_to_client_id`, otherwise `patient_id`.
- An unlinked inquiry may join a linked identity through a valid normalized phone
  only when that phone identifies exactly one linked identity. Distinct explicit
  links never collapse because they share a phone. Ambiguous unlinked inquiries
  form their own phone group.
- Otherwise group by the full normalized phone (10–15 digits). Formatting is
  ignored; the existing regional 11-digit `8` prefix is normalized to `7`.
  No last-N-digit matching or name matching is used. Empty, short, masked,
  alphabetic, and repeated-single-digit placeholder numbers are not identities.
  Ten-digit numbers are not assumed to have a particular country code.
- Earliest `created_at` wins across all statuses and channels, before UI filters.
  Equal timestamps use document ID as a stable tie-breaker. Missing/invalid dates
  sort after dated inquiries. The earliest document keeps its own status and fields.

The canonical card exposes `linked_inquiries` in chronological order and a
separate `identity_patient_id` for HMS details; the original patient-link fields
are not rewritten. The existing HMS/tasks modal includes inquiry history with
document IDs, timestamps, channels, source IDs, status, contact information,
description, notes, and appointment links. The card summarizes later channels.
Search includes linked inquiries but returns only their canonical card. Column
counters and amounts use the same filtered canonical arrays as rendered cards.
The board also displays the existing `qualified` and `lost` enum statuses.

The board is not limited to the regular listing's default 50-document page.
This complete projection is necessary to avoid choosing a recent inquiry as the
first touch. For very large datasets, server-side indexed identity projection
and canonical-card pagination may be needed; pagination must follow grouping.

## Scheduling semantics (unchanged)

`POST /api/crm/leads/{lead_id}/schedule-appointment` remains `contacted` for the
CRM lead and creates an HMS appointment with status `confirmed`. Evidence:

- `backend/crm/models/lead.py`: `CONTACTED` means scheduled; `IN_PROGRESS`
  means the CRM confirmation stage.
- `EnhancedLeadsView.js`: `contacted` is “ЗАПИСАН НА ПРИЕМ”; `in_progress`
  is “ЗАПИСЬ ПОДТВЕРЖДЕНА”.
- The calendar appointment creation route also writes `contacted` to CRM.

CRM statuses: `new`, `contacted`, `in_progress`, `converted`, `closed`,
`qualified`, `rejected`, `lost`. HMS appointment statuses: `unconfirmed`,
`confirmed`, `arrived`, `in_progress`, `completed`, `cancelled`, `no_show`.
These are separate lifecycles; HMS `confirmed` alone is not evidence to change
the CRM scheduling endpoint to `in_progress`.
