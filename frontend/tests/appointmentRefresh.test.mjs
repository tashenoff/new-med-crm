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
          ? `export const apiClient={get:(...args)=>globalThis.appointmentRefreshFixture.api('GET',...args),post:(...args)=>globalThis.appointmentRefreshFixture.api('POST',...args)};export const API_BASE_URL='https://fixture.invalid/api';export const handleApiError=e=>e.message;`
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

async function mount(t, { lead = false, fail = false } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid' });
  dom.window.innerWidth = 1280;
  const patient = { id: 'patient', full_name: 'Fixture Patient', phone: '+70000000000' };
  const doctors = [{ id: 'doctor-one', full_name: 'Doctor One' }, { id: 'doctor-two', full_name: 'Doctor Two' }];
  const rooms = doctors.map((doctor, i) => ({ id: `room-${i+1}`, name: `Room ${i+1}`, schedule:
    Array.from({ length: 7 }, (_, day) => ({ day_of_week: day, doctor_id: doctor.id, is_active: true, start_time: '08:00', end_time: '20:00' })) }));
  const chat = { phone: patient.phone, ...(lead ? { linked_lead_id: 'lead', lead_name: 'Fixture Lead', source: 'lead' }
    : { patient_id: patient.id, patient_name: patient.full_name, source: 'patient' }) };
  const f = { saved: [], writes: [], calendarReads: 0, gate: null };
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
    if (method === 'POST') {
      assert.ok(['/appointments', '/crm/leads/lead/schedule-appointment'].includes(path), 'No messages or unrelated writes');
      return save(path, options);
    }
    if (path === '/wazzup/chats') return { data: { chats: [structuredClone(chat)] } };
    if (path.startsWith('/wazzup/messages/history/')) return { data: { messages: [] } };
    if (path === '/doctors') return { data: doctors };
    if (path === '/appointments') return { data: structuredClone(f.saved.filter(row => !options?.params?.patient_id || row.patient_id === options.params.patient_id)) };
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
  t.after(async () => {
    await act(async () => root.unmount()); dom.window.close(); console.log = log;
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  await act(async () => root.render(React.createElement(Harness)));
  const button = name => [...document.querySelectorAll('button')].find(e => e.textContent.trim() === name);
  const click = async element => { assert.ok(element); await act(async () => element.click()); };
  const selectDay = async day => {
    await click(document.querySelector('[aria-label="Выбрать дату"]'));
    await click([...document.querySelectorAll('[aria-label="Выбор даты"] button')].find(e => e.textContent.trim() === String(day)));
  };
  // A non-today selection catches refresh implementations which remount/reset the calendar.
  const now = new Date(), day = now.getDate() === 15 ? 16 : 15;
  await selectDay(day);
  const selectedDate = dateString(new Date(now.getFullYear(), now.getMonth(), day));
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
  return { f, form, click, button, cards, subtitle, selectDay, openWhatsAppBooking, assertOneCard, today: now.getDate() };
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
