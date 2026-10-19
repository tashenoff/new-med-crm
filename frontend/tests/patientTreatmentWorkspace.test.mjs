import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act, useState } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window; globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window; delete globalThis.document; bootstrap.window.close();
const compiled = await build({ stdin: { contents: `export { default as Workspace } from './src/components/treatment/PatientTreatmentWorkspace.jsx'; export { default as PatientModal } from './src/components/modals/PatientModal.js'; export { GlobalRefreshProvider } from './src/hooks/useGlobalRefresh.js';`, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom', 'react-dom/client'], loader: { '.js': 'jsx' }, define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://crm.test"}' } });
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
const { Workspace, PatientModal, GlobalRefreshProvider } = loaded.exports;
const text = node => node.textContent.replace(/[\s\u00a0\u202f]+/g, ' ').trim();
const findButton = (container, label) => [...container.querySelectorAll('button')].find(node => text(node).replace(/[⌃⌄]/g, '').trim() === label);
const plan = (id, total = 1000, paid = 0) => ({ id, title: `План ${id}`, created_at: '2026-10-19T09:40:00', created_by_name: 'Сотрудник проверки', total_cost: total, paid_amount: paid, accounting_events: [], payment_completion_policy: 'full_payment_v1', services: [{ service_id: `service-${id}`, service_row_id: `row-${id}`, service_name: `Услуга ${id}`, total_price: total, paid_amount: paid, quantity_total: 1, quantity_completed: 0, occurrence_ids: [`occ-${id}`], payment_status: paid >= total ? 'paid' : paid ? 'partially_paid' : 'unpaid' }] });
function ControlledWorkspace(props) { const [paymentFilter, onPaymentFilter] = useState('all'), [procedureFilter, onProcedureFilter] = useState('all'); return React.createElement(Workspace, { ...props, paymentFilter, onPaymentFilter, procedureFilter, onProcedureFilter }); }
function Card(props) { return React.createElement(GlobalRefreshProvider, null, React.createElement(PatientModal, props)); }

