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
  entryPoints: [fileURLToPath(new URL('../src/components/layout/NavigationSearch.jsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom', 'react-router-dom'], loader: { '.js': 'jsx' }
});
const module = { exports: {} };
const require = createRequire(import.meta.url);
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports);
const NavigationSearch = module.exports.default;
const { MemoryRouter } = require('react-router-dom');

async function mount(context) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
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
  await act(async () => root.render(React.createElement(MemoryRouter, null,
    React.createElement(NavigationSearch, { user: { role: 'admin' }, onNavigate: () => {} }))));
  return document.querySelector('button[aria-haspopup="dialog"]');
}

async function key(target, options) {
  const event = new window.KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true, ...options });
  await act(async () => target.dispatchEvent(event));
  return event;
}

async function enterQuery(input, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.equal(input.value, value);
}

for (const modifier of ['ctrlKey', 'metaKey']) {
  test(`${modifier} opens and focuses search, preserves an open query and clears it on reopening`, async context => {
    const trigger = await mount(context);
    assert.equal(trigger.getAttribute('aria-keyshortcuts'), 'Control+k Meta+k');
    assert.match(trigger.title, /Ctrl\+K.*⌘K/);
    assert.equal((await key(document.body, { [modifier]: true })).defaultPrevented, true);
    let input = document.querySelector('[role="combobox"]');
    assert.equal(document.activeElement, input);
    await enterQuery(input, 'calendar');
    assert.equal((await key(input, { [modifier]: true })).defaultPrevented, true);
    assert.equal(input.value, 'calendar');
    await key(input, { key: 'Escape' });
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, trigger);
    await key(trigger, { [modifier]: true });
    input = document.querySelector('[role="combobox"]');
    assert.equal(input.value, '');
    assert.equal(document.activeElement, input);
    await enterQuery(input, 'patients');
    await key(input, { key: 'Escape' });
    await act(async () => trigger.click());
    assert.equal(document.querySelector('[role="combobox"]').value, '');
  });
}

test('shortcut ignores unrelated editable fields without preventing default, even while search is open', async context => {
  const trigger = await mount(context);
  for (const open of [false, true]) {
    if (open) await act(async () => trigger.click());
    for (const tag of ['input', 'textarea', 'select', 'contenteditable']) {
      const field = document.createElement(tag === 'contenteditable' ? 'div' : tag);
      if (tag === 'contenteditable') {
        field.setAttribute('contenteditable', 'true');
        field.innerHTML = '<span tabindex="0">Editable child</span>';
      }
      document.body.append(field);
      const focused = tag === 'contenteditable' ? field.firstChild : field;
      focused.focus();
      for (const modifier of ['ctrlKey', 'metaKey']) {
        assert.equal((await key(focused, { [modifier]: true })).defaultPrevented, false);
        assert.equal(!!document.querySelector('[role="dialog"]'), open);
        assert.equal(document.activeElement, focused);
      }
      field.remove();
    }
  }
});

test('unmodified and other modified keys leave browser defaults alone', async context => {
  await mount(context);
  for (const options of [{}, { ctrlKey: true, key: 'j' }, { ctrlKey: true, altKey: true }, { metaKey: true, shiftKey: true }]) {
    assert.equal((await key(document.body, options)).defaultPrevented, false);
    assert.equal(document.querySelector('[role="dialog"]'), null);
  }
});
