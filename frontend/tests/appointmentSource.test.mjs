import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window; globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window; delete globalThis.document; bootstrap.window.close();
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/modals/AppointmentModal.js', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom', 'react-dom/client'], loader: { '.js': 'jsx', '.css': 'empty' },
  define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://fixture.invalid"}' },
  plugins: [{ name: 'unrelated-widgets', setup(builder) {
    builder.onResolve({ filter: /react-signature-canvas|\/ServiceSelector$|\/PatientPaymentWorkspace$|\/PatientTreatmentWorkspace$|\/shared\/PatientPlanWorkspace$/ }, args => ({ path: args.path, namespace: 'widgets' }));
    builder.onLoad({ filter: /.*/, namespace: 'widgets' }, () => ({ contents: 'export const PlanEmptyState=()=>null; export default ()=>null;' }));
  } }]
});
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const Modal = module.exports.default;
const catalog = [{ id: '2gis', name: '2GIS', type: 'phone' }, { id: 'web', name: 'Сайт', type: 'website' }];
const patient = (id, source_id) => ({ id, full_name: `Пациент ${id}`, phone: '', ...(source_id === undefined ? {} : { source_id }) });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function mount(t, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid' });
  const previous = new Map();
  const f = { saved: [], requests: [], patientRequests: [], patients: options.patients || [patient('a', '2gis'), patient('b', 'web')],
    form: { patient_id: 'a', appointment_date: '2026-10-21', appointment_time: '10:00', end_time: '10:30', doctor_id: 'doc', room_id: 'room', ...options.form } };
  const globals = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true, alert: message => assert.fail(message), fetch: async (input, init) => {
      const url = new URL(input); f.requests.push({ path: url.pathname, method: init?.method || 'GET' });
      assert.equal(url.origin, 'https://fixture.invalid');
      let data = [];
      if (url.pathname === '/api/crm/sources/') {
        if (options.sourceGate) await options.sourceGate.promise;
        const all = options.sources || catalog; const skip = Number(url.searchParams.get('skip') || 0); data = all.slice(skip, skip + 100);
      } else if (/^\/api\/patients\/[^/]+$/.test(url.pathname)) {
        const id = url.pathname.split('/').at(-1); f.patientRequests.push(id);
        data = options.patientData?.[id];
        if (data?.promise) data = await data.promise;
        if (!data) return { ok: false, status: 404, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => data };
    } };
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const log = console.log; console.log = () => {};
  const root = createRoot(document.getElementById('root'));
  let show = true;
  const render = () => root.render(React.createElement(Modal, { user: options.user || {permissions: ['calendar_view', 'calendar_edit']}, show, onClose() {}, appointmentForm: f.form,
    patients: f.patients, doctors: [], editingItem: options.editing || null, hideAddPlanForm: true,
    setAppointmentForm: form => { f.form = form; }, onSave: async data => { f.saved.push(data); } }));
  t.after(async () => {
    await act(async () => root.unmount()); dom.window.close(); console.log = log;
    for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; }
  });
  const rerender = async () => act(async () => { render(); });
  await rerender();
  const select = () => document.querySelector('[aria-label="Канал привлечения"]');
  const setControl = async (element, value) => act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, value);
    element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
  const switchPatient = async id => {
    const clear = [...document.querySelectorAll('button')].find(node => node.textContent.includes('Изменить'));
    if (clear) await act(async () => clear.click());
    const input = document.querySelector('input[placeholder*="Начните вводить"]');
    assert.ok(input, 'patient search exists');
    await setControl(input, `Пациент ${id}`);
    const choice = [...document.querySelectorAll('div.cursor-pointer')].find(node => node.textContent.includes(`Пациент ${id}`));
    assert.ok(choice, 'patient choice exists'); await act(async () => choice.click());
  };
  return { f, dom, select, setControl, rerender, switchPatient,
    settle: async fn => act(async () => { fn(); }),
    reopen: async () => { show = false; await rerender(); show = true; await rerender(); },
    submit: async () => act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))) };
}

