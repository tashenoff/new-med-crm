import { chromium, expect } from '@playwright/test';
import { MongoClient } from 'mongodb';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const cases = {
  'ordinary-fixed': { doctor: 'e2e-doctor', complex: false },
  'ordinary-hybrid': { doctor: 'e2e-hybrid', complex: false },
  'complex-components': { doctor: 'e2e-doctor', complex: true, componentFirst: true },
  'complex-full': { doctor: 'e2e-doctor', complex: true },
  'lab-analysis': { doctor: null, complex: false, lab: true },
};
const caseId = process.env.E2E_SCENARIO;
assert.ok(Object.hasOwn(cases, caseId), 'Runner must select a known bounded scenario');
const config = cases[caseId];
const names = { 'e2e-doctor': 'E2E Fixed Doctor', 'e2e-hybrid': 'E2E Hybrid Doctor' };
const targets = config.complex ? [
  { service: 'e2e-component-fixed', doctor: 'e2e-doctor', price: 2000, salary: 1000 },
  { service: 'e2e-component-hybrid', doctor: 'e2e-hybrid', price: 3000, salary: 1300 },
] : config.lab ? [{ service: 'e2e-analysis', doctor: null, price: 2500, salary: 0 }]
  : [{ service: 'e2e-service', doctor: config.doctor, price: 3000, salary: config.doctor === 'e2e-hybrid' ? 1300 : 1000 }];
const total = targets.reduce((sum, target) => sum + target.price, 0);
const session = JSON.parse(await readFile('/run/secrets/session', 'utf8'));
const origin = 'http://localhost';
const patientName = `E2E Synthetic ${caseId}`;
const client = new MongoClient('mongodb://mongo:27017');
const db = client.db('medcrm_browser_e2e');
const evidence = { caseId, stages: [], checkpoints: [], replays: [], financeResponses: [], blockedExternalRequests: [], httpErrors: [], browserErrors: [] };
let stage = 'browser startup';
let page, browser, context, documentId, baselinePlan;
const artifact = name => `/artifacts/${caseId}-${name}`;
const stageAt = message => { stage = message; evidence.stages.push(message); console.log(`SCENARIO ${caseId}: ${message}`); };
// Mongo stores UTC BSON dates at millisecond precision; FastAPI serializes the
// same naive UTC value with six fractional digits and no trailing Z.
const normalized = value => JSON.parse(JSON.stringify(value), (key, item) => {
  if (typeof item === 'string' && /(?:_at|_date)$/.test(key) &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)?$/.test(item)) {
    return new Date(/(?:Z|\+00:00)$/.test(item) ? item : item + 'Z').toISOString();
  }
  return item;
});

