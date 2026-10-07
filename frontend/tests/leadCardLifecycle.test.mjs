import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { SYSTEM_COLUMN_NAMES } from '../src/utils/kanbanColumns.js';

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
      builder.onResolve({ filter: /\/useCrm$|\/useCrmApi$|\/ModalContext$|\/WhatsAppSidebar$/ }, args => ({
        path: args.path, namespace: 'test-contexts'
      }));
      builder.onLoad({ filter: /.*/, namespace: 'test-contexts' }, args => ({
        resolveDir: fileURLToPath(new URL('..', import.meta.url)),
        contents: args.path.endsWith('/useCrm')
          ? `import React from 'react';
             import { useCrm as useRealCrm } from './src/hooks/useCrm.js';
             export const useCrm = options => {
               const fixture = globalThis.cardFixture;
               if (fixture.realCrm) {
                 const crm = useRealCrm(options);
                 fixture.crm = crm;
                 fixture.loadingStates.push({ loading: crm.loading, leads: crm.dataLoading.leads });
                 return crm;
               }
               const [leads, setLeads] = React.useState(fixture.crm.leads);
               fixture.crm.leads = leads;
               fixture.crm.applyLeadKanbanMove = (id, result) => setLeads(current => current.map(lead =>
                 lead.id === id ? { ...lead, kanban_column_id: result.column_id === 'new' ? null : result.column_id,
                   status: result.status ?? lead.status } : lead));
               return fixture.crm;
             };`
          : args.path.endsWith('/useCrmApi')
            ? `import React from 'react'; export const useCrmApi = () => {
                const [loading, setLoading] = React.useState(false);
                globalThis.cardFixture.setApiLoading = value => {
                  globalThis.cardFixture.apiLoadingTransitions.push(value);
                  setLoading(value);
                };
                return { ...globalThis.cardFixture.api, loading };
              };`
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

const systemColumns = () => Object.entries(SYSTEM_COLUMN_NAMES).map(([id, name]) => ({
  id, name, is_system: true, manual_move_allowed: id === 'new', affected_count: 0
}));
const customColumn = { id: 'custom_followup', name: 'Перезвонить', is_system: false, manual_move_allowed: true, affected_count: 2 };

async function mountView(context, leads = [lead], options = {}) {
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
  const apiRequests = [];
  const columnState = { columns: structuredClone(options.columns || systemColumns()) };
  const backendLeads = structuredClone(leads);
  const pendingTasks = [];
  const scheduled = [];
  let initialLeadsFetched = false;
  const noop = async () => {};
  globalThis.cardFixture = {
    realCrm: options.realCrm,
    loadingStates: [],
    apiLoadingTransitions: [],
    crm: {
      leads, managers: [], sources: [], loading: false,
      fetchLeads: async () => {
        if (!initialLeadsFetched) {
          initialLeadsFetched = true;
          return;
        }
        scheduled.push(['refresh-leads']);
        globalThis.cardFixture.crm.leads = [...globalThis.cardFixture.crm.leads];
      }, fetchAvailableManagers: noop, fetchSources: noop,
      clearError: noop, updateLeadStatus: async (...args) => scheduled.push(args)
    },
    modals: { openModal: (...args) => scheduled.push(args), closeModal: noop }
  };
  let leadReads = 0;
  const getKanban = async () => {
    leadReads += 1;
    if (leadReads > 2) scheduled.push(['refresh-leads']);
    globalThis.cardFixture.setApiLoading(true);
    await Promise.resolve();
    globalThis.cardFixture.setApiLoading(false);
    return structuredClone(backendLeads);
  };
  globalThis.cardFixture.api = {
    leads: { getKanban, getStatistics: noop },
    clients: { getAll: async () => [] }, deals: { getAll: async () => [] },
    managers: { getAll: async () => [], getAvailable: async () => [] },
    sources: { getAll: async () => [] }, clearError: noop
  };
  dom.window.localStorage.setItem('token', 'clinic-token');
  globalThis.fetch = async (url, init = {}) => {
    requests.push(String(url));
    const path = new URL(url).pathname;
    if (path.includes('/kanban/columns') || path.endsWith('/kanban-column')) {
      const request = { path, method: init.method || 'GET', headers: init.headers, body: init.body && JSON.parse(init.body) };
      apiRequests.push(request);
      const override = await options.apiFetch?.(request, columnState);
      if (override) return override;
      let result = columnState.columns;
      if (request.method === 'POST') {
        result = { ...customColumn, id: 'custom_created', name: request.body.name, affected_count: 0 };
        columnState.columns.push(result);
      } else if (request.method === 'PUT') {
        columnState.columns = request.body.column_ids.map(id => columnState.columns.find(column => column.id === id));
        result = columnState.columns;
      } else if (request.method === 'PATCH' && path.endsWith('/kanban-column')) {
        const id = path.split('/').at(-2);
        const canonical = backendLeads.find(item => item.id === id);
        canonical.kanban_column_id = request.body.column_id === 'new' ? null : request.body.column_id;
        result = { lead_id: id, column_id: request.body.column_id, status: canonical.status };
      } else if (request.method === 'PATCH') {
        result = columnState.columns.find(column => column.id === path.split('/').at(-1));
        result.name = request.body.name;
      } else if (request.method === 'DELETE') {
        const id = path.split('/').at(-1);
        result = { id, affected_count: columnState.columns.find(column => column.id === id).affected_count };
        columnState.columns = columnState.columns.filter(column => column.id !== id);
        globalThis.cardFixture.crm.leads.forEach(item => {
          if (item.kanban_column_id === id) item.kanban_column_id = null;
        });
      }
      return { ok: true, json: async () => structuredClone(result) };
    }
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
  return { container, dom, requests, apiRequests, columnState, pendingTasks, scheduled, mouse, settleTasks,
    fixture: globalThis.cardFixture, backendLeads };
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
  const control = view.container.querySelector(`[aria-label="${label}"], [placeholder="${label}"]`);
  const prototype = control.tagName === 'SELECT' ? view.dom.window.HTMLSelectElement.prototype : view.dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, value);
    control.dispatchEvent(new view.dom.window.Event('input', { bubbles: true }));
    control.dispatchEvent(new view.dom.window.Event('change', { bubbles: true }));
  });
}

test('Kanban removes decorative buttons and the fake search label', async context => {
  const view = await mountView(context);
  for (const label of ['создать', 'общие', 'сделки в работе']) {
    assert.ok(!buttonWithLabel(view, label), `${label} must not appear`);
  }
  assert.doesNotMatch(view.container.textContent, /\+ поиск/);
});

test('Kanban removes the status dropdown and its options', async context => {
  const view = await mountView(context);
  assert.ok(!view.container.querySelector('[aria-label="Статус на доске"]'));
  assert.doesNotMatch(view.container.textContent, /Все статусы/);
  assert.equal(view.container.querySelectorAll('select option').length, 0);
});

test('Kanban removes first-touch date controls without hiding dated or undated cards', async context => {
  const leads = dateFixture();
  const view = await mountView(context, leads);
  assert.ok(!view.container.querySelector('[aria-label="Период первого касания"]'));
  assert.ok(!view.container.querySelector('input[type="date"], [aria-label^="Первое касание:"]'));
  assert.doesNotMatch(view.container.textContent, /Первое касание|Все даты|Диапазон дат/);
  assert.equal(view.container.querySelectorAll('[placeholder="Поиск..."]').length, 1);
  assert.deepEqual(visibleCards(view.container), leads.map(item => item.full_name).sort());
});

test('column controls appear once beside search, outside the board, in either edit mode', async context => {
  const view = await mountView(context, [], { columns: [customColumn, ...systemColumns()] });
  const search = view.container.querySelector('[placeholder="Поиск..."]');
  const board = view.container.querySelector('[aria-label="Колонки Канбан"]');
  for (const editing of [false, true, false]) {
    const editLabel = editing ? 'Готово' : 'Редактировать колонки';
    for (const label of [editLabel, 'Добавить колонку']) {
      const buttons = [...view.container.querySelectorAll('button')].filter(button => button.textContent.trim() === label);
      assert.equal(buttons.length, 1, `${label} must appear exactly once`);
      assert.equal(board.contains(buttons[0]), false, 'Controls belong in the main controls row, not the board header');
      assert.equal(buttons[0].parentElement.parentElement.contains(search), true, 'Controls share a row with search');
    }
    assert.equal(buttonWithLabel(view, editLabel).getAttribute('aria-pressed'), String(editing));
    assert.equal(buttonWithLabel(view, editing ? 'Редактировать колонки' : 'Готово'), undefined);
    await clickButton(view, editLabel);
  }
});

test('Kanban text search matches linked inquiries across dates without mutating leads', async context => {
  const linked = { ...lead, id: 'linked', full_name: 'Linked Search', source: 'telegram', created_at: dateAt(-30) };
  const current = { ...lead, full_name: 'Canonical Today', created_at: dateAt(0), linked_inquiries: [linked] };
  const old = { ...lead, id: 'canonical-old', full_name: 'Canonical Old', created_at: dateAt(-30), linked_inquiries: [{ ...linked, created_at: dateAt(0) }] };
  const snapshot = JSON.stringify([current, old]);
  const view = await mountView(context, [current, old]);
  assert.deepEqual(visibleCards(view.container), ['Canonical Old', 'Canonical Today']);
  const search = view.container.querySelector('[placeholder="Поиск..."]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(view.dom.window.HTMLInputElement.prototype, 'value').set.call(search, 'Linked Search');
    search.dispatchEvent(new view.dom.window.Event('input', { bubbles: true }));
  });
  assert.deepEqual(visibleCards(view.container), ['Canonical Old', 'Canonical Today']);
  assert.match(view.container.querySelector('[draggable="true"]').textContent, /Связанных обращений: 1/);
  await act(async () => {
    Object.getOwnPropertyDescriptor(view.dom.window.HTMLInputElement.prototype, 'value').set.call(search, 'No Such Patient');
    search.dispatchEvent(new view.dom.window.Event('input', { bubbles: true }));
  });
  assert.deepEqual(visibleCards(view.container), []);
  await changeControl(view, 'Поиск...', '');
  assert.deepEqual(visibleCards(view.container), ['Canonical Old', 'Canonical Today']);
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
  const { container, dom, mouse, settleTasks, scheduled, apiRequests } = await mountView(context);
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
  assert.deepEqual(JSON.parse(data.get('text/plain')), { leadId: lead.id });
  const drop = new dom.window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer });
  const targetColumn = container.querySelector('[data-column-id="in_progress"]');
  await act(async () => targetColumn.dispatchEvent(drop));
  assert.equal(apiRequests.filter(request => request.method === 'PATCH').length, 0);
  assert.ok(!scheduled.some(args => args[0] === lead.id && args[1] === 'in_progress'));
});

