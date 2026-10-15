import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { historyDate, historyPhones } from '../src/utils/leadHistory.js';

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
  assert.ok(section, 'the modal must contain detailed inquiry history');
  assert.deepEqual(requests.slice(initialRequests).map(request => new URL(request.url).pathname).sort(), [
    '/api/appointments', '/api/patients/patient/treatment-plans',
    ...historyPhones(lead).map(() => '/api/telephony/calls')
  ].sort(), 'details must reuse supplied inquiries without extra requests');
  return { modal, section };
}

const field = (entry, label) => [...entry.querySelectorAll('dt')]
  .find(term => term.textContent === label)?.nextElementSibling.textContent;

test('HMS modal shows every inquiry field and keeps the call timeline and current features', async context => {
  const { modal, section } = await openHistory(context, { ...primary, linked_inquiries: [repeat] });
  const entries = [...section.querySelectorAll('li')];
  assert.equal(entries.length, 2);
  assert.match(entries[0].textContent, /Первое обращение/);
  assert.match(entries[1].textContent, /Повторное обращение/);
  for (const [index, inquiry] of [primary, repeat].entries()) {
    const entry = entries[index];
    assert.equal(field(entry, 'Дата и время'), historyDate(inquiry.created_at));
    assert.equal(field(entry, 'Имя'), inquiry.full_name || inquiry.name);
    assert.match(field(entry, 'Канал / источник'), new RegExp(index ? 'WhatsApp' : 'Сайт'));
    assert.equal(field(entry, 'ID источника'), inquiry.source_id);
    assert.match(field(entry, 'Статус CRM'), new RegExp(index ? 'Связались' : 'Новое обращение'));
    for (const [label, key] of Object.entries({ Телефон: 'phone', Email: 'email', Описание: 'description', Заметки: 'notes', 'ID записи на приём': 'converted_to_appointment_id' })) {
      assert.equal(field(entry, label), inquiry[key]);
    }
  }
  assert.ok(modal.querySelector('[aria-label="Хронология обращений"]'), 'existing LeadHistory stays mounted');
  assert.match(modal.textContent, /Звонки: 0/);
  for (const feature of ['Планы лечения', 'Приемы', 'Задачи', 'Создать задачу', 'Закрыть']) {
    assert.ok(modal.textContent.includes(feature), `${feature} remains available`);
  }
});

test('details preserve the canonical first inquiry and every supplied entry, including duplicate IDs and missing dates', async context => {
  const linked = [
    { ...repeat, created_at: null },
    { ...repeat, name: 'Более раннее имя', created_at: '2026-09-01T10:00:00Z' },
    { ...repeat, id: undefined, name: 'Без ID', created_at: repeat.created_at }
  ];
  const { section } = await openHistory(context, { ...primary, linked_inquiries: linked });
  assert.deepEqual([...section.querySelectorAll('li')].map(entry => field(entry, 'Имя')), [
    primary.full_name, ...linked.map(inquiry => inquiry.name)
  ]);
  assert.equal(field(section.querySelectorAll('li')[1], 'Дата и время'), 'Дата не указана');
});

test('details handle absent fields, invalid dates, unknown codes and HTML-like content safely', async context => {
  const hostile = '<img src=x onerror="alert(1)">';
  const { section } = await openHistory(context, {
    id: primary.id, patient_id: 'patient', full_name: hostile, phone: primary.phone,
    status: 'future_status', source: 'future_channel', created_at: 'bad-date',
    description: hostile, notes: 'Строка 1\nСтрока 2'
  });
  const entry = section.querySelector('li');
  assert.equal(section.querySelectorAll('li').length, 1);
  assert.equal(field(entry, 'Дата и время'), 'Дата не указана');
  for (const label of ['ID источника', 'Email', 'ID записи на приём']) assert.equal(field(entry, label), '—');
  assert.match(field(entry, 'Канал / источник'), /future_channel/);
  assert.match(field(entry, 'Статус CRM'), /future_status/);
  assert.equal(field(entry, 'Имя'), hostile);
  assert.equal(field(entry, 'Описание'), hostile);
  assert.equal(field(entry, 'Заметки'), 'Строка 1\nСтрока 2');
  assert.equal(section.querySelector('img, script, a'), null);
  assert.doesNotMatch(section.textContent, /Invalid Date|undefined|\[object Object\]/);
});