async function navigate(label) {
  const patientPlans = page.locator('.modal-content').getByRole('button', { name: 'Планы лечения', exact: true });
  if (await patientPlans.isVisible()) {
    await patientPlans.click();
    await page.keyboard.press('F2');
  } else {
    await page.getByRole('button', { name: 'Поиск разделов', exact: true }).click();
  }
  await page.getByPlaceholder('Календарь, расписание…').fill(label);
  await page.getByRole('option').filter({ hasText: label }).click();
}
async function api(path, body) {
  return page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }, { path, body });
}
function expectedSalary(paidCount) {
  const result = config.lab ? { 'e2e-doctor': 1000, 'e2e-hybrid': 1300 } : { 'e2e-doctor': 0, 'e2e-hybrid': 0 };
  for (const target of targets.slice(0, paidCount)) if (target.doctor) result[target.doctor] += target.salary;
  return result;
}
async function salary(paidCount) {
  const expected = expectedSalary(paidCount);
  const result = await api('/api/doctors/salary-report');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.compensation_complete, true);
  assert.deepEqual(result.body.accounting_blockers, []);
  assert.equal(result.body.summary.total_salary, Object.values(expected).reduce((a, b) => a + b, 0));
  assert.equal(result.body.salary_data.length, 2);
  for (const [doctor, amount] of Object.entries(expected)) {
    const rows = result.body.salary_data.filter(row => row.doctor_id === doctor);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].calculated_salary, amount, `${doctor}: exact salary`);
  }
  return result.body;
}
async function captureLabBaseline() {
  // This is real persisted output of the preceding complex-full UI scenario,
  // never a fabricated paid seed or a mocked finance response.
  const patient = await db.collection('patients').findOne({ full_name: 'E2E Synthetic complex-full' });
  assert.ok(patient, 'Run lab after the existing complex-full browser scenario');
  assert.equal(await db.collection('patients').countDocuments({}), 1);
  assert.equal(await db.collection('treatment_plans').countDocuments({}), 1);
  baselinePlan = await db.collection('treatment_plans').findOne({ patient_id: patient.id });
  assert.equal(baselinePlan.payment_status, 'paid');
  assert.equal(baselinePlan.execution_status, 'completed');
  assert.equal(baselinePlan.paid_amount, 5000);
  assert.equal(baselinePlan.accounting_events.length, 4);
  for (const [doctor, amount] of Object.entries(expectedSalary(0))) {
    assert.equal(baselinePlan.accounting_events.filter(e => e.doctor_id === doctor)
      .reduce((sum, event) => sum + event.compensation_amount_kzt, 0), amount);
  }
  evidence.baseline = { plan_id: baselinePlan.id, salary_by_doctor: expectedSalary(0) };
}
async function uiSalary(paidCount) {
  for (const [doctor, amount] of Object.entries(expectedSalary(paidCount))) {
    const row = page.getByRole('row').filter({ hasText: names[doctor] });
    const formatted = new Intl.NumberFormat('ru-RU').format(amount).replaceAll('\u00a0', '\\s');
    await expect(row.getByRole('cell').last()).toHaveText(new RegExp(`^${formatted} KZT$`));
  }
}
function componentRow(name) {
  return page.locator('div.flex.items-center.justify-between.px-3.py-2').filter({ hasText: name });
}
async function uiComponents(paidCount) {
  if (!config.complex) return;
  for (const [index, name] of ['E2E Fixed Component', 'E2E Hybrid Component'].entries()) {
    const row = componentRow(name);
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'Оплатить', exact: true })).toHaveCount(index < paidCount ? 0 : 1);
    if (index < paidCount) {
      const amount = new Intl.NumberFormat('ru-RU').format(targets[index].price).replaceAll('\u00a0', '\\s');
      await expect(row.getByText(new RegExp(`^✅ ${amount} ₸$`))).toBeVisible();
    }
  }
}
async function snapshot(name, paidCount) {
  const patient = await db.collection('patients').findOne({ full_name: patientName });
  assert.ok(patient, 'UI-created synthetic patient must exist in MongoDB');
  assert.equal(await db.collection('patients').countDocuments({}), config.lab ? 2 : 1);
  const plans = await db.collection('treatment_plans').find({ patient_id: patient.id }).toArray();
  assert.equal(plans.length, 1, 'Exactly one UI-created treatment plan per reset');
  const plan = plans[0];
  assert.equal(plan.payment_completion_policy, 'full_payment_v1');
  assert.equal(plan.total_cost, total);
  assert.equal(plan.assigned_doctor_id, config.doctor);
  assert.equal(plan.services.length, 1);
  const row = plan.services[0];
  assert.equal(row.service_id, config.complex ? 'e2e-complex' : targets[0].service);
  assert.equal(Boolean(row.is_complex), config.complex);
  assert.equal(row.is_course || false, false);
  assert.equal(row.total_price, total);
  if (config.complex) assert.equal(row.components.length, 2);
  const paidAmount = targets.slice(0, paidCount).reduce((sum, target) => sum + target.price, 0);
  assert.equal(plan.paid_amount, paidAmount);
  const events = plan.accounting_events || [];
  assert.equal(events.length, paidCount * 2, 'Exactly one receipt/completion per paid target');
  const prefix = config.complex ? 'component' : 'service';
  for (const [index, target] of targets.entries()) {
    const item = config.complex ? row.components.find(component => component.service_id === target.service) : row;
    assert.ok(item, 'Expected stable service/component exists');
    assert.equal(item.doctor_id || plan.assigned_doctor_id, target.doctor);
    if (config.lab) {
      assert.equal(item.doctor_id ?? null, null);
      assert.equal(plan.doctor_name ?? null, null);
      assert.deepEqual(plan.appointment_ids, []);
      assert.equal(item.laboratory_id, 'e2e-laboratory');
      assert.equal(item.service_catalog_snapshot.id, 'e2e-analysis');
      assert.equal(item.service_catalog_snapshot.laboratory_id, 'e2e-laboratory');
      assert.equal(item.service_catalog_snapshot.service_type, 'regular');
    }
    assert.equal(item.occurrence_ids.length, 1);
    assert.ok(item.occurrence_ids[0]);
    if (config.complex) { assert.equal(item.price, target.price); assert.ok(item.component_id); }
    const linked = events.filter(event => event.service_id === target.service);
    if (index < paidCount) {
      assert.equal(item.status, 'completed');
      assert.equal(item.quantity_completed, 1);
      assert.equal(item.payment_status, 'paid');
      assert.equal(linked.length, 2);
      const receipt = linked.find(event => event.kind === `${prefix}_receipt`);
      const completion = linked.find(event => event.kind === `${prefix}_completion`);
      assert.ok(receipt); assert.ok(completion);
      assert.equal(receipt.amount_kzt, target.price);
      assert.equal(receipt.compensation_amount_kzt, config.lab ? 0 : target.salary - 1000);
      assert.equal(completion.compensation_amount_kzt, config.lab ? 0 : 1000);
      assert.equal(completion.amount_kzt, 0);
      assert.equal(completion.completion_source, 'full_payment');
      assert.equal(completion.occurrence_id, item.occurrence_ids[0]);
      for (const event of linked) {
        assert.equal(event.doctor_id, target.doctor);
        assert.equal(event.service_row_id, row.service_row_id);
        assert.equal(event.currency, 'KZT');
        if (config.lab) {
          assert.equal(event.service_catalog_snapshot.id, 'e2e-analysis');
          assert.equal(event.service_catalog_snapshot.laboratory_id, 'e2e-laboratory');
          assert.deepEqual(event.compensation_snapshot, { payment_mode: 'general', payment_type: 'percentage',
            payment_value: 0, hybrid_percentage_value: 0, currency: 'KZT', service_id: 'e2e-analysis' });
        }
        if (config.complex) assert.equal(event.component_id, item.component_id);
      }
      assert.equal(linked.reduce((sum, event) => sum + event.compensation_amount_kzt, 0), target.salary);
    } else {
      assert.equal(linked.length, 0, 'Unpaid component has no receipt/completion/accrual');
      assert.equal(item.quantity_completed || 0, 0);
      assert.notEqual(item.status, 'completed');
      assert.notEqual(item.payment_status, 'paid');
      assert.equal(item.paid_amount || 0, 0);
    }
  }
  if (paidCount === targets.length) {
    assert.equal(plan.execution_status, 'completed');
    assert.equal(plan.payment_status, 'paid');
    assert.equal(row.status, 'completed');
    assert.equal(row.payment_status, 'paid');
  } else {
    assert.notEqual(plan.execution_status, 'completed');
    assert.notEqual(row.status, 'completed');
    if (paidCount) { assert.equal(plan.payment_status, 'partially_paid'); assert.equal(row.payment_status, 'partially_paid'); }
  }
  assert.equal(await db.collection('notification_rules').countDocuments({}), 0);
  assert.equal(await db.collection('wazzup_messages').countDocuments({}), 0);
  const report = await salary(paidCount);
  if (config.lab) {
    assert.equal(await db.collection('treatment_plans').countDocuments({}), 2);
    assert.deepEqual(await db.collection('treatment_plans').findOne({ id: baselinePlan.id }), baselinePlan,
      'Adding/paying/replaying a doctorless analysis preserves the entire previous paid plan');
  }
  const apiPlan = await api(`/api/treatment-plans/${plan.id}`);
  assert.equal(apiPlan.status, 200);
  for (const key of ['paid_amount', 'execution_status', 'payment_status', 'services', 'accounting_events']) {
    assert.deepEqual(normalized(apiPlan.body[key]), normalized(plan[key]), `API/Mongo agree: ${key}`);
  }
  const result = { patient, plan, report, ...(config.lab ? { baselinePlan } : {}) };
  await writeFile(artifact(`${name}.json`), JSON.stringify(result, null, 2));
  evidence.checkpoints.push({ name, paid_kzt: paidAmount, salary_by_doctor: expectedSalary(paidCount), event_count: events.length });
  return result;
}
async function openPlan(plan) {
  await page.locator('.modal-content').getByRole('button', { name: 'Планы лечения', exact: true }).click();
  await page.getByText(plan.title, { exact: true }).filter({ visible: true }).first().click();
}
async function pay(amount, componentFirst = false) {
  if (componentFirst) {
    // Scope the actual component payment row by its visible service name.
    await componentRow('E2E Fixed Component')
      .getByRole('button', { name: 'Оплатить', exact: true }).click();
  } else {
    await page.getByRole('button', { name: /Оплатить остаток/ }).click();
  }
  await page.getByText('E2E Internal Cash', { exact: true }).click();
  const requestPromise = page.waitForRequest(request => request.method() === 'POST' &&
    /\/(receipts|settle-remaining|mark-paid)$/.test(new URL(request.url()).pathname));
  // Lab salaries intentionally do not change. Require a fresh request from the
  // mounted Finance view itself (dated query), not merely our API assertions.
  const financeRefresh = config.lab ? page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/doctors/salary-report' && url.searchParams.has('date_from');
  }).then(response => ({ status: response.status() })).catch(error => ({ error: error.message })) : null;
  const formatted = new Intl.NumberFormat('ru-RU').format(amount).replaceAll('\u00a0', '\\s?');
  await page.getByRole('button', { name: new RegExp(`^Оплатить ${formatted} ₸$`) }).click();
  const request = await requestPromise;
  const response = await request.response();
  assert.ok(response?.ok(), `UI payment failed: ${response?.status()} ${await response?.text()}`);
  if (financeRefresh) {
    const result = await financeRefresh;
    assert.equal(result.status, 200, `Mounted Finance must refresh after lab payment: ${JSON.stringify(result)}`);
    evidence.financeLiveRefresh = true;
  }
  return { path: new URL(request.url()).pathname, body: request.postDataJSON() };
}
async function replay(command, state, paidCount, name) {
  stageAt(`Replay ${name}: concurrent payment and each paid completion must preserve exact ledger`);
  const repeated = await Promise.all([api(command.path, command.body), api(command.path, command.body)]);
  assert.deepEqual(repeated.map(result => result.status), [200, 200]);
  const fresh = await api(command.path, { ...command.body, operation_id: randomUUID() });
  assert.equal(fresh.status, command.path.endsWith('/mark-paid') ? 422 : 409, JSON.stringify(fresh));
  const plan = state.plan, row = plan.services[0];
  const completionStatuses = [];
  for (const target of targets.slice(0, paidCount)) {
    const item = config.complex ? row.components.find(component => component.service_id === target.service) : row;
    const componentPath = config.complex ? `/components/${item.component_id}` : '';
    const result = await api(`/api/treatment-plans/${plan.id}/service-rows/${row.service_row_id}${componentPath}/occurrences/${item.occurrence_ids[0]}/complete`, { operation_id: randomUUID() });
    assert.equal(result.status, 409, JSON.stringify(result));
    completionStatuses.push(result.status);
  }
  const after = await snapshot(`after-repeat-${name}`, paidCount);
  assert.deepEqual(after.plan.accounting_events, plan.accounting_events, 'Duplicate commands preserve entire ledger');
  assert.deepEqual(after.plan.services, plan.services, 'Duplicate commands preserve execution/payment projections');
  await uiSalary(paidCount);
  evidence.replays.push({ name, sameOperation: repeated.map(result => result.status), newPaymentOperation: fresh.status, repeatCompletions: completionStatuses });
}
async function reload(paidCount, name) {
  await page.locator('.modal-content').getByRole('button', { name: 'Закрыть', exact: true }).last().click();
  await page.reload();
  await uiSalary(paidCount);
  const persisted = await snapshot(`after-reload-${name}`, paidCount);
  await page.screenshot({ path: artifact(`finance-reloaded-${name}.png`), fullPage: true });
  return persisted;
}

