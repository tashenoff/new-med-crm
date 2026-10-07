import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { localDateKey } from '../src/utils/firstTouchDateFilter.js';

const bootstrapDom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = bootstrapDom.window;
globalThis.document = bootstrapDom.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
bootstrapDom.window.close();

const compiled = await build({
  stdin: {
    contents: `import React from 'react';
      import View from './src/components/crm/leads/EnhancedLeadsView.js';
      import { ThemeProvider } from './src/hooks/useTheme.js';
      export default () => <ThemeProvider><View user={{ id: 'manager' }} /></ThemeProvider>;`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    loader: 'jsx'
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['react', 'react-dom', 'react-dom/client'],
  loader: { '.js': 'jsx' },
  define: { 'import.meta.env': '{}' },
  plugins: [{
    name: 'test-contexts',
    setup(builder) {
      builder.onResolve({ filter: /\/useCrm$|\/ModalContext$|\/WhatsAppSidebar$/ }, args => ({
        path: args.path, namespace: 'test-contexts'
      }));
      builder.onLoad({ filter: /.*/, namespace: 'test-contexts' }, args => ({
        contents: args.path.endsWith('/useCrm')
          ? 'export const useCrm = () => globalThis.cardFixture.crm;'
          : args.path.endsWith('/ModalContext')
            ? 'export const useModal = () => globalThis.cardFixture.modals;'
            : `import React from 'react'; export default props => props.isOpen
                ? React.createElement('aside', { 'data-testid': 'whatsapp' }, props.phone) : null;`
      }));
    }
  }]
});
const componentModule = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  createRequire(import.meta.url), componentModule, componentModule.exports
);
const View = componentModule.exports.default;

const lead = {
  id: 'lead-first', patient_id: 'patient-canonical', full_name: 'First Click Patient',
  first_name: 'First', last_name: 'Patient', phone: '+77012345678',
  status: 'new', source: 'website', created_at: '2026-01-01T00:00:00Z'
};

async function mountView(context, leads = [lead]) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
  const saved = new Map();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
    cardFixture: undefined, fetch: undefined
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const requests = [];
  const pendingTasks = [];
  const scheduled = [];
  const noop = async () => {};
  globalThis.cardFixture = {
    crm: {
      leads, managers: [], sources: [], loading: false,
      fetchLeads: noop, fetchAvailableManagers: noop, fetchSources: noop,
      clearError: noop, updateLeadStatus: async (...args) => scheduled.push(args)
    },
    modals: { openModal: (...args) => scheduled.push(args), closeModal: noop }
  };
  globalThis.fetch = async url => {
    requests.push(String(url));
    if (String(url).endsWith(`/api/crm/leads/${lead.id}/tasks`)) {
      return new Promise(resolve => pendingTasks.push(resolve));
    }
    const data = String(url).endsWith('/task-statuses') ? { statuses: [] }
      : String(url).endsWith('/api/patients') ? [{ id: lead.patient_id, phone: lead.phone }] : [];
    return { ok: true, json: async () => data };
  };
  const container = dom.window.document.getElementById('root');
  const root = createRoot(container);
  context.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await act(async () => root.render(React.createElement(View)));
  const mouse = (element, type) => element.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true }));
  const settleTasks = async () => {
    await act(async () => {
      for (const resolve of pendingTasks.splice(0)) {
        resolve({ ok: true, json: async () => ({ tasks: [{ id: 'task-urgent', priority: 'high', status: 'new' }] }) });
      }
    });
  };
  return { container, dom, requests, pendingTasks, scheduled, mouse, settleTasks };
}

const dateAt = (offset, end = false) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0);
  return date.toISOString();
};

const dateFixture = () => [
  ['today-start', dateAt(0)], ['today-end', dateAt(0, true)],
  ['yesterday-start', dateAt(-1)], ['yesterday-end', dateAt(-1, true)],
  ['day6', dateAt(-6)], ['day7', dateAt(-7, true)],
  ['day29', dateAt(-29)], ['day30', dateAt(-30, true)],
  ['future', dateAt(1)], ['missing', undefined], ['invalid', 'invalid']
].map(([id, created_at]) => ({ ...lead, id, full_name: id, created_at }));

const visibleCards = container => [...container.querySelectorAll('[draggable="true"]')]
  .map(card => card.querySelector('h4').textContent.trim()).sort();