const columnElements = view => [...view.container.querySelectorAll('[data-column-id]')];
const columnIds = view => columnElements(view).map(element => element.dataset.columnId);
const buttonWithLabel = (view, label) => [...view.dom.window.document.querySelectorAll('button')]
  .find(button => button.getAttribute('aria-label') === label || button.textContent.trim() === label);
const clickButton = (view, label) => act(async () => view.mouse(buttonWithLabel(view, label), 'click'));

async function saveColumn(view, name) {
  const input = view.dom.window.document.getElementById('kanban-column-name');
  await act(async () => {
    Object.getOwnPropertyDescriptor(view.dom.window.HTMLInputElement.prototype, 'value').set.call(input, name);
    input.dispatchEvent(new view.dom.window.Event('input', { bubbles: true }));
  });
  await act(async () => input.closest('form').dispatchEvent(new view.dom.window.Event('submit', { bubbles: true, cancelable: true })));
}

async function dropCard(view, leadId, destinationId, payload) {
  let value = payload;
  const dataTransfer = { setData: (type, data) => { value = data; }, getData: () => value };
  const dispatch = (element, type) => {
    const event = new view.dom.window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    element.dispatchEvent(event);
  };
  if (payload === undefined) {
    await act(async () => dispatch(view.container.querySelector(`[data-lead-id="${leadId}"]`), 'dragstart'));
  }
  await act(async () => dispatch(view.container.querySelector(`[data-column-id="${destinationId}"]`), 'drop'));
}