try {
  await client.connect();
  browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium' });
  evidence.chromium = browser.version();
  context = await browser.newContext({ viewport: { width: 1920, height: 1200 }, locale: 'ru-RU', timezoneId: 'UTC' });
  // No business API mocks. Deny only requests leaving the isolated stack.
  await context.route('**/*', async route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    evidence.blockedExternalRequests.push(new URL(route.request().url()).hostname);
    return route.abort('blockedbyclient');
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  const logs = [];
  page.on('console', message => logs.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', error => evidence.browserErrors.push(error.message));
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/api/doctors/salary-report') evidence.financeResponses.push(response.status());
    if (response.status() >= 400) evidence.httpErrors.push({ path: new URL(response.url()).pathname, status: response.status() });
  });
  page.on('dialog', dialog => dialog.accept());
  try {
    stageAt('Auth denies anonymous access; login through UI with expiring disposable user');
    assert.ok([401, 403].includes((await context.request.get(`${origin}/api/patients`)).status()));
    await page.goto(origin);
    assert.equal(await page.evaluate(() => window.isSecureContext && typeof crypto.randomUUID === 'function'), true);
    await page.getByPlaceholder('Email или логин').fill('browser-e2e@example.com');
    await page.getByPlaceholder('Пароль', { exact: true }).fill(session.password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.waitForURL('**/calendar');
    const skip = page.getByRole('button', { name: 'Пропустить', exact: true });
    if (await skip.isVisible()) await skip.click();
    assert.equal((await api('/api/wazzup/messages/send', {})).status, 503);
    if (config.lab) {
      stageAt('Retain the prior UI-paid complex and its nonzero 1000/1300 doctor salaries');
      await captureLabBaseline();
      await salary(0);
    }
    stageAt(config.lab ? 'Create synthetic patient and standalone analysis through Analyses UI without a doctor' : 'Create synthetic patient and plan through consultation UI');
    await navigate('Пациенты');
    await page.getByRole('button', { name: '+ Добавить пациента', exact: true }).click();
    await page.getByPlaceholder('ФИО *', { exact: true }).fill(patientName);
    await page.getByPlaceholder('Телефон *', { exact: true }).fill(config.lab ? '70000000001' : '70000000000');
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await page.getByRole('row').filter({ hasText: patientName }).click();
    if (config.lab) {
      await page.getByRole('button', { name: 'Анализы', exact: true }).click();
      await page.getByPlaceholder('Поиск по названию анализа...').fill('E2E Standalone Analysis');
      await page.locator('label').filter({ hasText: 'E2E Standalone Analysis' }).getByRole('checkbox').check();
      const created = page.waitForResponse(response => response.request().method() === 'POST' &&
        /\/api\/patients\/[^/]+\/treatment-plans$/.test(new URL(response.url()).pathname));
      await page.getByRole('button', { name: 'Добавить 1', exact: true }).click();
      const response = await created;
      assert.equal(response.status(), 200, await response.text());
      const creation = response.request().postDataJSON();
      assert.equal(creation.assigned_doctor_id ?? null, null);
      assert.equal(creation.services[0].doctor_id ?? null, null);
      await expect(page.getByText('✅ Анализы добавлены в план лечения', { exact: true })).toBeVisible();
    } else {
      await page.getByRole('button', { name: 'Консультации', exact: true }).click();
      await page.getByRole('button', { name: 'Добавить', exact: true }).click();
      await page.locator('select').filter({ has: page.locator(`option[value="${config.doctor}"]`) }).selectOption(config.doctor);
      const serviceName = config.complex ? 'E2E Two Doctor Complex' : 'E2E Ordinary Service';
      await page.getByPlaceholder('Поиск по названию услуги...').fill(serviceName);
      await page.locator('label').filter({ hasText: serviceName }).getByRole('checkbox').check();
      if (config.complex) {
        stageAt('Use real specialist availability and valid automatically selected slots for two compatible doctors');
        const availability = await api(`/api/service-prices/e2e-complex/specialists-availability?date=${new Date().toISOString().slice(0, 10)}`);
        assert.equal(availability.status, 200);
        assert.deepEqual(availability.body.services.map(row => row.doctors.map(doctor => doctor.doctor_id)), [['e2e-doctor'], ['e2e-hybrid']]);
        const scheduling = page.getByText('📅 Расписание специалистов — по каждой услуге своя дата и время', { exact: true }).locator('..');
        await expect(scheduling.locator('input[type="date"]')).toHaveCount(2);
        const startSlots = scheduling.locator('select').filter({ has: page.locator('option[value="09:00"]') });
        await expect(startSlots).toHaveCount(2);
        for (const slot of await startSlots.all()) await expect(slot).toHaveValue('09:00');
      }
      await page.getByRole('button', { name: 'Добавить 1', exact: true }).click();
      await page.getByRole('button', { name: 'Создать', exact: true }).click();
      await page.getByText('Консультационные листы пациента:', { exact: false }).waitFor();
    }
    const before = await snapshot('before-payment', 0);
    stageAt(config.lab ? 'Mount Finance before lab payment; existing salaries stay 1000/1300 with no accounting blockers' : 'Mount Finance before payment; both doctors have zero salary');
    await navigate('Зарплата врачей');
    await uiSalary(0);
    documentId = randomUUID();
    await page.evaluate(id => { window.__e2eDocumentId = id; }, documentId);
    await openPlan(before.plan);
    await uiComponents(0);
    let paidCount = config.componentFirst ? 1 : targets.length;
    stageAt(config.componentFirst ? 'Pay only fixed component; hybrid component must remain unpaid/uncompleted with zero salary' : 'Pay full plan; every paid target completes and accrues exact salary');
    const first = await pay(config.componentFirst ? 2000 : total, config.componentFirst);
    await uiSalary(paidCount);
    await uiComponents(paidCount);
    const after = await snapshot('after-first-payment', paidCount);
    if (config.lab) {
      const header = page.locator('button').filter({ has: page.getByText(before.plan.title, { exact: true }) }).filter({ visible: true });
      await expect(header.getByText('✓ Оплачено', { exact: true })).toBeVisible();
    }
    assert.equal(await page.evaluate(() => window.__e2eDocumentId), documentId, 'Finance refreshes without document reload');
    await page.screenshot({ path: artifact('finance-live-first.png'), fullPage: true });
    await replay(first, after, paidCount, 'first');
    const persisted = await reload(paidCount, 'first');
    assert.deepEqual(persisted.plan.accounting_events, after.plan.accounting_events, 'Ledger persists across reload');
    if (config.componentFirst) {
      stageAt('Reopen patient and settle remaining hybrid component; previous fixed accrual remains exactly once');
      await navigate('Пациенты');
      await page.getByRole('row').filter({ hasText: patientName }).click();
      await navigate('Зарплата врачей');
      await uiSalary(1);
      documentId = randomUUID();
      await page.evaluate(id => { window.__e2eDocumentId = id; }, documentId);
      await openPlan(before.plan);
      await uiComponents(1);
      const rest = await pay(3000);
      paidCount = targets.length;
      await uiSalary(paidCount);
      await uiComponents(paidCount);
      const settled = await snapshot('after-remaining-payment', paidCount);
      assert.deepEqual(settled.plan.accounting_events.slice(0, 2), after.plan.accounting_events, 'Remaining settlement preserves first doctor events');
      assert.equal(await page.evaluate(() => window.__e2eDocumentId), documentId, 'Remaining settlement refreshes Finance live');
      await page.screenshot({ path: artifact('finance-live-remaining.png'), fullPage: true });
      await replay(rest, settled, paidCount, 'remaining');
      const final = await reload(paidCount, 'remaining');
      assert.deepEqual(final.plan.accounting_events, settled.plan.accounting_events);
    }
    assert.deepEqual(evidence.browserErrors, [], 'No uncaught browser errors');
    if (config.lab) {
      assert.ok(evidence.financeResponses.length >= 3, 'Real mounted Finance requests observed across payment/reload');
      assert.ok(evidence.financeResponses.every(status => status === 200), 'Finance must never return 409 or another error for a doctorless analysis');
      evidence.lab_semantics = 'Catalog-linked regular analysis: paid/completed accounting row, doctor_id null, zero compensation; no laboratory-result readiness status is invented';
    }
    evidence.status = 'passed';
    stageAt('PASS: exact UI/API/Mongo per-doctor totals, live Finance, reload and duplicate protection');
  } finally {
    await writeFile(artifact('browser.log'), logs.join('\n'));
  }
} catch (error) {
  evidence.status = 'failed';
  evidence.failure = { stage, message: error.message, stack: error.stack };
  console.error(`FAILED ${caseId} at ${stage}: ${error.message}`);
  if (page) {
    await page.screenshot({ path: artifact('failure.png'), fullPage: true }).catch(() => {});
    await writeFile(artifact('failure.html'), await page.content().catch(() => ''));
  }
  process.exitCode = 1;
} finally {
  await writeFile(artifact('evidence.json'), JSON.stringify(evidence, null, 2));
  if (context) await context.tracing.stop({ path: artifact('trace.zip') });
  await browser?.close();
  await client.close();
}
