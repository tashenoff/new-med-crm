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

test('laboratory analysis creation projects standalone services without inherited doctor assignments', async () => {
  const source = await readFile(new URL('../src/components/modals/PatientModal.js', import.meta.url), 'utf8');
  const start = source.indexOf('const handleAddLabAnalyzes = async (items) => {');
  const end = source.indexOf('const handleSaveTreatmentPlan =', start);
  assert.ok(start >= 0 && end > start);
  const requests = [];
  const refreshes = [];
  const handleAdd = new Function('editingItem', 'localStorage', 'API', 'fetch', 'fetchTreatmentPlans',
    'refreshTreatmentPlans', 'showSuccess', 'alert', `${source.slice(start, end)}; return handleAddLabAnalyzes;`)(
    { id: 'patient', doctor_id: 'patient-doctor' }, { getItem: () => 'token' }, 'http://localhost',
    async (url, options) => { requests.push({ url, options, body: JSON.parse(options.body) }); return { ok: true }; },
    () => refreshes.push('plans'), () => refreshes.push('payments'), () => {}, assert.fail);
  await handleAdd([{ id: 'analysis', service_name: 'Анализ крови', price: 1000, laboratory_id: 'lab',
    laboratory_name: 'Лаборатория', doctor_id: 'catalog-doctor', doctor_name: 'Врач',
    doctors: [{ doctor_id: 'catalog-doctor' }], assigned_doctor_id: 'assigned-doctor' }]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://localhost/api/patients/patient/treatment-plans');
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(requests[0].body.services, [{ service_id: 'analysis', service_name: 'Анализ крови',
    category: 'Лаборатория', unit: 'анализ', unit_price: 1000, price: 1000, quantity: 1, total_price: 1000,
    laboratory_id: 'lab', laboratory_name: 'Лаборатория' }]);
  assert.deepEqual(requests[0].body.appointment_ids, []);
  assert.equal(requests[0].body.doctor_id, undefined);
  assert.equal(requests[0].body.total_cost, 1000);
  assert.deepEqual(refreshes, ['plans', 'payments']);
});

test('consultation-sheet service without deposit sends a valid ledger receipt', async context => {
  const plan = { ...makePlan('consultation-no-deposit'), deposit_amount: 0, accounting_events: [],
    services: [{ service_id: 'consultation-service', service_row_id: 'consultation-row', service_name: 'Услуга из консультационного листа',
      total_price: 1000, paid_amount: 0, discount_amount: 0, payment_status: 'unpaid' }] };
  const updated = [];
  const ui = await mount(context, ServicePaymentList, { plan, onUpdate: value => updated.push(value) }, (url, body) => {
    if (url.includes('payment-types')) return [{ id: 'cash', name: 'Касса' }];
    const validLedgerReceipt = body?.operation_id && url.endsWith('/api/treatment-plans/consultation-no-deposit/service-rows/consultation-row/receipts')
      && body.amount_kzt === 1000 && body.discount_amount_kzt === 0
      && body.payment_source === 'cash' && body.payment_method === 'cash' && body.payment_method_id === 'cash';
    return { ok: Boolean(validLedgerReceipt), data: { event: { kind: 'service_receipt' }, plan } };
  });
  await ui.click(ui.container.querySelector('button'));
  await ui.click([...ui.container.querySelectorAll('button')].find(element => element.textContent.includes('Оплатить') && !element.textContent.includes('остаток')));
  await ui.click(ui.container.querySelector('input[type="radio"]'));
  await ui.click([...ui.container.querySelectorAll('button')].filter(element => element.textContent.includes('Оплатить')).at(-1));
  assert.equal(updated.length, 1, 'server should accept the ledger receipt');
  assert.deepEqual(updated, [plan], 'the UI callback must receive the plan, not the event envelope');
  assert.equal(ui.alerts.length, 0);
  const request = ui.requests.find(item => item.body);
  assert.ok(request.url.endsWith('/api/treatment-plans/consultation-no-deposit/service-rows/consultation-row/receipts'));
  assert.equal(request.body.amount_kzt, 1000);
  assert.equal(request.body.discount_amount_kzt, 0);
  assert.equal(request.body.payment_source, 'cash');
  assert.equal(request.body.payment_method, 'cash');
  assert.equal(request.body.payment_method_id, 'cash');
  assert.match(request.body.operation_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('no-deposit ledger complex component payment sends the official receipt and unwraps the plan', async context => {
  const component = { service_id: 'component-consultation', component_id: 'component-row-consultation',
    service_name: 'Консультация', doctor_id: 'doctor-consultation', price: 100000, quantity: 1, paid: false };
  const service = { service_id: 'complex-consultations', service_row_id: 'row-complex-consultations',
    service_name: 'Комплекс консультаций', is_complex: true, price: 80000, total_price: 80000, quantity: 1,
    paid_amount: 0, discount_amount: 0, payment_status: 'unpaid', components: [component,
      { service_id: 'component-review', component_id: 'component-row-review', service_name: 'Осмотр',
        doctor_id: 'doctor-review', price: 60000, quantity: 1, paid: false }] };
  const plan = { ...makePlan('complex-no-deposit'), total_cost: service.total_price, deposit_amount: 0,
    accounting_events: [], services: [service] };
  const method = { id: 'kaspi', name: 'Kaspi' };
  const componentShare = service.price * component.price / service.components.reduce((sum, item) => sum + item.price, 0);
  const discountAmount = 0;
  const receiptAmount = componentShare - discountAmount;
  const path = `/api/treatment-plans/${plan.id}/complex-services/${service.service_id}/components/${component.service_id}/mark-paid`;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const responsePlan = { ...plan, paid_amount: receiptAmount,
    accounting_events: [{ kind: 'component_receipt', amount_kzt: receiptAmount }],
    services: [{ ...service, paid_amount: receiptAmount, components: [
      { ...component, paid: true, paid_amount: receiptAmount }, service.components[1]] }] };
  const updated = [];
  const ui = await mount(context, ServicePaymentList, { plan, onUpdate: value => updated.push(value) }, (url, body) => {
    if (url.endsWith('/api/payment-types') && !body) return [method];
    const valid = url.endsWith(path) && uuid.test(body?.operation_id)
      && body.service_row_id === service.service_row_id && body.component_id === component.component_id
      && body.amount_kzt === receiptAmount && body.discount_amount_kzt === discountAmount
      && body.payment_source === 'cash' && body.payment_method === method.id
      && body.payment_method_id === method.id && body.payment_method_name === method.name;
    return valid ? { event: responsePlan.accounting_events[0], plan: responsePlan }
      : { ok: false, data: { detail: 'HTTP 422: official component receipt fields required' } };
  });
  await ui.click(ui.container.querySelector('button'));
  await ui.click([...ui.container.querySelectorAll('button')].find(element => element.textContent.trim() === 'Оплатить'));
  const radio = ui.container.querySelector('input[type="radio"]');
  assert.equal(radio?.checked, false, 'payment method must be explicitly selected');
  await ui.click(radio);
  assert.equal(radio.checked, true);
  await ui.click([...ui.container.querySelectorAll('button')].filter(element => element.textContent.includes('Оплатить')).at(-1));
  const writes = ui.requests.filter(request => request.options.method === 'POST');
  assert.equal(writes.length, 1);
  const request = writes[0];
  assert.ok(request.url.endsWith(path));
  assert.match(request.body.operation_id || '', uuid, 'component receipt requires a UUID operation_id');
  assert.equal(request.body.service_row_id, service.service_row_id);
  assert.equal(request.body.component_id, component.component_id);
  assert.equal(componentShare, 50000);
  assert.equal(request.body.amount_kzt, receiptAmount);
  assert.equal(request.body.discount_amount_kzt, discountAmount);
  assert.equal(request.body.payment_source, 'cash');
  assert.equal(request.body.payment_method, method.id);
  assert.equal(request.body.payment_method_id, method.id);
  assert.equal(request.body.payment_method_name, method.name);
  assert.equal(ui.alerts.length, 0, 'server should accept the official component receipt');
  assert.deepEqual(updated, [responsePlan], 'onUpdate must receive response.plan || response, not the envelope');
});

test('ledger receipt requires payment method selection before final payment', async context => {
  const plan = { ...makePlan('method-required'), deposit_amount: 0, accounting_events: [],
    services: [{ service_id: 'service', service_row_id: 'row', service_name: 'Service',
      total_price: 1000, paid_amount: 0, discount_amount: 0, payment_status: 'unpaid' }] };
  const ui = await mount(context, ServicePaymentList, { plan }, (url, body) => {
    if (url.includes('payment-types')) return [{ id: 'cash', name: 'Касса' }];
    return { event: { kind: 'service_receipt' }, plan };
  });
  await ui.click(ui.container.querySelector('button'));
  await ui.click([...ui.container.querySelectorAll('button')].find(element => element.textContent.includes('Оплатить') && !element.textContent.includes('остаток')));
  const method = ui.container.querySelector('input[type="radio"]');
  const finalAction = [...ui.container.querySelectorAll('button')].at(-1);
  const writes = () => ui.requests.filter(request => request.options.method === 'POST');
  assert.ok(method, 'available payment method exists');
  assert.equal(method.checked, false);
  assert.equal(writes().length, 0, 'opening payment must not write a receipt');
  assert.equal(finalAction.disabled, true, 'final payment must be disabled until a method is selected');
  await ui.click(finalAction);
  assert.equal(writes().length, 0, 'no POST is allowed before selecting a payment method');
  await ui.click(method);
  assert.equal(method.checked, true);
  assert.equal(finalAction.disabled, false, 'selecting a method enables final payment');
  await ui.click(finalAction);
  assert.equal(writes().length, 1);
  const receipt = writes()[0];
  assert.ok(receipt.url.endsWith('/api/treatment-plans/method-required/service-rows/row/receipts'));
  assert.equal(receipt.body.payment_source, 'cash');
  assert.equal(receipt.body.payment_method, 'cash');
  assert.equal(receipt.body.payment_method_id, 'cash');
});

test('doctor-free analysis payment keeps payment-type selection and fixed discount without ledger fields', async context => {
  const plan = makePlan('analysis-fixed');
  plan.services[0] = { service_id: 'analysis', service_name: 'Анализ крови', unit: 'анализ', laboratory_id: 'lab', total_price: 1000, payment_status: 'unpaid' };
  const updated = [];
  const ui = await mount(context, ServicePaymentList, { plan, onUpdate: value => updated.push(value) }, (url, body) => {
    if (url.includes('payment-types')) return [{ id: 'cash', name: 'Касса' }];
    return body ? plan : null;
  });
  await ui.click(ui.container.querySelector('button'));
  await ui.click([...ui.container.querySelectorAll('button')].filter(element => element.textContent.includes('Оплатить')).at(-1));
  assert.ok(ui.requests.some(request => request.url.endsWith('/api/payment-types')));
  assert.equal(ui.container.querySelector('[aria-label="Источник оплаты"]'), null);
  assert.equal(ui.container.querySelector('[aria-label="Фактически получено, ₸"]'), null);
  assert.equal(ui.container.querySelector('[aria-label^="Сумма распределения"]'), null);
  await ui.click(ui.container.querySelector('input[type="radio"]'));
  await ui.change(ui.container.querySelector('input[placeholder="Сумма скидки, ₸"]'), '100');
  await ui.click(button(ui.container, 'Оплатить 900'));
  const requests = ui.requests.filter(request => request.body);
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.endsWith('/api/treatment-plans/analysis-fixed/services/analysis/mark-paid'));
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(requests[0].body, { payment_method_id: 'cash', payment_method_name: 'Касса', amount: 900 });
  assert.deepEqual(updated, [plan]);
});

test('existing deposit covering the plan hides remaining debt without new advance controls', async context => {
  const ui = await mount(context, ServicePaymentList, { plan: { ...makePlan('covered-deposit'), paid_amount: 1000 } });
  await ui.click(ui.container.querySelector('button'));
  assert.equal(button(ui.container, 'Оплатить остаток'), undefined);
  assert.equal(button(ui.container, 'Внести аванс'), undefined);
  assert.doesNotMatch(ui.container.textContent, /начисляется|распределение/i);
  assert.equal(ui.requests.filter(request => request.body).length, 0);
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

const receiptFields = ['payment_purpose', 'actual_amount_kzt', 'funding_source', 'advance_amount', 'advance_amount_kzt', 'plan_advance', 'plan_advance_amount', 'plan_id', 'treatment_plan_id'];
const assertDepositPayload = (payload, deposit, deposit_type) => {
  assert.equal(payload.deposit, deposit);
  assert.equal(payload.deposit_type, deposit_type);
  for (const field of receiptFields) assert.equal(Object.hasOwn(payload, field), false, `${field} must not be emitted`);
};

for (const writer of ['useAppointments', 'appointmentsApi', 'useApi']) {
  for (const action of ['create', 'update']) {
    for (const [deposit_type, deposit] of [['fixed', 500.5], ['percent', 25]]) {
      test(`${writer} ${action} preserves ${deposit_type} deposit without purpose or method`, async context => {
        const requests = [];
        const send = async (url, body) => { requests.push({ url, body }); return { data: { id: 'appointment' } }; };
        const client = { post: send, put: send, interceptors: { request: { use() {} }, response: { use() {} } } };
        globalThis.ledgerAxios = { ...client, create: () => client };
        context.after(() => { delete globalThis.ledgerAxios; });
        let api;
        if (writer === 'appointmentsApi') {
          api = (await compile('../src/api/appointments.js', true)).appointmentsApi;
        } else {
          const module = await compile(writer === 'useApi' ? '../src/hooks/useApi.js' : '../src/hooks/useAppointments.js', true);
          const useHook = writer === 'useApi' ? module : module.useAppointments;
          function Fixture() { api = useHook(); return null; }
          await mount(context, Fixture, {});
        }
        const input = { patient_id: 'patient', price: 10000, deposit, deposit_type };
        let result;
        await act(async () => {
          result = writer === 'appointmentsApi'
            ? await (action === 'create' ? api.create(input) : api.update('appointment', input))
            : await (action === 'create' ? api.createAppointment(input) : api.updateAppointment('appointment', input));
        });
        if (writer !== 'useApi') assert.equal(result.success, true, result.error);
        assert.equal(requests.length, 1, 'deposit submits exactly one API request');
        assert.ok(requests[0].url.endsWith(action === 'create' ? '/appointments' : '/appointments/appointment'));
        assertDepositPayload(requests[0].body, deposit, deposit_type);
      });
    }
  }
}

const modalForm = { patient_id: 'patient', doctor_id: 'doctor', appointment_date: '2026-10-08', appointment_time: '10:00', end_time: '10:30', price: 10000 };
async function depositModal(context, depositFields) {
  const saved = [];
  const ui = await mount(context, AppointmentModal, { show: true, editingItem: { id: 'modal-appointment' },
    appointmentForm: { ...modalForm, ...depositFields }, patients: [{ id: 'patient', full_name: 'Пациент' }],
    doctors: [], appointments: [], onSave: payload => saved.push(payload) });
  ui.container = document.body;
  return { ...ui, saved, submit: async () => act(async () => ui.container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))) };
}

test('AppointmentModal contains no new receipt or payment-purpose UI', async context => {
  const ui = await depositModal(context, { deposit: '', deposit_type: '' });
  for (const text of ['Новый платеж', 'Назначение платежа', 'Оплата консультации', 'Аванс на план лечения']) {
    assert.equal(ui.container.textContent.includes(text), false, `forbidden UI: ${text}`);
  }
});

test('AppointmentModal renders no-deposit and established fixed deposit controls and submits chosen amount', async context => {
  const ui = await depositModal(context, { deposit: '', deposit_type: '' });
  const type = [...ui.container.querySelectorAll('select')].find(element => [...element.options].some(option => option.textContent === 'Без депозита'));
  assert.ok(type, 'old no-deposit selector exists');
  assert.equal(type.value, '');
  assert.ok([...type.options].some(option => option.value === 'fixed' && option.textContent === 'Фиксированная сумма'));
  await ui.submit();
  assert.equal(ui.saved.length, 1);
  assertDepositPayload(ui.saved[0], '', '');
  await ui.change(type, 'fixed');
  const amount = ui.container.querySelector('input[type="number"][step="0.01"][placeholder="0"]');
  await ui.change(amount, '1250.50');
  await ui.submit();
  assert.equal(ui.saved.length, 2);
  assertDepositPayload(ui.saved[1], '1250.50', 'fixed');
});

for (const [deposit_type, deposit] of [['fixed', '500.50'], ['percent', '25']]) {
  test(`AppointmentModal renders and submits existing ${deposit_type} deposit unchanged`, async context => {
    const ui = await depositModal(context, { deposit, deposit_type });
    const amount = ui.container.querySelector(deposit_type === 'percent'
      ? 'input[type="number"][step="1"][max="100"][placeholder="0-100"]'
      : 'input[type="number"][step="0.01"][placeholder="0"]');
    assert.ok(amount, `${deposit_type} deposit amount control exists`);
    assert.equal(amount.value, deposit);
    await ui.submit();
    assert.equal(ui.saved.length, 1);
    assertDepositPayload(ui.saved[0], deposit, deposit_type);
  });
}

test('complex payments retain component and remaining endpoints without allocation writers', async context => {
  const plan = makePlan('complex-batch');
  plan.services[0] = { ...plan.services[0], is_complex: true, price: 1000, quantity: 1,
    components: [{ service_id: 'first', name: 'Первая', price: 600 }, { service_id: 'second', name: 'Вторая', price: 400 }] };
  const ui = await mount(context, ServicePaymentList, { plan }, (url, body) => {
    if (url.includes('payment-types')) return [{ id: 'cash', name: 'Касса' }];
    return body ? plan : null;
  });
  await ui.click(ui.container.querySelector('button'));
  await ui.click([...ui.container.querySelectorAll('button')].find(element => element.textContent.trim() === 'Оплатить'));
  await ui.click(ui.container.querySelector('input[type="radio"]'));
  await ui.change(ui.container.querySelector('input[placeholder="Сумма скидки, ₸"]'), '100');
  await ui.click(button(ui.container, 'Оплатить 500'));
  await ui.click(button(ui.container, 'Оплатить всё'));
  await ui.click(ui.container.querySelector('input[type="radio"]'));
  assert.equal(ui.container.querySelector('[aria-label^="Сумма распределения"]'), null);
  await ui.click(button(ui.container, 'Оплатить 1'));
  const writes = ui.requests.filter(request => request.body);
  assert.equal(writes.length, 2);
  assert.ok(writes[0].url.endsWith('/complex-services/service/components/first/mark-paid'));
  assert.deepEqual(writes[0].body, { payment_method_id: 'cash', payment_method_name: 'Касса', amount: 500 });
  assert.ok(writes[1].url.endsWith('/complex-services/service/pay-remaining'));
  assert.deepEqual(writes[1].body, { payment_method_id: 'cash', payment_method_name: 'Касса' });
});

test('partial existing deposit retains remaining debt payment and plan refresh without new deposit receipts', async context => {
  const plan = { ...makePlan('partial-deposit'), deposit_amount: 400, paid_amount: 400 };
  const updated = [];
  const ui = await mount(context, ServicePaymentList, { plan, onUpdate: value => updated.push(value) }, url => url.includes('payment-types')
    ? [{ id: 'cash', name: 'Касса' }] : url.endsWith('/partial-deposit') ? plan : null);
  await ui.click(ui.container.querySelector('button'));
  assert.match(button(ui.container, 'Оплатить остаток').textContent, /600\s*₸/);
  assert.equal(button(ui.container, 'Внести аванс'), undefined);
  await ui.click(button(ui.container, 'Оплатить остаток'));
  await ui.click(ui.container.querySelector('input[type="radio"]'));
  await ui.click(button(ui.container, 'Оплатить 600'));
  const writes = ui.requests.filter(request => request.body);
  assert.equal(writes.length, 1);
  assert.ok(writes[0].url.endsWith('/services/service/mark-paid'));
  assert.deepEqual(writes[0].body, { payment_method_id: 'cash', payment_method_name: 'Касса' });
  assert.equal(ui.requests.some(request => request.url.endsWith('/add-deposit')), false);
  assert.deepEqual(updated, [plan]);
});

test('existing per-session course summary retains paid-session pricing without accounting amounts', async context => {
  const plan = makePlan('session-summary');
  plan.services[0] = { ...plan.services[0], is_course: true, payment_type: 'per_session', price_per_unit: 1000,
    sessions: [{ session_id: 'paid-session', paid: true, paid_amount: 250 }, { session_id: 'unpaid-session', paid: false }] };
  const ui = await mount(context, ServicePaymentList, { plan }, url => url.includes('payment-types') ? [{ id: 'cash', name: 'Касса' }] : null);
  await ui.click(ui.container.querySelector('button'));
  assert.match(ui.container.textContent, /ОПЛАЧЕНО ДЕНЕГ1\s*000\s*₸/);
  assert.match(ui.container.textContent, /осталось 1\s*000\s*₸/);
  assert.doesNotMatch(ui.container.textContent, /250\s*₸/);
  assert.ok(button(ui.container, 'Оплатить 1 процедуру'));
  assert.equal(ui.requests.filter(request => request.body).length, 0);
});

test('doctor-free analysis payment retains percent discounts and resets modal choices on close', async context => {
  const plan = makePlan('analysis-percent');
  plan.services[0] = { service_id: 'analysis', service_name: 'Анализ крови', unit: 'анализ', laboratory_id: 'lab', total_price: 1000, payment_status: 'unpaid' };
  const ui = await mount(context, ServicePaymentList, { plan }, (url, body) => url.includes('payment-types') ? [{ id: 'cash', name: 'Касса' }] : body ? plan : null);
  await ui.click(ui.container.querySelector('button'));
  await ui.click([...ui.container.querySelectorAll('button')].filter(element => element.textContent.includes('Оплатить')).at(-1));
  await ui.click(ui.container.querySelector('input[type="radio"]'));
  await ui.click(button(ui.container, '%'));
  await ui.change(ui.container.querySelector('input[placeholder="Процент скидки"]'), '25');
  await ui.click(button(ui.container, '×'));
  assert.equal(ui.requests.filter(request => request.body).length, 0);
  await ui.click([...ui.container.querySelectorAll('button')].filter(element => element.textContent.includes('Оплатить')).at(-1));
  assert.equal(ui.container.querySelector('input[type="radio"]').checked, false);
  assert.equal(ui.container.querySelector('input[placeholder="Сумма скидки, ₸"]').value, '');
  await ui.click(ui.container.querySelector('input[type="radio"]'));
  await ui.click(button(ui.container, '%'));
  await ui.change(ui.container.querySelector('input[placeholder="Процент скидки"]'), '25');
  await ui.click(button(ui.container, 'Оплатить 750'));
  const write = ui.requests.find(request => request.body);
  assert.ok(write.url.endsWith('/services/analysis/mark-paid'));
  assert.deepEqual(write.body, { payment_method_id: 'cash', payment_method_name: 'Касса', amount: 750 });
});

test('ordinary service paid_amount renders partial payment and only the remaining balance', async context => {
  const plan = makePlan('ordinary-partial-payment');
  plan.total_cost = 2500;
  plan.paid_amount = 2000;
  plan.services[0] = { ...plan.services[0], total_price: 2500, paid_amount: 2000, payment_status: 'unpaid' };
  const ui = await mount(context, ServicePaymentList, { plan });
  await ui.click(ui.container.querySelector('button'));
  assert.match(ui.container.textContent, /Частично/);
  assert.match(ui.container.textContent, /2\s*000 \/ 2\s*500\s*₸/);
  assert.ok(button(ui.container, 'Оплатить500 ₸'), 'service offers payment of the remaining 500 ₸');
  assert.equal([...ui.container.querySelectorAll('button')].some(element => /Оплатить\s*2\s*500\s*₸/.test(element.textContent)), false);
});

test('missing plan paid_amount keeps ordinary partial payment debt at 500 after expansion', async context => {
  const plan = makePlan('missing-plan-paid-amount');
  delete plan.paid_amount;
  plan.total_cost = 2500;
  plan.services[0] = { ...plan.services[0], total_price: 2500, paid_amount: 2000, payment_status: 'unpaid' };
  const ui = await mount(context, ServicePaymentList, { plan });
  await ui.click(ui.container.querySelector('button'));
  assert.match(ui.container.textContent, /Частично/);
  assert.match(ui.container.textContent, /2\s*000 \/ 2\s*500\s*₸/);
  assert.ok(button(ui.container, 'Оплатить500 ₸'), 'service offers payment of the remaining 500 ₸');
  const remaining = button(ui.container, 'Оплатить остаток');
  assert.ok(remaining, 'summary offers remaining debt payment');
  assert.match(remaining.textContent, /500\s*₸/);
  assert.doesNotMatch(remaining.textContent, /2\s*500\s*₸/);
});
