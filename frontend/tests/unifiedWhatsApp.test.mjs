import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { fixture, harnessBundle, allPermissions } from './fixtures/unifiedWhatsAppFixture.mjs';
import { normalizeWhatsAppPhone } from '../src/utils/openWhatsAppChat.js';

const boot = new JSDOM('<html><body></body></html>');
globalThis.window = boot.window; globalThis.document = boot.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window; delete globalThis.document; boot.window.close();
const compiled = await harnessBundle();
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
const Harness = loaded.exports.default;

async function mount(t, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://127.0.0.1:4179' });
  const f = fixture(options), saved = new Map();
  const nativeTimeout = globalThis.setTimeout;
  const timers = new Set();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true, widgetFixture: f, fetch: f.fetch,
    setTimeout: (...args) => { const timer = nativeTimeout(...args); timers.add(timer); return timer; } })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(Harness)));
  t.after(async () => { await act(async () => root.unmount()); for (const timer of timers) clearTimeout(timer); dom.window.close();
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const button = text => [...document.querySelectorAll('button')].find(b => (b.textContent.trim() === text || b.getAttribute('aria-label') === text));
  const click = async target => { const node = typeof target === 'string' ? button(target) : target; assert.ok(node); assert.equal(node.disabled, false);
    await act(async () => { node.focus(); node.click(); }); return node; };
  const fill = async (node, value) => { await act(async () => {
    const proto = node.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value);
    node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }); };
  return { f, dom, root, click, fill, button, widget: () => document.querySelector('.curai-whatsapp'),
    compose: () => document.querySelector('.curai-chat-compose textarea') };
}

test('normalizes international identities and rejects ambiguous local/invalid routing targets', () => {
  for (const [raw, expected] of [['77011234567', '+77011234567'], ['+7 (701) 123-45-67', '+77011234567'],
    ['442071234567', '+442071234567'], ['+8613812345678', '+8613812345678'], ['+82101234567', '+82101234567']]) {
    assert.equal(normalizeWhatsAppPhone(raw), expected);
  }
  for (const raw of ['', '123', '87011234567', '7011234567', '+99999999999', 'number 77011234567']) assert.equal(normalizeWhatsAppPhone(raw), null);
});

test('actual CRM card opens only the new widget on its normalized contact, without writes', async t => {
  const ui = await mount(t, { showCrm: true });
  await ui.click(document.querySelector('[data-lead-id="synthetic-lead"] [title="Открыть WhatsApp"]'));
  assert.ok(ui.widget());
  assert.equal(document.querySelectorAll('.curai-whatsapp-history').length, 0);
  assert.equal(document.querySelector('.curai-chat-phone').textContent, '+442071234567');
  assert.ok(document.querySelector('.curai-chat-person').textContent.includes('Synthetic Lead'));
  assert.ok(ui.f.requests.some(r => r.path.includes('/history/+442071234567')));
  assert.ok(ui.f.requests.every(r => r.method === 'GET'));
});

