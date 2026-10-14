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
  const event = new window.KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true, ...options });
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

test('F2 opens and focuses search, preserves an open query and clears it on reopening', async context => {
  const trigger = await mount(context);
  assert.equal(trigger.getAttribute('aria-keyshortcuts'), 'F2');
  assert.equal(trigger.title, 'F2');
  assert.equal((await key(document.body, {})).defaultPrevented, true);
  let input = document.querySelector('[role="combobox"]');
  assert.equal(document.activeElement, input);
  await enterQuery(input, 'calendar');
  assert.equal((await key(input, {})).defaultPrevented, true);
  assert.equal(input.value, 'calendar');
  const closeButton = document.querySelector('[role="dialog"] button');
  closeButton.focus();
  assert.equal((await key(closeButton, {})).defaultPrevented, true);
  assert.equal(document.activeElement, input);
  assert.equal(input.value, 'calendar');
  await key(input, { key: 'Escape' });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, trigger);
  await key(trigger, {});
  input = document.querySelector('[role="combobox"]');
  assert.equal(input.value, '');
  assert.equal(document.activeElement, input);
  await enterQuery(input, 'patients');
  await key(input, { key: 'Escape' });
  await act(async () => trigger.click());
  assert.equal(document.querySelector('[role="combobox"]').value, '');
});

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
      assert.equal((await key(focused, {})).defaultPrevented, false);
      assert.equal(!!document.querySelector('[role="dialog"]'), open);
      assert.equal(document.activeElement, focused);
      field.remove();
    }
  }
});

test('Ctrl+K, Meta+K, Ctrl+Shift+Space and Meta+Shift+Space are not intercepted', async context => {
  const trigger = await mount(context);
  for (const open of [false, true]) {
    if (open) await act(async () => trigger.click());
    const target = open ? document.querySelector('[role="combobox"]') : trigger;
    if (open) await enterQuery(target, 'calendar');
    for (const modifier of ['ctrlKey', 'metaKey']) {
      for (const options of [{ key: 'k', [modifier]: true }, { key: ' ', [modifier]: true, shiftKey: true }]) {
        assert.equal((await key(target, options)).defaultPrevented, false);
        assert.equal(!!document.querySelector('[role="dialog"]'), open);
        if (open) assert.equal(target.value, 'calendar');
      }
    }
  }
});

test('F2 with any modifier is ignored while closed and open', async context => {
  const trigger = await mount(context);
  for (const open of [false, true]) {
    if (open) await act(async () => trigger.click());
    const input = document.querySelector('[role="combobox"]');
    if (open) await enterQuery(input, 'calendar');
    trigger.focus();
    for (let mask = 1; mask < 16; mask++) {
      const options = Object.fromEntries(['ctrlKey', 'metaKey', 'altKey', 'shiftKey']
        .map((modifier, index) => [modifier, Boolean(mask & (1 << index))]));
      assert.equal((await key(trigger, options)).defaultPrevented, false);
      assert.equal(!!document.querySelector('[role="dialog"]'), open);
      assert.equal(document.activeElement, trigger);
      if (open) assert.equal(input.value, 'calendar');
    }
  }
});

test('other keys, composing events and already prevented F2 are ignored', async context => {
  await mount(context);
  for (const options of [{ key: ' ' }, { key: 'k' }, { key: 'j' }, { isComposing: true }]) {
    assert.equal((await key(document.body, options)).defaultPrevented, false);
    assert.equal(document.querySelector('[role="dialog"]'), null);
  }
  const event = new window.KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true });
  event.preventDefault();
  await act(async () => document.body.dispatchEvent(event));
  assert.equal(document.querySelector('[role="dialog"]'), null);
});
