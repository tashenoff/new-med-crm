import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { buildDoctorPayload } from '../src/utils/doctorCompensation.js';
import { permissionLabel, allPermissionKeys } from '../src/utils/permissions.js';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
bootstrap.window.close();

async function compile(path) {
  const compiled = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['react', 'react-dom', 'axios'], loader: { '.js': 'jsx' },
    define: { 'import.meta.env': '{}' } });
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
  return loaded.exports.default;
}
const DoctorModal = await compile('../src/components/modals/DoctorModal.js');
const DoctorsView = await compile('../src/components/doctors/DoctorsView.js');
const PermissionEditor = await compile('../src/components/staff/PermissionEditor.jsx');

async function mount(t, Component, props) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://synthetic' });
  const values = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async () => ({ok: true, json: async () => []}) };
  const previous = Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  await act(async () => root.render(React.createElement(Component, props)));
  return document.body;
}

test('creation has a distinct label and profile payload excludes all compensation', () => {
  assert.ok(allPermissionKeys.includes('doctors_create'));
  assert.equal(permissionLabel('doctors_create'), 'Создание врача');
  assert.equal(permissionLabel('doctors_edit'), 'Изменение');
  assert.deepEqual(buildDoctorPayload({ full_name: ' Doctor ', phone: '+77012345678',
    payment_value: 999, currency: 'USD', services: [{commission_value: 999}] }, {includeCompensation: false}),
    {full_name: 'Doctor', phone: '+77012345678', specialties: [], specialty: null, calendar_color: '#3B82F6'});
  assert.throws(() => buildDoctorPayload({full_name: 'Doctor', phone: '+7'}, {includeCompensation: false}), /Телефон/);
  assert.throws(() => buildDoctorPayload({full_name: 'Doctor', payment_value: 25}), /режим оплаты/);
});

test('creation checkbox toggles independently of payroll and survives reopening', async t => {
  let form, setForm;
  function Harness() {
    [form, setForm] = React.useState({role: 'admin', custom_permissions: ['doctors_view']});
    return React.createElement(PermissionEditor, {form, onChange: setForm});
  }
  const body = await mount(t, Harness);
  const checkbox = body.querySelector('[name="doctors_create"]');
  assert.match(checkbox.parentElement.textContent, /Создание врача/);
  await act(async () => checkbox.click());
  assert.deepEqual(form.custom_permissions, ['doctors_view', 'doctors_create']);
  assert.equal(body.querySelector('[name="payroll_view"]').checked, false);
  const saved = structuredClone(form);
  await act(async () => setForm(saved));
  assert.equal(checkbox.checked, true);
  await act(async () => checkbox.click());
  assert.deepEqual(form.custom_permissions, ['doctors_view']);
});

for (const permissions of [['doctors_view', 'doctors_create'], ['doctors_view', 'doctors_edit', 'payroll_view']]) {
  test(`add button uses creation permission: ${permissions.join(',')}`, async t => {
    let clicks = 0;
    const body = await mount(t, DoctorsView, {user: {role: 'admin', permissions}, doctors: [],
      searchTerm: '', setSearchTerm() {}, onAddDoctor() {clicks++;}, canManage: true});
    const button = [...body.querySelectorAll('button')].find(item => item.textContent.includes('Добавить врача'));
    assert.equal(Boolean(button), permissions.includes('doctors_create'));
    if (button) { await act(async () => button.click()); assert.equal(clicks, 1); }
  });
}

for (const payroll of [false, true]) {
  test(`doctor modal submits with payroll ${payroll ? 'enabled' : 'disabled'}`, async t => {
    let saved;
    const permissions = ['doctors_view', 'doctors_create', ...(payroll ? ['payroll_view'] : [])];
    function Harness() {
      const [form, setForm] = React.useState({full_name: 'Synthetic doctor', consultation_compensation_mode: 'inherit', payment_value: 25});
      return React.createElement(DoctorModal, {user: {permissions}, show: true, doctorForm: form,
        setDoctorForm: setForm, onClose() {}, onSave(e, payload) {saved = payload;} });
    }
    const body = await mount(t, Harness);
    assert.equal(Boolean(body.querySelector('[name="consultation_compensation_mode"]')), payroll);
    assert.equal(body.textContent.includes('Основная схема оплаты'), payroll);
    await act(async () => body.querySelector('form').dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true})));
    assert.ok(saved, body.textContent);
    const {editingItem, ...payload} = saved;
    assert.equal(editingItem, null);
    assert.equal(Object.hasOwn(payload, 'payment_value'), payroll);
    if (payroll) assert.equal(payload.payment_value, 25);
    else assert.deepEqual(payload, buildDoctorPayload({full_name: 'Synthetic doctor'}, {includeCompensation: false}));
  });
}