test('patient phone button preserves dirty form and focus through close/Escape; floating button uses same widget', async t => {
  const ui = await mount(t);
  await ui.click('Open patient');
  const patientDialog = document.querySelector('.curai-dialog');
  const notes = patientDialog.querySelector('textarea');
  await ui.fill(notes, 'Unsaved synthetic note');
  const opener = await ui.click(patientDialog.querySelector('[title="Открыть WhatsApp"]'));
  assert.equal(document.querySelector('.curai-chat-phone').textContent, '+77011234567');
  assert.equal(patientDialog.isConnected, true);
  assert.equal(ui.f.form.notes, 'Unsaved synthetic note');
  await act(async () => document.dispatchEvent(new ui.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(ui.widget(), null);
  assert.equal(patientDialog.isConnected, true);
  assert.equal(document.activeElement, opener);
  assert.equal(notes.value, 'Unsaved synthetic note');
  await ui.click('Открыть WhatsApp чаты');
  assert.equal(document.querySelectorAll('.curai-whatsapp').length, 1);
  await ui.click('Закрыть WhatsApp');
  assert.equal(notes.value, 'Unsaved synthetic note');
  assert.ok(ui.f.requests.every(r => r.method === 'GET'));
});

test('empty/existing chats, repeated open and contact switch keep separate drafts and ignore stale history', async t => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let waitOld = true;
  const ui = await mount(t, { api: async (method, path) => {
    if (path === '/wazzup/messages/history/+77011234567' && waitOld) { waitOld = false; return pending; }
  } });
  await ui.click('Open target');
  await ui.fill(ui.compose(), 'Draft A');
  await ui.click('Open other');
  assert.equal(ui.compose().value, '');
  await ui.fill(ui.compose(), 'Draft B');
  await act(async () => release({ messages: [{ text: 'STALE private history', sent_at: '2026-10-22T01:00:00Z' }] }));
  assert.ok(!ui.widget().textContent.includes('STALE private history'));
  await ui.click('Open target');
  assert.equal(ui.compose().value, 'Draft A');
  await ui.click('Open target');
  assert.equal(ui.compose().value, 'Draft A');
  await ui.click('Закрыть WhatsApp');
  await ui.click('Open other');
  assert.equal(ui.compose().value, 'Draft B');
  assert.ok(ui.f.requests.every(r => r.method === 'GET'));
});

test('read permissions gate the host; read-only users cannot send or upload', async t => {
  await t.test('no CRM read access', async child => {
    const ui = await mount(child, { user: { permissions: ['patients_view', 'patients_edit'] } });
    await ui.click('Open target');
    assert.equal(ui.widget(), null);
    assert.equal(ui.button('Открыть WhatsApp чаты'), undefined);
    assert.equal(ui.f.requests.some(r => r.path.includes('/wazzup/')), false);
  });
  await t.test('CRM read only', async child => {
    const ui = await mount(child, { user: { permissions: ['crm_view'] } });
    await ui.click('Open target');
    await ui.fill(ui.compose(), 'Synthetic unsent text');
    assert.equal(ui.button('Отправить').disabled, true);
    assert.equal(document.querySelector('.curai-chat-compose .relative > button').disabled, true);
    assert.ok(ui.f.requests.every(r => r.method === 'GET'));
  });
});

test('opening a patient link never replaces an existing dirty patient form; booking suspends and restores widget', async t => {
  const ui = await mount(t);
  await ui.click('Open patient');
  await ui.fill(document.querySelector('.curai-dialog textarea'), 'Keep this form');
  await ui.click('Open target');
  await ui.click(document.querySelector('.curai-patient-link'));
  assert.equal(ui.f.form.notes, 'Keep this form');
  assert.ok(ui.widget().textContent.includes('Сначала завершите открытую карточку пациента'));
  await ui.click('Записать');
  assert.equal(ui.widget().style.display, 'none');
  assert.ok(document.querySelector('[aria-label="Synthetic appointment"]'));
  await ui.click('Cancel appointment');
  assert.equal(ui.widget().style.display, '');
  assert.equal(ui.f.form.notes, 'Keep this form');
  assert.ok(ui.f.requests.every(r => r.method === 'GET'));
  assert.ok(allPermissions.includes('patients_export'));
});

test('document export, patient attachment saving and booking retain their own permissions', async t => {
  const ui = await mount(t, { user: { permissions: ['crm_view', 'crm_edit', 'patients_view'] },
    api: async (_method, path) => {
      if (path.startsWith('/wazzup/messages/history/')) return { messages: [{ id: 'synthetic-media',
        media_url: '/uploads/synthetic.pdf', message_type: 'document', sent_at: '2026-10-22T01:00:00Z' }] };
      if (path.endsWith('/documents')) return [{ id: 'synthetic-document', filename: 'synthetic.pdf' }];
    }
  });
  await ui.click('Open target');
  assert.equal(document.querySelector('.curai-chat-messages button[data-permissions]').disabled, true);
  assert.equal(document.querySelector('.curai-chat-header-actions .curai-button-primary').disabled, true);
  await ui.click(document.querySelector('.curai-chat-compose .relative > button'));
  const documentButton = document.querySelector('[data-permissions="crm_view crm_edit patients_view patients_export"]');
  assert.ok(documentButton);
  assert.equal(documentButton.disabled, true);
  assert.ok(ui.f.requests.every(r => r.method === 'GET'));
});
