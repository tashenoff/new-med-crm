import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(new URL('../src/hooks/useBookingTime.js', import.meta.url), 'utf8');
const useBookingTime = new Function('React', `const {useEffect,useRef,useState}=React;
  ${source.replace(/^import .*?;\s*/, '').replace('export function', 'function')}
  return useBookingTime;`)(React);
const initial = { patient_id: 'patient', doctor_id: 'doctor', room_id: 'room',
  appointment_date: '2026-10-25', appointment_time: '10:00', end_time: '11:00', deposit: 2000 };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function harness(context, fetcher, editing = false, opening = initial) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://synthetic' });
  const keys = ['window', 'document', 'localStorage', 'fetch', 'IS_REACT_ACT_ENVIRONMENT'];
  const saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, fetch: fetcher, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById('root'));
  let state, setForm, result;
  function Harness() {
    [state, setForm] = React.useState(opening);
    result = useBookingTime({ show: true, editing, form: state, update: setForm, api: 'http://synthetic' });
    return null;
  }
  context.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  await act(async () => root.render(React.createElement(Harness)));
  return { get state() { return state; }, get result() { return result; },
    change: async update => act(async () => setForm(current => ({ ...current, ...update }))),
    settle: async () => act(async () => wait(240)) };
}
const ok = data => ({ ok: true, json: async () => data });

test('calendar/CRM/WhatsApp shared hook automatically updates times and preserves deposit and patient', async context => {
  const requests = [];
  const h = await harness(context, async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return ok({ appointment_date: initial.appointment_date, appointment_time: '11:30', end_time: '12:30' });
  });
  assert.equal(h.result.checking, true);
  await h.settle();
  assert.equal(h.state.appointment_time, '11:30');
  assert.equal(h.state.end_time, '12:30');
  assert.equal(h.state.deposit, 2000);
  assert.equal(h.state.patient_id, 'patient');
  assert.match(h.result.notice, /11:30–12:30/);
  assert.equal(requests[0].url, 'http://synthetic/api/appointments/resolve-time');
  assert.equal(requests[0].body.end_time, '11:00');
});

test('a stale response cannot overwrite a newer time or patient notes', async context => {
  let respond;
  const h = await harness(context, () => new Promise(resolve => { respond = resolve; }));
  await h.settle();
  await h.change({ appointment_time: '14:00', end_time: '15:00', notes: 'Keep my note' });
  await act(async () => respond(ok({ appointment_date: initial.appointment_date,
    appointment_time: '11:30', end_time: '12:30' })));
  assert.equal(h.state.appointment_time, '14:00');
  assert.equal(h.state.end_time, '15:00');
  assert.equal(h.state.notes, 'Keep my note');
});

test('a fully occupied day shows a useful error without changing date or creating a booking', async context => {
  const h = await harness(context, async () => ({ ok: false,
    json: async () => ({ detail: 'На выбранную дату больше нет свободного времени. Выберите другую дату.' }) }));
  await h.settle();
  assert.match(h.result.error, /другую дату/);
  assert.deepEqual(h.state, initial);
  assert.equal(h.result.checking, false);
});

test('editing an existing booking never automatically changes its time', async context => {
  let requests = 0;
  const h = await harness(context, async () => { requests++; return ok({}); }, true);
  await h.settle();
  assert.equal(requests, 0);
  assert.deepEqual(h.state, initial);
});

test('a duration shorter than 30 minutes never triggers automatic selection', async context => {
  let requests = 0;
  const h = await harness(context, async () => { requests++; return ok({}); }, false,
    { ...initial, end_time: '10:15' });
  await h.settle();
  assert.equal(requests, 0);
  assert.equal(h.result.checking, false);
});
