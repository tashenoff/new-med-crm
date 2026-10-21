import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { formatPatientPhone } from '../src/utils/patientPhone.js';
import { patientOriginLabel, visiblePatientNotes } from '../src/utils/patientOrigin.js';

const cases = [
  ['77011234567', '+77011234567'],
  ['+77011234567', '+77011234567'],
  ['7 (701) 123-45-67', '+77011234567'],
  ['12025550123', '+12025550123'],
  ['442071234567', '+442071234567'],
  ['8613812345678', '+8613812345678'],
  ['+82101234567', '+82101234567'],
  ['87011234567', '87011234567'],
  ['7011234567', '7011234567'],
  ['02071234567', '02071234567'],
  ['99999999999', '99999999999'],
  ['+123', '+123'],
  ['123', '123'],
  ['+7701123456700000', '+7701123456700000'],
  ['phone 77011234567', 'phone 77011234567'],
  ['77011234567 ext 1', '77011234567 ext 1'],
  ['', '']
];

test('only formats validated international identities; never truncates or guesses a local country', () => {
  for (const [raw, expected] of cases) {
    assert.equal(formatPatientPhone(raw), expected, raw);
    assert.equal(formatPatientPhone(expected), expected, `idempotent: ${raw}`);
  }
  assert.equal(formatPatientPhone(null), '');
});

const generatedNote = 'Создан из заявки CRM. Обращение через WhatsApp: secret: snippet';
const origin = { kind: 'crm_lead', entity_id: 'synthetic-lead', source: 'social', channel: 'whatsapp' };
const noteCases = [
  { name: 'new WhatsApp origin', notes: '', origin, label: 'Создан из заявки CRM. Источник: WhatsApp', visible: '' },
  { name: 'legacy proven WhatsApp note', notes: generatedNote,
    origin: { ...origin, legacy_generated_note: true }, label: 'Создан из заявки CRM. Источник: WhatsApp', visible: '' },
  { name: 'source name with colons', notes: 'Врач: позвонить: завтра',
    origin: { kind: 'crm_lead', entity_id: 'synthetic-lead', source: 'phone', source_id: 'synthetic-source' },
    sources: [{ id: 'synthetic-source', name: 'Телефон: филиал: реклама' }],
    label: 'Создан из заявки CRM. Источник: Телефон: филиал: реклама', visible: 'Врач: позвонить: завтра' },
  { name: 'ambiguous legacy plus manual text', notes: `${generatedNote}\nВрач: позвонить`, origin: null,
    label: '', visible: `${generatedNote}\nВрач: позвонить` },
  { name: 'manual WhatsApp-looking note', notes: 'Обращение через WhatsApp: ручной текст', origin: null,
    label: '', visible: 'Обращение через WhatsApp: ручной текст' }
];

test('origin labels use structured metadata and source names, while manual notes stay literal', () => {
  for (const row of noteCases) {
    assert.equal(patientOriginLabel(row, row.sources), row.label);
    assert.equal(visiblePatientNotes(row), row.visible);
    assert.equal(visiblePatientNotes(row, 'Новая заметка: полный текст'), 'Новая заметка: полный текст');
  }
});

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
bootstrap.window.close();

// Actual list, modal and phone hook; only unrelated tabs and read-only APIs are fixtures.
const compiled = await build({
  stdin: {
    contents: `export { default as List } from './src/components/patients/PatientsView.js';
      export { default as Card } from './src/components/modals/PatientModal.js';`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx'
  },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom'], loader: { '.js': 'jsx' },
  define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://crm.test"}' },
  plugins: [{ name: 'patient-phone-boundaries', setup(builder) {
    builder.onResolve({ filter: /\/(useGlobalRefresh|PatientTermsStatus|PatientBonusWidget|ServiceSelector|ConsultationSheetForm|TreatmentPlanView|ServicePaymentList|PatientPaymentWorkspace|PatientTreatmentWorkspace|AppointmentsSchedule|LabAnalysisPicker|WhatsAppSidebar)$/ }, args => ({ path: args.path, namespace: 'patient-phone-boundaries' }));
    builder.onLoad({ filter: /.*/, namespace: 'patient-phone-boundaries' }, args => ({
      contents: args.path.endsWith('/useGlobalRefresh')
        ? 'export const useGlobalRefresh = () => ({ refreshTriggers: {}, refreshTreatmentPlans() {} });'
        : 'export default () => null;', loader: 'jsx'
    }));
  } }]
});
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
const { List, Card } = loaded.exports;

