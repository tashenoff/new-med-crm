import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
bootstrap.window.close();

async function compile(path, page = false) {
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['react', 'react-dom'], loader: { '.js': 'jsx' },
    define: { 'import.meta.env': '{}' },
    plugins: page ? [{ name: 'doctor-page-fixture', setup(builder) {
      builder.onResolve({ filter: /\/(useDoctors|useGlobalRefresh|ModalContext|DoctorsView|DoctorCashbackWidget)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents:
        args.path.endsWith('/useDoctors') ? 'export const useDoctors = () => globalThis.doctorFixture.hook;'
          : args.path.endsWith('/useGlobalRefresh') ? 'export const useGlobalRefresh = () => ({ refreshTriggers: {}, refreshDoctors() {} });'
          : args.path.endsWith('/ModalContext') ? 'export const useModal = () => globalThis.doctorFixture.modals;'
          : args.path.endsWith('/DoctorsView') ? 'export default props => { globalThis.doctorFixture.view = props; return null; };'
          : 'export default () => null;'
      }));
    } }] : []
  });
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
  return loaded.exports.default;
}

const DoctorModal = await compile('../src/components/modals/DoctorModal.js');
const DoctorsPage = await compile('../src/pages/DoctorsPage.jsx', true);
const SalariesView = await compile('../src/components/finance/salaries/SalariesView.js');
const doctor = {
  id: 'a', full_name: 'Doctor A', specialty: 'Therapy', specialties: ['Therapy'],
  payment_mode: 'individual', payment_type: 'hybrid', payment_value: 2500,
  hybrid_fixed_amount: 2500, hybrid_percentage_value: 0, currency: 'KZT', consultation_compensation_mode: 'separate',
  consultation_payment_type: 'hybrid', consultation_payment_value: 1500,
  consultation_hybrid_fixed_amount: 1500, consultation_currency: 'KZT', consultation_hybrid_percentage_value: 0,
  services: [{ service_id: 'service', commission_type: 'fixed', commission_value: 800, commission_currency: 'KZT' }]
};
const cleanups = new WeakMap();