async function changeControl(view, label, value) {
  const control = view.container.querySelector(`[aria-label="${label}"]`);
  const prototype = control.tagName === 'SELECT' ? view.dom.window.HTMLSelectElement.prototype : view.dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, value);
    control.dispatchEvent(new view.dom.window.Event('input', { bubbles: true }));
    control.dispatchEvent(new view.dom.window.Event('change', { bubbles: true }));
  });
}

test('Kanban defaults to all dates, including missing/invalid dates, and reset restores all cards', async context => {
  const leads = dateFixture();
  const view = await mountView(context, leads);
  const select = view.container.querySelector('[aria-label="Период первого касания"]');
  assert.equal(select.value, 'all');
  assert.deepEqual([...select.options].map(option => option.textContent), ['Все даты', 'Сегодня', 'Вчера', '7 дней', '30 дней', 'Диапазон дат']);
  assert.deepEqual(visibleCards(view.container), leads.map(item => item.full_name).sort());
  await changeControl(view, 'Период первого касания', 'today');
  assert.deepEqual(visibleCards(view.container), ['today-end', 'today-start']);
  await changeControl(view, 'Период первого касания', 'all');
  assert.deepEqual(visibleCards(view.container), leads.map(item => item.full_name).sort());
});

test('Kanban presets include local boundary days and exclude older, future and undated cards', async context => {
  const view = await mountView(context, dateFixture());
  const expected = {
    today: ['today-start', 'today-end'],
    yesterday: ['yesterday-start', 'yesterday-end'],
    '7days': ['today-start', 'today-end', 'yesterday-start', 'yesterday-end', 'day6'],
    '30days': ['today-start', 'today-end', 'yesterday-start', 'yesterday-end', 'day6', 'day7', 'day29']
  };
  for (const [preset, names] of Object.entries(expected)) {
    await changeControl(view, 'Период первого касания', preset);
    assert.deepEqual(visibleCards(view.container), names.sort());
  }
});

test('Kanban custom date inputs filter inclusively, allow open bounds and explain reversed ranges', async context => {
  const view = await mountView(context, dateFixture());
  await changeControl(view, 'Период первого касания', 'custom');
  const today = localDateKey(new Date());
  const yesterday = localDateKey(new Date(dateAt(-1)));
  await changeControl(view, 'Первое касание: с', yesterday);
  assert.deepEqual(visibleCards(view.container), ['future', 'today-end', 'today-start', 'yesterday-end', 'yesterday-start']);
  await changeControl(view, 'Первое касание: по', today);
  assert.deepEqual(visibleCards(view.container), ['today-end', 'today-start', 'yesterday-end', 'yesterday-start']);
  await changeControl(view, 'Первое касание: с', today);
  await changeControl(view, 'Первое касание: по', yesterday);
  assert.deepEqual(visibleCards(view.container), []);
  assert.match(view.container.querySelector('[role="alert"]').textContent, /должна быть не позже/);
  assert.equal(view.container.querySelector('[aria-label="Первое касание: с"]').getAttribute('aria-invalid'), 'true');
  await changeControl(view, 'Первое касание: с', '');
  assert.equal(view.container.querySelector('[role="alert"]'), null);
  assert.deepEqual(visibleCards(view.container), ['day29', 'day30', 'day6', 'day7', 'yesterday-end', 'yesterday-start']);
});

test('Kanban date filter uses canonical first touch, preserves linked inquiries and combines with search', async context => {
  const linked = { ...lead, id: 'linked', full_name: 'Linked Search', source: 'telegram', created_at: dateAt(-30) };
  const current = { ...lead, full_name: 'Canonical Today', created_at: dateAt(0), linked_inquiries: [linked] };
  const old = { ...lead, id: 'canonical-old', full_name: 'Canonical Old', created_at: dateAt(-30), linked_inquiries: [{ ...linked, created_at: dateAt(0) }] };
  const snapshot = JSON.stringify([current, old]);
  const view = await mountView(context, [current, old]);
  await changeControl(view, 'Период первого касания', 'today');
  assert.deepEqual(visibleCards(view.container), ['Canonical Today']);
  const search = view.container.querySelector('[placeholder="Поиск..."]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(view.dom.window.HTMLInputElement.prototype, 'value').set.call(search, 'Linked Search');
    search.dispatchEvent(new view.dom.window.Event('input', { bubbles: true }));
  });
  assert.deepEqual(visibleCards(view.container), ['Canonical Today']);
  assert.match(view.container.querySelector('[draggable="true"]').textContent, /Связанных обращений: 1/);
  await act(async () => {
    Object.getOwnPropertyDescriptor(view.dom.window.HTMLInputElement.prototype, 'value').set.call(search, 'No Such Patient');
    search.dispatchEvent(new view.dom.window.Event('input', { bubbles: true }));
  });
  assert.deepEqual(visibleCards(view.container), []);
  assert.equal(JSON.stringify([current, old]), snapshot);
});