test('API array loads with current auth; exactly five protected system columns and configured order render', async context => {
  const columns = [...systemColumns().reverse(), customColumn,
    ...['rejected', 'qualified', 'lost'].map(id => ({ id, name: id, is_system: true, manual_move_allowed: false }))];
  const leads = ['new', 'contacted', 'in_progress', 'converted', 'closed', 'rejected', 'qualified', 'lost']
    .map(status => ({ ...lead, id: status, status, full_name: status }));
  const snapshot = JSON.stringify(leads);
  const view = await mountView(context, leads, { columns });
  assert.deepEqual(columnIds(view), ['closed', 'converted', 'in_progress', 'contacted', 'new', customColumn.id]);
  assert.deepEqual(columnElements(view).slice(0, 5).map(element => element.querySelector('h3').textContent.trim()),
    Object.values(SYSTEM_COLUMN_NAMES).reverse());
  assert.equal(view.container.textContent.match(/Системная/g).length, 5);
  for (const element of columnElements(view).slice(0, 5)) {
    assert.equal(element.querySelector('[aria-label^="Переименовать"]'), null);
    assert.equal(element.querySelector('[aria-label^="Удалить"]'), null);
  }
  assert.deepEqual([...view.container.querySelectorAll('[data-lead-id]')].map(element => element.dataset.leadId).sort(),
    ['closed', 'contacted', 'converted', 'in_progress', 'new']);
  assert.equal(view.apiRequests[0].headers.Authorization, 'Bearer clinic-token');
  assert.equal(JSON.stringify(leads), snapshot, 'Legacy data is not changed');
});