async function mount(t, Component, props, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' }), writes = [], previous = new Map();
  const globals = { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true, alert() {}, fetch: async (url, command = {}) => {
    if ((command.method || 'GET') !== 'GET') { assert.ok(options.writeResponse, 'Display actions must not issue writes'); writes.push({ url: String(url), body: JSON.parse(command.body) }); return { ok: true, json: async () => options.writeResponse }; }
    const value = options.read ? options.read(String(url)) : undefined;
    return { ok: true, status: 200, json: async () => value !== undefined ? value : String(url).endsWith('/payment-types') ? [{ id: 'cash', name: 'Касса' }] : String(url).endsWith('/consultation') ? options.clinical || null : [] };
  } };
  for (const [key, value] of Object.entries(globals)) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
  const root = createRoot(document.getElementById('root'));
  const render = async next => act(async () => root.render(React.createElement(Component, next)));
  await render(props);
  t.after(async () => { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  return { container: dom.window.document.body, writes, render, click: async node => { assert.ok(node, 'Control exists'); await act(async () => node.click()); }, select: async (label, value) => { const node = document.querySelector(`select[aria-label="${label}"]`); assert.ok(node); await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); } };
}

test('treatment selects one of many plans, preserves payment updates and resets selection for a different patient', async t => {
  const plans = Array.from({ length: 12 }, (_, i) => plan(String(i + 1)));
  plans[1].title = 'Очень длинное название плана лечения с подробным описанием всех этапов реабилитации';
  const ui = await mount(t, ControlledWorkspace, { plans, patientId: 'patient-a' });
  const options = () => [...ui.container.querySelectorAll('.curai-plan-option')];
  assert.equal(options().length, 12);
  await ui.click(options()[1]);
  assert.equal(ui.container.querySelector('.curai-treatment-plan-details h4').textContent, plans[1].title);
  const updated = plans.map(p => p.id === '2' ? { ...p, paid_amount: 500 } : p);
  await ui.render({ plans: updated, patientId: 'patient-a' });
  assert.equal(options()[1].getAttribute('aria-pressed'), 'true');
  await ui.render({ plans: updated, patientId: 'patient-b' });
  assert.equal(options()[0].getAttribute('aria-pressed'), 'true');
  await ui.render({ plans: [plans[2]], patientId: 'patient-b' });
  assert.equal(ui.container.querySelector('.curai-treatment-plan-details h4').textContent, plans[2].title);
  assert.equal(ui.writes.length, 0);
});

test('payment and procedure filters retain partial unpaid services and never invent manual creation or deletion', async t => {
  const paid = plan('paid', 1000, 1000), partial = plan('partial', 1000, 200), course = plan('course');
  course.services[0].is_course = true;
  let created = 0;
  const ui = await mount(t, ControlledWorkspace, { plans: [paid, partial, course], onCreatePlan: () => created++ });
  const titles = () => [...ui.container.querySelectorAll('.curai-plan-option>strong')].map(node => node.textContent);
  await ui.select('Оплата услуг', 'unpaid'); assert.deepEqual(titles(), ['План partial', 'План course']);
  await ui.select('Тип услуг', 'procedures'); assert.deepEqual(titles(), ['План course']);
  await ui.select('Оплата услуг', 'paid'); assert.deepEqual(titles(), []); assert.match(text(ui.container), /Нет подходящих услуг/);
  await ui.select('Оплата услуг', 'all'); await ui.select('Тип услуг', 'non_procedures'); assert.deepEqual(titles(), ['План paid', 'План partial']);
  await ui.click(findButton(ui.container, 'Создать через консультацию')); assert.equal(created, 1);
  assert.ok(!findButton(ui.container, 'Удалить')); assert.equal(ui.writes.length, 0);
});

test('selected treatment plan pays only its own remaining balance through the existing payment modal', async t => {
  const first = plan('first'), selected = plan('selected', 2000), updates = [];
  const ui = await mount(t, ControlledWorkspace, { plans: [first, selected], onUpdate: p => updates.push(p) }, { writeResponse: { plan: { ...selected, paid_amount: 2000 } } });
  await ui.click(ui.container.querySelectorAll('.curai-plan-option')[1]);
  await ui.click(findButton(ui.container, 'Оплатить остаток'));
  const dialog = ui.container.querySelector('[role="dialog"]'); assert.ok(dialog);
  await ui.click(dialog.querySelector('input[type="radio"]'));
  await ui.click([...dialog.querySelectorAll('button')].find(node => text(node).startsWith('Оплатить 2')));
  assert.equal(ui.writes.length, 1); assert.ok(ui.writes[0].url.endsWith('/treatment-plans/selected/settle-remaining'));
  assert.equal(ui.writes[0].body.amount_kzt, 2000); assert.equal(ui.writes[0].body.discount_amount_kzt, 0); assert.equal(ui.writes[0].body.service_row_id, undefined); assert.equal(updates[0].id, 'selected');
});

test('ordinary treatment completion retains the stable occurrence command and refresh callback', async t => {
  const selected = plan('simple'), updates = [];
  const ui = await mount(t, ControlledWorkspace, { plans: [selected], onUpdate: p => updates.push(p) }, { writeResponse: { plan: { ...selected, services: [{ ...selected.services[0], quantity_completed: 1 }] } } });
  await ui.click(findButton(ui.container, '+ Отметить'));
  assert.equal(ui.writes.length, 1); assert.ok(ui.writes[0].url.endsWith('/service-rows/row-simple/occurrences/occ-simple/complete'));
  assert.ok(ui.writes[0].body.operation_id); assert.equal(updates[0].id, 'simple');
});

test('complex keeps allocated shares, component payment and stable component completion separate', async t => {
  const selected = plan('complex', 3000, 1800), updates = [];
  selected.services = [{ ...selected.services[0], is_complex: true, components: [{ component_id: 'component-a', service_id: 'a', service_name: 'Компонент А', price: 3000, quantity: 1, occurrence_ids: ['occ-a'], quantity_completed: 1, status: 'completed', paid: true, paid_amount: 1800 }, { component_id: 'component-b', service_id: 'b', service_name: 'Компонент Б', price: 2000, quantity: 1, occurrence_ids: ['occ-b'], quantity_completed: 0, status: 'pending', paid: false, paid_amount: 0 }] }];
  const ui = await mount(t, ControlledWorkspace, { plans: [selected], onUpdate: p => updates.push(p) }, { writeResponse: { plan: selected } });
  await ui.click(findButton(ui.container, 'Состав комплекса'));
  const children = ui.container.querySelector('[aria-label="Состав комплекса: Услуга complex"]');
  assert.match(text(children), /доля 1 800 ₸/); assert.match(text(children), /доля 1 200 ₸/);
  const last = children.querySelectorAll('.curai-treatment-component')[1];
  await ui.click(findButton(last, 'Оплатить')); assert.equal(ui.writes.length, 0);
  assert.match(text(ui.container.querySelector('[role="dialog"]')), /Оплатить 1 200 ₸/);
  assert.equal(ui.container.querySelector('select[aria-label="Тип скидки"]').disabled, false);
  await ui.click(findButton(ui.container.querySelector('[role="dialog"]'), 'Отмена'));
  await ui.click(findButton(last, 'Отметить'));
  assert.ok(ui.writes[0].url.endsWith('/components/component-b/occurrences/occ-b/complete')); assert.equal(updates[0].id, selected.id);
});

test('course retains next unpaid payment, next incomplete session and conditional entire-course payment', async t => {
  const selected = plan('course', 4000, 2500);
  selected.services = [{ ...selected.services[0], is_course: true, payment_type: 'per_session', price_per_unit: 2000, sessions: [{ session_id: 'session-a', price: 2000, paid: true, paid_amount: 2000, completed: true }, { session_id: 'session-b', price: 2000, paid: false, paid_amount: 500, completed: false }] }];
  const ui = await mount(t, ControlledWorkspace, { plans: [selected] }, { writeResponse: { plan: selected } });
  await ui.click(findButton(ui.container, 'Процедуры · выполнено 1 из 2'));
  assert.equal(ui.container.querySelectorAll('.curai-treatment-session').length, 2); assert.ok(findButton(ui.container, 'Оплатить весь курс'));
  await ui.click(findButton(ui.container, 'Оплатить 1 процедуру'));
  assert.match(text(ui.container.querySelector('[role="dialog"]')), /Оплатить 1 500 ₸/);
  assert.equal(ui.container.querySelector('select[aria-label="Тип скидки"]').disabled, true);
  await ui.click(findButton(ui.container.querySelector('[role="dialog"]'), 'Отмена'));
  await ui.click(findButton(ui.container, '+ Отметить'));
  assert.equal(ui.writes[0].body.session_id, 'session-b'); assert.equal(ui.writes[0].body.service_row_id, 'row-course');
  await ui.render({ plans: [{ ...selected, payment_completion_policy: undefined }], patientId: 'legacy' });
  await ui.click(findButton(ui.container, 'Процедуры · выполнено 1 из 2')); assert.ok(!findButton(ui.container, 'Оплатить весь курс'));
});

test('plan facts and populated clinical sections stay accessible without a data write', async t => {
  const selected = { ...plan('clinical'), description: 'Описание выбранного плана', notes: 'Примечания выбранного плана', deposit_amount: 0 };
  const ui = await mount(t, ControlledWorkspace, { plans: [selected] }, { clinical: { consultation_date: '2026-10-19', doctor_name: 'Врач проверки', complaints: 'Жалобы <b>как текст</b>', diagnosis: 'Диагноз проверки', icd10_codes: [{ code: 'Z00' }], notes: 'Клиническое примечание' } });
  await ui.click(findButton(ui.container, 'Описание и консультация'));
  assert.match(text(ui.container), /Описание выбранного плана/); assert.match(text(ui.container), /Примечания выбранного плана/); assert.match(text(ui.container), /МКБ-10: Z00/);
  await ui.click(findButton(ui.container, 'Жалобы'));
  assert.match(text(ui.container), /Жалобы <b>как текст<\/b>/); assert.equal(ui.container.querySelector('.curai-treatment-clinical b'), null); assert.equal(ui.writes.length, 0);
});

test('empty treatment opens existing consultation creation and does not expose a bottom Close', async t => {
  let created = 0;
  const ui = await mount(t, ControlledWorkspace, { plans: [], onCreatePlan: () => created++ });
  assert.match(text(ui.container), /Планы лечения пока не созданы/); assert.ok(!findButton(ui.container, 'Закрыть'));
  await ui.click(findButton(ui.container, 'Открыть консультации')); assert.equal(created, 1); assert.equal(ui.writes.length, 0);
});

test('changing patient ignores the previous pending plan response in both treatment and payment', async t => {
  let resolveOld;
  const old = new Promise(resolve => { resolveOld = resolve; });
  const a = { id: 'patient-a', full_name: 'Пациент А' }, b = { id: 'patient-b', full_name: 'Пациент Б' }, planB = plan('current-b');
  const base = { show: true, editingItem: a, onClose() {}, patientForm: {}, onSave() {} };
  const ui = await mount(t, Card, base, { read: url => url.endsWith('/patients/patient-a/treatment-plans') ? old : url.endsWith('/patients/patient-b/treatment-plans') ? [planB] : undefined });
  await ui.render({ ...base, editingItem: b });
  await ui.click([...ui.container.querySelectorAll('[role="tab"]')].find(node => text(node) === 'Планы лечения'));
  assert.equal(ui.container.querySelector('.curai-treatment-plan-details h4').textContent, planB.title);
  await act(async () => resolveOld([plan('stale-a')]));
  assert.doesNotMatch(text(ui.container), /План stale-a/);
  await ui.click([...ui.container.querySelectorAll('[role="tab"]')].find(node => text(node) === 'Оплата'));
  assert.equal(ui.container.querySelector('.curai-r21-plan-details h4').textContent, planB.title);
  assert.equal(ui.container.querySelector('.curai-dialog-header h3').textContent, b.full_name); assert.equal(ui.writes.length, 0);
});
