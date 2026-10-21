import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { matchesSource, sourceLabel } from '../src/utils/crmSources.js';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
bootstrap.window.close();
const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/crm/contacts/SourceEditor.jsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'],
  define: { 'import.meta.env': '{"VITE_BACKEND_URL":"http://localhost:4318"}' }
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const SourceEditor = module.exports.default;
const did = '+77011234567';
const button = (f, text) => [...f.container.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const inputFor = (f, text) => [...f.container.querySelectorAll('label')].find(node => node.textContent.startsWith(text))?.querySelector('input,select,textarea');

async function mount(context, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:4318' });
  const state = { mappings: [], sources: [], failInsertOnce: false, ...options };
  const requests = [], saved = [];
  const descriptors = new Map();
  const install = (key, value) => {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };
  install('window', dom.window); install('document', dom.window.document);
  install('localStorage', dom.window.localStorage); install('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.setItem('token', 'synthetic');
  install('fetch', async (url, options) => {
    const path = new URL(url).pathname.replace('/api/crm', '');
    const method = options.method;
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ path, method, body, headers: options.headers });
    let data, status = 200;
    if (path === '/inbound-source-mappings' && method === 'GET') data = state.mappings;
    else if (path === '/inbound-source-mappings/validate') {
      const normalized = body.phone_number.replace(/[ ().-]/g, '');
      if (!/^\+[1-9][0-9]{9,14}$/.test(normalized)) { status = 422; data = { detail: 'Некорректный международный номер' }; }
      else if (state.mappings.some(row => row.phone_number === normalized)) { status = 409; data = { detail: 'Этот номер уже привязан к источнику' }; }
      else data = { phone_number: normalized };
    } else if (path === '/inbound-source-mappings' && method === 'POST') {
      if (state.failInsertOnce) { state.failInsertOnce = false; status = 409; data = { detail: 'Номер заняли параллельно' }; }
      else { state.mappings.push(body); data = body; }
    } else if (path.startsWith('/inbound-source-mappings/') && method === 'DELETE') {
      const phone = decodeURIComponent(path.split('/').at(-1));
      state.mappings = state.mappings.filter(row => row.phone_number !== phone); status = 204;
    } else if (path === '/sources/' && method === 'POST') {
      data = { id: 'created-source', ...body }; state.sources.push(data);
    } else if (path.startsWith('/sources/') && method === 'PUT') data = { id: path.split('/').at(-1), ...body };
    else throw new Error(`Unexpected mock request ${method} ${path}`);
    return { ok: status < 400, status, json: async () => structuredClone(data) };
  });
  const container = document.getElementById('root');
  const root = createRoot(container);
  context.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  await act(async () => root.render(React.createElement(SourceEditor, {
    source: state.source, canEdit: options.canEdit ?? true, canDeleteNumbers: options.canDeleteNumbers ?? true, canManageNumbers: options.canManageNumbers ?? true,
    onClose() {}, onSaved: source => saved.push(source)
  })));
  const change = async (node, value) => {
    assert.ok(node, 'form field exists');
    await act(async () => {
      const prototype = node.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
      node.dispatchEvent(new window.Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
  };
  const submit = () => act(async () => container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  return { container, state, requests, saved, change, submit };
}

test('phone type reveals a clinic number on the same source form, with no extra source selector', async context => {
  const f = await mount(context);
  assert.equal(inputFor(f, 'Входящий номер клиники'), undefined);
  await f.change(inputFor(f, 'Тип'), 'phone');
  assert.ok(inputFor(f, 'Входящий номер клиники'));
  assert.equal(f.container.querySelectorAll('select').length, 1);
  await f.change(inputFor(f, 'Название'), '2GIS');
  await f.change(inputFor(f, 'Входящий номер клиники'), '+7 (701) 123-45-67');
  await f.submit();
  assert.equal(f.saved.length, 1);
  assert.deepEqual(f.state.mappings, [{ phone_number: did, source_id: 'created-source' }]);
  assert.deepEqual(f.requests.filter(request => request.method !== 'GET').map(request => request.path),
    ['/inbound-source-mappings/validate', '/sources/', '/inbound-source-mappings']);
  assert.equal(f.state.sources[0].type, 'phone');
  assert.ok(f.requests.every(request => request.headers.Authorization === 'Bearer synthetic'));
});

for (const [name, number, mappings] of [['invalid', '87011234567', []], ['duplicate', did, [{ phone_number: did, source_id: 'other' }]]]) {
  test(`${name} number fails before a source is created`, async context => {
    const f = await mount(context, { mappings });
    await f.change(inputFor(f, 'Тип'), 'phone');
    await f.change(inputFor(f, 'Название'), '2GIS');
    await f.change(inputFor(f, 'Входящий номер клиники'), number);
    await f.submit();
    assert.equal(f.saved.length, 0);
    assert.equal(f.state.sources.length, 0);
    assert.ok(f.container.querySelector('[role="alert"]'));
  });
}

test('legacy phone source without a number remains editable and needs no mapping', async context => {
  const f = await mount(context, { source: { id: 'legacy', name: 'Старый телефон', type: 'phone' } });
  assert.equal(inputFor(f, 'Входящий номер клиники').value, '');
  await f.submit();
  assert.equal(f.saved[0].id, 'legacy');
  assert.deepEqual(f.requests.filter(request => request.method !== 'GET').map(request => request.path), ['/sources/legacy']);
});

test('renaming or changing source type preserves existing mappings and attribution history', async context => {
  const f = await mount(context, { source: { id: 'legacy', name: '2GIS', type: 'phone' }, mappings: [{ phone_number: did, source_id: 'legacy' }] });
  assert.equal(inputFor(f, 'Входящий номер клиники').readOnly, true);
  await f.change(inputFor(f, 'Название'), 'Новое имя');
  await f.change(inputFor(f, 'Тип'), 'website');
  await f.submit();
  assert.deepEqual(f.state.mappings, [{ phone_number: did, source_id: 'legacy' }]);
  assert.ok(!f.requests.some(request => request.method === 'DELETE'));
  assert.equal(f.saved[0].name, 'Новое имя');
});

test('explicit unbinding allows a replacement on the same source ID', async context => {
  const f = await mount(context, { source: { id: 'legacy', name: '2GIS', type: 'phone' }, mappings: [{ phone_number: did, source_id: 'legacy' }] });
  await act(async () => button(f, 'Снять привязку').click());
  await f.change(inputFor(f, 'Входящий номер клиники'), '+442079460123');
  await f.submit();
  assert.deepEqual(f.state.mappings, [{ phone_number: '+442079460123', source_id: 'legacy' }]);
});

test('non-admin editor cannot change number bindings', async context => {
  const f = await mount(context, { canManageNumbers: false, source: { id: 'legacy', name: '2GIS', type: 'phone' }, mappings: [{ phone_number: did, source_id: 'legacy' }] });
  assert.equal(inputFor(f, 'Входящий номер клиники').readOnly, true);
  assert.equal(button(f, 'Снять привязку'), undefined);
  await f.submit();
  assert.ok(!f.requests.some(request => request.path.startsWith('/inbound-source-mappings') && request.method !== 'GET'));
});

test('read-only source editor rejects form submission and cannot unbind a number', async context => {
  const f = await mount(context, {canEdit: false, canDeleteNumbers: false,
    source: {id: 'legacy', name: 'Synthetic', type: 'phone'}, mappings: [{phone_number: did, source_id: 'legacy'}]});
  assert.equal(f.container.querySelector('button[type="submit"]').disabled, true);
  await f.submit();
  assert.equal(f.requests.some(request => request.method !== 'GET'), false);
  assert.equal(f.container.querySelectorAll('.text-curai-negative.underline').length, 0);
});

test('racing mapping failure retains a created source ID and retry never duplicates the catalog', async context => {
  const f = await mount(context, { failInsertOnce: true });
  await f.change(inputFor(f, 'Тип'), 'phone');
  await f.change(inputFor(f, 'Название'), '2GIS');
  await f.change(inputFor(f, 'Входящий номер клиники'), did);
  await f.submit();
  assert.match(f.container.querySelector('[role="alert"]').textContent, /Источник уже сохранён/);
  await f.change(inputFor(f, 'Входящий номер клиники'), '+442079460123');
  await f.submit();
  assert.equal(f.state.sources.length, 1);
  assert.equal(f.saved[0].id, 'created-source');
  assert.ok(f.requests.some(request => request.path === '/sources/created-source' && request.method === 'PUT'));
});

test('source identity matching and labels do not confuse same-type sources or assign unknown IDs', () => {
  const sources = [{ id: 'a', name: '2GIS', type: 'phone' }, { id: 'b', name: 'Сайт', type: 'phone' }];
  assert.equal(matchesSource({ source_id: 'a', source: 'phone' }, 'b'), false);
  assert.equal(matchesSource({ source: 'phone' }, 'a'), false);
  assert.equal(matchesSource({ source_id: 'a' }, 'a'), true);
  assert.equal(sourceLabel({ source_id: 'a', source: 'phone' }, sources), '2GIS');
  assert.equal(sourceLabel({ source_id: 'gone', source: 'phone' }, sources), 'Телефон');
  assert.equal(sourceLabel({ source: 'phone' }, sources), 'Телефон');
});