test('calendar patient selection fills persisted source ID and saves/reopens it', async t => {
  const h = await mount(t); assert.equal(h.select().value, '2gis'); assert.equal(h.f.form.source, 'phone');
  await h.submit(); assert.equal(h.f.saved[0].source_id, '2gis');
  await h.reopen(); assert.equal(h.select().value, '2gis');
  assert.equal(h.f.patientRequests.length, 0);
});

test('source prefill does not authorize a read-only calendar save', async t => {
  const h = await mount(t, {user: {permissions: ['calendar_view']}});
  assert.equal(h.select().value, '2gis');
  await h.submit();
  assert.equal(h.f.saved.length, 0);
});
test('CRM concrete inquiry takes precedence over patient and survives manual override', async t => {
  const h = await mount(t, { form: { source_id: 'web', lead_source_id: 'web' } });
  assert.equal(h.select().value, 'web'); await h.setControl(h.select(), '2gis');
  await h.rerender(); assert.equal(h.select().value, '2gis'); await h.submit(); assert.equal(h.f.saved[0].source_id, '2gis');
});
test('WhatsApp minimal patient loads persisted source instead of guessing chat channel', async t => {
  const h = await mount(t, { patients: [patient('a')], form: { source: 'patient' }, patientData: { a: patient('a', '2gis') } });
  assert.equal(h.select().value, '2gis'); assert.deepEqual(h.f.patientRequests, ['a']);
});
test('unknown inquiry source stays an explicit choice even when patient has a known source', async t => {
  const h = await mount(t, { form: { source_id: 'deleted', lead_source_id: 'deleted' } });
  assert.equal(h.select().value, ''); assert.equal(h.f.form.source, '');
  assert.equal(h.f.patientRequests.length, 0);
});
test('missing inquiry source does not borrow source from another patient inquiry', async t => {
  const h = await mount(t, { form: { lead_source_id: '' } }); assert.equal(h.select().value, '');
});
test('patient with no confirmed source leaves placeholder, never first catalog option', async t => {
  const h = await mount(t, { patients: [patient('a', null)] }); assert.equal(h.select().value, '');
});
test('late patient response cannot overwrite manual source selection', async t => {
  const gate = deferred(); const h = await mount(t, { patients: [patient('a')], patientData: { a: gate } });
  await h.setControl(h.select(), 'web'); await h.settle(() => gate.resolve(patient('a', '2gis')));
  assert.equal(h.select().value, 'web');
});
test('switching patient clears stale manual value and late response from former patient', async t => {
  const gate = deferred(); const h = await mount(t, { patients: [patient('a'), patient('b', 'web')], patientData: { a: gate } });
  await h.setControl(h.select(), '2gis'); await h.switchPatient('b');
  assert.equal(h.select().value, 'web'); await h.settle(() => gate.resolve(patient('a', '2gis')));
  assert.equal(h.select().value, 'web'); assert.equal(h.f.form.patient_id, 'b');
});
test('source catalog loading never chooses first option and supports source beyond page 100', async t => {
  const sources = Array.from({ length: 122 }, (_, i) => ({ id: `source-${i}`, name: `Source ${i}`, type: 'phone' }));
  const gate = deferred(); const h = await mount(t, { patients: [patient('a', 'source-121')], sources, sourceGate: gate });
  assert.equal(h.select().value, ''); await h.settle(() => gate.resolve()); assert.equal(h.select().value, 'source-121');
});
test('editing an existing appointment never replaces its historical source', async t => {
  const h = await mount(t, { editing: { id: 'visit' }, form: { source_id: 'deleted' } });
  assert.equal(h.select().value, 'deleted'); assert.match(h.select().selectedOptions[0].textContent, /недоступен/);
});

test('manual empty choice is not refilled by a delayed patient source', async t => {
  const gate = deferred(); const h = await mount(t, { patients: [patient('a')], patientData: { a: gate } });
  await h.setControl(h.select(), ''); await h.settle(() => gate.resolve(patient('a', '2gis')));
  assert.equal(h.select().value, '');
});
test('reopened saved appointment keeps its own source rather than the patient original source', async t => {
  const h = await mount(t, { editing: { id: 'saved-visit' }, form: { source_id: 'web', source: 'website' } });
  assert.equal(h.select().value, 'web'); await h.reopen(); assert.equal(h.select().value, 'web');
});
