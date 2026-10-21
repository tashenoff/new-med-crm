# Workspace permission contract

The four groups are HMS, CRM, Warehouse and Finance. `src/utils/permissions.js`
contains all 39 keys, the URL guard mapping and the default destination selector.
There is no client-side admin/super_admin permission bypass.

Staff writes always send `permission_mode: "explicit"`. The selected
`custom_permissions` array replaces the role preset. An empty array denies
business access. Changing the role does not change the array. The user can apply
the role preset with a separate button; it never selects payroll implicitly.
Legacy records must be reopened with effective `permissions`, then saved as an
explicit list. New-account omitted permissions deny; omitted update fields
preserve current grants. Backend validation rejects null and unknown keys.

`finance_view` does not imply `payroll_view`. Payroll routes/screens and doctor
compensation require the latter explicitly. Ordinary finance screens are still
demonstrations and are labelled accordingly; their display does not imply a
working financial CRUD backend. Existing backend role/ownership restrictions
remain additional conditions. Some old business action buttons still rely on
server 403 instead of complete permission-based disabled/hidden UI.

Frontend and backend must ship as a reviewed pair. The backend audit and full API
matrix are in `docs/permissions/AUDIT.md` and `api-inventory.csv` on branch
`audit/permissions-backend` (separate ref-2 checkout). MCP/grants were explicitly
out of scope: its legacy role union must be reviewed before claiming uniform
effective permissions across access methods. Mixed-clinic databases and historic
raw upload URLs are also release blockers, described in that audit.

Tests: `npm test`; `npm run build`. The repository has no project-wide ESLint
config/typecheck script. The changed permission modules can be checked with
the existing `tests/patientTerms.eslint.cjs` configuration. Isolated browser smoke
and synthetic screenshots are retained in task-3/browser-qa and task-3/evidence;
the smoke blocks external network, mocks API and uses its own browser context.


Action controls use explicit view/edit/delete/export checks through canAction/permissionProps; role alone does not enable them. CRM drag/drop and message send handlers also check current rights. ModalManager receives current user from App, overriding stale modal props. Clinical/payment workspaces receive separate payment/completion capabilities; full-payment auto-completion requires both. Document links download a blob from our own authenticated API after patients_view + patients_export validation. Public raw uploads are not restored. Source/DID mapping retains its original admin/super_admin constraint in addition to CRM keys. Generic presentation-only payment components keep optional capability props for standalone reuse; every application mount passes computed capabilities.
