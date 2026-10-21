# Getting Started with Create React App

## Sales funnel and Kanban columns

CRM → Сделки (`FunnelView`) uses the same ordered column configuration and
canonical card collection as the board: `GET /api/crm/kanban/columns` and
`GET /api/crm/leads/kanban`. Column names/order come from the shared Kanban
configuration, including empty custom and paid stages. Counts and drilldown
use the filtered canonical cards and the board's `cardColumnId` rule, including
supported manual overrides; linked inquiries are not counted again.

Legacy statuses and assignments absent from the current configuration remain
inspectable under **Вне текущего канбана**. They do not become active stages or
silently move to another column. The API has no column archive flag; normal
column deletion clears assignments and returns cards to Unparsed on the server.

The screen has one **По этапам** view and a named-source dropdown (**Все** plus
the existing source catalog). It filters by `source_id`, including when several
named sources share the same `phone` type. The old source chips and the two
broadcast/repeat-visit shortcuts were removed only from this screen. Summary
definitions are retained: conversion is
the number of cards with base status `converted` divided by all filtered cards;
loss is `rejected + lost`; active is `new + in_progress + contacted + qualified`.
Adjacent-stage percentages still compare current counts, not historical transition
events. Reopening the view fetches current configuration/cards, and existing
`crm-kanban-changed` events refresh both. There are no period or clinic controls
on this screen; the board's date/search controls are independent.

`node --test tests/funnelView.test.mjs` covers order, rename/add/delete, moves,
empty stages, filtering, totals, legacy/unknown IDs, overrides, full collections
beyond 50 cards, authentication headers, and API-error retry with mock HTTP only.

## Inbound clinic numbers in source forms

The existing **Источники** create/edit form reveals **Входящий номер клиники**
when **Тип → Телефон** is selected. It binds that number to the source being
saved, without another source-name field or source selector. A telephone source
without a number remains valid. Administrators (`admin`/`super_admin`) can bind
or explicitly unbind numbers; other staff can edit source metadata and read the
bindings. Existing mappings remain visible and are preserved on name/type edits.
Replacing a number requires explicitly unbinding it first. This changes future
attribution only; it never rewrites lead or call history.

Numbers require an explicit `+` and country code; the backend validates using
libphonenumber, rejects normalized duplicates, and checks administrator rights.
The form validates before creating a source. A concurrent mapping conflict after
creation leaves the form open with the saved source ID, so retry edits that source
instead of creating a duplicate. These operations use the matching backend's
`/api/crm/inbound-source-mappings` API. Catalog reads page beyond 50/100 entries.
The board, inquiry history and funnel detail resolve names by the stored source ID.

`node --test tests/sourceEditor.test.mjs tests/funnelView.test.mjs` runs the
mock-HTTP form, permissions-display, retry, ID-filter and pagination regressions.

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Runs the frontend regression tests with Node.js 22 or later (`node --test`).
The lead-history tests render the React timeline and cover Russian labels, closed
technical details, empty/error states, and pagination of real backend call records.
They use the existing React and esbuild dependencies without contacting the backend.

The history call count uses `/api/telephony/calls` filtered by the unique phone
numbers of the primary and linked inquiries (the backend matches the last ten
digits). It reads all pages of up to 500 records, including missed calls, rather
than using `contact_attempts` or the number of inquiries. Missing numbers and API
failures are displayed separately from a successful count of zero. This is phone
history, not a lead-ID-specific count; the existing backend model is unchanged.

## Kanban first-touch date filter

The board defaults to **Все даты**. **Сегодня**, **Вчера**, **7 дней** and
**30 дней** filter only the canonical Kanban card's `created_at`; linked inquiries
and card history are unchanged. The 7/30-day presets include today and the previous
6/29 calendar days, excluding future days. Boundaries include the entire day in
the user's local timezone, including daylight-saving transitions.

**Диапазон дат** provides native date inputs (**С** / **По**) with inclusive
boundaries. Either boundary can be left empty; both empty means no restriction.
Reversed bounds show a validation message and no cards. Missing/invalid first-touch
dates remain visible without a restriction and are excluded whenever a boundary
is set. The filter combines with the existing search and requires no backend calls.

`npm test` covers the date logic and rendered Kanban interactions, alongside the
existing card lifecycle and history regression tests.

## Shared Kanban columns

Column configuration is shared by all clinic staff and loaded from
`GET /api/crm/kanban/columns` (an array of `id`, `name`, `is_system`,
`manual_move_allowed`, and `affected_count`). Only the five core system columns
appear: `new`, `contacted`, `in_progress`, `converted`, and `closed`. Legacy
`rejected`, `qualified`, and `lost` data and inquiry history are not changed.

The compact column control creates custom columns with `POST` and `{ name }`.
Custom headers provide rename (`PATCH /api/crm/kanban/columns/{id}` with
`{ name }`) and delete (`DELETE` at the same path). Left/right controls reorder
both system and custom columns with `PUT /api/crm/kanban/columns/order` and
`{ column_ids }`, containing every configured ID exactly once. System columns
cannot be renamed or deleted. The board scrolls horizontally on narrow screens
and retains light/dark themes.

Manual cards keep base `status: new`; their canonical first-touch
`kanban_column_id` determines custom membership. Only Unparsed/custom sources
and destinations allow drag/drop, using
`PATCH /api/crm/leads/{lead_id}/kanban-column` with `{ column_id }`. Event-driven
system cards cannot be dragged or receive manual drops. Column/status, date,
and search filters compose without modifying linked inquiries.

Before deletion, the frontend fetches columns again and confirms the backend's
current `affected_count`, independent of board filters, explaining that cards
return to Unparsed. The DELETE result's actual count is shown afterwards: another
staff member can change assignments between confirmation and deletion. All
successful mutations refresh columns and canonical leads. Controls are locked
while mutations are in flight; API failures provide feedback and retry.

Integration requires the matching backend API and canonical lead field. Shared
changes are not pushed live to other open sessions: reload the board to obtain
external changes, and refresh/retry if a concurrent reorder invalidates the ID
list. The existing CRM lead-loading hook handles lead-fetch errors separately.
Tests mock the exact API contract; they do not contact a backend or database.

### `npm run build`

Runs the project's Vite production build and writes the optimized output to `dist`.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
