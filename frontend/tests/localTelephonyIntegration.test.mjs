import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act, useState } from 'react';
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
  stdin: {
    contents: `export { default as Dialer } from './src/components/crm/telephony/DialerWidget.jsx';
      export { default as Phone } from './src/components/layout/PhoneFloatingButton.js';`,
    resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'jsx',
  },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom'], loader: { '.js': 'jsx' },
  plugins: [{ name: 'local-telephony-fixtures', setup(builder) {
    builder.onResolve({ filter: /\/api\/telephony$|\/context\/AuthContext$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents:
      args.path.endsWith('AuthContext') ? 'export const useAuth = () => ({ user: { id: "local-user" } });'
        : 'export const telephonyApi = globalThis.localTelephony.api; export const handleApiError = e => e.message;'
    }));
  } }],
});

test('phone opens the integrated dialer, history reuses a number and calling loads no vendor widget', async context => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const calls = [];
  globalThis.localTelephony = { api: { getCalls: async query => {
    calls.push(query);
    return [{ id: 'call', phone_number: '+77012345678', direction: 'inbound', status: 'answered' }];
  } } };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const { Dialer, Phone } = module.exports;
  function Shell() {
    const [open, setOpen] = useState(false);
    return React.createElement(React.Fragment, null,
      React.createElement(Phone, { isOpen: open, onToggle: () => setOpen(value => !value) }),
      React.createElement(Dialer, { isOpen: open, onClose: () => setOpen(false) }));
  }
  const root = createRoot(document.getElementById('root'));
  context.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT', 'localTelephony']) delete globalThis[key];
  });
  await act(async () => root.render(React.createElement(Shell)));
  assert.equal(document.querySelector('input[type="tel"]'), null);
  await act(async () => document.querySelector('[title="Телефония"]').click());
  assert.ok(document.querySelector('input[type="tel"]'));
  assert.equal(document.querySelector('[title="Телефония"]'), null);
  await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'История звонков').click());
  assert.deepEqual(calls, [{ user_id: 'local-user', limit: 50 }]);
  await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent.includes('+77012345678')).click());
  const phone = document.querySelector('input[type="tel"]');
  assert.equal(phone.value, '+77012345678');
  await act(async () => phone.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  assert.match(document.body.textContent, /Браузерный звонок временно отключён/);
  assert.equal(document.querySelectorAll('script,iframe').length, 0);
  await act(async () => document.querySelector('[title="Закрыть"]').click());
  assert.equal(document.querySelector('input[type="tel"]'), null);
  assert.ok(document.querySelector('[title="Телефония"]'));
});
