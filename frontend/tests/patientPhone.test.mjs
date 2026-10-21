import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { formatPatientPhone } from '../src/utils/patientPhone.js';

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
  for (const [raw, expected] of cases.filter(([raw]) => raw)) {
    await context.test(raw, async child => {
      const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
      const requests = [], changes = [], saves = [];
      const globals = {
        window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
        IS_REACT_ACT_ENVIRONMENT: true,
        fetch: async (url, options = {}) => {
          requests.push({ url, options });
          assert.equal(options.method || 'GET', 'GET');
          return { ok: true, json: async () => [] };
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
      const patient = { id: 'synthetic-patient', full_name: 'Synthetic', phone: raw, notes: '', source: 'crm_conversion' };
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
      assert.deepEqual(changes, [], 'loading must not persist the display formatter');
      assert.deepEqual(patient, original);
      await act(async () => document.querySelector('[role="dialog"] form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
      assert.equal(saves.length, 1);
      assert.equal(saves[0].phone, raw, 'saving an unrelated edit must not silently rewrite a stored phone');
      assert.ok(requests.length > 0);
      assert.ok(requests.every(({ url }) => !url.includes('/send')));
    });
  }
});
