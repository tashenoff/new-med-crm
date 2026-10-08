import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
bootstrap.window.close();

async function compile(path, mockAxios = false) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, write: false,
    platform: 'node', format: 'cjs', external: ['react', 'react-dom'], loader: { '.js': 'jsx' }, define: { 'import.meta.env': '{}' },
    plugins: mockAxios ? [{ name: 'axios-fixture', setup(builder) {
      builder.onResolve({ filter: /^axios$/ }, () => ({ path: 'axios', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export default globalThis.ledgerAxios;' }));
    } }] : [] });
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
  return loaded.exports.default || loaded.exports;
}
const ServicePaymentList = await compile('../src/components/treatment/ServicePaymentList.jsx');
const TreatmentPlanView = await compile('../src/components/treatment/TreatmentPlanView.jsx');
const AppointmentsSchedule = await compile('../src/components/treatment/AppointmentsSchedule.jsx');
const AppointmentModal = await compile('../src/components/modals/AppointmentModal.js');

async function mount(context, Component, props, responder = () => []) {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'http://localhost' });
  const requests = [];
  const alerts = [];
  const globals = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
    alert: message => alerts.push(message), fetch: async (url, options = {}) => {
      const body = options.body && JSON.parse(options.body);
      requests.push({ url: String(url), body, options });
      const result = responder(String(url), body);
      return { ok: result?.ok !== false, json: async () => result?.data ?? result };
    } };
  const saved = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const container = dom.window.document.getElementById('root');
  const root = createRoot(container);
  context.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  await act(async () => root.render(React.createElement(Component, props)));
  const click = async element => { assert.ok(element, 'required control exists'); await act(async () => element.click()); };
  const change = async (element, value) => {
    assert.ok(element, 'required input exists');
    const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    await act(async () => element.dispatchEvent(new dom.window.Event('change', { bubbles: true })));
    await act(async () => element.dispatchEvent(new dom.window.Event('input', { bubbles: true })));
  };
  return { container, requests, alerts, click, change };
}
const makePlan = id => ({ id, title: 'План', created_at: '2026-01-01', total_cost: 1000, deposit_amount: 1000, paid_amount: 0,
  services: [{ service_id: 'service', name: 'Услуга', total_price: 1000, quantity_total: 2, quantity_completed: 0, payment_status: 'unpaid' }] });
const button = (container, text) => [...container.querySelectorAll('button')].find(element => element.textContent.includes(text));

test('service UI requires funding and actual amount; partial receipt/discount retries keep operation ID', async context => {
  const plan = makePlan('service-ui');
  let attempts = 0;
  const ui = await mount(context, ServicePaymentList, { plan }, (url, body) => {
    if (url.includes('payment-types')) return [{ id: 'cash', name: 'Касса' }];
    if (!body) return null;
    attempts++;
    return attempts === 1 ? { ok: false, data: { detail: 'retry' } } : plan;
  });
  await ui.click(ui.container.querySelector('button'));
  await ui.click([...ui.container.querySelectorAll('button')].filter(element => element.textContent.includes('Оплатить')).at(-1));
  const pay = () => button(ui.container, 'Оплатить 1');
  await ui.click(pay());
  assert.equal(ui.requests.filter(request => request.body).length, 0);
  await ui.change(ui.container.querySelector('[aria-label="Источник оплаты"]'), 'cash');
  await ui.click(ui.container.querySelector('input[type="radio"]'));
  await ui.change(ui.container.querySelector('[aria-label="Фактически получено, ₸"]'), '800');
  await ui.change(ui.container.querySelector('input[placeholder="Сумма скидки, ₸"]'), '100');
  await ui.click(button(ui.container, 'Оплатить 8'));
  await ui.click(button(ui.container, 'Оплатить 8'));
  const requests = ui.requests.filter(request => request.body);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.amount, 800);
  assert.equal(requests[0].body.discount_amount, 100);
  assert.equal(requests[0].body.funding_source, 'cash');
  assert.equal(requests[0].body.operation_id, requests[1].body.operation_id);
});

test('advance never hides the explicit remaining service allocation; add-deposit is a plan advance only', async context => {
  const ui = await mount(context, ServicePaymentList, { plan: makePlan('advance-ui') });
  await ui.click(ui.container.querySelector('button'));
  assert.ok(button(ui.container, 'Оплатить остаток'));
  assert.ok(button(ui.container, 'Внести аванс'));
  assert.match(ui.container.textContent, /не начисляется/i);
});

