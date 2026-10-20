import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { historyPhones } from '../src/utils/leadHistory.js';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
bootstrap.window.close();

const compiled = await build({
  stdin: {
    contents: `import React from 'react';
      import View from './src/components/crm/leads/EnhancedLeadsView.js';
      import { ThemeProvider } from './src/hooks/useTheme.js';
      export default () => <ThemeProvider><View user={{ id: 'manager' }} /></ThemeProvider>;`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx'
  },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom'], loader: { '.js': 'jsx' },
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'inquiry-fixtures', setup(builder) {
    builder.onResolve({ filter: /\/useCrm$|\/ModalContext$|\/WhatsAppSidebar$/ }, args => ({
      path: args.path, namespace: 'inquiry-fixtures'
    }));
    builder.onLoad({ filter: /.*/, namespace: 'inquiry-fixtures' }, args => ({
      contents: args.path.endsWith('/useCrm')
        ? 'export const useCrm = () => globalThis.inquiryFixture.crm;'
        : args.path.endsWith('/ModalContext')
          ? 'export const useModal = () => globalThis.inquiryFixture.modals;'
          : 'export default () => null;'
    }));
  } }]
});
const componentModule = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  createRequire(import.meta.url), componentModule, componentModule.exports
);
const View = componentModule.exports.default;

const primary = {
  id: 'canonical-lead', patient_id: 'patient', full_name: 'Первый пациент',
  status: 'new', source: 'website', source_id: 'website-form-42',
  created_at: '2026-10-01T10:30:00Z', phone: '+77012345678', email: 'first@example.test',
  description: 'Первое описание\nВторая строка', notes: 'Первая заметка',
  converted_to_appointment_id: 'appointment-first'
};
const repeat = {
  id: 'repeat', name: 'Повторное имя', source: 'whatsapp', source_id: 'wa-thread-7',
  status: 'contacted', created_at: '2026-10-02T11:45:00Z',
  phone: '+77023456789', email: 'repeat@example.test',
  description: 'Повторное описание', notes: 'Повторная заметка',
  converted_to_appointment_id: 'appointment-repeat'
};

async function openHistory(context, lead) {
  const before = structuredClone(lead);
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
  const requests = [];
  const noop = async () => {};
  const globals = {
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
    inquiryFixture: {
      crm: { leads: [lead], managers: [], sources: [], loading: false,
        fetchLeads: noop, fetchAvailableManagers: noop, fetchSources: noop, clearError: noop },
      modals: { openModal: noop, closeModal: noop }
    },
    fetch: async (url, options = {}) => {
      requests.push({ url: String(url), method: options.method || 'GET' });
      const path = new URL(url).pathname;
      const data = path.endsWith('/kanban/columns')
        ? [{ id: lead.status, name: 'Тестовая колонка', is_system: lead.status === 'new', manual_move_allowed: true }]
        : path.endsWith('/tasks') ? { tasks: [] }
          : path.endsWith('/task-statuses') ? { statuses: [] } : [];
      return { ok: true, json: async () => data };
    }
  };
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
    assert.deepEqual(lead, before, 'display must not mutate the supplied inquiry data');
    assert.ok(requests.every(request => request.method === 'GET'), 'opening history must not persist data');
  });
  await act(async () => root.render(React.createElement(View)));
  assert.equal(document.querySelector('[aria-label="Подробная история обращений"]'), null);
  const card = document.querySelector('[draggable]');
  assert.ok(card, 'the existing lead card must render');
  const initialRequests = requests.length;
  await act(async () => card.click());
  const modal = document.querySelector('.modal-content');
  assert.ok(modal, 'the existing History and Data modal must open');
  const section = modal.querySelector('[aria-label="Подробная история обращений"]');
  assert.equal(section, null, 'detailed inquiry history must stay hidden in the card');
  assert.deepEqual(requests.slice(initialRequests).map(request => new URL(request.url).pathname).sort(), [
    '/api/appointments', '/api/patients/patient/treatment-plans',
    ...historyPhones(lead).map(() => '/api/telephony/calls')
  ].sort(), 'opening the card must keep its existing read-only requests');
  return { modal };
}

test('HMS card hides detailed inquiry history and keeps the timeline and current features', async context => {
  const { modal } = await openHistory(context, { ...primary, linked_inquiries: [repeat] });
  assert.ok(modal.querySelector('[aria-label="Хронология обращений"]'), 'existing LeadHistory stays mounted');
  assert.match(modal.textContent, /Звонки: 0/);
  for (const feature of ['Планы лечения', 'Приемы', 'Задачи', 'Создать задачу', 'Закрыть']) {
    assert.ok(modal.textContent.includes(feature), `${feature} remains available`);
  }
});
