import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bootstrapDom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = bootstrapDom.window;
globalThis.document = bootstrapDom.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
bootstrapDom.window.close();

// Actual React, ModalContext, PatientsPage, PatientModal and usePhoneInput.
// Only unrelated tab contents, list rendering and unit API boundaries are fixtures.
const compiled = await build({
  stdin: {
    contents: `import React from 'react';
      import Page from './src/pages/PatientsPage.jsx';
      import Modal from './src/components/modals/PatientModal.js';
      import { ModalProvider, useModal } from './src/context/ModalContext.jsx';
      import { usePhoneInput } from './src/hooks/usePhoneInput.js';
      function Connected() {
        const context = useModal();
        const props = context.getModalProps('patient');
        globalThis.patientFixture.props = props;
        globalThis.patientFixture.context = context;
        return <Modal show={context.isModalOpen('patient')} onClose={() => context.closeModal('patient')} {...props} />;
      }
      export function PatientHarness() { return <ModalProvider><Page user={{role:'super_admin'}} /><Connected /></ModalProvider>; }
      export function PhoneHarness({ session, check }) {
        const hook = usePhoneInput('', null, check, session);
        globalThis.patientFixture.phone = hook;
        return <input {...hook.phoneInputProps} />;
      }`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx'
  },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom', 'react-dom/client'], loader: { '.js': 'jsx' },
  define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://crm.test"}' },
  plugins: [{ name: 'patient-unit-boundaries', setup(builder) {
    builder.onResolve({ filter: /\/(usePatients|useGlobalRefresh|PatientsView|PatientBonusWidget|ServiceSelector|ConsultationSheetForm|TreatmentPlanView|ServicePaymentList|AppointmentsSchedule|LabAnalysisPicker|WhatsAppSidebar)$/ }, args => ({ path: args.path, namespace: 'patient-boundaries' }));
    builder.onLoad({ filter: /.*/, namespace: 'patient-boundaries' }, args => ({
      contents: args.path.endsWith('/usePatients')
        ? 'export const usePatients = () => globalThis.patientFixture.api;'
        : args.path.endsWith('/useGlobalRefresh')
          ? 'export const useGlobalRefresh = () => ({ refreshTriggers: {}, refreshTreatmentPlans() {} });'
          : args.path.endsWith('/PatientsView')
            ? `import React from 'react'; export default props => <div>
                <button onClick={props.onAddPatient}>Add patient</button>
                {props.patients.map(patient => <button key={patient.id} onClick={() => props.onEditPatient(patient)}>Edit {patient.id}</button>)}
              </div>;`
            : 'export default () => null;', loader: 'jsx'
    }));
  } }]
});
const componentModule = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), componentModule, componentModule.exports);
const { PatientHarness, PhoneHarness } = componentModule.exports;

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const first = { id: 'patient-one', full_name: 'Original One', phone: '+70000000801', notes: 'Original notes', source: 'other' };

async function mount(t, component = PatientHarness, props = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
  // Track real timers belonging to this fixture so a component notification
  // cannot fire after its jsdom window has been disposed. No fake clock.
  const pendingTimers = new Set();
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  const globals = {
    setTimeout: (...args) => { const timer = nativeSetTimeout(...args); pendingTimers.add(timer); return timer; },
    clearTimeout: timer => { pendingTimers.delete(timer); nativeClearTimeout(timer); },
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true, patientFixture: {}, fetch: async () => ({ ok: true, json: async () => [] }) };
  const previous = new Map();
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const writes = [];
  const fixture = globalThis.patientFixture;
  fixture.api = {
    patients: [structuredClone(first)], fetchPatients: async () => {},
    createPatient: async data => { writes.push({ method: 'POST', data }); return { success: true, data: { id: 'new-patient', ...data } }; },
    updatePatient: async (id, data) => { writes.push({ method: 'PUT', id, data }); return { success: true, data: { id, ...data } }; }
  };
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(component, props)));
  t.after(async () => {
    await act(async () => root.unmount());
    for (const timer of pendingTimers) nativeClearTimeout(timer);
    pendingTimers.clear();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
  const click = async text => { const node = button(text); assert.ok(node, `Button ${text}`); await act(async () => node.click()); };
  const input = async (placeholder, value) => {
    const node = document.querySelector(`input[placeholder="${placeholder}"]`);
    assert.ok(node);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(node, value);
      node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  const submit = async () => { await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))); };
  return { fixture, writes, root, dom, click, input, submit, rerender: async props => act(async () => root.render(React.createElement(component, props))) };
}

test('edit card -> close -> Add patient in the same document issues POST with no retained identity', async t => {
  const h = await mount(t);
  await h.click('Edit patient-one'); await h.click('Отмена');
  await h.click('Add patient');
  await h.input('ФИО *', 'New Two'); await h.input('Телефон *', '70000000802');
  assert.equal(h.fixture.props.patientForm.full_name, 'New Two', 'Real React change handler ran');
  await h.submit();
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].method, 'POST');
  for (const key of ['id', '_id', '_editingItemId']) assert.equal(Object.hasOwn(h.writes[0].data, key), false);
});