test('procedure completion retries carry stable occurrence and operation IDs', async context => {
  let attempts = 0;
  const ui = await mount(context, TreatmentPlanView, { plan: makePlan('completion-ui') }, (url, body) => {
    if (body) attempts++;
    return { ok: attempts > 1, data: makePlan('completion-ui') };
  });
  await ui.click(button(ui.container, 'Отметить'));
  await ui.click(button(ui.container, 'Отметить'));
  const writes = ui.requests.filter(request => request.options.method === 'POST');
  assert.equal(writes.length, 2);
  assert.ok(writes[0].body?.occurrence_id);
  assert.ok(writes[0].body?.operation_id);
  assert.deepEqual(writes[0].body, writes[1].body);
});

test('course schedule offers explicit session payment and completion with stable server ID', async context => {
  const plan = makePlan('course-ui');
  plan.services[0] = { ...plan.services[0], is_course: true, course_payment_type: 'per_session', price_per_unit: 1000,
    sessions: [{ session_id: 'server-session', date: new Date().toISOString(), completed: false, paid: false }] };
  const ui = await mount(context, AppointmentsSchedule, { patientId: 'patient' }, (url, body) => body ? plan : [plan]);
  await ui.click(button(ui.container, 'Оплатить сеанс'));
  await ui.change(ui.container.querySelector('[aria-label="Фактически получено за сеанс, ₸"]'), '700');
  await ui.click(button(ui.container, 'Подтвердить оплату'));
  await ui.click(button(ui.container, 'Завершить сеанс'));
  const writes = ui.requests.filter(request => request.body);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].body.amount_kzt, 700);
  assert.equal(writes[0].body.session_id, 'server-session');
  assert.ok(writes[0].body.operation_id);
  assert.equal(writes[1].body.session_id, 'server-session');
  assert.ok(writes[1].body.operation_id);
});