test('existing stored phones render equally in the patient list and edit card without writing the form', async context => {
  const rows = cases.filter(([raw]) => raw).map(([raw, expected]) => ({ raw, expected, name: raw }))
    .concat(noteCases.map(row => ({ raw: '77011234567', expected: '+77011234567', ...row })));
  for (const row of rows) {
    const { raw, expected } = row;
    await context.test(row.name, async child => {
      const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
      const requests = [], changes = [], saves = [];
      const globals = {
        window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
        IS_REACT_ACT_ENVIRONMENT: true,
        fetch: async (url, options = {}) => {
          requests.push({ url, options });
          assert.equal(options.method || 'GET', 'GET');
          return { ok: true, json: async () => url.includes('/crm/sources') ? (row.sources || []) : [] };
        }
      };
      const previous = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
      Object.assign(globalThis, globals);
      const root = createRoot(document.getElementById('root'));
      child.after(async () => {
        await act(async () => root.unmount());
        dom.window.close();
        for (const [key, descriptor] of previous) {
          if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
        }
      });
      const patient = { id: 'synthetic-patient', full_name: 'Synthetic', phone: raw, notes: row.notes || '',
        origin: row.origin, source: 'crm_conversion' };
      const original = structuredClone(patient);
      const user = { permissions: ['patients_view', 'patients_edit'] };
      await act(async () => root.render(React.createElement(React.Fragment, null,
        React.createElement(List, { patients: [patient], patientsTreatmentPlans: {}, searchTerm: '', filterType: 'all', canManage: true, user }),
        React.createElement(Card, { show: true, user, editingItem: patient, patientForm: patient,
          setPatientForm: value => changes.push(value), onClose() {},
          onSave(event, form) { event.preventDefault(); saves.push(form); } })
      )));
      assert.equal(document.querySelector('tbody tr td:nth-child(2) div').textContent, expected);
      assert.equal(document.querySelector('[role="dialog"] input[type="tel"]').value, expected);
      if (Object.hasOwn(row, 'visible')) {
        const listText = document.querySelector('tbody tr td:first-child').textContent;
        const card = document.querySelector('[role="dialog"]');
        assert.equal(card.querySelector('textarea').value, row.visible);
        if (row.label) {
          assert.ok(listText.includes(row.label));
          assert.ok(card.textContent.includes(row.label));
        }
        if (!row.visible) {
          assert.ok(!listText.includes('secret: snippet'));
          assert.ok(!card.textContent.includes('secret: snippet'));
        } else assert.ok(listText.includes(row.visible));
      }
      assert.deepEqual(changes, [], 'loading must not persist the display formatter');
      assert.deepEqual(patient, original);
      await act(async () => document.querySelector('[role="dialog"] form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
      assert.equal(saves.length, 1);
      assert.equal(saves[0].phone, raw, 'saving an unrelated edit must not silently rewrite a stored phone');
      assert.equal(saves[0].notes, patient.notes, 'unrelated save preserves raw legacy and manual notes');
      if (Object.hasOwn(row, 'visible')) {
        const input = document.querySelector('[role="dialog"] textarea');
        const manual = 'Ручная заметка: сохранить: целиком';
        await act(async () => {
          Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(input, manual);
          input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        });
        assert.equal(changes.at(-1).notes, manual, 'editing notes preserves the full literal text');
      }
      assert.ok(requests.length > 0);
      assert.ok(requests.every(({ url }) => !url.includes('/send')));
    });
  }
});
