import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const result = await build({ entryPoints: [fileURLToPath(new URL('../src/components/crm/tasks/TaskComposer.jsx', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'], plugins: [{ name: 'mock-api', setup(b) { b.onResolve({ filter: /api\/config$/ }, () => ({ path: 'api', namespace: 'mock' })); b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const apiClient = globalThis.taskApi; export const handleApiError = e => e.message;' })); } }] });
const calls = [];
globalThis.taskApi = { get: async path => ({ data: path.includes('assignees') ? { assignees: [{ id: 'manager', name: 'Менеджер' }] } : { titles: [{ id: 'title', name: 'Связаться', is_active: true }] } }), post: async (path, data) => { calls.push({ path, data }); return { data: { id: 'created' } }; }, put: async (path, data) => { calls.push({ path, data }); return { data: { id: 'edited' } }; } };
const module = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const Composer = module.exports.default;

async function mount(t, props) {
  calls.length = 0;
  const dom = new JSDOM('<div id="root"></div>');
  const keys = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'];
  const saved = keys.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById('root'));
  t.after(async () => { await act(async () => root.unmount()); dom.window.close(); for (const [k, d] of saved) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } });
  await act(async () => root.render(React.createElement(Composer, props)));
  return { dom, root, submit: () => act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))) };
}
test('shared composer saves internal task with manager and ISO deadline, never sends WhatsApp', async t => {
  let saved = 0;
  const h = await mount(t, { user: { permissions: ['crm_tasks_edit'] }, initialTask: { id: 't', title: 'Связаться', kind: 'task', assigned_to: 'manager', due_date: '2026-11-12T12:00:00Z' }, chat: { phone: '+77000000000' }, leadId: 'lead', onSaved: () => saved++ });
  await h.submit();
  assert.equal(saved, 1); assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/crm/tasks/t'); assert.equal(calls[0].data.chat_phone, '+77000000000'); assert.equal(calls[0].data.lead_id, 'lead'); assert.equal(calls[0].data.due_date, '2026-11-12T12:00:00.000Z');
});
test('note has no deadline and denied create cannot submit even by event', async t => {
  const h = await mount(t, { user: { permissions: ['crm_view'] }, initialKind: 'note' });
  assert.equal(document.querySelector('button[type=submit]').disabled, true);
  await h.submit(); assert.equal(calls.length, 0);
});
test('task validation keeps the form and displays missing responsible error', async t => {
  const h = await mount(t, { user: { permissions: ['crm_tasks_edit'] }, initialTask: { id: 't', title: 'Связаться', kind: 'task' } });
  await h.submit(); assert.equal(calls.length, 0); assert.match(document.querySelector('[role=alert]').textContent, /ответственного/);
});
test('clicking Today exposes editable date and time without submitting', async t => {
  const h = await mount(t, { user: { permissions: ['crm_tasks_create'] } });
  await act(async () => document.querySelector('button[aria-expanded]').click());
  assert.ok(document.querySelector('input[type=datetime-local]')); assert.equal(calls.length, 0);
});
test('note save clears deadline and never requires a manager', async t => {
  const h = await mount(t, { user: { permissions: ['crm_tasks_edit'] }, initialTask: { id: 'n', title: 'Заметка', kind: 'note', due_date: '2026-11-12T12:00:00Z' } });
  await h.submit(); assert.equal(calls.length, 1); assert.equal(calls[0].data.due_date, null); assert.equal(calls[0].data.assigned_to, null);
});
test('double submit is locked and unmounted chat does not receive save callback', async t => {
  const old = globalThis.taskApi.put; let resolve, saved = 0;
  globalThis.taskApi.put = (path, data) => { calls.push({ path, data }); return new Promise(r => { resolve = r; }); };
  t.after(() => { globalThis.taskApi.put = old; });
  const h = await mount(t, { user: { permissions: ['crm_tasks_edit'] }, initialTask: { id: 'n', title: 'Заметка', kind: 'note' }, onSaved: () => saved++ });
  await h.submit(); await h.submit(); assert.equal(calls.length, 1);
  await act(async () => h.root.render(null));
  await act(async () => resolve({ data: { id: 'n' } })); assert.equal(saved, 0);
});
