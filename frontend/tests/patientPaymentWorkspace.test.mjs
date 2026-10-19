import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window; globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window; delete globalThis.document; bootstrap.window.close();
const compiled = await build({
  stdin: { contents: `export { default as Workspace } from './src/components/treatment/PatientPaymentWorkspace.jsx'; export { default as ServicePaymentList } from './src/components/treatment/ServicePaymentList.jsx';`, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom', 'react-dom/client'], define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://crm.test"}' },
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { Workspace, ServicePaymentList } = module.exports;
const normalized = node => node.textContent.replace(/[\s\u00a0\u202f]+/g, ' ').trim();
const button = (root, text) => [...root.querySelectorAll('button')].find(node => normalized(node).includes(text));
const plan = (id, total, paid = 0) => ({ id, title: `План ${id}`, created_at: '2026-10-18', total_cost: total, paid_amount: paid, accounting_events: [], payment_status: paid ? 'partially_paid' : 'unpaid', services: [{ service_id: `service-${id}`, service_row_id: `row-${id}`, service_name: `Услуга ${id}`, total_price: total, paid_amount: paid, quantity_total: 1, payment_status: paid ? 'partially_paid' : 'unpaid' }] });

async function mount(t, Component, props, writeResponse = null) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
  const writes = [], reads = [];
  const globals = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, alert() {}, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url, options = {}) => {
      if ((options.method || 'GET') !== 'GET') {
        assert.ok(writeResponse, 'Display actions must not issue payment commands');
        writes.push({ url: String(url), body: JSON.parse(options.body) });
        return { ok: true, json: async () => writeResponse };
      }
      reads.push(String(url));
      const data = String(url).endsWith('/payment-types') ? [{ id: 'cash', name: 'Касса' }] : String(url).endsWith('/consultation') ? null : writeResponse?.plan || writeResponse;
      return { ok: true, json: async () => data };
    } };
  const previous = new Map();
  for (const [key, value] of Object.entries(globals)) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  const container = document.getElementById('root'), root = createRoot(container);
  const render = async next => act(async () => root.render(React.createElement(Component, next)));
  await render(props);
  t.after(async () => { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  return { container, writes, reads, render, dom, click: async element => { assert.ok(element, 'control exists'); await act(async () => element.click()); } };
}

test('workspace selects one plan, preserves selection on updates, and recovers if it disappears', async t => {
  const plans = Array.from({ length: 12 }, (_, index) => plan(String(index + 1), (index + 1) * 1000));
  const ui = await mount(t, Workspace, { plans });
  const options = () => [...ui.container.querySelectorAll('.curai-r21-plan-option')];
  assert.equal(options().length, 12);
  assert.equal(options().filter(node => node.getAttribute('aria-pressed') === 'true').length, 1);
  await ui.click(options()[1]);
  assert.equal(ui.container.querySelector('.curai-r21-plan-details h4').textContent, 'План 2');
  assert.match(normalized(ui.container.querySelector('.curai-r21-selected-plan-action')), /2 000 ₸/);
  const updated = plans.map(p => p.id === '2' ? { ...p, paid_amount: 1000, services: [{ ...p.services[0], paid_amount: 1000 }] } : p);
  await ui.render({ plans: updated });
  assert.equal(options()[1].getAttribute('aria-pressed'), 'true');
  assert.match(normalized(ui.container.querySelector('.curai-r21-selected-plan-action')), /1 000 ₸/);
  assert.doesNotMatch(normalized(ui.container), /Прочее/);
  await ui.render({ plans: [plans[0]] });
  assert.equal(ui.container.querySelector('.curai-r21-plan-details h4').textContent, 'План 1');
  assert.equal(ui.writes.length, 0);
});

test('selected-plan footer sends auto-settlement only to the selected plan', async t => {
  const first = plan('first', 1000), selected = { ...plan('selected', 2000), payment_completion_policy: 'full_payment_v1' };
  const updated = { ...selected, paid_amount: 2000 };
  const ui = await mount(t, Workspace, { plans: [first, selected] }, { plan: updated });
  await ui.click(ui.container.querySelectorAll('.curai-r21-plan-option')[1]);
  await ui.click(button(ui.container, 'Оплатить остаток плана'));
  await ui.click(ui.container.querySelector('input[type="radio"]'));
  await ui.click(button(ui.container.querySelector('[role="dialog"]'), 'Оплатить 2'));
  assert.equal(ui.writes.length, 1);
  assert.ok(ui.writes[0].url.endsWith('/treatment-plans/selected/settle-remaining'));
  assert.equal(ui.writes[0].body.amount_kzt, 2000);
  assert.equal(ui.writes[0].body.discount_amount_kzt, 0);
  assert.equal(ui.writes[0].body.payment_method, 'cash');
  assert.equal(ui.writes[0].body.service_row_id, undefined, 'footer pays the selected plan, not just one row');
});

test('legacy selected-plan settlement keeps all commands within its plan id', async t => {
  const first = plan('first', 1000), selected = plan('legacy', 2000);
  delete selected.services[0].service_row_id; // Truly historical row, not a prospective ledger row.
  const ui = await mount(t, Workspace, { plans: [first, selected] }, { ...selected, paid_amount: 2000 });
  await ui.click(ui.container.querySelectorAll('.curai-r21-plan-option')[1]);
  await ui.click(button(ui.container, 'Оплатить остаток плана'));
  await ui.click(ui.container.querySelector('input[type="radio"]'));
  await ui.click(button(ui.container.querySelector('[role="dialog"]'), 'Оплатить 2'));
  assert.equal(ui.writes.length, 1);
  assert.ok(ui.writes.every(write => write.url.includes('/treatment-plans/legacy/')));
  assert.ok(ui.writes[0].url.endsWith('/services/service-legacy/mark-paid'));
  assert.deepEqual(ui.writes[0].body, { payment_method_id: 'cash', payment_method_name: 'Касса' });
});

test('complex and course disclosures retain shares, session balances and the next-session action', async t => {
  const complex = { service_id: 'package', service_row_id: 'row-package', service_name: 'Комплекс', is_complex: true, total_price: 30000, paid_amount: 18000, payment_status: 'partially_paid', components: [{ service_id: 'a', component_id: 'a', service_name: 'Компонент А', price: 30000, quantity: 1, paid: true, paid_amount: 18000 }, { service_id: 'b', component_id: 'b', service_name: 'Компонент Б', price: 20000, quantity: 1, paid: false, paid_amount: 0 }] };
  const course = { service_id: 'course', service_row_id: 'row-course', service_name: 'Курс', is_course: true, payment_type: 'per_session', total_price: 30000, paid_amount: 12000, price_per_unit: 6000, payment_status: 'partially_paid', sessions: Array.from({ length: 5 }, (_, i) => ({ session_id: `session-${i}`, price: 6000, paid_amount: i < 2 ? 6000 : 0, paid: i < 2 })) };
  const selected = { ...plan('mixed', 60000, 30000), payment_completion_policy: 'full_payment_v1', services: [complex, course] };
  const ui = await mount(t, ServicePaymentList, { plan: selected, layout: 'workspace' });
  await ui.click(ui.container.querySelectorAll('.curai-r21-service-toggle')[0]);
  const components = ui.container.querySelector('table[aria-label="Состав комплекса: Комплекс"]');
  assert.match(normalized(components), /18 000 ₸/);
  assert.match(normalized(components), /12 000 ₸/);
  assert.ok(components.querySelector('button[aria-label="Оплатить компонент: Компонент Б"]'));
  await ui.click(ui.container.querySelectorAll('.curai-r21-service-toggle')[1]);
  const sessions = ui.container.querySelector('table[aria-label="Процедуры курса: Курс"]');
  assert.equal(sessions.querySelector('tbody').children.length, 5);
  assert.deepEqual([...sessions.querySelector('tbody').children[2].cells].slice(0, 4).map(normalized), ['Процедура 3', '6 000 ₸', '0 ₸', '6 000 ₸']);
  await ui.click(ui.container.querySelector('button[aria-label="Оплатить следующую процедуру: Курс"]'));
  assert.match(normalized(ui.container.querySelector('[role="dialog"]')), /Оплатить 6 000 ₸/);
  assert.equal(ui.container.querySelector('select[aria-label="Тип скидки"]').disabled, true);
  assert.equal(ui.writes.length, 0);
});

test('a settled rerender removes the pinned action and does not subtract deposits twice', async t => {
  const initial = plan('settled', 10000, 4000);
  initial.deposit_amount = 4000;
  initial.accounting_events = [{ kind: 'service_deposit_allocation', amount_kzt: 4000 }];
  const ui = await mount(t, Workspace, { plans: [initial] });
  assert.match(normalized(ui.container.querySelector('.curai-r21-total-due')), /6 000 ₸/);
  const updated = { ...initial, paid_amount: 9000, services: [{ ...initial.services[0], paid_amount: 9000, discount_amount: 1000, payment_status: 'paid' }] };
  await ui.render({ plans: [updated] });
  assert.ok(!button(ui.container, 'Оплатить остаток плана'));
  assert.match(normalized(ui.container), /План лечения полностью оплачен/);
  assert.equal(normalized(ui.container.querySelector('.curai-r21-total-due')), 'Оплачено');
  assert.equal(ui.writes.length, 0);
});
