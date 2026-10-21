import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window; delete globalThis.document; bootstrap.window.close();

// Real modal, CalendarPage -> CalendarView -> AppointmentCard, ModalContext,
// useAppointments and payment adapter. Only unrelated data hooks/tabs and HTTP
// transport are fixtures. No backend or external network is contacted.
const compiled = await build({
  stdin: { contents: `
    import React from 'react';
    import Page from './src/pages/CalendarPage.jsx';
    import Modal from './src/components/modals/AppointmentModal.js';
    import { ModalProvider, useModal } from './src/context/ModalContext.jsx';
    import { useAppointments } from './src/hooks/useAppointments.js';
    function Connected() {
      const context = useModal();
      const props = context.getModalProps('appointment');
      globalThis.appointmentFixture.modal = props;
      return context.isModalOpen('appointment') ? <Modal user={{permissions:['calendar_view','calendar_edit','patients_view','patients_edit','patients_delete','patients_export','finance_view','finance_edit']}} show onClose={() => context.closeModal('appointment')} {...props} /> : null;
    }
    export function CalendarHarness() {
      return <ModalProvider><Page user={{role:'super_admin', permissions:['crm_view','crm_edit','crm_delete','patients_view','patients_edit','patients_export','calendar_view','calendar_edit','calendar_delete','directory_view','directory_edit','directory_delete','warehouse_view','warehouse_edit','warehouse_delete','warehouse_export','finance_view','finance_edit','doctors_view','doctors_edit','doctors_delete','payroll_view']}} /><Connected /></ModalProvider>;
    }
    export function CreateHarness({ status }) {
      const api = useAppointments();
      return <Modal user={{permissions:['calendar_view','calendar_edit','patients_view','patients_edit','patients_delete','patients_export','finance_view','finance_edit']}} show onClose={() => {}} appointmentForm={{...globalThis.appointmentFixture.form, status}}
        patients={globalThis.appointmentFixture.patients} doctors={globalThis.appointmentFixture.doctors}
        onSave={async data => { const result = await api.createAppointment(data); if (!result.success) throw Error(result.error); }} />;
    }
  `, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom', 'react-dom/client'], loader: { '.js': 'jsx', '.css': 'empty' },
  define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://crm.test"}' },
  plugins: [{ name: 'appointment-http-and-unrelated-boundaries', setup(builder) {
    builder.onResolve({ filter: /^axios$/ }, () => ({ path: 'axios', namespace: 'appointment-fixtures' }));
    builder.onResolve({ filter: /\/(usePatients|useDoctors|useRooms|useGlobalRefresh|ServiceSelector|ServicePaymentList|DoctorCashbackWidget|PatientBonusWidget)$/ }, args => ({ path: args.path, namespace: 'appointment-fixtures' }));
    builder.onLoad({ filter: /.*/, namespace: 'appointment-fixtures' }, args => {
      const hook = args.path.split('/').at(-1);
      const contents = hook === 'axios' ? 'export default new Proxy({}, {get: (_, method) => (...args) => globalThis.appointmentFixture.http(method, ...args)});'
        : hook === 'useGlobalRefresh' ? 'export const useGlobalRefresh = () => ({refreshTriggers:{}});'
        : ['usePatients','useDoctors','useRooms'].includes(hook)
          ? `export const ${hook} = () => globalThis.appointmentFixture.${hook};`
          : 'export default () => null;';
      return { contents, loader: 'jsx' };
    });
  }}]
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { CalendarHarness, CreateHarness } = module.exports;
const today = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); };

async function mount(t, { status = 'confirmed', create = false, createStatus } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
  dom.window.scrollTo = () => {};
  const appointment = { id: 'appointment-fixture', patient_id: 'patient-fixture', doctor_id: 'doctor-fixture', room_id: 'room-fixture',
    appointment_date: today(), appointment_time: '10:00', end_time: '10:30', price: 100, deposit: 0,
    deposit_type: 'fixed', source: 'other', source_id: 'source-fixture', status, reason: 'Fixture visit', notes: '', patient_notes: '' };
  const fixture = { form: {...appointment}, saved: create ? [] : [{...appointment}], writes: [],
    patients: [{id:'patient-fixture',full_name:'Fixture Patient',phone:'+70000000801'}],
    doctors: [{id:'doctor-fixture',full_name:'Fixture Doctor',calendar_color:'#123456'}] };
  const noOp = async () => {};
  fixture.usePatients = { patients: fixture.patients, fetchPatients:noOp };
  fixture.useDoctors = { doctors: fixture.doctors, fetchDoctors:noOp };
  fixture.useRooms = { rooms:[{id:'room-fixture',name:'Fixture room',schedule:[]}], fetchRooms:noOp };
  fixture.http = async (method, url, data) => {
    assert.ok(url.startsWith('https://crm.test/api/appointments'));
    if (method === 'get') return {data: structuredClone(fixture.saved)};
    fixture.writes.push({method, url, data: structuredClone(data)});
    if (method === 'post') fixture.saved.push({ ...data, id:'created-fixture' });
    else { assert.equal(fixture.saved.length,1); Object.assign(fixture.saved[0],data); }
    return {data: structuredClone(fixture.saved.at(-1))};
  };
  const globals = { window:dom.window, document:dom.window.document, localStorage:dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT:true, appointmentFixture:fixture,
    alert: message => assert.fail('Unexpected alert: '+message),
    fetch: async (url, options = {}) => {
      assert.equal(options.method || 'GET', 'GET', 'No message/upload/mutation via fetch');
      const path = new URL(url).pathname;
      const data = path === '/api/rooms' ? fixture.useRooms.rooms
        : path === '/api/payment-types' ? []
        : path === '/api/crm/sources/' ? [{id:'source-fixture',name:'Fixture source',type:'other'}]
        : path === '/api/rooms/room-fixture/schedule' ? [] : undefined;
      assert.notEqual(data, undefined, 'Unexpected fetch: '+path);
      return {ok:true, json:async () => data};
    } };
  const previous = new Map();
  for (const [key,value] of Object.entries(globals)) {
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  localStorage.setItem('token','fixture-only');
  // Keep noisy application debug logs out of test output; errors remain visible.
  const log = console.log; console.log = () => {};
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount()); dom.window.close(); console.log = log;
    for (const [key,descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key]; }
  });
  await act(async () => root.render(React.createElement(create ? CreateHarness : CalendarHarness, {status:createStatus})));
  const card = () => document.querySelector('[draggable="true"][aria-label]');
  const open = async () => { assert.ok(card(),'Real calendar card rendered'); await act(async () => card().click()); };
  const changeStatus = async label => {
    await act(async () => card().dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:100})));
    const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label);
    assert.ok(button, 'Real calendar status menu: '+label);
    await act(async () => button.dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true,cancelable:true})));
  };
  const editNotes = async value => {
    const input = document.querySelector('textarea[placeholder="Заметки о записи"]'); assert.ok(input);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(input,value);
      input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    });
  };
  const submit = async () => act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  const noStatusSelect = () => {
    const selects = [...document.querySelectorAll('form select')];
    assert.equal(selects.some(select => [...select.options].some(option => ['unconfirmed','confirmed','completed'].includes(option.value))),false);
  };
  return {fixture, open, changeStatus, editNotes, submit, noStatusSelect};
}

