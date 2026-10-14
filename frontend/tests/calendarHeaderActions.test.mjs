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
delete globalThis.window;
delete globalThis.document;
bootstrap.window.close();

const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/calendar/CalendarView.js', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom'], loader: { '.js': 'jsx', '.css': 'empty' },
  plugins: [{ name: 'calendar-data-fixtures', setup(builder) {
    builder.onResolve({ filter: /TimeGrid$|DragDropManager$|useTheme$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export default () => null;
      export class DragDropManager {}
      export const themeClasses = { border: {}, bg: {}, text: {}, shadow: {}, button: {} };
    ` }));
  } }]
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const CalendarView = module.exports.default;

async function mount(context, { canEdit = true, width = 1280 } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
  dom.window.innerWidth = width;
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true };
  const saved = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  const root = createRoot(document.getElementById('root'));
  context.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const calls = { create: 0, dates: [] };
  await act(async () => root.render(React.createElement(CalendarView, {
    currentDate: new Date(2026, 9, 14), canEdit,
    rooms: [{ id: 'room', name: 'Room' }],
    onNewAppointment: () => calls.create++, onDateChange: date => calls.dates.push(date)
  })));
  return { document: dom.window.document, calls };
}

test('normal calendar owns one compact set of actions inside its schedule header', async context => {
  const { document, calls } = await mount(context);
  const header = document.querySelector('.calendar-schedule-header');
  assert.ok(header.querySelector('h2'));
  assert.ok(header.querySelector('p'));
  assert.equal(document.querySelectorAll('.calendar-header-controls').length, 1);
  assert.equal(document.querySelectorAll('.calendar-date-nav').length, 1, 'only the panel header remains');
  assert.equal(document.querySelectorAll('[aria-haspopup="dialog"]').length, 1);
  await act(async () => header.querySelector('[data-guide="add-appointment-btn"]').click());
  assert.equal(calls.create, 1);
  const picker = header.querySelector('[aria-haspopup="dialog"]');
  await act(async () => picker.click());
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog);
  assert.equal(dialog.parentElement, document.body, 'popover remains portaled');
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, picker);
  await act(async () => picker.click());
  const day = [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent.trim() === '15');
  assert.ok(day);
  await act(async () => day.click());
  assert.equal(calls.dates.length, 1);
  assert.equal(calls.dates[0].getDate(), 15);
  assert.equal(document.activeElement, picker);
  await act(async () => header.querySelector('button[title]:last-child').click());
  assert.equal(document.querySelector('.calendar-schedule-header'), null);
  assert.equal(document.querySelector('.calendar-header-controls'), null);
  assert.equal(document.querySelectorAll('[aria-haspopup="dialog"]').length, 1);
  assert.equal(document.querySelectorAll('[data-guide="add-appointment-btn"]').length, 1);
  await act(async () => document.querySelector('[data-guide="add-appointment-btn"]').click());
  assert.equal(calls.create, 2);
  await act(async () => document.querySelector('button[title]:last-child').click());
  assert.ok(document.querySelector('.calendar-schedule-header'));
});

test('read-only calendar hides create in normal and fullscreen views', async context => {
  const { document } = await mount(context, { canEdit: false });
  assert.equal(document.querySelector('[data-guide="add-appointment-btn"]'), null);
  await act(async () => document.querySelector('.calendar-header-controls button[title]:last-child').click());
  assert.equal(document.querySelector('[data-guide="add-appointment-btn"]'), null);
  assert.equal(document.querySelectorAll('[aria-haspopup="dialog"]').length, 1);
});

test('mobile keeps the room selector and hides fullscreen while retaining header actions', async context => {
  const { document } = await mount(context, { width: 320 });
  const controls = document.querySelector('.calendar-header-controls');
  assert.equal(controls.querySelectorAll('button').length, 2);
  assert.ok(controls.querySelector('[aria-haspopup="dialog"]'));
  assert.ok(controls.querySelector('[data-guide="add-appointment-btn"]'));
  assert.equal(document.querySelector('.calendar-mobile-toolbar select').value, 'room');
});