test('loading state disables create; column API errors display a retry that recovers', async context => {
  let resolveColumns;
  const view = await mountView(context, [], {
    apiFetch: request => request.method === 'GET' && new Promise(resolve => { resolveColumns = resolve; })
  });
  assert.match(view.container.textContent, /Загрузка колонок/);
  assert.equal(buttonWithLabel(view, 'Добавить колонку').disabled, true);
  assert.deepEqual(columnIds(view), []);
  await act(async () => resolveColumns({ ok: false, json: async () => ({ detail: 'Колонки недоступны' }) }));
  assert.match(view.container.querySelector('[role="alert"]').textContent, /Колонки недоступны/);
  await clickButton(view, 'Обновить колонки');
  await act(async () => resolveColumns({ ok: true, json: async () => systemColumns() }));
  assert.deepEqual(columnIds(view), Object.keys(SYSTEM_COLUMN_NAMES));
  assert.equal(view.container.querySelector('[role="alert"]'), null);
});

test('create and rename send only name and refresh columns plus canonical cards', async context => {
  const view = await mountView(context);
  await clickButton(view, 'Добавить колонку');
  assert.equal(view.dom.window.document.querySelector('button[type="submit"]').disabled, true);
  await saveColumn(view, '  Ожидает ответа  ');
  assert.deepEqual(view.apiRequests.find(request => request.method === 'POST').body, { name: 'Ожидает ответа' });
  assert.ok(columnIds(view).includes('custom_created'));
  assert.equal(view.dom.window.document.querySelector('.modal-wrapper'), null);
  await clickButton(view, 'Переименовать «Ожидает ответа»');
  await saveColumn(view, 'Повторный звонок');
  const rename = view.apiRequests.find(request => request.method === 'PATCH');
  assert.equal(rename.path, '/api/crm/kanban/columns/custom_created');
  assert.deepEqual(rename.body, { name: 'Повторный звонок' });
  assert.equal(view.columnState.columns.at(-1).name, 'Повторный звонок');
  assert.equal(view.scheduled.filter(args => args[0] === 'refresh-leads').length, 2);
  assert.equal(view.apiRequests.filter(request => request.method === 'GET').length, 3);
});

test('rename error retains dialog and original column, and allows retry', async context => {
  let fail = true;
  const view = await mountView(context, [], { columns: [...systemColumns(), customColumn],
    apiFetch: request => request.method === 'PATCH' && fail
      ? { ok: false, json: async () => ({ detail: 'Название уже используется' }) } : undefined
  });
  await clickButton(view, 'Переименовать «Перезвонить»');
  await saveColumn(view, 'Дубликат');
  assert.ok(view.dom.window.document.querySelector('.modal-wrapper'));
  assert.match(view.dom.window.document.querySelector('.modal-wrapper [role="alert"]').textContent, /Название уже используется/);
  assert.equal(view.columnState.columns.at(-1).name, 'Перезвонить');
  fail = false;
  await saveColumn(view, 'Новое имя');
  assert.equal(view.dom.window.document.querySelector('.modal-wrapper'), null);
});

test('column reorder arrows are hidden by default without affecting custom rename or delete', async context => {
  const view = await mountView(context, [], { columns: [customColumn, ...systemColumns()] });
  assert.equal(view.container.querySelectorAll('button[aria-label^="Переместить «"]').length, 0);
  assert.ok(buttonWithLabel(view, 'Редактировать колонки'));
  assert.ok(buttonWithLabel(view, 'Переименовать «Перезвонить»'));
  assert.ok(buttonWithLabel(view, 'Удалить «Перезвонить»'));
  assert.equal(view.apiRequests.filter(request => request.method === 'PUT').length, 0);
});

test('column edit mode toggles custom arrows and explanatory text without changing order', async context => {
  const view = await mountView(context, [], { columns: [customColumn, ...systemColumns()] });
  const originalIds = columnIds(view);
  await clickButton(view, 'Редактировать колонки');
  assert.ok(buttonWithLabel(view, 'Готово'));
  assert.equal(view.container.querySelectorAll('button[aria-label^="Переместить «"]').length, 2);
  assert.match(view.container.textContent, /Перемещать можно только пользовательские колонки/);
  await clickButton(view, 'Готово');
  assert.ok(buttonWithLabel(view, 'Редактировать колонки'));
  assert.equal(view.container.querySelectorAll('button[aria-label^="Переместить «"]').length, 0);
  assert.doesNotMatch(view.container.textContent, /Перемещать можно только пользовательские колонки/);
  assert.deepEqual(columnIds(view), originalIds);
  assert.equal(view.apiRequests.filter(request => request.method === 'PUT').length, 0);
});

