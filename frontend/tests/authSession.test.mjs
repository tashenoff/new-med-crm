import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Real React and Axios with a synthetic adapter. No server or browser is used.
const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
bootstrap.window.close();
const compiled = await build({
  stdin: { contents: `
    export { AuthProvider, useAuth } from './src/context/AuthContext.jsx';
    export { default as SessionGate } from './src/components/auth/SessionGate.jsx';
    export { authHttp } from './src/api/session.js';
    export { apiClient } from './src/api/config.js';`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
  loader: { '.js': 'jsx' }, define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://fixture.invalid"}' },
});
const module = { exports: {} };
const require = createRequire(import.meta.url);
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports);
const { AuthProvider, useAuth, SessionGate, authHttp, apiClient } = module.exports;
const { MemoryRouter } = require('react-router-dom');
const user = (id = 'verified') => ({ id, is_active: true, role: 'administrator', permissions: ['calendar_view'] });

async function mount(t, token = 'synthetic-A') {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid/calendar', pretendToBeVisual: true });
  const previous = new Map();
  const fetches = [];
  const globals = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url, options) => { fetches.push({ url, options }); return { ok: true }; } };
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  if (token) localStorage.setItem('token', token);
  const pending = [], calls = [];
  const adapter = config => new Promise((resolve, reject) => {
    const request = { config,
      ok: data => resolve({ data, config, status: 200, statusText: 'OK', headers: {} }),
      fail: (status, detail, code) => reject(Object.assign(new Error('Synthetic transport error'), {
        config, code, ...(status ? { response: { status, data: { detail }, config } } : {}),
      })),
    };
    pending.push(request); calls.push(request);
  });
  const adapters = [authHttp.defaults.adapter, apiClient.defaults.adapter];
  authHttp.defaults.adapter = adapter;
  apiClient.defaults.adapter = adapter;
  let auth;
  function Probe() {
    auth = useAuth();
    return React.createElement(SessionGate, null, auth.user
      ? React.createElement('p', { 'data-protected': true }, auth.user.id)
      : React.createElement('p', { 'data-login': true }, 'Sign in'));
  }
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: ['/calendar'] },
    React.createElement(AuthProvider, null, React.createElement(Probe)))));
  t.after(async () => {
    await act(async () => root.unmount());
    authHttp.defaults.adapter = adapters[0]; apiClient.defaults.adapter = adapters[1];
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  return { dom, pending, calls, fetches, get auth() { return auth; },
    next() { assert.ok(pending.length, 'expected synthetic HTTP request'); return pending.shift(); },
    async ok(data = user()) { const request = this.next(); await act(async () => request.ok(data)); },
    async fail(status, detail, code) { const request = this.next(); await act(async () => request.fail(status, detail, code)); },
    async focus() { await act(async () => window.dispatchEvent(new dom.window.Event('focus'))); },
    async api(client, path = '/patients') {
      let promise;
      await act(async () => { promise = client.get(`https://fixture.invalid/api${path}`).catch(() => {}); });
      return { promise, request: this.next() };
    },
    async storage(nextToken, key = 'token', area = localStorage) {
      await act(async () => {
        if (nextToken) localStorage.setItem('token', nextToken); else localStorage.removeItem('token');
        window.dispatchEvent(new dom.window.StorageEvent('storage', { key, newValue: nextToken, storageArea: area }));
      });
    },
  };
}

test('cold-start 502 retains token, gates protected content and retries successfully', async t => {
  const h = await mount(t);
  assert.equal(document.querySelector('[data-protected]'), null);
  await h.fail(502);
  assert.equal(localStorage.getItem('token'), 'synthetic-A');
  assert.equal(h.auth.user, null);
  assert.match(document.body.textContent, /Повторить проверку/);
  assert.equal(document.querySelector('[data-login]'), null);
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Повторить проверку').click());
  await h.ok();
  assert.equal(document.querySelector('[data-protected]').textContent, 'verified');
});

test('cold-start network failure retains the token and offers an explicit logout', async t => {
  const h = await mount(t); await h.fail(null, undefined, 'ERR_NETWORK');
  assert.equal(localStorage.getItem('token'), 'synthetic-A');
  assert.equal(document.querySelector('[data-protected]'), null);
  await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Выйти').click());
  assert.equal(localStorage.getItem('token'), null);
  assert.ok(document.querySelector('[data-login]'));
});

for (const [label, status, code] of [['network', null, 'ERR_NETWORK'], ['timeout', null, 'ECONNABORTED'], ['500', 500], ['502', 502], ['503', 503]]) {
  test(`verified session survives a background ${label}`, async t => {
    const h = await mount(t); await h.ok(); await h.focus(); await h.fail(status, undefined, code);
    assert.equal(localStorage.getItem('token'), 'synthetic-A');
    assert.equal(h.auth.user.id, 'verified');
    assert.ok(document.querySelector('[data-protected]'));
  });
}

test('profile 403 blocks protected content but retains the session for recovery', async t => {
  const h = await mount(t); await h.ok(); await h.focus(); await h.fail(403, 'Clinic access denied');
  assert.equal(localStorage.getItem('token'), 'synthetic-A');
  assert.equal(document.querySelector('[data-protected]'), null);
  assert.match(document.body.textContent, /подтвердить доступ/);
});

for (const [name, client] of [['default Axios', authHttp], ['apiClient', apiClient]]) {
  test(`${name}: current 401 logs out; 403 and 502 do not`, async t => {
    const h = await mount(t); await h.ok();
    for (const status of [403, 502]) {
      const { request, promise } = await h.api(client);
      await act(async () => request.fail(status)); await promise;
      assert.equal(h.auth.user.id, 'verified');
      assert.equal(localStorage.getItem('token'), 'synthetic-A');
    }
    const { request, promise } = await h.api(client);
    await act(async () => request.fail(401)); await promise;
    assert.equal(localStorage.getItem('token'), null);
    assert.equal(h.auth.user, null);
    assert.ok(document.querySelector('[data-login]'));
  });

  test(`${name}: Password expired opens the existing password form without protected content`, async t => {
    const h = await mount(t); await h.ok();
    const { request, promise } = await h.api(client);
    await act(async () => request.fail(401, 'Password expired')); await promise;
    assert.equal(localStorage.getItem('token'), 'synthetic-A');
    assert.ok(document.querySelector('[role="dialog"]'));
    assert.ok(document.querySelector('#currentPassword'));
    assert.equal(document.querySelector('[data-protected]'), null);
  });
}

test('cold-start expired password renders a real form and re-verifies after synthetic change', async t => {
  const h = await mount(t); await h.fail(401, 'Password expired');
  for (const [id, value] of [['currentPassword', 'synthetic-old'], ['newPassword', 'synthetic-new'], ['confirmPassword', 'synthetic-new']]) {
    await act(async () => {
      const input = document.getElementById(id);
      Object.getOwnPropertyDescriptor(h.dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new h.dom.window.Event('input', { bubbles: true }));
    });
  }
  await act(async () => document.querySelector('form').dispatchEvent(new h.dom.window.Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(h.fetches.length, 1);
  assert.equal(h.fetches[0].options.method, 'POST');
  assert.equal(document.querySelector('[data-protected]'), null);
  await h.ok();
  assert.ok(document.querySelector('[data-protected]'));
  assert.equal(document.querySelector('[role="dialog"]'), null);
});

for (const outcome of ['401', 'success', 'same-token-401']) {
  test(`old request ${outcome} cannot replace or clear a newer login`, async t => {
    const h = await mount(t); await h.ok(); await h.focus(); const old = h.next();
    let login;
    await act(async () => { login = h.auth.login('synthetic', 'synthetic'); });
    await h.ok({ access_token: outcome === 'same-token-401' ? 'synthetic-A' : 'synthetic-B', user: user('new') });
    await login;
    await h.ok(user('new'));
    await act(async () => outcome === 'success' ? old.ok(user('old')) : old.fail(401));
    assert.equal(localStorage.getItem('token'), outcome === 'same-token-401' ? 'synthetic-A' : 'synthetic-B');
    assert.equal(h.auth.user.id, 'new');
    assert.equal(document.querySelector('[data-protected]').textContent, 'new');
  });
}

test('cross-tab logout removes local state and ignores a pending profile success', async t => {
  const h = await mount(t); await h.ok(); await h.focus(); const old = h.next();
  await h.storage(null);
  assert.equal(h.auth.user, null); assert.equal(h.auth.token, null);
  assert.ok(document.querySelector('[data-login]'));
  await act(async () => old.ok(user('old')));
  assert.equal(h.auth.user, null);
});

test('cross-tab login is verified before showing data; old responses are ignored', async t => {
  const h = await mount(t); await h.ok(); await h.focus(); const old = h.next();
  await h.storage('synthetic-B');
  assert.equal(document.querySelector('[data-protected]'), null);
  await h.ok(user('other-tab'));
  await act(async () => old.fail(401));
  assert.equal(h.auth.user.id, 'other-tab');
  assert.equal(localStorage.getItem('token'), 'synthetic-B');
});

test('old apiClient 401 cannot log out a session adopted from another tab', async t => {
  const h = await mount(t); await h.ok(); const { request, promise } = await h.api(apiClient);
  await h.storage('synthetic-B'); await h.ok(user('other-tab'));
  await act(async () => request.fail(401)); await promise;
  assert.equal(localStorage.getItem('token'), 'synthetic-B');
  assert.equal(h.auth.user.id, 'other-tab');
});

test('delayed storage notification for the current token does not reset a verified session', async t => {
  const h = await mount(t); await h.ok(); await h.storage('synthetic-A');
  assert.equal(h.auth.user.id, 'verified');
  assert.equal(h.auth.loading, false);
  assert.equal(h.pending.length, 0);
});

test('password-expired transition ignores older successful profile replies', async t => {
  const h = await mount(t); await h.ok(); await h.focus(); const old = h.next();
  const { request, promise } = await h.api(apiClient);
  await act(async () => request.fail(401, 'Password expired')); await promise;
  await act(async () => old.ok(user()));
  assert.ok(document.querySelector('[role="dialog"]'));
  assert.equal(document.querySelector('[data-protected]'), null);
});

test('successful password change ignores a pending earlier password-expired reply', async t => {
  const h = await mount(t); await h.ok();
  const { request: old, promise } = await h.api(apiClient);
  await act(async () => { h.auth.handlePasswordChanged(); });
  await h.ok(user());
  await act(async () => old.fail(401, 'Password expired')); await promise;
  assert.equal(h.auth.showPasswordExpiredModal, false);
  assert.ok(document.querySelector('[data-protected]'));
});

test('focus and online checks share the in-flight profile request', async t => {
  const h = await mount(t);
  await h.focus(); await h.focus();
  await act(async () => window.dispatchEvent(new h.dom.window.Event('online')));
  assert.equal(h.calls.length, 1);
  await h.ok();
  assert.equal(h.auth.user.id, 'verified');
});

test('incorrect login does not invalidate an existing session', async t => {
  const h = await mount(t); await h.ok(); let login;
  await act(async () => { login = h.auth.login('synthetic', 'synthetic'); });
  await h.fail(401, 'Incorrect email or password');
  assert.equal((await login).success, false);
  assert.equal(h.auth.user.id, 'verified');
  assert.equal(localStorage.getItem('token'), 'synthetic-A');
});

test('unrelated service 401 carries no cabinet token and does not log out', async t => {
  const h = await mount(t); await h.ok(); let promise;
  await act(async () => { promise = authHttp.get('https://outside.invalid/api/data').catch(() => {}); });
  const request = h.next();
  assert.equal(request.config.headers.get('Authorization'), undefined);
  await act(async () => request.fail(401)); await promise;
  assert.equal(h.auth.user.id, 'verified');
});
