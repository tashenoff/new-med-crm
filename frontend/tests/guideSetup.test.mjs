import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act, useState } from 'react';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { allPermissionKeys } from '../src/utils/permissions.js';

const boot = new JSDOM('<body/>');
globalThis.window = boot.window;
globalThis.document = boot.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
boot.window.close();
const compiled = await build({
  stdin: { contents: `export {GuideProvider,useGuide,GUIDE_STEPS} from './src/context/GuideContext.jsx';
    export {default as GuideTour} from './src/components/guide/GuideTour.jsx';
    export {default as GuideTourModal} from './src/components/guide/GuideTourModal.jsx';
    export {default as Rooms} from './src/components/directory/Rooms.js';
    export {default as DoctorSchedule} from './src/components/doctors/DoctorSchedule.js';`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'],
  loader: { '.js': 'jsx', '.css': 'empty' },
  define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://fixture.invalid"}' },
});
const mod = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
const { GuideProvider, useGuide, GUIDE_STEPS, GuideTour, GuideTourModal, Rooms, DoctorSchedule } = mod.exports;
const el = React.createElement;
const user = { role: 'admin', permissions: allPermissionKeys };
const doctor = { id: 'fixture-doctor', full_name: 'Демо-врач', specialty: 'Терапевт', is_active: true };
const cases = [
  { type: 'room', scope: 'room', add: 'add-room-btn', save: 'save-room-btn', title: 'Как создать кабинет' },
  { type: 'doctorSchedule', scope: 'doctor-schedule', add: 'add-doctor-schedule-btn', save: 'save-doctor-schedule-btn', title: 'Как создать расписание врача' },
];

async function mount(t, { allowed = true } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid' });
  const writes = [];
  const globals = {
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (input, options = {}) => {
      if ((options.method || 'GET') !== 'GET') writes.push(options);
      assert.equal(options.method || 'GET', 'GET', 'guide navigation must not create records');
      const path = new URL(String(input)).pathname;
      const data = path.endsWith('/doctors') ? [doctor] : /\/rooms(?:-with-schedule)?$/.test(path) ? [{ id: 'fixture-room', name: 'Кабинет 1' }] : [];
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  };
  const saved = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  window.requestAnimationFrame = callback => setTimeout(callback, 0);
  window.cancelAnimationFrame = clearTimeout;
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.HTMLElement.prototype.getBoundingClientRect = function () { return { top: 100, left: 80, width: 120, height: 40, right: 200, bottom: 140 }; };
  let guide;
  function Screen() {
    const [page, setPage] = useState('');
    guide = useGuide();
    const actor = allowed ? user : { role: 'doctor', permissions: ['calendar_view'] };
    return el(React.Fragment, null,
      el('button', { 'data-guide': 'nav-room-management' }, 'Кабинеты'),
      el('button', { 'data-guide': 'nav-doctor-schedule' }, 'Расписание врачей'),
      page === 'room-management' && el(Rooms, { user: actor }),
      page === 'doctor-schedule' && el(DoctorSchedule, { doctors: [doctor], user: actor, canEdit: allowed }),
      el(GuideTourModal), el(GuideTour, { onNavigate: setPage }));
  }
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(el(GuideProvider, null, el(Screen))));
  const run = async callback => {
    await act(async () => callback());
    for (let n = 0; n < 3; n++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  };
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const button = label => [...document.querySelectorAll('.guide-tour-tooltip button')].find(item => item.textContent === label);
  return { get guide() { return guide; }, run, writes, button };
}

test('guide picker includes both setup workflows alongside the existing guides', async t => {
  const h = await mount(t);
  await h.run(() => h.guide.openGuideModal());
  assert.equal(document.querySelectorAll('.guide-option-card').length, 4);
  for (const flow of cases) {
    assert.ok([...document.querySelectorAll('.guide-option-card strong')].some(item => item.textContent === flow.title));
    assert.equal(GUIDE_STEPS[flow.type].length, 4);
  }
});

for (const flow of cases) {
  test(`${flow.type}: guide opens the actual form before instructions and can reopen it`, async t => {
    const h = await mount(t);
    await h.run(() => h.guide.startGuide(flow.type));
    assert.ok(document.querySelector(GUIDE_STEPS[flow.type][0].targetSelector), 'first step must have a real visible anchor even with a collapsed sidebar');
    await h.run(() => h.button('Далее').click());
    assert.equal(document.querySelector(`[data-guide="${flow.save}"]`), null);
    await h.run(() => h.button('Открыть форму').click());
    assert.equal(h.guide.currentStep, 2);
    assert.ok(document.querySelector(`[data-guide-form="${flow.scope}"] [data-guide="${flow.save}"]`));
    assert.equal(document.querySelector('.guide-tour-highlight'), null, 'no outline around the form');
    assert.equal(document.querySelector('.guide-tour-mask'), null);
    await h.run(() => document.querySelector('.curai-dialog-close').click());
    assert.ok(h.button('Открыть форму'));
    await h.run(() => h.button('Открыть форму').click());
    assert.equal(h.guide.currentStep, 2);
    assert.ok(document.querySelector(`[data-guide="${flow.save}"]`));
    assert.equal(h.writes.length, 0);
  });

  test(`${flow.type}: field focus collapses the hint and completing the guide never saves`, async t => {
    const h = await mount(t);
    await h.run(() => h.guide.startGuide(flow.type));
    await h.run(() => h.button('Далее').click());
    await h.run(() => h.button('Открыть форму').click());
    const field = document.querySelector(`[data-guide-form="${flow.scope}"] input, [data-guide-form="${flow.scope}"] select`);
    await h.run(() => field.focus());
    assert.ok(document.querySelector('.guide-tour-compact'));
    assert.equal(document.activeElement, field);
    await h.run(() => field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
    assert.equal(h.guide.currentStep, 2, 'typing must not advance guide');
    await h.run(() => document.querySelector('[aria-label="Показать подсказку"]').click());
    await h.run(() => h.button('Далее').click());
    assert.equal(h.guide.currentStep, 3);
    await h.run(() => h.button('Завершить').click());
    assert.equal(h.guide.activeGuide, null);
    assert.ok(document.querySelector(`[data-guide="${flow.save}"]`), 'form stays open for manual save');
    assert.equal(h.writes.length, 0);
  });

  test(`${flow.type}: guide cannot bypass missing create permissions`, async t => {
    const h = await mount(t, { allowed: false });
    await h.run(() => h.guide.startGuide(flow.type));
    await h.run(() => h.button('Далее').click());
    assert.equal(h.button('Открыть форму').disabled, true);
    await h.run(() => document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
    assert.equal(h.guide.currentStep, 1);
    assert.equal(document.querySelector(`[data-guide="${flow.save}"]`), null);
    assert.equal(h.writes.length, 0);
  });
}