test('system columns never expose reorder controls even in column edit mode', async context => {
  const view = await mountView(context, [], { columns: [...systemColumns(), customColumn] });
  await clickButton(view, 'Редактировать колонки');
  for (const column of systemColumns()) {
    const header = view.container.querySelector(`[data-column-id="${column.id}"]`);
    assert.equal(header.querySelectorAll('button[aria-label^="Переместить «"]').length, 0);
  }
  assert.equal(buttonWithLabel(view, 'Переместить «Перезвонить» вправо').disabled, true);
});

test('custom columns move one adjacent position around systems preserving every system ID relative order', async context => {
  const systems = systemColumns();
  const secondCustom = { ...customColumn, id: 'custom_second', name: 'Ожидание' };
  const view = await mountView(context, [], { columns: [customColumn, ...systems, secondCustom] });
  await clickButton(view, 'Редактировать колонки');
  assert.equal(buttonWithLabel(view, 'Переместить «Перезвонить» влево').disabled, true);
  assert.equal(buttonWithLabel(view, 'Переместить «Ожидание» вправо').disabled, true);
  await clickButton(view, 'Переместить «Перезвонить» вправо');
  assert.deepEqual(columnIds(view), ['new', customColumn.id, 'contacted', 'in_progress', 'converted', 'closed', secondCustom.id]);
  await clickButton(view, 'Переместить «Перезвонить» вправо');
  assert.deepEqual(columnIds(view), ['new', 'contacted', customColumn.id, 'in_progress', 'converted', 'closed', secondCustom.id]);
  await clickButton(view, 'Переместить «Перезвонить» влево');
  assert.deepEqual(columnIds(view), ['new', customColumn.id, 'contacted', 'in_progress', 'converted', 'closed', secondCustom.id]);
  await clickButton(view, 'Переместить «Ожидание» влево');
  assert.deepEqual(columnIds(view), ['new', customColumn.id, 'contacted', 'in_progress', 'converted', secondCustom.id, 'closed']);
  const updates = view.apiRequests.filter(request => request.method === 'PUT');
  assert.equal(updates.length, 4);
  for (const update of updates) {
    assert.equal(update.path, '/api/crm/kanban/columns/order');
    assert.deepEqual(Object.keys(update.body), ['column_ids']);
    assert.equal(new Set(update.body.column_ids).size, 7);
    assert.deepEqual(update.body.column_ids.filter(id => systems.some(column => column.id === id)), systems.map(column => column.id));
  }
  assert.equal(view.scheduled.filter(args => args[0] === 'refresh-leads').length, 4);
});

test('column edit mode is disabled during initial column loading', async context => {
  let resolveLoad;
  const view = await mountView(context, [], {
    apiFetch: request => request.method === 'GET' ? new Promise(resolve => { resolveLoad = resolve; }) : undefined
  });
  assert.equal(buttonWithLabel(view, 'Редактировать колонки').disabled, true);
  await clickButton(view, 'Редактировать колонки');
  assert.equal(view.container.querySelectorAll('button[aria-label^="Переместить «"]').length, 0);
  await act(async () => resolveLoad({ ok: true, json: async () => [...systemColumns(), customColumn] }));
  assert.equal(buttonWithLabel(view, 'Редактировать колонки').disabled, false);
});

test('column edit mode and reorder controls are disabled throughout a pending mutation', async context => {
  let resolveOrder;
  const view = await mountView(context, [], {
    columns: [customColumn, ...systemColumns()],
    apiFetch: request => request.method === 'PUT' ? new Promise(resolve => { resolveOrder = resolve; }) : undefined
  });
  await clickButton(view, 'Редактировать колонки');
  await clickButton(view, 'Переместить «Перезвонить» вправо');
  assert.equal(buttonWithLabel(view, 'Готово').disabled, true);
  for (const button of view.container.querySelectorAll('button[aria-label^="Переместить «"]')) {
    assert.equal(button.disabled, true);
  }
  await clickButton(view, 'Готово');
  await clickButton(view, 'Переместить «Перезвонить» вправо');
  assert.equal(view.apiRequests.filter(request => request.method === 'PUT').length, 1);
  const order = view.apiRequests.find(request => request.method === 'PUT').body.column_ids;
  view.columnState.columns = order.map(id => view.columnState.columns.find(column => column.id === id));
  await act(async () => resolveOrder({ ok: true, json: async () => view.columnState.columns }));
  assert.equal(buttonWithLabel(view, 'Готово').disabled, false);
  assert.equal(buttonWithLabel(view, 'Переместить «Перезвонить» вправо').disabled, false);
});