for (const status of ['confirmed','completed']) {
  test('editing notes of '+status+' appointment omits status and receipt command', async t => {
    const h = await mount(t,{status}); await h.open(); h.noStatusSelect();
    await h.editNotes('Updated fixture notes'); await h.submit();
    assert.equal(h.fixture.writes.length,1);
    const request = h.fixture.writes[0]; assert.equal(request.method,'put');
    assert.equal(request.data.notes,'Updated fixture notes');
    assert.equal(Object.hasOwn(request.data,'status'),false);
    assert.equal(Object.hasOwn(request.data,'operation_id'),false);
    assert.equal(h.fixture.saved[0].status,status);
  });
}
for (const createStatus of [undefined,'completed']) {
  test('create uses unconfirmed default, opening form status = '+createStatus, async t => {
    const h = await mount(t,{create:true,createStatus}); h.noStatusSelect(); await h.submit();
    assert.equal(h.fixture.writes.length,1); assert.equal(h.fixture.writes[0].method,'post');
    assert.equal(h.fixture.writes[0].data.status,'unconfirmed');
    assert.equal(Object.hasOwn(h.fixture.writes[0].data,'operation_id'),false);
  });
}
test('calendar confirmation PATCH survives saving an older unconfirmed modal snapshot', async t => {
  const h = await mount(t,{status:'unconfirmed'}); await h.open();
  assert.equal(h.fixture.modal.appointmentForm.status,'unconfirmed');
  await h.changeStatus('Подтверждено');
  assert.equal(h.fixture.modal.appointmentForm.status,'unconfirmed','Opening snapshot is intentionally stale');
  await h.editNotes('Edited after confirmation'); await h.submit();
  assert.deepEqual(h.fixture.writes.map(({method,data}) => [method,data.status]),[['patch','confirmed'],['put',undefined]]);
  assert.equal(h.fixture.writes[0].url,'https://crm.test/api/appointments/appointment-fixture/status');
  assert.deepEqual(h.fixture.writes[0].data,{status:'confirmed'});
  assert.equal(h.fixture.saved[0].status,'confirmed');
  assert.equal(h.fixture.saved[0].notes,'Edited after confirmation');
});
test('calendar completion retains the dedicated status PATCH and operation identity', async t => {
  const h = await mount(t); await h.changeStatus('Завершен');
  assert.equal(h.fixture.writes.length,1); const request = h.fixture.writes[0];
  assert.equal(request.method,'patch'); assert.ok(request.url.endsWith('/appointment-fixture/status'));
  assert.equal(request.data.status,'completed'); assert.ok(request.data.operation_id);
  assert.equal(h.fixture.saved[0].status,'completed');
});