test('appointment form and both API writers use ledger validation and completion commands', async () => {
  const source = await readFile(new URL('../src/components/modals/AppointmentModal.js', import.meta.url), 'utf8');
  assert.match(source, /Назначение платежа/);
  assert.match(source, /value="consultation"/);
  assert.match(source, /value="plan_advance"/);
  assert.match(source, /appointmentPayment\(/);
  for (const path of ['../src/hooks/useAppointments.js', '../src/api/appointments.js', '../src/hooks/useApi.js']) {
    const writer = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(writer, /appointmentPayment\(/);
    assert.match(writer, /ledgerCommands.run/);
    assert.match(writer, /status === 'completed'/);
  }
});

test('course completion in procedure view selects a concrete session, not an anonymous occurrence', async context => {
  const plan = makePlan('course-procedure');
  plan.services[0].is_course = true;
  plan.services[0].sessions = [{ session_id: 'next-session', completed: false }];
  const ui = await mount(context, TreatmentPlanView, { plan }, () => plan);
  await ui.click(button(ui.container, 'Отметить'));
  const write = ui.requests.find(request => request.options.method === 'POST');
  assert.equal(write.body.session_id, 'next-session');
  assert.ok(write.body.operation_id);
});

test('both appointment APIs send validated purposes and retry completion without duplicate requests', async context => {
  const requests = [];
  let fail = true;
  const send = async (url, body) => { requests.push({ url, body }); if (fail) throw new Error('retry'); return { data: { id: 'appointment' } }; };
  const client = { post: send, put: send, patch: send, interceptors: { request: { use() {} }, response: { use() {} } } };
  globalThis.ledgerAxios = { ...client, create: () => client };
  context.after(() => { delete globalThis.ledgerAxios; });
  const { useAppointments } = await compile('../src/hooks/useAppointments.js', true);
  const { appointmentsApi } = await compile('../src/api/appointments.js', true);
  const useApi = await compile('../src/hooks/useApi.js', true);
  let hook;
  let legacyHook;
  function Fixture() { hook = useAppointments(); legacyHook = useApi(); return null; }
  await mount(context, Fixture, {});
  for (const payment_purpose of ['consultation', 'plan_advance']) {
    fail = false;
    const result = await act(async () => hook.createAppointment({ payment_purpose, actual_amount_kzt: '500', payment_method: 'cash', patient_id: payment_purpose }));
    assert.equal(result.success, true);
    const body = requests.at(-1).body;
    assert.equal(body.actual_amount_kzt, 500);
    assert.equal(body.payment_purpose, payment_purpose);
    assert.ok(body.operation_id);
  }
  const before = requests.length;
  await act(async () => hook.createAppointment({ deposit: 500 }));
  assert.equal(requests.length, before);
  for (const [index, updateStatus] of [hook.updateAppointmentStatus, appointmentsApi.updateStatus].entries()) {
    fail = true;
    const id = `status-${index}`;
    await act(async () => updateStatus(id, 'completed'));
    fail = false;
    await act(async () => Promise.all([updateStatus(id, 'completed'), updateStatus(id, 'completed')]));
    const writes = requests.filter(request => request.url.includes(id));
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[0].body, writes[1].body);
    assert.ok(writes[0].body.operation_id);
  }
  fail = false;
  await act(async () => legacyHook.createAppointment({ payment_purpose: 'plan_advance', actual_amount_kzt: '900', payment_method: 'card' }));
  assert.equal(requests.at(-1).body.actual_amount_kzt, 900);
  assert.ok(requests.at(-1).body.operation_id);
});

test('appointment modal purpose is a required explicit receipt choice and historical deposits are not resubmitted', async context => {
  const saved = [];
  const form = { patient_id: 'patient', doctor_id: 'doctor', appointment_date: '2026-10-08', appointment_time: '10:00', end_time: '10:30', deposit: 500 };
  const ui = await mount(context, AppointmentModal, { show: true, editingItem: { id: 'modal-appointment', deposit: 500 }, appointmentForm: form,
    patients: [{ id: 'patient', full_name: 'Пациент' }], doctors: [], appointments: [], onSave: payload => saved.push(payload) });
  ui.container = document.body;
  const submit = async () => act(async () => ui.container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  await submit();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].deposit, undefined);
  assert.equal(saved[0].payment_purpose, undefined);
  await ui.change(ui.container.querySelector('[aria-label="Назначение платежа"]'), 'plan_advance');
  await submit();
  assert.equal(saved.length, 1);
  await ui.change(ui.container.querySelector('[aria-label="Фактически получено, ₸"]'), '400');
  await ui.change(ui.container.querySelector('[aria-label="Способ оплаты"]'), 'cash');
  await submit();
  await submit();
  assert.equal(saved[1].payment_purpose, 'plan_advance');
  assert.equal(saved[1].actual_amount_kzt, 400);
  assert.equal(saved[1].operation_id, saved[2].operation_id);
});

test('complex remaining payments require exact component amounts and partial-batch retry does not repay acknowledged components', async context => {
  const plan = makePlan('complex-batch');
  plan.services[0] = { ...plan.services[0], is_complex: true, price: 1000, quantity: 1,
    components: [{ service_id: 'first', name: 'Первая', price: 600 }, { service_id: 'second', name: 'Вторая', price: 400 }] };
  const writes = [];
  let failSecond = true;
  const ui = await mount(context, ServicePaymentList, { plan }, (url, body) => {
    if (url.includes('payment-types')) return [{ id: 'cash', name: 'Касса' }];
    if (!body) return null;
    writes.push({ url, body });
    return url.includes('/second/') && failSecond ? { ok: false, data: { detail: 'retry' } } : plan;
  });
  await ui.click(ui.container.querySelector('button'));
  await ui.click(button(ui.container, 'Оплатить всё'));
  await ui.change(ui.container.querySelector('[aria-label="Источник оплаты"]'), 'cash');
  await ui.click(ui.container.querySelector('input[type="radio"]'));
  await ui.click(button(ui.container, 'Оплатить 1'));
  assert.equal(writes.length, 0);
  await ui.change(ui.container.querySelector('[aria-label="Сумма распределения service:first"]'), '500');
  await ui.change(ui.container.querySelector('[aria-label="Сумма распределения service:second"]'), '300');
  await ui.click(button(ui.container, 'Оплатить 1'));
  failSecond = false;
  await ui.click(button(ui.container, 'Оплатить 1'));
  assert.equal(writes.length, 3);
  assert.equal(writes.filter(write => write.url.includes('/first/')).length, 1);
  assert.equal(writes[0].body.amount, 500);
  assert.equal(writes[1].body.amount, 300);
  assert.equal(writes[1].body.operation_id, writes[2].body.operation_id);
  assert.notEqual(writes[0].body.operation_id, writes[1].body.operation_id);
});

