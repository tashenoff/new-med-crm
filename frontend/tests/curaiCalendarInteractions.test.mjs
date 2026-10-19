import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
bootstrap.window.close();
const compiled = await build({
  stdin: { contents: `export { default as CalendarView } from './src/components/calendar/CalendarView.js'; export { getAppointmentHeight } from './src/components/calendar/utils/timeUtils.js';`, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom'], loader: { '.js': 'jsx', '.css': 'empty' },
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { CalendarView, getAppointmentHeight } = module.exports;

async function mount(context, canEdit = true) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
  dom.window.innerWidth = 1280;
  dom.window.scrollTo = () => {};
  dom.window.confirm = () => { throw new Error('Unexpected confirmation'); };
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const saved = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  const root = createRoot(document.getElementById('root'));
  context.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const calls = { slot: [], edit: [], status: [], move: [] };
  const appointment = { id: 'appointment', patient_id: 'patient', doctor_id: 'doctor', room_id: 'room', appointment_date: '2026-10-19', appointment_time: '08:30', end_time: '09:00', status: 'confirmed' };
  await act(async () => root.render(React.createElement(CalendarView, {
    appointments: [appointment], patients: [{ id: 'patient', full_name: 'Test patient' }],
    doctors: [{ id: 'doctor', full_name: 'Test doctor', calendar_color: '#3B82F6' }],
    rooms: [{ id: 'room', name: 'Room', schedule: [{ day_of_week: 0, is_active: true, start_time: '08:00', end_time: '20:00', doctor_id: 'doctor' }] }, { id: 'empty', name: 'Empty', schedule: [] }],
    currentDate: new Date(2026, 9, 19), onDateChange() {}, canEdit,
    onSlotClick: (...args) => calls.slot.push(args), onEditAppointment: value => calls.edit.push(value),
    onStatusChange: (...args) => calls.status.push(args), onMoveAppointment: (...args) => calls.move.push(args),
  })));
  return { document: dom.window.document, calls, appointment };
}

test('Curai grid preserves slot and appointment callbacks and room schedule filtering', async context => {
  const { document, calls, appointment } = await mount(context);
  const columns = document.querySelectorAll('.calendar-room-column');
  assert.equal(columns.length, 2);
  assert.equal(columns[0].querySelectorAll('.calendar-timeslot').length, 24);
  await act(async () => columns[0].querySelector('.calendar-timeslot').click());
  assert.deepEqual(calls.slot, [['2026-10-19', '08:00', 'room']]);
  await act(async () => columns[1].querySelector('.calendar-timeslot').click());
  assert.equal(calls.slot.length, 1, 'room without a doctor does not create an appointment');
  await act(async () => columns[0].querySelector('.curai-appointment-card').click());
  assert.equal(calls.edit[0], appointment);
});

test('Curai appointment context menu keeps status changes and drag/drop keeps target room/time', async context => {
  const { document, calls } = await mount(context);
  const card = document.querySelector('.curai-appointment-card');
  await act(async () => card.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 })));
  const status = [...document.querySelectorAll('body > div button')].find(button => button.textContent.trim() === 'Завершен');
  assert.ok(status);
  await act(async () => status.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })));
  assert.deepEqual(calls.status, [['appointment', 'completed']]);
  const data = new Map();
  const transfer = { setData: (key, value) => data.set(key, value), getData: key => data.get(key) || '', effectAllowed: '', dropEffect: '' };
  const drag = type => { const event = new window.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(event, 'dataTransfer', { value: transfer }); return event; };
  await act(async () => card.dispatchEvent(drag('dragstart')));
  assert.equal(data.get('appointmentId'), 'appointment');
  const target = document.querySelectorAll('.calendar-room-column')[0].querySelectorAll('.calendar-timeslot')[3];
  await act(async () => target.dispatchEvent(drag('drop')));
  assert.deepEqual(calls.move, [['appointment', 'doctor', '2026-10-19', '09:30', 'room']]);
});

test('Curai calendar design slot height remains aligned with duration geometry', async () => {
  const tokens = JSON.parse(await readFile(new URL('../src/theme/curai.tokens.json', import.meta.url), 'utf8'));
  for (const [end, slots] of [['09:00', 1], ['09:30', 2], ['10:00', 3]]) {
    assert.equal(getAppointmentHeight({ appointment_time: '08:30', end_time: end }), tokens.calendar['slot-height'] * slots);
  }
});