test('delete confirms freshly fetched backend affected_count, supports cancel and reports actual result', async context => {
  const assigned = { ...lead, kanban_column_id: customColumn.id, full_name: 'Manual card' };
  const view = await mountView(context, [assigned], { columns: [...systemColumns(), customColumn] });
  await changeControl(view, 'Поиск...', 'No Such Patient');
  assert.equal(view.container.querySelector('[data-lead-id]'), null, 'Search-filtered count is not used');
  const confirmations = [];
  view.dom.window.confirm = text => { confirmations.push(text); return false; };
  view.columnState.columns.at(-1).affected_count = 17;
  await clickButton(view, 'Удалить «Перезвонить»');
  assert.match(confirmations[0], /Карточек: 17/);
  assert.match(confirmations[0], /Все карточки вернутся в «Неразобранные»/);
  assert.equal(view.apiRequests.filter(request => request.method === 'DELETE').length, 0);
  view.dom.window.confirm = text => {
    confirmations.push(text);
    view.columnState.columns.at(-1).affected_count = 18;
    return true;
  };
  await clickButton(view, 'Удалить «Перезвонить»');
  assert.equal(view.apiRequests.filter(request => request.method === 'DELETE').length, 1);
  assert.ok(!columnIds(view).includes(customColumn.id));
  assert.match(view.container.textContent, /возвращено в «Неразобранные»: 18/);
  await changeControl(view, 'Поиск...', '');
  assert.equal(view.container.querySelector('[data-lead-id]').closest('[data-column-id]').dataset.columnId, 'new');
  assert.equal(assigned.status, 'new');
});

test('custom membership uses canonical stage only; event statuses and legacy statuses ignore custom assignment', async context => {
  const leads = [
    { ...lead, id: 'manual', kanban_column_id: customColumn.id, linked_inquiries: [{ kanban_column_id: 'custom_other' }] },
    { ...lead, id: 'unparsed', linked_inquiries: [{ kanban_column_id: customColumn.id }] },
    ...['contacted', 'in_progress', 'converted', 'closed', 'rejected', 'qualified', 'lost']
      .map(status => ({ ...lead, id: status, status, kanban_column_id: customColumn.id }))
  ];
  const snapshot = JSON.stringify(leads);
  const view = await mountView(context, leads, { columns: [...systemColumns(), customColumn] });
  for (const [id, column] of [['manual', customColumn.id], ['unparsed', 'new'],
    ['contacted', 'contacted'], ['in_progress', 'in_progress'], ['converted', 'converted'], ['closed', 'closed']]) {
    const card = view.container.querySelector(`[data-lead-id="${id}"]`);
    assert.equal(card.closest('[data-column-id]').dataset.columnId, column);
    assert.equal(card.draggable, ['manual', 'unparsed'].includes(id));
  }
  for (const status of ['rejected', 'qualified', 'lost']) assert.equal(view.container.querySelector(`[data-lead-id="${status}"]`), null);
  assert.equal(JSON.stringify(leads), snapshot);
});

test('manual movement only permits new/custom sources and destinations, preserves base status and inquiries', async context => {
  const linked = { ...lead, id: 'linked', status: 'qualified' };
  const manual = { ...lead, id: 'manual', linked_inquiries: [linked] };
  const automated = { ...lead, id: 'automated', status: 'contacted' };
  const secondCustom = { ...customColumn, id: 'custom_second', name: 'Ожидание' };
  const view = await mountView(context, [manual, automated], {
    realCrm: true, columns: [...systemColumns(), customColumn, secondCustom]
  });
  for (const destination of ['contacted', 'in_progress', 'converted', 'closed', 'new']) {
    await dropCard(view, manual.id, destination);
  }
  await dropCard(view, automated.id, customColumn.id, JSON.stringify({ leadId: automated.id, currentStatus: 'new' }));
  await dropCard(view, manual.id, customColumn.id, 'invalid JSON');
  await dropCard(view, manual.id, customColumn.id, JSON.stringify({ leadId: 'unknown' }));
  assert.equal(view.apiRequests.filter(request => request.method === 'PATCH').length, 0);
  await dropCard(view, manual.id, customColumn.id);
  assert.deepEqual(view.apiRequests.find(request => request.method === 'PATCH').body, { column_id: customColumn.id });
  assert.equal(view.container.querySelector('[data-lead-id="manual"]').closest('[data-column-id]').dataset.columnId, customColumn.id);
  await dropCard(view, manual.id, secondCustom.id);
  assert.equal(view.container.querySelector('[data-lead-id="manual"]').closest('[data-column-id]').dataset.columnId, secondCustom.id);
  await dropCard(view, manual.id, 'new');
  assert.equal(view.container.querySelector('[data-lead-id="manual"]').closest('[data-column-id]').dataset.columnId, 'new');
  assert.equal(manual.status, 'new');
  assert.equal(linked.status, 'qualified');
  assert.equal(automated.status, 'contacted');
  assert.equal(view.fixture.crm.leads.find(item => item.id === manual.id).kanban_column_id, null);
  assert.equal(view.scheduled.filter(args => args[0] === 'refresh-leads').length, 0);
});