test('advance deposit receipt has explicit purpose and operation ID; closing/reopening failed payment preserves request', async context => {
  const plan = makePlan('deposit-retry');
  const ui = await mount(context, ServicePaymentList, { plan }, (url, body) => url.includes('payment-types')
    ? [{ id: 'cash', name: 'Касса' }] : body ? { ok: false, data: { detail: 'retry' } } : null);
  await ui.click(ui.container.querySelector('button'));
  await ui.click(button(ui.container, 'Внести аванс'));
  await ui.change(ui.container.querySelector('[aria-label="Источник оплаты"]'), 'cash');
  await ui.click(ui.container.querySelector('input[type="radio"]'));
  await ui.change(ui.container.querySelector('[aria-label="Фактически получено, ₸"]'), '200');
  await ui.click(button(ui.container, 'Оплатить 2'));
  await ui.click(button(ui.container, '×'));
  await ui.click(button(ui.container, 'Внести аванс'));
  assert.equal(ui.container.querySelector('[aria-label="Фактически получено, ₸"]').value, '200');
  await ui.click(button(ui.container, 'Оплатить 2'));
  const writes = ui.requests.filter(request => request.body);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].body.payment_purpose, 'plan_advance');
  assert.equal(writes[0].body.amount, 200);
  assert.equal(writes[0].body.operation_id, writes[1].body.operation_id);
  assert.ok(writes.every(write => write.url.endsWith('/add-deposit')));
});

test('course receipt summary uses actual server amount and remaining plan payments target stable sessions', async context => {
  const plan = makePlan('session-summary');
  plan.services[0] = { ...plan.services[0], is_course: true, course_payment_type: 'per_session', price_per_unit: 1000,
    sessions: [{ session_id: 'paid-session', paid: true, paid_amount: 250 }, { session_id: 'unpaid-session', paid: false }] };
  const ui = await mount(context, ServicePaymentList, { plan }, url => url.includes('payment-types') ? [{ id: 'cash', name: 'Касса' }] : null);
  await ui.click(ui.container.querySelector('button'));
  assert.match(ui.container.textContent, /250\s*₸/);
  await ui.click(button(ui.container, 'Оплатить остаток'));
  assert.ok(ui.container.querySelector('[aria-label="Сумма распределения service:unpaid-session"]'));
  assert.equal(Boolean(ui.container.querySelector('input[placeholder="Сумма скидки, ₸"]')), false);
});

test('explicit advance allocations require server-reported unallocated balance and never create a new cash receipt', async context => {
  const plan = makePlan('advance-allocation');
  plan.advance_balance_kzt = 300;
  const ui = await mount(context, ServicePaymentList, { plan }, (url, body) => url.includes('payment-types') ? [{ id: 'cash', name: 'Касса' }] : body ? plan : null);
  await ui.click(ui.container.querySelector('button'));
  await ui.click([...ui.container.querySelectorAll('button')].filter(element => element.textContent.includes('Оплатить')).at(-1));
  await ui.change(ui.container.querySelector('[aria-label="Источник оплаты"]'), 'cash');
  await ui.click(ui.container.querySelector('input[type="radio"]'));
  await ui.change(ui.container.querySelector('[aria-label="Источник оплаты"]'), 'plan_advance');
  await ui.change(ui.container.querySelector('[aria-label="Фактически получено, ₸"]'), '400');
  await ui.click(button(ui.container, 'Оплатить 4'));
  assert.equal(ui.requests.filter(request => request.body).length, 0);
  await ui.change(ui.container.querySelector('[aria-label="Фактически получено, ₸"]'), '200');
  await ui.click(button(ui.container, 'Оплатить 2'));
  const write = ui.requests.find(request => request.body);
  assert.equal(write.body.funding_source, 'plan_advance');
  assert.equal(write.body.amount, 200);
  assert.equal(write.body.payment_method_id, undefined);
  assert.ok(write.body.operation_id);
});