test('intended edit target survives form identity contamination and saved callback closure', async t => {
  const h = await mount(t);
  await h.click('Edit patient-one');
  const props = h.fixture.props;
  await act(async () => props.onSave({ preventDefault() {} }, { ...props.patientForm, id: 'wrong-target', _editingItemId: 'wrong-target', notes: 'Legal edit' }));
  assert.equal(h.writes[0].method, 'PUT');
  assert.equal(h.writes[0].id, first.id);
  assert.equal(h.writes[0].data.notes, 'Legal edit');
});

test('retyping the intended edit target phone does not block a legitimate save', async t => {
  const h = await mount(t);
  globalThis.fetch = async url => ({ ok: true, json: async () => String(url).includes('/check-phone/') ? { patient: first } : [] });
  await h.click('Edit patient-one');
  await h.input('Телефон *', first.phone);
  // Exercise the actual phone hook even when the DOM value is already equal.
  await h.input('Телефон *', '+7000000080');
  await h.input('Телефон *', first.phone);
  await act(async () => new Promise(resolve => setTimeout(resolve, 330)));
  const save = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Обновить');
  assert.equal(save.disabled, false);
  await h.submit();
  assert.equal(h.writes[0].id, first.id);
});

test('old save completion cannot close a newly opened create session', async t => {
  const h = await mount(t);
  const pending = deferred();
  h.fixture.api.updatePatient = (id, data) => { h.writes.push({ method: 'PUT', id, data }); return pending.promise; };
  await h.click('Edit patient-one');
  let saving;
  await act(async () => { saving = h.fixture.props.onSave({ preventDefault() {} }, { ...h.fixture.props.patientForm, notes: 'Saved in old session' }); });
  await h.click('Отмена'); await h.click('Add patient');
  await act(async () => { pending.resolve({ success: true }); await saving; });
  assert.ok(document.querySelector('input[placeholder="ФИО *"]'), 'New create session stays open');
  assert.equal(h.fixture.props.editingItem, null);
});

test('stale form/save callbacks cannot write into the next opening', async t => {
  const h = await mount(t);
  await h.click('Edit patient-one'); const old = h.fixture.props;
  await h.click('Отмена'); await h.click('Add patient');
  await act(async () => old.setPatientForm({ ...old.patientForm, full_name: 'Stale callback' }));
  assert.equal(h.fixture.props.patientForm.full_name, '');
  await act(async () => old.onSave({ preventDefault() {} }, old.patientForm));
  assert.deepEqual(h.writes, []);
});

async function schedulePhone(h, value) {
  await act(async () => h.fixture.phone.handlePhoneChange({ target: { value } }));
  await act(async () => new Promise(resolve => setTimeout(resolve, 330)));
}

test('phone results from a prior input cannot replace the latest result or its checking state', async t => {
  const pending = [];
  const check = phone => { const request = { phone, ...deferred() }; pending.push(request); return request.promise; };
  const h = await mount(t, PhoneHarness, { session: 'create-one', check });
  await schedulePhone(h, '70000000801');
  await schedulePhone(h, '70000000802');
  assert.equal(pending.length, 2);
  await act(async () => pending[0].resolve({ patient: first }));
  assert.equal(h.fixture.phone.foundData, null);
  assert.equal(h.fixture.phone.isChecking, true);
  await act(async () => pending[1].resolve({ patient: null, active_lead: null }));
  assert.equal(h.fixture.phone.hasMatch, false);
  assert.equal(h.fixture.phone.isChecking, false);
});

test('close/reopen and reset invalidate in-flight and pending debounced phone checks', async t => {
  const pending = [];
  const check = phone => { const request = { phone, ...deferred() }; pending.push(request); return request.promise; };
  const h = await mount(t, PhoneHarness, { session: 'first-open', check });
  await schedulePhone(h, '70000000801');
  await h.rerender({ session: null, check });
  await h.rerender({ session: 'second-open', check });
  await act(async () => pending[0].resolve({ patient: first }));
  assert.equal(h.fixture.phone.hasMatch, false);
  await act(async () => h.fixture.phone.handlePhoneChange({ target: { value: '70000000802' } }));
  await act(async () => h.fixture.phone.reset());
  await act(async () => new Promise(resolve => setTimeout(resolve, 330)));
  assert.equal(pending.length, 1, 'Reset cancels a pending debounce');
});

test('parent echo keeps current lookup, external phone sync cancels old results', async t => {
  const pending = deferred();
  const h = await mount(t, PhoneHarness, { session: 'open', check: () => pending.promise });
  await act(async () => h.fixture.phone.handlePhoneChange({ target: { value: '70000000801' } }));
  await act(async () => h.fixture.phone.syncValue('+70000000801'));
  await act(async () => new Promise(resolve => setTimeout(resolve, 330)));
  assert.equal(h.fixture.phone.isChecking, true);
  await act(async () => h.fixture.phone.syncValue('+70000000802'));
  await act(async () => pending.resolve({ patient: first }));
  assert.equal(h.fixture.phone.hasMatch, false);
  assert.equal(h.fixture.phone.value, '+70000000802');
});
