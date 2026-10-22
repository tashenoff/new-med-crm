# Unified WhatsApp entry points

CRM card links and the patient phone button call `openWhatsAppChat({ phone,
patientId, leadId, displayName })`. `App` mounts one `WhatsAppWidget`, which also
owns the floating button. No legacy URL route existed in the inspected main.

Opening validates an international phone using the existing patient formatter
and libphonenumber metadata. Ambiguous local or invalid numbers are not routed.
Opening performs reads only: no send, patient/lead creation or explicit relink.
A contact without a saved chat opens as a temporary empty thread. Explicit
patient/inquiry context survives list refreshes; drafts stay separate per phone,
and stale responses cannot restore the previously selected contact.

The widget opens above the patient card without closing it. Escape/close restores
focus; an existing patient or booking form is not silently replaced. New booking
forms temporarily hide the widget and restore it on close. The patient-visits
dialog renders above the widget and keeps its own keyboard behavior.

Read requires `crm_view`; sending/uploading requires `crm_edit` as well. Patient
attachment saving, document export and booking retain their additional existing
permissions. Backend webhooks, history, channels, templates, media, consent and
`/broadcast` are unchanged. Existing channel selection behavior is unchanged.

`WhatsAppSidebar.jsx` and `WhatsAppHistory.jsx` were removed after both active
call sites migrated and no runtime imports remained. The unused patient-modal
send handler was also removed.

## Synthetic validation

Run from `frontend`:

```sh
node --test --test-concurrency=2 tests/*.test.mjs
node node_modules/eslint/bin/eslint.js --no-eslintrc -c tests/patientTerms.eslint.cjs src/utils/openWhatsAppChat.js src/components/crm/telephony/WhatsAppWidget.jsx src/components/crm/telephony/WhatsAppInbox.jsx src/components/layout/WhatsAppFloatingButton.js
npm run build
node tests/browser/unifiedWhatsAppPreview.mjs
# In another terminal; uses an isolated headless browser and synthetic APIs:
python tests/browser/unifiedWhatsApp.py
```

The preview binds only 127.0.0.1:4179, has no real credentials/backend, and the
browser check blocks external network access. Screenshots and JSON evidence go
to the task's `widget-qa` directory. Never point these fixtures at real patients.

The repository's default `npm run lint` has no root ESLint configuration. Using
the existing test config, baseline main already has 10 errors in App, 10 in
EnhancedLeadsView and 18 in PatientModal; this patch leaves the first two unchanged
and reduces PatientModal to 12. New widget code passes the scoped lint command.
