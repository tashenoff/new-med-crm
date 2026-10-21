import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { SYSTEM_COLUMN_NAMES } from '../src/utils/kanbanColumns.js';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
bootstrap.window.close();

const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/crm/funnel/FunnelView.js', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom'], loader: { '.js': 'jsx' },
  define: { 'import.meta.env': '{"VITE_BACKEND_URL":"http://localhost:4318"}' },
  plugins: [{ name: 'mock-http-only', setup(builder) {
    builder.onResolve({ filter: /^axios$/ }, () => ({ path: 'axios', namespace: 'mock-http' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock-http' }, () => ({ contents:
      'export default config => globalThis.funnelFixture.axios(config);'
    }));
  } }]
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const View = module.exports.default;

const custom = (id, name) => ({ id, name, is_system: false, manual_move_allowed: true, affected_count: 999 });
const columns = () => {
  const system = Object.entries(SYSTEM_COLUMN_NAMES).map(([id, name]) => ({ id, name, is_system: true }));
  return [custom('custom_z', 'Звонок позже'), system[1], custom('custom_a', 'Анализ предложения'),
    system[0], system[2], custom('custom_empty', 'Пустой этап'), system[3], system[4]];
};
const lead = (id, status, extra = {}) => ({
  id, status, first_name: id, last_name: 'Тест', source: 'phone', priority: 'medium', ...extra
});
const leads = () => [
  lead('custom-card', 'new', { kanban_column_id: 'custom_z', linked_inquiries: [lead('repeat', 'new')] }),
  lead('proposal-card', 'new', { kanban_column_id: 'custom_a', source: 'website' }),
  lead('new-card', 'new'), lead('booked-card', 'contacted'), lead('confirmed-card', 'in_progress'),
  lead('arrived-card', 'converted'), lead('paid-card', 'closed'),
  lead('lost-card', 'lost'), lead('rejected-card', 'rejected'), lead('qualified-card', 'qualified'),
  lead('unknown-card', 'new', { kanban_column_id: 'custom_deleted' }),
  lead('stale-assignment', 'contacted', { kanban_column_id: 'custom_z' })
];

async function mount(context, overrides = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:4318' });
  const saved = new Map();
  const state = { columns: columns(), leads: leads(), failColumns: false, ...overrides };
  const requests = [];
  const install = (key, value) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };
  install('window', dom.window);
  install('document', dom.window.document);
  install('localStorage', dom.window.localStorage);
  install('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.setItem('token', 'synthetic-token');
  install('funnelFixture', { axios: async config => {
    const path = new URL(config.url).pathname;
    requests.push({ path, method: config.method, headers: config.headers });
    const data = path === '/api/crm/leads/kanban' ? state.leads
      : path === '/api/crm/leads/' ? state.leads.slice(0, 50).map(({ kanban_column_id, ...card }) => card)
      : path === '/api/crm/sources/' ? [] : path.includes('statistics') ? {} : [];
    return { data: structuredClone(data) };
  } });
  install('fetch', async (url, options) => {
    const path = new URL(url).pathname;
    requests.push({ path, ...options });
    assert.equal(path, '/api/crm/kanban/columns');
    return { ok: !state.failColumns, json: async () => structuredClone(
      state.failColumns ? { detail: 'Колонки недоступны' } : state.columns) };
  });
  const container = document.getElementById('root');
  const root = createRoot(container);
  context.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await act(async () => root.render(React.createElement(View, { user: { role: 'manager' } })));
  const click = async element => { assert.ok(element, 'click target exists'); await act(async () => element.click()); };
  const refresh = async () => act(async () => window.dispatchEvent(new window.Event('crm-kanban-changed')));
  return { container, state, requests, click, refresh };
}

const rows = container => [...container.querySelectorAll('[data-funnel-stage]')];
const counts = container => Object.fromEntries(rows(container).map(row => [
  row.getAttribute('data-funnel-stage'), Number(row.querySelector('[data-stage-count]').textContent)
]));
const buttonWith = (container, text) => [...container.querySelectorAll('button')].find(button => button.textContent.includes(text));

test('current stages follow shared kanban order and names, including empty custom and paid stages', async context => {
  const f = await mount(context);
  assert.deepEqual(rows(f.container).map(row => row.getAttribute('data-funnel-stage')), columns().map(column => column.id));
  assert.deepEqual(counts(f.container), {
    custom_z: 1, contacted: 2, custom_a: 1, new: 1, in_progress: 1, custom_empty: 0, converted: 1, closed: 1
  });
  assert.ok(f.requests.some(request => request.path === '/api/crm/leads/kanban'));
  assert.ok(!f.requests.some(request => request.path === '/api/crm/leads/'));
  assert.ok(f.requests.every(request => request.method.toUpperCase() === 'GET'));
  assert.ok(f.requests.every(request => request.headers.Authorization === 'Bearer synthetic-token'));
});