test('text search filters system and custom columns regardless of creation date', async context => {
  const leads = [
    { ...lead, id: 'today-custom', full_name: 'Matching Today', kanban_column_id: customColumn.id, created_at: dateAt(0) },
    { ...lead, id: 'old-custom', full_name: 'Matching Old', kanban_column_id: customColumn.id, created_at: dateAt(-30) },
    { ...lead, id: 'today-new', full_name: 'Matching New', created_at: dateAt(0) }
  ];
  const view = await mountView(context, leads, { columns: [...systemColumns(), customColumn] });
  assert.deepEqual(visibleCards(view.container), ['Matching New', 'Matching Old', 'Matching Today']);
  await changeControl(view, 'Поиск...', 'oLd');
  assert.deepEqual(visibleCards(view.container), ['Matching Old']);
  assert.equal(view.container.querySelector('[data-lead-id="old-custom"]').closest('[data-column-id]').dataset.columnId, customColumn.id);
  await changeControl(view, 'Поиск...', 'New');
  assert.deepEqual(visibleCards(view.container), ['Matching New']);
  assert.equal(view.container.querySelector('[data-lead-id="today-new"]').closest('[data-column-id]').dataset.columnId, 'new');
  await changeControl(view, 'Поиск...', 'No Such Patient');
  assert.deepEqual(visibleCards(view.container), []);
  await changeControl(view, 'Поиск...', '');
  assert.deepEqual(visibleCards(view.container), ['Matching New', 'Matching Old', 'Matching Today']);
});

test('delete failure preserves column and cards; successful delete preserves text search', async context => {
  let fail = true;
  const assigned = { ...lead, kanban_column_id: customColumn.id };
  const view = await mountView(context, [assigned], { columns: [...systemColumns(), customColumn],
    apiFetch: request => request.method === 'DELETE' && fail
      ? { ok: false, json: async () => ({ detail: 'Удаление недоступно' }) } : undefined
  });
  view.dom.window.confirm = () => true;
  await changeControl(view, 'Поиск...', 'First Click');
  await clickButton(view, 'Удалить «Перезвонить»');
  assert.match(view.container.querySelector('[role="alert"]').textContent, /Удаление недоступно/);
  assert.ok(columnIds(view).includes(customColumn.id));
  assert.equal(assigned.kanban_column_id, customColumn.id);
  fail = false;
  await clickButton(view, 'Удалить «Перезвонить»');
  assert.equal(view.container.querySelector('[placeholder="Поиск..."]').value, 'First Click');
  assert.equal(view.container.querySelector('[data-lead-id]').closest('[data-column-id]').dataset.columnId, 'new');
});

test('movement in flight locks management and duplicate drops until PATCH completes', async context => {
  let resolveMove;
  const manual = { ...lead };
  const view = await mountView(context, [manual], { columns: [...systemColumns(), customColumn],
    apiFetch: request => request.path.endsWith('/kanban-column')
      ? new Promise(resolve => { resolveMove = resolve; }) : undefined
  });
  await dropCard(view, manual.id, customColumn.id);
  assert.equal(buttonWithLabel(view, 'Добавить колонку').disabled, true);
  assert.equal(view.container.querySelector('[data-lead-id]').draggable, false);
  await dropCard(view, manual.id, customColumn.id, JSON.stringify({ leadId: manual.id }));
  assert.equal(view.apiRequests.filter(request => request.method === 'PATCH').length, 1);
  await act(async () => resolveMove({ ok: true, json: async () => ({ lead_id: manual.id, column_id: customColumn.id, status: 'new' }) }));
  assert.equal(buttonWithLabel(view, 'Добавить колонку').disabled, false);
  assert.equal(view.container.querySelector('[data-lead-id]').closest('[data-column-id]').dataset.columnId, customColumn.id);
});

