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
const compiled = await build({
  stdin: { contents: `export { default as Status } from './src/components/patients/PatientTermsStatus.jsx'; export { default as Page } from './src/pages/PatientTermsPage.jsx';`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom/client'],
  loader: { '.css': 'empty' }, define: { 'import.meta.env': '{"VITE_BACKEND_URL":"http://localhost"}' },
  plugins: [{ name: 'terms-http-boundary', setup(builder) {
    builder.onResolve({ filter: /\/api\/config$/ }, () => ({ path: 'api', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const apiClient = {get:(...args)=>globalThis.termsFixture.get(...args)};` }));
  } }],
});
const mod = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
const { Status, Page } = mod.exports;
const pending = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function mount(t, Component, props = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: `http://localhost/consent/#${'a'.repeat(43)}`, pretendToBeVisual: true });
  const timers = new Set(), requests = [];
  const nativeTimeout = globalThis.setTimeout, nativeClear = globalThis.clearTimeout;
  const fixture = { get: async (url, options) => { requests.push({ url, options }); return { data: { accepted: false, version: 'demo-v1', history: [] } }; } };
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true,
    termsFixture: fixture,
    setTimeout: (fn, ms, ...args) => { if (ms === 5000) { const handle = { fn }; timers.add(handle); return handle; } return nativeTimeout(fn, ms, ...args); },
    clearTimeout: handle => { if (timers.has(handle)) timers.delete(handle); else nativeClear(handle); } };
  const previous = new Map();
  for (const [key, value] of Object.entries(globals)) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  const root = createRoot(dom.window.document.getElementById('root'));
  const render = async newProps => { await act(async () => root.render(React.createElement(Component, newProps))); };
  t.after(async () => { await act(async () => root.unmount()); assert.equal(timers.size, 0); dom.window.close(); for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; } });
  await render(props);
  return { dom, root, fixture, requests, timers, render, text: () => dom.window.document.body.textContent };
}

test('status hides only this patient for this session; card stays visible', async t => {
  const f = await mount(t, Status, { patientId: 'hide-one', dismissible: true });
  assert.match(f.text(), /Условия не приняты/);
  await act(async () => f.dom.window.document.querySelector('button').click());
  assert.equal(f.text(), '');
  await f.render({ patientId: 'hide-two', dismissible: true });
  assert.match(f.text(), /Условия не приняты/);
  await f.render({ patientId: 'hide-one', dismissible: true });
  assert.equal(f.text(), '');
  await f.render({ patientId: 'hide-one' });
  assert.match(f.text(), /Условия не приняты/);
  assert.match(f.text(), /demo-v1/);
});

test('late response cannot show another patient; cleanup aborts request', async t => {
  const f = await mount(t, Status, { patientId: 'race-initial' });
  const old = pending(); let oldSignal;
  f.fixture.get = (url, options) => {
    if (url.includes('race-old')) { oldSignal = options.signal; return old.promise; }
    return Promise.resolve({ data: { accepted: false, version: 'demo-v1' } });
  };
  await f.render({ patientId: 'race-old' });
  await f.render({ patientId: 'race-new' });
  assert.equal(oldSignal.aborted, true);
  await act(async () => old.resolve({ data: { accepted: true, accepted_at: '2026-10-21T09:00:00Z' } }));
  assert.match(f.text(), /Условия не приняты/);
  assert.doesNotMatch(f.text(), /Условия приняты ·/);
});

test('polling reads server state after another browser accepts, pauses while hidden', async t => {
  const f = await mount(t, Status, { patientId: 'poll-one' });
  let requests = 0;
  f.fixture.get = async () => { requests++; return { data: { accepted: true, accepted_at: '2026-10-21T09:00:00Z', version: 'demo-v1', history: [] } }; };
  Object.defineProperty(f.dom.window.document, 'hidden', { configurable: true, value: true });
  await act(async () => f.dom.window.document.dispatchEvent(new f.dom.window.Event('visibilitychange')));
  assert.equal(f.timers.size, 0);
  assert.equal(requests, 0);
  Object.defineProperty(f.dom.window.document, 'hidden', { configurable: true, value: false });
  await act(async () => f.dom.window.document.dispatchEvent(new f.dom.window.Event('visibilitychange')));
  assert.match(f.text(), /Условия приняты ·/);
  assert.equal(f.timers.size, 1);
  const timer = [...f.timers][0]; f.timers.delete(timer);
  await act(async () => timer.fn());
  assert.equal(requests, 2);
  await f.render({ patientId: 'poll-one', active: false });
  assert.equal(f.timers.size, 0);
});

test('public page starts unchecked; only explicit checked submit accepts', async t => {
  const original = globalThis.fetch;
  const calls = [];
  const data = { state: 'pending', document: { version: 'demo-v1', text: 'ДЕМОНСТРАЦИОННЫЙ ТЕКСТ', demonstration: true } };
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => url.endsWith('accept') ? { ...data, state: 'accepted', accepted_at: '2026-10-21T09:00:00Z' } : data }; };
  t.after(() => { globalThis.fetch = original; });
  const f = await mount(t, Page);
  const checkbox = f.dom.window.document.querySelector('input'), button = f.dom.window.document.querySelector('button');
  assert.equal(checkbox.checked, false); assert.equal(button.disabled, true);
  assert.equal(calls.length, 1); assert.match(calls[0].url, /lookup$/);
  assert.equal(calls[0].options.credentials, 'omit'); assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  await act(async () => f.dom.window.document.querySelector('form').dispatchEvent(new f.dom.window.Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(calls.length, 1);
  await act(async () => checkbox.click());
  assert.equal(button.disabled, false);
  await act(async () => button.click());
  assert.equal(calls.length, 2); assert.match(calls[1].url, /accept$/);
  assert.equal(JSON.parse(calls[1].options.body).acknowledged, true);
  assert.match(f.text(), /Ознакомление подтверждено/);
});

test('visible-window focus supersedes a stalled poll and bypasses stale GET caches', async t => {
  const f = await mount(t, Status, { patientId: 'focus-one' });
  const stalled = pending(); let oldSignal;
  f.fixture.get = (url, options) => { oldSignal = options.signal; return stalled.promise; };
  const timer = [...f.timers][0]; f.timers.delete(timer);
  await act(async () => { timer.fn(); });
  const fresh = [];
  f.fixture.get = async (url, options) => { fresh.push(options); return { data: { accepted: true, accepted_at: '2026-10-21T09:00:00Z', version: 'demo-v1' } }; };
  await act(async () => f.dom.window.dispatchEvent(new f.dom.window.Event('focus')));
  assert.equal(oldSignal.aborted, true);
  assert.match(f.text(), /Условия приняты ·/);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].timeout, 5000);
  assert.equal(typeof fresh[0].params._consent_refresh, 'number');
  await act(async () => stalled.resolve({ data: { accepted: false } }));
  assert.match(f.text(), /Условия приняты ·/);
  assert.equal(f.timers.size, 1);
  await act(async () => f.dom.window.dispatchEvent(new f.dom.window.Event('pageshow')));
  assert.equal(fresh.length, 2);
  await f.render({ patientId: 'focus-one', active: false });
  await act(async () => {
    f.dom.window.dispatchEvent(new f.dom.window.Event('focus'));
    f.dom.window.dispatchEvent(new f.dom.window.Event('pageshow'));
  });
  assert.equal(fresh.length, 2);
  assert.equal(f.timers.size, 0);
});

test('another fragment in the same tab resets confirmation and ignores old acceptance response', async t => {
  const original = globalThis.fetch, acceptance = pending();
  globalThis.fetch = async (url, options) => {
    const token = JSON.parse(options.body).token;
    return url.endsWith('accept') ? acceptance.promise : { ok: true, json: async () => ({
      state: 'pending', document: { version: token.startsWith('a') ? 'demo-one' : 'demo-two', text: 'Demo', demonstration: true },
    }) };
  };
  t.after(() => { globalThis.fetch = original; });
  const f = await mount(t, Page);
  await act(async () => f.dom.window.document.querySelector('input').click());
  await act(async () => f.dom.window.document.querySelector('button').click());
  await act(async () => {
    f.dom.window.location.hash = 'b'.repeat(43);
    f.dom.window.dispatchEvent(new f.dom.window.HashChangeEvent('hashchange'));
  });
  assert.match(f.text(), /demo-two/);
  assert.equal(f.dom.window.document.querySelector('input').checked, false);
  assert.equal(f.dom.window.document.querySelector('button').disabled, true);
  await act(async () => acceptance.resolve({ ok: true, json: async () => ({ state: 'accepted', accepted_at: '2026-10-21T09:00:00Z', document: { version: 'demo-one', text: 'Old demo' } }) }));
  assert.match(f.text(), /demo-two/);
  assert.doesNotMatch(f.text(), /Ознакомление подтверждено/);
});