test('first card click survives task loading between press and release and opens history', async context => {
  const { container, dom, mouse, settleTasks, requests, pendingTasks } = await mountView(context);
  const card = container.querySelector('[draggable="true"]');
  assert.ok(card);
  assert.ok(pendingTasks.length > 0);
  await act(async () => mouse(card, 'mousedown'));
  await settleTasks();
  await act(async () => {
    mouse(card, 'mouseup');
    mouse(card, 'click');
  });
  assert.ok(dom.window.document.querySelector('.modal-wrapper'), 'The first click must open history even when tasks finish during the gesture');
  assert.equal(container.querySelector('[draggable="true"]'), card, 'Task updates must preserve the pressed card DOM node');
  assert.match(card.textContent, /0\/1 заданий/);
  assert.match(dom.window.document.querySelector('.modal-content').textContent, /First Click Patient/);
  assert.ok(requests.some(url => url.endsWith('/api/appointments?patient_id=patient-canonical')));
  assert.ok(requests.some(url => url.endsWith('/api/patients/patient-canonical/treatment-plans')));
  assert.equal(requests.filter(url => url.endsWith(`/api/crm/leads/${lead.id}/tasks`)).length, 1);
  await act(async () => dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(dom.window.document.querySelector('.modal-wrapper'), null);
  await act(async () => mouse(card, 'click'));
  assert.ok(dom.window.document.querySelector('.modal-wrapper'), 'The same card can reopen history');
  await act(async () => mouse(dom.window.document.querySelector('.modal-overlay'), 'click'));
  assert.equal(dom.window.document.querySelector('.modal-wrapper'), null);
  assert.equal(requests.filter(url => url.endsWith(`/api/crm/leads/${lead.id}/tasks`)).length, 1);
});

test('card action buttons do not open history and drag/drop retains lead identity', async context => {
  const { container, dom, mouse, settleTasks, scheduled } = await mountView(context);
  await settleTasks();
  const card = container.querySelector('[draggable="true"]');
  const taskButton = [...card.querySelectorAll('button')].find(button => button.textContent.includes('Создать задачу'));
  await act(async () => mouse(taskButton, 'click'));
  assert.match(dom.window.document.querySelector('.modal-content').textContent, /Новое задание/);
  assert.doesNotMatch(dom.window.document.querySelector('.modal-content').textContent, /История и данные/);
  await act(async () => dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  const currentCard = container.querySelector('[draggable="true"]');
  await act(async () => mouse(currentCard.querySelector('[title="Открыть WhatsApp"]'), 'click'));
  assert.equal(container.querySelector('[data-testid="whatsapp"]').textContent, lead.phone);
  assert.equal(dom.window.document.querySelector('.modal-wrapper'), null);
  const appointmentButton = [...container.querySelector('[draggable="true"]').querySelectorAll('button')]
    .find(button => button.textContent.includes('Назначить прием'));
  await act(async () => mouse(appointmentButton, 'click'));
  const appointment = scheduled.find(args => args[0] === 'appointment');
  assert.equal(appointment[1].appointmentForm.patient_id, lead.patient_id);
  assert.equal(appointment[1].appointmentForm.lead_phone, lead.phone);
  assert.equal(dom.window.document.querySelector('.modal-wrapper'), null);
  const data = new Map();
  const dataTransfer = { setData: (key, value) => data.set(key, value), getData: key => data.get(key) };
  const drag = new dom.window.Event('dragstart', { bubbles: true });
  Object.defineProperty(drag, 'dataTransfer', { value: dataTransfer });
  await act(async () => container.querySelector('[draggable="true"]').dispatchEvent(drag));
  assert.deepEqual(JSON.parse(data.get('text/plain')), { leadId: lead.id, currentStatus: 'new' });
  const drop = new dom.window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer });
  const targetColumn = [...container.querySelectorAll('h3')].find(title => title.textContent === 'ЗАПИСЬ ПОДТВЕРЖДЕНА').parentElement.parentElement.parentElement;
  await act(async () => targetColumn.dispatchEvent(drop));
  assert.ok(scheduled.some(args => args[0] === lead.id && args[1] === 'in_progress'));
});