async function mount(context, Component, props = {}, response) {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'http://localhost' });
  const globals = {
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
    alert: () => {},
    fetch: async url => typeof response === 'function' ? response(url) : ({ ok: true, json: async () => response ?? (String(url).includes('specialties')
      ? [{ id: 'specialty', name: 'Therapy' }]
      : [{ id: 'service', name: 'Service', category: 'Therapy', price: 10000 }]) })
  };
  const descriptors = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const container = dom.window.document.getElementById('root');
  const root = createRoot(container);
  if (!cleanups.has(context)) {
    cleanups.set(context, []);
    context.after(async () => {
      for (const cleanup of cleanups.get(context).reverse()) await cleanup();
      delete globalThis.doctorFixture;
    });
  }
  cleanups.get(context).push(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const render = async nextProps => { await act(async () => root.render(React.createElement(Component, nextProps))); };
  await render(props);
  const change = async (element, value) => {
    assert.ok(element, 'control exists');
    await act(async () => {
      const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  };
  return { container: dom.window.document.body, render, change, submit: async () => {
    await act(async () => dom.window.document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
  } };
}

async function modal(context, editingItem = null, initial = {}) {
  const saved = [];
  function Harness({ editingItem }) {
    const [form, setForm] = React.useState(initial);
    return React.createElement(DoctorModal, {
      show: true, editingItem, doctorForm: form,
      setDoctorForm: value => { assert.equal(typeof value, 'object', 'ModalContext requires plain objects'); setForm(value); },
      onClose() {}, onSave: (event, payload) => { event.preventDefault(); saved.push(payload); }
    });
  }
  return { ...await mount(context, Harness, { editingItem }), saved };
}

const salaryReport = {
  salary_data: [{ ...doctor, doctor_id: 'a', doctor_name: 'Current salary doctor', total_revenue: 987654, calculated_salary: 123456 }],
  summary: { total_doctors: 1, total_revenue: 987654, total_salary: 123456 },
  compensation_complete: true, accounting_blockers: []
};
const salaryBlockers = [
  { detail: 'Не настроена комиссия услуги', doctor_name: 'Заблокированный врач', doctor_id: 'doctor-blocked', source: 'treatment_plan', service_id: 'service-blocked', plan_id: 'plan-blocked', appointment_id: 'appointment-blocked' },
  { message: 'Не указана оплата консультации', context: { doctor_id: 'doctor-second', source_id: 'source-second' } }
];

async function salarySequence(context, responses) {
  const ui = await mount(context, SalariesView, {}, () => {
    assert.ok(responses.length, 'expected salary request');
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response;
  });
  return { ...ui, retry: async () => {
    const button = ui.container.querySelector('button');
    assert.equal(button.disabled, false);
    await act(async () => button.click());
  } };
}

const salaryResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

function assertSalaryCleared(ui) {
  assert.doesNotMatch(ui.container.textContent, /Current salary doctor/);
  assert.equal(ui.container.querySelector('tbody'), null);
  assert.doesNotMatch(ui.container.textContent, /Всего врачей|Общая зарплата|123\s*456|987\s*654/);
  assert.ok(ui.container.querySelector('[role="alert"]'), 'visible Russian error');
  assert.match(ui.container.querySelector('[role="alert"]').textContent, /расч[её]т|отч[её]т|загруз/i);
}

test('salary report success then 409 clears stale rows/totals, shows every blocker and recovers on retry', async context => {
  const ui = await salarySequence(context, [salaryResponse(salaryReport), salaryResponse({ detail: { accounting_blockers: salaryBlockers }, compensation_complete: false }, 409), salaryResponse(salaryReport)]);
  assert.match(ui.container.textContent, /Current salary doctor/);
  await ui.retry();
  assertSalaryCleared(ui);
  for (const value of ['Не настроена комиссия услуги', 'Заблокированный врач', 'doctor-blocked', 'treatment_plan', 'service-blocked', 'plan-blocked', 'appointment-blocked', 'Не указана оплата консультации', 'doctor-second', 'source-second']) assert.ok(ui.container.textContent.includes(value), value);
  await ui.retry();
  assert.match(ui.container.textContent, /Current salary doctor/);
  assert.ok(ui.container.textContent.includes('123\u00a0456'));
  assert.equal(ui.container.querySelector('[role="alert"]'), null);
  assert.doesNotMatch(ui.container.textContent, /doctor-blocked/);
});

for (const [label, response, explanation] of [
  ['ordinary HTTP error', salaryResponse({ detail: 'Сервис временно недоступен' }, 503), /503.*Сервис временно недоступен/s],
  ['structured 422 validation', salaryResponse({ detail: [{ loc: ['query', 'date_from'], msg: 'Некорректная дата', type: 'date_parsing' }] }, 422), /422.*query.*date_from.*Некорректная дата/s],
  ['malformed JSON', { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token'); } }, /некорректн.*JSON/i],
  ['malformed 409 JSON', { ok: false, status: 409, json: async () => { throw new SyntaxError('Unexpected token'); } }, /409.*JSON/s],
  ['invalid response shape', salaryResponse({ salary_data: {}, summary: {} }), /некорректн/i],
  ['missing summary', salaryResponse({ salary_data: [] }), /некорректн/i],
  ['network error', new Error('Network unavailable'), /Не удалось загрузить/i]
]) {
  test(`salary report ${label} clears stale data with readable explanation and permits retry`, async context => {
    const ui = await salarySequence(context, [salaryResponse(salaryReport), response, salaryResponse(salaryReport)]);
    await ui.retry();
    assertSalaryCleared(ui);
    assert.match(ui.container.querySelector('[role="alert"]').textContent, explanation);
    assert.doesNotMatch(ui.container.textContent, /\[object Object\]/);
    await ui.retry();
    assert.match(ui.container.textContent, /Current salary doctor/);
    assert.equal(ui.container.querySelector('[role="alert"]'), null);
  });
}

test('salary report success displays additive incomplete compensation and accounting blockers', async context => {
  const ui = await salarySequence(context, [salaryResponse({ ...salaryReport, compensation_complete: false, accounting_blockers: salaryBlockers })]);
  assert.match(ui.container.textContent, /Current salary doctor/);
  assert.match(ui.container.querySelector('[role="alert"]')?.textContent ?? '', /неполн|не заверш/i);
  for (const blocker of salaryBlockers) assert.ok(ui.container.textContent.includes(blocker.detail ?? blocker.message));
});

test('new doctor requires an explicit consultation mode and offers none/inherit/separate', async context => {
  const ui = await modal(context);
  const select = ui.container.querySelector('[name="consultation_compensation_mode"]');
  assert.ok(select);
  assert.equal(select.required, true);
  assert.equal(select.value, '');
  assert.deepEqual([...select.options].filter(option => option.value).map(option => option.value), ['none', 'inherit', 'separate']);
  await ui.submit();
  assert.equal(ui.saved.length, 0);
  for (const mode of ['none', 'inherit', 'separate']) {
    await ui.change(select, mode);
    assert.equal(Boolean(ui.container.querySelector('[name="consultation_payment_type"]')), mode === 'separate');
    await ui.submit();
    assert.equal(ui.saved.at(-1).consultation_compensation_mode, mode);
  }
});

test('edit round-trips individual commissions and fixed-only main/consultation hybrid fields', async context => {
  const ui = await modal(context, doctor);
  await ui.submit();
  assert.equal(ui.saved.length, 1);
  for (const field of ['payment_mode', 'payment_type', 'payment_value', 'hybrid_percentage_value', 'consultation_compensation_mode', 'consultation_payment_type', 'consultation_payment_value', 'consultation_hybrid_percentage_value', 'services']) {
    assert.deepEqual(ui.saved[0][field], doctor[field], field);
  }
  assert.ok(ui.container.querySelector('[name="payment_type"]'), 'main scheme remains editable in individual mode for consultation inheritance');
});

test('hybrid missing inactive state defaults to zero without blocking individual or general save', async context => {
  for (const payment_mode of ['general', 'individual']) {
    const ui = await modal(context, { ...doctor, payment_mode, hybrid_percentage_value: undefined, consultation_compensation_mode: 'none', services: [] });
    await ui.submit();
    assert.equal(ui.saved.length, 1);
    assert.equal(ui.saved[0].hybrid_percentage_value, 0);
  }
});

test('sequential edit A to empty B resets selected services, commissions and both modes', async context => {
  const ui = await modal(context, doctor);
  await ui.render({ editingItem: { id: 'b', full_name: 'Doctor B', services: [], payment_mode: 'general', payment_type: 'fixed', payment_value: 0, consultation_compensation_mode: 'none' } });
  await ui.submit();
  assert.equal(ui.saved.length, 1);
  assert.deepEqual(ui.saved[0].services, []);
  assert.equal(ui.saved[0].payment_mode, 'general');
  assert.equal(ui.saved[0].consultation_compensation_mode, 'none');
  assert.equal(ui.container.querySelector('[name="consultation_payment_type"]'), null);
});

test('fixed controls are KZT only and describe per-completed-occurrence pay', async context => {
  const ui = await modal(context, doctor);
  assert.equal(ui.container.querySelectorAll('option[value="USD"], option[value="EUR"], option[value="RUB"]').length, 0);
  assert.match(ui.container.textContent, /KZT/);
  assert.match(ui.container.textContent, /заверш[её]н/);
  assert.doesNotMatch(ui.container.textContent, /за период работы/);
});

test('legacy foreign currency is not silently relabeled or submitted as KZT', async context => {
  const ui = await modal(context, { ...doctor, currency: 'USD' });
  assert.match(ui.container.textContent, /USD/);
  await ui.submit();
  assert.equal(ui.saved.length, 0);
  assert.match(ui.container.textContent, /KZT/);
});

for (const [field, value] of [['payment_value', -1], ['hybrid_percentage_value', 101], ['consultation_payment_value', -1], ['consultation_hybrid_percentage_value', 101]]) {
  test(`rejects invalid ${field} bounds`, async context => {
    const ui = await modal(context, { ...doctor, payment_mode: 'general', [field]: value });
    await ui.submit();
    assert.equal(ui.saved.length, 0);
    assert.ok(ui.container.querySelector('[role="alert"]'));
  });
}

test('rejects main, consultation and individual percentages over 100', async context => {
  for (const record of [
    { ...doctor, payment_mode: 'general', payment_type: 'percentage', payment_value: 101 },
    { ...doctor, consultation_payment_type: 'percentage', consultation_payment_value: 101 },
    { ...doctor, services: [{ service_id: 'service', commission_type: 'percentage', commission_value: 101 }] },
    { ...doctor, services: [{ service_id: 'service', commission_type: 'fixed', commission_value: -1 }] }
  ]) {
    const ui = await modal(context, record);
    await ui.submit();
    assert.equal(ui.saved.length, 0);
  }
});

for (const editing of [false, true]) {
  test(`DoctorsPage ${editing ? 'edit' : 'create'} path preserves the shared compensation payload`, async context => {
    const calls = [];
    globalThis.doctorFixture = {
      hook: { doctors: [], fetchDoctors: async () => {}, createDoctor: async data => { calls.push(data); return { success: true }; }, updateDoctor: async (id, data) => { calls.push({ id, ...data }); return { success: true }; } },
      modals: { openModal: (id, props) => { globalThis.doctorFixture.opened = props; }, closeModal() {}, updateModalProps() {}, getModalProps() {} }
    };
    await mount(context, DoctorsPage, { user: { role: 'admin' } });
    await act(async () => editing ? globalThis.doctorFixture.view.onEditDoctor(doctor) : globalThis.doctorFixture.view.onAddDoctor());
    const opened = globalThis.doctorFixture.opened;
    if (editing) assert.equal(opened.doctorForm.consultation_payment_value, 1500);
    else assert.equal(opened.doctorForm.consultation_compensation_mode, '');
    await act(async () => opened.onSave({ preventDefault() {} }, { ...doctor, editingItem: editing ? doctor : null }));
    assert.equal(calls.length, 1);
    for (const field of ['payment_type', 'payment_mode', 'hybrid_percentage_value', 'consultation_compensation_mode', 'consultation_payment_type', 'consultation_payment_value', 'consultation_hybrid_percentage_value', 'services']) assert.deepEqual(calls[0][field], doctor[field], field);
    const { buildDoctorPayload } = await import('../src/utils/doctorCompensation.js');
    const expected = buildDoctorPayload(doctor);
    assert.deepEqual(calls[0], editing ? { id: doctor.id, ...expected } : expected);
    for (const field of ['hybrid_fixed_amount', 'consultation_hybrid_fixed_amount', 'consultation_currency']) {
      assert.equal(calls[0][field], doctor[field], field);
    }
    if (editing) assert.equal(calls[0].id, doctor.id);
  });
}

test('salary report labels hybrid as fixed KZT per occurrence plus percent, not percentage-only', async context => {
  const ui = await mount(context, SalariesView, {}, {
    salary_data: [{ ...doctor, doctor_id: 'a', doctor_name: 'Doctor A', total_revenue: 10000, calculated_salary: 4000 }], summary: {}
  });
  assert.match(ui.container.textContent, /Гибрид/);
  assert.match(ui.container.textContent, /2\s?500.*KZT.*0%/);
  assert.match(ui.container.textContent, /заверш[её]н/);
  assert.doesNotMatch(ui.container.textContent, /2500%/);
});


test('inactive general and separate schemes do not block individual commissions with consultation none', async context => {
  const ui = await modal(context, { ...doctor, consultation_compensation_mode: 'none', hybrid_percentage_value: 150, consultation_payment_value: -1 });
  await ui.submit();
  assert.equal(ui.saved.length, 1);
  assert.equal(ui.saved[0].hybrid_percentage_value, 0);
  assert.equal(ui.saved[0].consultation_payment_value, 0);
});

test('create edits main and separate consultation hybrid controls into numeric payloads', async context => {
  const ui = await modal(context);
  await ui.change(ui.container.querySelector('[name="payment_type"]'), 'hybrid');
  await ui.change(ui.container.querySelector('[name="payment_value"]'), '2300.75');
  await ui.change(ui.container.querySelector('[name="hybrid_percentage_value"]'), '0');
  await ui.change(ui.container.querySelector('[name="consultation_compensation_mode"]'), 'separate');
  await ui.change(ui.container.querySelector('[name="consultation_payment_type"]'), 'hybrid');
  await ui.change(ui.container.querySelector('[name="consultation_payment_value"]'), '0');
  await ui.change(ui.container.querySelector('[name="consultation_hybrid_percentage_value"]'), '12.5');
  await ui.submit();
  assert.equal(ui.saved.length, 1);
  assert.equal(ui.saved[0].payment_type, 'hybrid');
  assert.equal(ui.saved[0].payment_value, 2300.75);
  assert.equal(ui.saved[0].hybrid_percentage_value, 0);
  assert.equal(ui.saved[0].consultation_payment_type, 'hybrid');
  assert.equal(ui.saved[0].consultation_payment_value, 0);
  assert.equal(ui.saved[0].consultation_hybrid_percentage_value, 12.5);
});

test('consultation inheritance activates the main scheme in individual plan mode', async context => {
  const ui = await modal(context, { ...doctor, consultation_compensation_mode: 'none' });
  assert.equal(ui.container.querySelector('fieldset').disabled, true);
  await ui.change(ui.container.querySelector('[name="consultation_compensation_mode"]'), 'inherit');
  assert.equal(ui.container.querySelector('fieldset').disabled, false);
  await ui.change(ui.container.querySelector('[name="hybrid_percentage_value"]'), '101');
  await ui.submit();
  assert.equal(ui.saved.length, 0);
  await ui.change(ui.container.querySelector('[name="hybrid_percentage_value"]'), '100');
  await ui.submit();
  assert.equal(ui.saved[0].hybrid_percentage_value, 100);
  assert.deepEqual(ui.saved[0].services, doctor.services);
});

test('legacy foreign-currency individual commissions remain visible and block silent conversion', async context => {
  const ui = await modal(context, { ...doctor, services: [{ ...doctor.services[0], commission_currency: 'EUR' }] });
  assert.match(ui.container.textContent, /EUR/);
  await ui.submit();
  assert.equal(ui.saved.length, 0);
});

test('edit empty individual B preserves its explicit mode without commissions from A', async context => {
  const ui = await modal(context, doctor);
  await ui.render({ editingItem: { id: 'b', full_name: 'Doctor B', services: [], payment_mode: 'individual', consultation_compensation_mode: 'inherit', payment_type: 'percentage', payment_value: 15 } });
  await ui.submit();
  assert.equal(ui.saved[0].payment_mode, 'individual');
  assert.equal(ui.saved[0].consultation_compensation_mode, 'inherit');
  assert.deepEqual(ui.saved[0].services, []);
});

test('individual plan mode can inherit a zero-fixed hybrid main scheme for consultations', async context => {
  const ui = await modal(context, { ...doctor, payment_value: 0, hybrid_percentage_value: 12.5, consultation_compensation_mode: 'inherit' });
  await ui.submit();
  assert.equal(ui.saved.length, 1);
  assert.equal(ui.saved[0].payment_value, 0);
  assert.equal(ui.saved[0].hybrid_percentage_value, 12.5);
  assert.equal(ui.saved[0].payment_mode, 'individual');
  assert.equal(ui.saved[0].consultation_compensation_mode, 'inherit');
});

test('general percentage and fixed schemes serialize zero and fractional values', async context => {
  for (const [payment_type, payment_value] of [['percentage', 0], ['percentage', 100], ['fixed', 0], ['fixed', 1250.5]]) {
    const ui = await modal(context, { ...doctor, payment_mode: 'general', payment_type, payment_value, services: [] });
    await ui.submit();
    assert.equal(ui.saved.length, 1);
    assert.equal(ui.saved[0].payment_type, payment_type);
    assert.equal(ui.saved[0].payment_value, payment_value);
    const input = ui.container.querySelector('[name="payment_value"]');
    assert.equal(input.min, '0');
    assert.equal(input.max, payment_type === 'percentage' ? '100' : '');
  }
});


test('modal and page payload retain all compensation fields on edit', async context => {
  const original = { ...doctor, hybrid_fixed_amount: 2500, consultation_hybrid_fixed_amount: 1500, consultation_currency: 'KZT' };
  const ui = await modal(context, original);
  await ui.submit();
  const { buildDoctorPayload } = await import('../src/utils/doctorCompensation.js');
  const submitted = buildDoctorPayload(ui.saved[0]);
  for (const field of ['hybrid_fixed_amount', 'consultation_hybrid_fixed_amount', 'consultation_currency']) {
    assert.equal(submitted[field], original[field], field);
  }
});


test('editing hybrid canonical amounts keeps persisted aliases consistent', async context => {
  const ui = await modal(context, { ...doctor, payment_mode: 'general', hybrid_fixed_amount: 2500, consultation_hybrid_fixed_amount: 1500 });
  await ui.change(ui.container.querySelector('[name="payment_value"]'), '2700');
  await ui.change(ui.container.querySelector('[name="consultation_payment_value"]'), '1700');
  await ui.submit();
  assert.equal(ui.saved[0].hybrid_fixed_amount, 2700);
  assert.equal(ui.saved[0].consultation_hybrid_fixed_amount, 1700);
});

test('consultation currency cannot be silently replaced on edit', async context => {
  const ui = await modal(context, { ...doctor, consultation_currency: 'USD' });
  await ui.submit();
  assert.equal(ui.saved.length, 0);
  assert.ok(ui.container.querySelector('[role="alert"]'));
});


test('cross-stack modal payloads and API readback', async context => {
  const { readFile, writeFile } = await import('node:fs/promises');
  const { buildDoctorPayload } = await import('../src/utils/doctorCompensation.js');
  if (process.env.DOCTOR_CONTRACT_READBACK) {
    const documents = JSON.parse(await readFile(process.env.DOCTOR_CONTRACT_READBACK, 'utf8'));
    for (const { expected, actual } of documents) {
      const ui = await modal(context, actual);
      await ui.submit();
      const payload = buildDoctorPayload(ui.saved[0]);
      for (const [field, value] of Object.entries(expected)) assert.deepEqual(payload[field], value, field);
    }
    return;
  }
  const cases = [];
  for (const payment_mode of ['general', 'individual']) {
    for (const payment_type of ['fixed', 'percentage', 'hybrid']) {
      for (const consultation_compensation_mode of ['none', 'inherit', 'separate']) {
        for (const consultation_payment_type of ['fixed', 'percentage', 'hybrid']) {
          const original = { ...doctor, payment_mode, payment_type, payment_value: 17.5,
            hybrid_fixed_amount: payment_type === 'hybrid' ? 17.5 : 0, hybrid_percentage_value: 12.5,
            consultation_compensation_mode, consultation_payment_type, consultation_payment_value: 19.5,
            consultation_hybrid_fixed_amount: consultation_payment_type === 'hybrid' ? 19.5 : 0,
            consultation_hybrid_percentage_value: 14.5, consultation_currency: 'KZT',
            services: payment_mode === 'individual' ? doctor.services : ['service'] };
          const ui = await modal(context, null, original);
          await ui.submit();
          assert.equal(ui.saved.length, 1);
          const expectedCreated = buildDoctorPayload(original);
          assert.deepEqual(ui.saved[0], { ...expectedCreated, editingItem: null });
          const created = buildDoctorPayload(ui.saved[0]);
          assert.deepEqual(created, expectedCreated);
          const edit = await modal(context, { ...created, id: 'mock-doctor' });
          if (payment_mode === 'general' || consultation_compensation_mode === 'inherit') {
            await edit.change(edit.container.querySelector('[name="payment_value"]'), '23.75');
          }
          if (consultation_compensation_mode === 'separate') {
            await edit.change(edit.container.querySelector('[name="consultation_payment_value"]'), '31.25');
          }
          await edit.submit();
          assert.equal(edit.saved.length, 1);
          const expectedEdited = buildDoctorPayload({ ...created,
            payment_value: payment_mode === 'general' || consultation_compensation_mode === 'inherit' ? 23.75 : created.payment_value,
            consultation_payment_value: consultation_compensation_mode === 'separate' ? 31.25 : created.consultation_payment_value });
          assert.deepEqual(edit.saved[0], { ...expectedEdited, editingItem: { ...created, id: 'mock-doctor' } });
          assert.deepEqual(buildDoctorPayload(edit.saved[0]), expectedEdited);
          cases.push({ created, edited: expectedEdited });
        }
      }
    }
  }
  assert.equal(cases.length, 54);
  if (process.env.DOCTOR_CONTRACT_PAYLOADS) await writeFile(process.env.DOCTOR_CONTRACT_PAYLOADS, JSON.stringify(cases));
});