test('source filter preserves zero stages, counts, denominator and canonical drilldown', async context => {
  const f = await mount(context);
  await f.click(buttonWith(f.container, 'Сайт'));
  assert.equal(counts(f.container).custom_a, 1);
  assert.equal(Object.values(counts(f.container)).reduce((a, b) => a + b, 0), 1);
  assert.equal(rows(f.container).length, columns().length);
  await f.click(buttonWith(f.container, 'Анализ предложения'));
  assert.match(f.container.textContent, /proposal-card/);
  assert.doesNotMatch(f.container.textContent, /custom-card/);
  assert.match(f.container.textContent, /1 заявок/);
  await f.click(buttonWith(f.container, 'Все каналы'));
  await f.click(buttonWith(f.container, 'Звонок позже'));
  assert.match(f.container.textContent, /custom-card/);
  assert.doesNotMatch(f.container.textContent, /new-card|repeat/);
});

test('rename, reorder, add, move and deletion refresh in place without losing the source filter', async context => {
  const f = await mount(context);
  await f.click(buttonWith(f.container, 'Сайт'));
  f.state.columns[2].name = 'Переименован';
  f.state.columns = [custom('custom_added', 'Новый пустой'), ...f.state.columns.toReversed()];
  f.state.leads.find(card => card.id === 'proposal-card').kanban_column_id = 'custom_z';
  await f.refresh();
  assert.deepEqual(rows(f.container).map(row => row.getAttribute('data-funnel-stage')), f.state.columns.map(column => column.id));
  assert.ok(buttonWith(f.container, 'Переименован'));
  assert.equal(counts(f.container).custom_added, 0);
  assert.equal(counts(f.container).custom_z, 1);
  assert.equal(counts(f.container).custom_a, 0);
  f.state.columns = f.state.columns.filter(column => column.id !== 'custom_z');
  f.state.leads.filter(card => card.kanban_column_id === 'custom_z').forEach(card => { card.kanban_column_id = null; });
  await f.refresh();
  assert.equal(counts(f.container).new, 1);
  assert.ok(!buttonWith(f.container, 'Звонок позже'));
});

test('legacy and unknown assignments remain separate, inspectable and counted exactly once', async context => {
  const f = await mount(context);
  const historical = f.container.querySelector('[aria-label="Вне текущего канбана"]');
  assert.ok(historical);
  assert.match(historical.textContent, /Отказ.*1/);
  assert.match(historical.textContent, /Потеряны.*1/);
  assert.match(historical.textContent, /Квалифицированы.*1/);
  assert.match(historical.textContent, /Недоступный этап.*1/);
  const historyCounts = [...historical.querySelectorAll('[data-stage-count]')].map(item => Number(item.textContent));
  assert.equal(Object.values(counts(f.container)).reduce((a, b) => a + b, 0) + historyCounts.reduce((a, b) => a + b, 0), f.state.leads.length);
  await f.click(buttonWith(historical, 'Недоступный этап'));
  assert.match(f.container.textContent, /unknown-card/);
  assert.equal(counts(f.container).new, 1, 'unknown custom assignment is not silently reassigned');
});

test('conversion and loss summaries keep base-status formulas even for custom overrides', async context => {
  const cards = [lead('a', 'converted', { kanban_column_id: 'custom_z', kanban_override_source: 'whatsapp' }),
    lead('b', 'closed'), lead('c', 'new', { kanban_column_id: 'custom_a' }), lead('d', 'rejected')];
  const f = await mount(context, { leads: cards });
  assert.equal(counts(f.container).custom_z, 1);
  assert.equal(counts(f.container).converted, 0);
  const stats = [...f.container.querySelectorAll('[data-funnel-summary]')].map(item => item.textContent.replace(/\s+/g, ''));
  assert.deepEqual(stats, ['1Конвертированы25%конверсия', '1Потеряно25%отток', '1Вобработкеактивные']);
  const secondRow = rows(f.container)[1];
  assert.match(secondRow.previousElementSibling.textContent, /0%/);
});

test('full canonical collection includes cards beyond the old 50-row page, never linked inquiries', async context => {
  const cards = Array.from({ length: 123 }, (_, i) => lead(`card-${i}`, 'new', {
    kanban_column_id: 'custom_a', linked_inquiries: [lead(`repeat-${i}`, 'new')]
  }));
  const f = await mount(context, { leads: cards });
  assert.equal(counts(f.container).custom_a, 123);
  assert.match(f.container.textContent, /123 заявок/);
  assert.equal(Object.values(counts(f.container)).reduce((a, b) => a + b, 0), 123);
});

test('empty data displays every active column with zero', async context => {
  const f = await mount(context, { leads: [] });
  assert.equal(rows(f.container).length, columns().length);
  assert.ok(Object.values(counts(f.container)).every(count => count === 0));
});

test('column API failure shows retry instead of a hardcoded or partial funnel', async context => {
  const f = await mount(context, { failColumns: true });
  assert.match(f.container.querySelector('[role="alert"]').textContent, /Колонки недоступны/);
  assert.equal(rows(f.container).length, 0);
  f.state.failColumns = false;
  await f.click(buttonWith(f.container, 'Повторить'));
  assert.equal(rows(f.container).length, columns().length);
});