test('successful card drag updates real CRM state without lead refresh, page loading or navigation', async context => {
  let resolveMove;
  const manual = { ...lead, linked_inquiries: [{ id: 'inquiry', status: 'qualified' }] };
  const untouched = { ...lead, id: 'untouched', full_name: 'Untouched Patient' };
  const view = await mountView(context, [manual, untouched], {
    realCrm: true, columns: [...systemColumns(), customColumn],
    apiFetch: request => request.path.endsWith('/kanban-column')
      ? new Promise(resolve => { resolveMove = resolve; }) : undefined
  });
  await changeControl(view, 'Поиск...', 'Patient');
  view.fixture.loadingStates.length = 0;
  view.fixture.apiLoadingTransitions.length = 0;
  const untouchedState = view.fixture.crm.leads.find(item => item.id === untouched.id);
  const url = view.dom.window.location.href;
  const board = view.container.querySelector('[data-column-id="new"]');
  const position = () => view.container.querySelector(`[data-lead-id="${manual.id}"]`).closest('[data-column-id]').dataset.columnId;
  await dropCard(view, manual.id, customColumn.id);
  assert.equal(position(), 'new', 'Do not move before PATCH succeeds');
  await dropCard(view, manual.id, customColumn.id, JSON.stringify({ leadId: manual.id }));
  assert.equal(view.apiRequests.filter(request => request.method === 'PATCH').length, 1);
  view.backendLeads[0].kanban_column_id = customColumn.id;
  await act(async () => resolveMove({ ok: true, json: async () => ({
    lead_id: manual.id, column_id: customColumn.id, status: 'new'
  }) }));
  assert.equal(position(), customColumn.id);
  assert.equal(view.scheduled.filter(args => args[0] === 'refresh-leads').length, 0);
  assert.ok(view.fixture.loadingStates.length > 0);
  assert.ok(view.fixture.loadingStates.every(state => !state.loading && !state.leads));
  assert.deepEqual(view.fixture.apiLoadingTransitions, []);
  assert.equal(view.container.querySelector('.animate-spin'), null);
  assert.equal(view.container.querySelector('[data-column-id="new"]'), board);
  assert.equal(view.dom.window.location.href, url);
  assert.equal(view.container.querySelector('[placeholder="Поиск..."]').value, 'Patient');
  assert.equal(view.fixture.crm.leads.find(item => item.id === untouched.id), untouchedState);
  assert.equal(view.fixture.crm.leads[0].status, 'new');
  assert.deepEqual(view.fixture.crm.leads[0].linked_inquiries, manual.linked_inquiries);
  assert.equal(manual.kanban_column_id, undefined, 'Input records are not mutated');
  assert.equal(view.apiRequests.filter(request => request.method === 'GET').length, 1);
  await act(async () => view.fixture.crm.fetchLeads());
  assert.equal(position(), customColumn.id, 'Later canonical refresh retains persisted membership');
});

test('failed card PATCH preserves real CRM state and board, displays error and permits retry', async context => {
  let fail = true;
  const view = await mountView(context, [{ ...lead }], {
    realCrm: true, columns: [...systemColumns(), customColumn],
    apiFetch: request => request.path.endsWith('/kanban-column') && fail
      ? { ok: false, json: async () => ({ detail: 'Перемещение недоступно' }) } : undefined
  });
  view.fixture.loadingStates.length = 0;
  view.fixture.apiLoadingTransitions.length = 0;
  const before = view.fixture.crm.leads;
  await dropCard(view, lead.id, customColumn.id);
  assert.equal(view.fixture.crm.leads, before);
  assert.equal(view.container.querySelector('[data-lead-id]').closest('[data-column-id]').dataset.columnId, 'new');
  assert.match(view.container.querySelector('[role="alert"]').textContent, /Перемещение недоступно/);
  assert.equal(buttonWithLabel(view, 'Добавить колонку').disabled, false);
  assert.equal(view.scheduled.filter(args => args[0] === 'refresh-leads').length, 0);
  assert.ok(view.fixture.loadingStates.every(state => !state.loading && !state.leads));
  assert.deepEqual(view.fixture.apiLoadingTransitions, []);
  fail = false;
  await dropCard(view, lead.id, customColumn.id);
  assert.equal(view.container.querySelector('[role="alert"]'), null);
  assert.equal(view.container.querySelector('[data-lead-id]').closest('[data-column-id]').dataset.columnId, customColumn.id);
});
