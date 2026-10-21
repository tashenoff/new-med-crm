import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window; globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window; delete globalThis.document; bootstrap.window.close();
const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/index.jsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'],
  loader: { '.css': 'empty', '.js': 'jsx' }, define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://api.fixture.invalid"}' },
  plugins: [{ name: 'entry-boundaries', setup(builder) {
    builder.onResolve({ filter: /^react-dom\/client$/ }, () => ({ path: 'root', namespace: 'entry-fixture' }));
    builder.onResolve({ filter: /^\.\/App$/ }, () => ({ path: 'crm', namespace: 'entry-fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'entry-fixture' }, args => ({ contents: args.path === 'root'
      ? 'export default {createRoot:element=>globalThis.entryFixture.createRoot(element)};'
      : `import React from 'react';globalThis.entryFixture.crmLoaded=true;export default ()=>React.createElement('h1',null,'CRM fixture');` }));
  } }],
});

for (const path of ['/consent', '/consent/']) {
  test(`real entrypoint keeps ${path} outside CRM after host canonicalization`, async t => {
    const dom = new JSDOM('<div id="root"></div>', { url: `https://www.curai.asia${path}#${'a'.repeat(43)}`, pretendToBeVisual: true });
    let root;
    const requests = [];
    const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true,
      entryFixture: { crmLoaded: false, createRoot: element => { root = createRoot(element); return root; } },
      fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ state: 'pending', document: { version: 'demo-entry', text: 'Demo text', demonstration: true } }) }; } };
    const previous = new Map();
    for (const [key, value] of Object.entries(globals)) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
    t.after(async () => { await act(async () => root?.unmount()); dom.window.close(); for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; } });
    await act(async () => {
      const mod = { exports: {} };
      new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
    });
    assert.match(dom.window.document.body.textContent, /Условия для пациента/);
    assert.equal(globalThis.entryFixture.crmLoaded, false);
    assert.ok(requests.length > 0);
    assert.ok(requests.every(request => request.url.endsWith('/patient-terms/lookup') && request.options.credentials === 'omit'));
    assert.equal(dom.window.document.querySelector('input').checked, false);
  });
}
