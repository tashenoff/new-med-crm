import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

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

async function mountView(context) {
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
      leads: [lead], managers: [], sources: [], loading: false,
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
