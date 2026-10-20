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

// Exercise the real booking callbacks, shared refresh provider, appointments hook
// and calendar cards together. Only HTTP and unrelated data/widgets are mocked.
const compiled = await build({
  stdin: { contents: `
    import React from 'react';
    import Page from './src/pages/CalendarPage.jsx';
    import Inbox from './src/components/crm/telephony/WhatsAppInbox.jsx';
    import Auth from './src/context/AuthContext.jsx';
    import { ModalProvider, useModal } from './src/context/ModalContext.jsx';
    import { GlobalRefreshProvider, useGlobalRefresh } from './src/hooks/useGlobalRefresh.js';
    function Capture() {
      const modal = useModal();
      const refresh = useGlobalRefresh();
      const f = globalThis.appointmentRefreshFixture;
      f.modal = modal.getModalProps('appointment');
      f.modalOpen = modal.isModalOpen('appointment');
      f.refresh = refresh.refreshAppointments;
      return null;
    }
    export default function Harness() {
      return <GlobalRefreshProvider><ModalProvider>
        <Auth.Provider value={{user:{role:'super_admin'}}}>
          <Page user={{role:'super_admin'}} /><Inbox isOpen onClose={() => {}} /><Capture />
        </Auth.Provider>
      </ModalProvider></GlobalRefreshProvider>;
    }
  `, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom', 'react-dom/client'], loader: { '.js': 'jsx', '.css': 'empty' },
  define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://fixture.invalid"}' },
  plugins: [{ name: 'appointment-refresh-boundaries', setup(builder) {
    builder.onResolve({ filter: /^axios$|\/api\/config$|\/context\/AuthContext(\.jsx)?$|\/(usePatients|useDoctors|useRooms|DoctorCashbackWidget|PatientBonusWidget|ChatCrmStage|WhatsAppConnectionBadge)$/ }, args => ({
      path: /AuthContext/.test(args.path) ? 'AuthContext' : args.path, namespace: 'fixture'
    }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
      const name = args.path.split('/').at(-1);
      const contents = name === 'axios'
        ? `export default {get:(...args)=>globalThis.appointmentRefreshFixture.calendarGet(...args),post:(...args)=>globalThis.appointmentRefreshFixture.calendarPost(...args)};`
        : name === 'config'
          ? `export const apiClient={get:(...args)=>globalThis.appointmentRefreshFixture.api('GET',...args),post:(...args)=>globalThis.appointmentRefreshFixture.api('POST',...args),patch:(...args)=>globalThis.appointmentRefreshFixture.api('PATCH',...args)};export const API_BASE_URL='https://fixture.invalid/api';export const handleApiError=e=>e.message;`
          : name === 'AuthContext'
            ? `import React from 'react';export default React.createContext(null);`
            : ['usePatients','useDoctors','useRooms'].includes(name)
              ? `export const ${name}=()=>globalThis.appointmentRefreshFixture.${name};`
              : 'export default ()=>null;';
      return { contents, loader: 'jsx' };
    });
  } }]
});
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
const Harness = loaded.exports.default;
const dateString = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

async function mount(t, { lead = false, fail = false, seedStatus = false, failStatus = false } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid' });
  dom.window.innerWidth = 1280;
  const patient = { id: 'patient', full_name: 'Fixture Patient', phone: '+70000000000' };
  const doctors = [{ id: 'doctor-one', full_name: 'Doctor One' }, { id: 'doctor-two', full_name: 'Doctor Two' }];
  const rooms = doctors.map((doctor, i) => ({ id: `room-${i+1}`, name: `Room ${i+1}`, schedule:
    Array.from({ length: 7 }, (_, day) => ({ day_of_week: day, doctor_id: doctor.id, is_active: true, start_time: '08:00', end_time: '20:00' })) }));
  const chat = { phone: patient.phone, ...(lead ? { linked_lead_id: 'lead', lead_name: 'Fixture Lead', source: 'lead' }
    : { patient_id: patient.id, patient_name: patient.full_name, source: 'patient' }) };
  const now = new Date(), day = now.getDate() === 15 ? 16 : 15;
  const selectedDate = dateString(new Date(now.getFullYear(), now.getMonth(), day));
  const f = { saved: [], writes: [], calendarReads: 0, patientReads: 0, statusWrites: [], statusEvents: 0, gate: null, statusGate: null };
  if (seedStatus) f.saved.push({ id: 'seeded', patient_id: patient.id, patient_name: patient.full_name,
    doctor_id: 'doctor-two', doctor_name: doctors[1].full_name, room_id: 'room-2',
    appointment_date: selectedDate, appointment_time: '10:00', end_time: '10:30', status: 'unconfirmed' });
  const listeners = new Set();
  const add = dom.window.addEventListener.bind(dom.window), remove = dom.window.removeEventListener.bind(dom.window);
  const dispatch = dom.window.dispatchEvent.bind(dom.window);
  dom.window.addEventListener = (type, listener, ...args) => {
    if (type === 'crm-appointments-changed') listeners.add(listener);
    return add(type, listener, ...args);
  };
  dom.window.removeEventListener = (type, listener, ...args) => {
    if (type === 'crm-appointments-changed') listeners.delete(listener);
    return remove(type, listener, ...args);
  };
  dom.window.dispatchEvent = event => {
    if (event.type === 'crm-appointments-changed') f.statusEvents++;
    return dispatch(event);
  };
  const noOp = async () => {};
  f.usePatients = { patients: [patient], fetchPatients: noOp };
  f.useDoctors = { doctors, fetchDoctors: noOp };
  f.useRooms = { rooms, fetchRooms: noOp };
  const save = async (path, data) => {
    f.writes.push({ path, data: structuredClone(data) });
    if (f.gate) await f.gate;
    if (fail) throw Error('Fixture booking rejected');
    const record = { ...data, id: `created-${f.saved.length+1}`, patient_id: data.patient_id || patient.id,
      patient_name: patient.full_name, doctor_name: doctors.find(d => d.id === data.doctor_id)?.full_name,
      status: data.status || 'unconfirmed' };
    f.saved.push(record);
    if (lead) Object.assign(chat, { patient_id: patient.id, patient_name: patient.full_name });
    return { data: structuredClone(record) };
  };
  f.calendarGet = async url => {
    assert.equal(url, 'https://fixture.invalid/api/appointments');
    f.calendarReads++;
    return { data: structuredClone(f.saved) };
  };
  f.calendarPost = async (url, data) => {
    assert.equal(url, 'https://fixture.invalid/api/appointments');
    return save('/appointments', data);
  };
  f.api = async (method, path, options) => {
    if (method === 'PATCH') {
      assert.equal(path, '/appointments/seeded/status', 'only the selected visit may change');
      f.statusWrites.push(structuredClone(options));
      if (f.statusGate) await f.statusGate;
      if (failStatus) throw Error('Fixture status rejected');
      const visit = f.saved.find(row => row.id === 'seeded');
      visit.status = options.status;
      return { data: structuredClone(visit) };
    }
    if (method === 'POST') {
      assert.ok(['/appointments', '/crm/leads/lead/schedule-appointment'].includes(path), 'No messages or unrelated writes');
      return save(path, options);
    }
    if (path === '/wazzup/chats') return { data: { chats: [structuredClone(chat), ...(seedStatus ? [{
      phone: '+70000000001', lead_name: 'Other Fixture Lead', linked_lead_id: 'other', source: 'lead',
    }] : [])] } };
    if (path.startsWith('/wazzup/messages/history/')) return { data: { messages: [] } };
    if (path === '/doctors') return { data: doctors };
    if (path === '/appointments') {
      f.patientReads++;
      return { data: structuredClone(f.saved.filter(row => !options?.params?.patient_id || row.patient_id === options.params.patient_id)) };
    }
    throw Error('Unexpected fixture request: '+method+' '+path);
  };
  const previous = new Map();
  const globals = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true, appointmentRefreshFixture: f, setInterval: () => 1, clearInterval() {},
    fetch: async () => { throw Error('External fetch forbidden in regression test'); },
    alert: message => assert.fail('Unexpected alert: '+message) };
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const log = console.log; console.log = () => {};
  const root = createRoot(document.getElementById('root'));
  let mounted = true;
  const unmount = async () => { if (mounted) { await act(async () => root.unmount()); mounted = false; } };
  const rerender = async () => act(async () => root.render(React.createElement(Harness)));
  t.after(async () => {
    await unmount(); dom.window.close(); console.log = log;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  await rerender();
  const button = name => [...document.querySelectorAll('button')].find(e => e.textContent.trim() === name);
  const click = async element => { assert.ok(element); await act(async () => element.click()); };
  const selectDay = async day => {
    await click(document.querySelector('[aria-label="Выбрать дату"]'));
    await click([...document.querySelectorAll('[aria-label="Выбор даты"] button')].find(e => e.textContent.trim() === String(day)));
  };
  // A non-today selection catches refresh implementations which remount/reset the calendar.
  await selectDay(day);
  const form = { patient_id: patient.id, doctor_id: 'doctor-two', room_id: 'room-2', appointment_date: selectedDate,
    appointment_time: '10:00', end_time: '10:30', status: 'unconfirmed', price: 0, source_id: 'source', reason: 'Fixture visit' };
  const openWhatsAppBooking = async () => {
    await click([...document.querySelectorAll('.curai-chat-sidebar button')].find(e => e.textContent.includes(lead ? 'Fixture Lead' : patient.full_name)));
    await click(button('Записать'));
    assert.equal(f.modalOpen, true);
  };
  const cards = () => [...document.querySelectorAll('.curai-appointment-card')];
  const subtitle = () => document.querySelector('.calendar-date-subtitle').textContent;
  const assertOneCard = () => {
    assert.equal(cards().length, 1, 'one visible card without a page reload');
    const column = cards()[0].closest('.calendar-room-column');
    assert.match(column.textContent, /Room 2/);
    assert.match(cards()[0].getAttribute('aria-label'), /Doctor Two/);
    assert.equal(document.querySelectorAll('.calendar-room-column')[0].querySelector('.curai-appointment-card'), null);
  };
  const openWhatsAppVisits = async () => {
    await click([...document.querySelectorAll('.curai-chat-sidebar button')].find(e => e.textContent.includes(patient.full_name)));
    await click(button('Приёмы · 1'));
  };
  return { f, form, click, button, cards, subtitle, selectDay, openWhatsAppBooking, openWhatsAppVisits,
    assertOneCard, today: now.getDate(), listeners, rerender, unmount, dom };
}

for (const lead of [false, true]) {
  test(`WhatsApp ${lead ? 'lead conversion' : 'patient booking'} refreshes the mounted calendar once after success`, async t => {
    const h = await mount(t, { lead });
    assert.equal(h.f.calendarReads, 1, 'one initial calendar fetch');
    const selectedSubtitle = h.subtitle();
    await h.openWhatsAppBooking();
    let release;
    h.f.gate = new Promise(resolve => { release = resolve; });
    let saving;
    await act(async () => { saving = h.f.modal.onSave(h.form); });
    assert.equal(h.f.calendarReads, 1, 'no refresh before successful POST');
    assert.equal(h.cards().length, 0);
    await act(async () => { release(); await saving; });
    assert.equal(h.f.writes.length, 1);
    assert.equal(h.f.writes[0].path, lead ? '/crm/leads/lead/schedule-appointment' : '/appointments');
    assert.equal(h.f.calendarReads, 2, 'one shared invalidation causes one calendar fetch');
    assert.equal(h.f.modalOpen, false);
    assert.equal(h.subtitle(), selectedSubtitle, 'selected day survives refresh');
    h.assertOneCard();
    await act(async () => h.f.refresh());
    h.assertOneCard();
    assert.equal(h.f.writes.length, 1, 'refresh never repeats the creation');
  });

  test(`failed WhatsApp ${lead ? 'lead conversion' : 'patient booking'} neither refreshes nor inserts a calendar card`, async t => {
    const h = await mount(t, { lead, fail: true });
    await h.openWhatsAppBooking();
    await act(async () => assert.rejects(h.f.modal.onSave(h.form), /Fixture booking rejected/));
    assert.equal(h.f.calendarReads, 1);
    assert.equal(h.f.saved.length, 0);
    assert.equal(h.cards().length, 0);
    assert.equal(h.f.modalOpen, true);
  });
}

test('calendar slot booking retains its own refresh, day and doctor without duplicate cards', async t => {
  const h = await mount(t);
  const selectedSubtitle = h.subtitle();
  await h.click(document.querySelectorAll('.calendar-room-column')[1].querySelector('.calendar-timeslot'));
  assert.equal(h.f.modal.appointmentForm.appointment_date, h.form.appointment_date);
  assert.equal(h.f.modal.appointmentForm.room_id, 'room-2');
  await act(async () => h.f.modal.onSave(h.form));
  assert.equal(h.f.writes.length, 1);
  assert.equal(h.f.calendarReads, 2, 'local creation keeps one existing server refresh');
  assert.equal(h.subtitle(), selectedSubtitle);
  h.assertOneCard();
});

test('WhatsApp booking for another day does not change the current calendar day or show a ghost card', async t => {
  const h = await mount(t);
  const selectedSubtitle = h.subtitle();
  await h.openWhatsAppBooking();
  const otherDay = new Date(h.form.appointment_date+'T12:00:00');
  otherDay.setDate(h.today);
  await act(async () => h.f.modal.onSave({ ...h.form, appointment_date: dateString(otherDay) }));
  assert.equal(h.f.calendarReads, 2);
  assert.equal(h.subtitle(), selectedSubtitle);
  assert.equal(h.cards().length, 0);
  await h.selectDay(h.today);
  h.assertOneCard();
});

test('WhatsApp status confirmation refreshes both lists once and preserves the calendar day and card', async t => {
  const h = await mount(t, { seedStatus: true });
  const date = h.subtitle(), card = h.cards()[0];
  assert.match(card.textContent, /Не подтверждено/);
  await h.openWhatsAppVisits();
  const reads = h.f.patientReads;
  await h.click(document.querySelector('[aria-label="Статус записи: Не подтверждено"]'));
  await h.click([...document.querySelectorAll('[role="menuitemradio"]')].find(e => e.textContent.trim() === 'Подтверждено'));
  assert.deepEqual(h.f.statusWrites, [{ status: 'confirmed' }]);
  assert.equal(h.f.statusEvents, 1);
  assert.equal(h.f.calendarReads, 2, 'one initial read plus one successful-status invalidation');
  assert.equal(h.f.patientReads, reads + 1, 'the DOM event must not be followed by a redundant local reload');
  assert.match(h.cards()[0].textContent, /Подтверждено/);
  assert.equal(h.cards()[0], card, 'refresh updates the existing card without remounting it');
  assert.equal(h.subtitle(), date);
  h.assertOneCard();
});

test('a rejected WhatsApp status write changes neither list and emits no invalidation', async t => {
  const h = await mount(t, { seedStatus: true, failStatus: true });
  await h.openWhatsAppVisits();
  const reads = h.f.patientReads;
  await h.click(h.button('Подтвердить'));
  assert.equal(h.f.statusWrites.length, 1);
  assert.equal(h.f.statusEvents, 0);
  assert.equal(h.f.calendarReads, 1);
  assert.equal(h.f.patientReads, reads);
  assert.equal(h.f.saved[0].status, 'unconfirmed');
  assert.match(h.cards()[0].textContent, /Не подтверждено/);
  assert.ok(h.button('Подтвердить'));
  assert.match(document.querySelector('[role="alert"]').textContent, /Fixture status rejected/);
});

test('a double click during status PATCH produces one write, event and calendar reload', async t => {
  const h = await mount(t, { seedStatus: true });
  await h.openWhatsAppVisits();
  let release;
  h.f.statusGate = new Promise(resolve => { release = resolve; });
  const target = h.button('Подтвердить'), reads = h.f.patientReads;
  await act(async () => { target.click(); target.click(); });
  assert.equal(h.f.statusWrites.length, 1);
  assert.equal(h.f.calendarReads, 1, 'pending writes must not invalidate the calendar');
  await act(async () => release());
  assert.equal(h.f.statusEvents, 1);
  assert.equal(h.f.calendarReads, 2);
  assert.equal(h.f.patientReads, reads + 1);
  h.assertOneCard();
});

test('a status PATCH completing after a chat switch still refreshes the calendar without restoring the old chat', async t => {
  const h = await mount(t, { seedStatus: true });
  await h.openWhatsAppVisits();
  let release;
  h.f.statusGate = new Promise(resolve => { release = resolve; });
  await h.click(h.button('Подтвердить'));
  await h.click(document.querySelector('[role="dialog"] button'));
  await h.click([...document.querySelectorAll('.curai-chat-sidebar button')].find(e => e.textContent.includes('Other Fixture Lead')));
  await act(async () => release());
  assert.equal(h.f.statusWrites.length, 1);
  assert.equal(h.f.calendarReads, 2);
  assert.match(h.cards()[0].textContent, /Подтверждено/);
  assert.match(document.querySelector('.curai-chat-header').textContent, /Other Fixture Lead/);
  assert.equal(document.querySelector('[role="dialog"]'), null);
});

test('the provider keeps one stable status subscription across rerenders and removes it on unmount', async t => {
  const h = await mount(t);
  assert.equal(h.listeners.size, 1);
  const listener = [...h.listeners][0];
  await h.rerender(); await h.rerender(); await h.rerender();
  assert.deepEqual([...h.listeners], [listener]);
  assert.equal(h.f.calendarReads, 1);
  await act(async () => window.dispatchEvent(new window.Event('crm-appointments-changed')));
  assert.equal(h.f.calendarReads, 2);
  assert.deepEqual([...h.listeners], [listener]);
  await h.unmount();
  assert.equal(h.listeners.size, 0);
  h.dom.window.dispatchEvent(new h.dom.window.Event('crm-appointments-changed'));
  assert.equal(h.f.calendarReads, 2, 'an unmounted provider cannot trigger stale reloads');
});
