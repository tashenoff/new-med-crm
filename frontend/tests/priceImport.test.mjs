import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { canImportPreview, importErrorText, previewErrors, formatImportTime } from '../src/components/directory/priceImport.js';

const boot = new JSDOM('<body/>');
globalThis.window = boot.window;
globalThis.document = boot.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
boot.window.close();
const compiled = await build({
  stdin: { contents: "export {default} from './src/components/directory/ServicePrices.js';", resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'],
  loader: { '.js': 'jsx', '.css': 'empty' }, define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://fixture.invalid"}' },
  plugins: [{ name: 'isolate-materials', setup(builder) {
    builder.onResolve({ filter: /\/api\/materials$/ }, () => ({ path: 'materials', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const materialsApi={list:async()=>({success:true,data:[]})};', loader: 'js' }));
  } }],
});
const mod = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
const ServicePrices = mod.exports.default;
const user = { role: 'admin', permissions: ['directory_view', 'directory_edit', 'directory_delete'] };
const successful = { status: 'success', finished_at: '2026-10-28T12:00:00Z' };
const validPreview = { success: true, can_import: true, total_services: 2, categories: { total: 2, new: [] }, services_preview: { new_count: 2, duplicate_count: 0 }, parse_errors: [] };

async function mount(t, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid' });
  const requests = [];
  const history = options.history || { last_import: null, last_successful_import: null };
  const globals = {
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (input, config = {}) => {
      const path = new URL(String(input)).pathname;
      requests.push(path);
      let data = [];
      let status = 200;
      if (path.endsWith('/history')) data = structuredClone(history);
      if (path.endsWith('/preview')) data = options.preview || validPreview;
      if (path.endsWith('/upload')) {
        data = options.upload || { success: true, status: 'success', services: { created: 2, updated: 0, skipped: 0 }, categories: { created: 2 }, errors: { parse: [], import: [] } };
        status = options.uploadStatus || 200;
        if (status === 200) {
          history.last_import = { status: data.status, finished_at: '2026-10-28T13:00:00Z' };
          if (data.status === 'success') history.last_successful_import = history.last_import;
        }
      }
      return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    },
  };
  const saved = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  const root = createRoot(document.getElementById('root'));
  const run = async callback => { await act(async () => { await callback(); await new Promise(resolve => setTimeout(resolve, 0)); }); };
  await run(() => root.render(React.createElement(ServicePrices, { user })));
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  };
  t.after(close);
  const button = label => [...document.querySelectorAll('button')].find(item => item.textContent.includes(label));
  const selectFile = async name => {
    await run(() => button('Импорт Excel').click());
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { configurable: true, value: [new window.File(['fixture'], name || 'prices.xlsx')] });
    await run(() => input.dispatchEvent(new window.Event('change', { bubbles: true })));
  };
  return { run, button, selectFile, close, requests, history };
}

test('preview validation and API errors keep real diagnostics', () => {
  assert.equal(canImportPreview({ total_services: 0, can_import: false }), false);
  assert.equal(canImportPreview({ total_services: 1, can_import: true, parse_errors: ['row 3'] }), true);
  assert.equal(canImportPreview({ total_services: 1, services_preview: { match_errors: ['ambiguous'] } }), false);
  assert.deepEqual(previewErrors({ parse_errors: ['row 3'], services_preview: { match_errors: ['ambiguous'] } }), ['row 3', 'ambiguous']);
  assert.equal(importErrorText({ message: 'Ошибка парсинга', errors: ['Не найден столбец с ценой'] }), 'Ошибка парсинга\nНе найден столбец с ценой');
});

test('UTC timestamps display the browser local time and explicit timezone', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Asia/Tokyo';
  try {
    assert.match(formatImportTime('2026-10-28T12:00:00Z'), /21:00:00/);
    assert.match(formatImportTime('2026-10-28T12:00:00Z'), /Asia\/Tokyo/);
    assert.equal(formatImportTime('2026-10-28T12:00:00'), 'Дата недоступна');
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('zero valid rows show parse errors and cannot be uploaded', async t => {
  const h = await mount(t, { preview: { ...validPreview, success: false, can_import: false, total_services: 0, parse_errors: ['Не найден столбец с ценой'], services_preview: { new_count: 0, duplicate_count: 0 } } });
  await h.selectFile();
  assert.match(document.querySelector('[role="alert"]').textContent, /Не найден столбец с ценой/);
  assert.equal(h.button('Импортировать').disabled, true);
  await h.run(() => h.button('Импортировать').click());
  assert.equal(h.requests.filter(path => path.endsWith('/upload')).length, 0);
});

test('a partial result is explicit and preserves the last successful date', async t => {
  const h = await mount(t, { history: { last_import: successful, last_successful_import: successful }, preview: { ...validPreview, parse_errors: ['Строка 4: некорректная цена'] }, upload: { success: false, status: 'partial', services: { created: 1 }, categories: {}, errors: { parse: ['Строка 4: некорректная цена'], import: [] } } });
  await h.selectFile();
  assert.match(document.querySelector('[role="alert"]').textContent, /Импортируются только корректные строки/);
  assert.equal(h.button('Импортировать').disabled, false);
  await h.run(() => h.button('Импортировать').click());
  assert.match(document.body.textContent, /Импорт выполнен частично/);
  assert.match(document.body.textContent, /Последняя попытка: выполнена частично/);
  assert.equal(document.querySelector('time').dateTime, successful.finished_at);
  assert.ok(h.requests.filter(path => path.endsWith('/history')).length >= 2);
});

test('failed uploads show detailed errors', async t => {
  const h = await mount(t, { uploadStatus: 400, upload: { detail: { message: 'Ошибка парсинга', errors: ['Не найден столбец с ценой'] } } });
  await h.selectFile();
  await h.run(() => h.button('Импортировать').click());
  assert.match(document.querySelector('[role="alert"]').textContent, /Не найден столбец с ценой/);
});

test('success history comes from the backend again after remount, without stored UI dates', async t => {
  const h = await mount(t);
  assert.match(document.body.textContent, /Последний успешный импорт: данных пока нет/);
  await h.selectFile();
  await h.run(() => h.button('Импортировать').click());
  assert.equal(document.querySelector('time').dateTime, '2026-10-28T13:00:00Z');
  const serverHistory = structuredClone(h.history);
  await h.close();
  const reopened = await mount(t, { history: serverHistory });
  assert.equal(localStorage.length, 0);
  assert.equal(document.querySelector('time').dateTime, '2026-10-28T13:00:00Z');
  assert.equal(reopened.requests.filter(path => path.endsWith('/history')).length, 1);
});
