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
  entryPoints: [fileURLToPath(new URL('../src/pages/StaffManagementPage.jsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom', 'axios'], loader: { '.js': 'jsx' },
  define: { 'import.meta.env': JSON.stringify({ VITE_BACKEND_URL: 'https://synthetic-api.invalid' }) }
});
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
const StaffManagementPage = loaded.exports.default;

async function mount(t, { load = 'success', save = 'success' } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://synthetic-ui.invalid' });
  const keys = ['window', 'document', 'localStorage', 'HTMLElement', 'fetch', 'IS_REACT_ACT_ENVIRONMENT', 'setTimeout', 'clearTimeout'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const timers = new Set();
  const schedule = globalThis.setTimeout;
  const cancel = globalThis.clearTimeout;
  const calls = [];
  const record = { id: 'synthetic-doctor', full_name: 'Synthetic Doctor', login: 'synthetic-doctor',
    role: 'doctor', type: 'doctor', has_access: true, is_active: true };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
    setTimeout: (...args) => { const timer = schedule(...args); timers.add(timer); return timer; },
    clearTimeout: timer => { timers.delete(timer); cancel(timer); },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith('/personnel/all')) return { ok: true, json: async () => [record] };
      if (!options.method) {
        if (load === 'network') throw new TypeError('Failed to fetch');
        if (load === '403') return { ok: false, json: async () => ({ detail: 'Permission denied' }) };
        return { ok: true, json: async () => load === 'empty' ? null
          : { ...record, permission_mode: 'explicit', custom_permissions: ['patients_view'] } };
      }
      if (save === 'network') throw new TypeError('Failed to fetch');
      if (save !== 'success') return { ok: false, json: async () => ({ detail: 'Synthetic save rejected ' + save }) };
      return { ok: true, json: async () => ({ ...record, ...JSON.parse(options.body) }) };
    }
  });
  const oldError = console.error;
  console.error = () => {};
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    for (const timer of timers) cancel(timer);
    console.error = oldError;
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  await act(async () => root.render(React.createElement(StaffManagementPage,
    { user: { role: 'super_admin', permissions: ['staff_view', 'staff_edit'] } })));
  await act(async () => document.querySelector('button[title="Редактировать права"]').click());
  return { calls, body: document.body };
}

for (const load of ['network', '403', 'empty']) {
  test(`failed doctor permission load (${load}) never opens an empty editable form`, async t => {
    const { calls, body } = await mount(t, { load });
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.querySelector('input[name="patients_view"]'), null);
    assert.equal(calls.some(call => call.options.method === 'PUT'), false);
    assert.match(body.textContent, /Failed to fetch|Ошибка при загрузке данных сотрудника|Не удалось загрузить текущие права врача/);
  });
}

for (const save of ['success', '403', '422', 'network']) {
  test(`loaded doctor permissions preserve the draft through save ${save}`, async t => {
    const { calls, body } = await mount(t, { save });
    assert.equal(document.querySelector('input[name="patients_view"]').checked, true);
    const before = calls.length;
    await act(async () => document.querySelector('input[name="calendar_view"]').click());
    assert.equal(calls.length, before, 'checkbox changes do not send requests');
    await act(async () => document.querySelector('form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })));
    const writes = calls.filter(call => call.options.method === 'PUT');
    assert.equal(writes.length, 1);
    assert.deepEqual(JSON.parse(writes[0].options.body), { login: 'synthetic-doctor',
      permission_mode: 'explicit', custom_permissions: ['patients_view', 'calendar_view'] });
    if (save === 'success') assert.equal(document.querySelector('[role="dialog"]'), null);
    else {
      assert.ok(document.querySelector('[role="dialog"]'));
      assert.equal(document.querySelector('input[name="patients_view"]').checked, true);
      assert.equal(document.querySelector('input[name="calendar_view"]').checked, true);
      assert.ok(body.textContent.includes(save === 'network' ? 'Failed to fetch' : 'Synthetic save rejected ' + save));
    }
  });
}
