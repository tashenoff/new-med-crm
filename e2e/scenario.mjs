import { chromium, expect } from '@playwright/test';
import { MongoClient } from 'mongodb';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const session = JSON.parse(await readFile('/run/secrets/session', 'utf8'));
const origin = 'http://localhost';
const patientName = 'E2E Synthetic Patient';
const client = new MongoClient('mongodb://mongo:27017');
const db = client.db('medcrm_browser_e2e');
const evidence = { stages: [], blockedExternalRequests: [], httpErrors: [], browserErrors: [] };
let stage = 'browser startup';
let page, browser, context;
const stageAt = message => { stage = message; evidence.stages.push(message); console.log(`SCENARIO: ${message}`); };
const save = () => writeFile('/artifacts/evidence.json', JSON.stringify(evidence, null, 2));

async function navigate(label) {
  // Use the application's keyboard navigation, including when a patient modal is open.
  const patientPlans = page.locator('.modal-content').getByRole('button', { name: 'Планы лечения', exact: true });
  if (await patientPlans.isVisible()) {
    // Focus a real button; the shortcut intentionally ignores editable fields.
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
async function salary(expected) {
  const result = await api('/api/doctors/salary-report');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.compensation_complete, true);
  assert.deepEqual(result.body.accounting_blockers, []);
  assert.equal(result.body.summary.total_salary, expected);
  assert.equal(result.body.salary_data.length, 1);
  assert.equal(result.body.salary_data[0].doctor_id, 'e2e-doctor');
  assert.equal(result.body.salary_data[0].calculated_salary, expected);
  return result.body;
}
function salaryRow() {
  return page.getByRole('row').filter({ hasText: 'E2E Fixed Doctor' });
}
async function snapshot(name, paid) {
  const patient = await db.collection('patients').findOne({ full_name: patientName });
  assert.ok(patient, 'UI-created synthetic patient must exist in MongoDB');
  assert.equal(await db.collection('patients').countDocuments({}), 1);
  const plans = await db.collection('treatment_plans').find({ patient_id: patient.id }).toArray();
  assert.equal(plans.length, 1, 'Exactly one UI-created treatment plan');
  const plan = plans[0];
  assert.equal(plan.payment_completion_policy, 'full_payment_v1');
  assert.equal(plan.total_cost, 3000);
  assert.equal(plan.services.length, 1);
  const row = plan.services[0];
  assert.equal(row.service_id, 'e2e-service');
  assert.equal(row.is_complex || false, false);
  assert.equal(row.is_course || false, false);
  assert.equal(plan.assigned_doctor_id, 'e2e-doctor');
  assert.equal(row.total_price, 3000);
  assert.equal(plan.paid_amount, paid ? 3000 : 0);
  const events = plan.accounting_events || [];
  if (paid) {
    assert.equal(plan.execution_status, 'completed');
    assert.equal(plan.payment_status, 'paid');
    assert.equal(row.status, 'completed');
    assert.equal(row.quantity_completed, 1);
    assert.equal(row.payment_status, 'paid');
    assert.equal(events.length, 2, 'Exactly one receipt and one completion');
    const receipts = events.filter(e => e.kind === 'service_receipt');
    const completions = events.filter(e => e.kind === 'service_completion');
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].amount_kzt, 3000);
    assert.equal(completions.length, 1);
    assert.equal(completions[0].doctor_id, 'e2e-doctor');
    assert.equal(completions[0].completion_source, 'full_payment');
    assert.equal(completions[0].compensation_amount_kzt, 1000);
    assert.equal(completions[0].occurrence_id, row.occurrence_ids[0]);
    assert.equal(events.reduce((total, e) => total + e.compensation_amount_kzt, 0), 1000);
  } else {
    assert.equal(events.length, 0);
    assert.notEqual(plan.execution_status, 'completed');
    assert.equal(row.quantity_completed || 0, 0);
  }
  assert.equal(await db.collection('notification_rules').countDocuments({}), 0);
  assert.equal(await db.collection('wazzup_messages').countDocuments({}), 0);
  const report = await salary(paid ? 1000 : 0);
  const result = { patient, plan, report };
  await writeFile(`/artifacts/${name}.json`, JSON.stringify(result, null, 2));
  const apiPlan = await api(`/api/treatment-plans/${plan.id}`);
  assert.equal(apiPlan.status, 200);
  assert.equal(apiPlan.body.paid_amount, plan.paid_amount);
  assert.equal(apiPlan.body.execution_status, plan.execution_status);
  return result;
}

try {
  await client.connect();
  browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium' });
  evidence.chromium = browser.version();
  context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'ru-RU', timezoneId: 'UTC' });
  // Real business API is never mocked. Only non-stack requests are denied.
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
    if (response.status() >= 400) evidence.httpErrors.push({ path: new URL(response.url()).pathname, status: response.status() });
  });
  page.on('dialog', dialog => dialog.accept());
  try {
    stageAt('Readiness and auth: real API refuses unauthenticated patient access');
    const unauthorized = await context.request.get(`${origin}/api/patients`);
    assert.ok([401, 403].includes(unauthorized.status()));
    stageAt('Login through UI with a one-run expiring user');
    await page.goto(origin);
    assert.equal(await page.evaluate(() => window.isSecureContext && typeof crypto.randomUUID === 'function'), true, 'Loopback frontend must provide browser crypto in a secure context');
    await page.getByPlaceholder('Email или логин').fill('browser-e2e@example.com');
    await page.getByPlaceholder('Пароль', { exact: true }).fill(session.password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.waitForURL('**/calendar');
    const skip = page.getByRole('button', { name: 'Пропустить', exact: true });
    if (await skip.isVisible()) await skip.click();
    // Stamp the document, then require SPA navigation and finance refresh to preserve it.
    const documentId = randomUUID();
    await page.evaluate(id => { window.__e2eDocumentId = id; }, documentId);
    stageAt('Integration guard refuses Wazzup before any handler or external send');
    assert.equal((await api('/api/wazzup/messages/send', {})).status, 503);
    stageAt('Create patient through UI');
    await navigate('Пациенты');
    await page.getByRole('button', { name: '+ Добавить пациента', exact: true }).click();
    await page.getByPlaceholder('ФИО *', { exact: true }).fill(patientName);
    await page.getByPlaceholder('Телефон *', { exact: true }).fill('70000000000');
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await page.getByRole('row').filter({ hasText: patientName }).click();
    stageAt('Create an ordinary 3000 KZT treatment plan via consultation UI');
    await page.getByRole('button', { name: 'Консультации', exact: true }).click();
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await page.locator('select').filter({ has: page.locator('option[value="e2e-doctor"]') }).selectOption('e2e-doctor');
    await page.getByPlaceholder('Поиск по названию услуги...').fill('E2E Ordinary Service');
    await page.locator('label').filter({ hasText: 'E2E Ordinary Service' }).getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Добавить 1', exact: true }).click();
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await page.getByText('Консультационные листы пациента:', { exact: false }).waitFor();
    evidence.before = await snapshot('before-payment', false);
    stageAt('Open Finance under the patient modal; confirm mounted salary is zero');
    await navigate('Зарплата врачей');
    await expect(salaryRow().getByRole('cell').last()).toHaveText('0 KZT');
    await page.locator('.modal-content').getByRole('button', { name: 'Планы лечения', exact: true }).click();
    // Expand the real payment card, then submit an internal receipt through UI.
    await page.getByText(evidence.before.plan.title, { exact: true }).filter({ visible: true }).first().click();
    await page.getByRole('button', { name: /Оплатить остаток/ }).click();
    await page.getByText('E2E Internal Cash', { exact: true }).click();
    const receiptRequest = page.waitForRequest(request => request.method() === 'POST' && /\/(receipts|settle-remaining)$/.test(new URL(request.url()).pathname)).catch(() => null);
    stageAt('Full UI payment automatically completes one occurrence and accrues 1000 KZT');
    await page.getByRole('button', { name: /^Оплатить 3\s?000 ₸$/ }).click();
    const actualRequest = await receiptRequest;
    assert.ok(actualRequest, 'Full UI payment must submit an actual business API command');
    const command = actualRequest.postDataJSON();
    const commandPath = new URL(actualRequest.url()).pathname;
    await expect(salaryRow().getByRole('cell').last()).toHaveText(/1\s000 KZT/);
    evidence.after = await snapshot('after-payment', true);
    assert.equal(await page.evaluate(() => window.__e2eDocumentId), documentId, 'Finance must refresh in the existing document');
    await page.locator('.modal-content').getByRole('button', { name: 'Закрыть', exact: true }).last().click();
    await expect(salaryRow()).toBeVisible();
    await page.screenshot({ path: '/artifacts/finance-live.png', fullPage: true });
    stageAt('Repeat actual payment concurrently and retry completion; no duplicate ledger accrual');
    const replay = await Promise.all([api(commandPath, command), api(commandPath, command)]);
    assert.deepEqual(replay.map(result => result.status), [200, 200]);
    const newOperation = await api(commandPath, { ...command, operation_id: randomUUID() });
    assert.ok([200, 409].includes(newOperation.status), JSON.stringify(newOperation));
    const paidPlan = evidence.after.plan;
    const paidRow = paidPlan.services[0];
    const completeAgain = await api(`/api/treatment-plans/${paidPlan.id}/service-rows/${paidRow.service_row_id}/occurrences/${paidRow.occurrence_ids[0]}/complete`, { operation_id: randomUUID() });
    assert.ok([200, 409].includes(completeAgain.status), JSON.stringify(completeAgain));
    const repeated = await snapshot('after-repeat', true);
    assert.deepEqual(repeated.plan.accounting_events, paidPlan.accounting_events, 'Repeated commands must preserve the exact ledger');
    evidence.replay = { sameOperation: replay.map(result => result.status), newPaymentOperation: newOperation.status, repeatCompletion: completeAgain.status };
    stageAt('Reload Finance; API, persisted MongoDB and UI still show exactly 1000 KZT');
    await page.reload();
    await expect(salaryRow().getByRole('cell').last()).toHaveText(/1\s000 KZT/);
    await snapshot('after-reload', true);
    await page.screenshot({ path: '/artifacts/finance-reloaded.png', fullPage: true });
    assert.deepEqual(evidence.browserErrors, [], 'No uncaught browser errors');
    evidence.status = 'passed';
    stageAt('PASS: UI/API/DB agree; no duplicate receipt/completion/compensation');
  } finally {
    await writeFile('/artifacts/browser.log', logs.join('\n'));
  }
} catch (error) {
  evidence.status = 'failed';
  evidence.failure = { stage, message: error.message, stack: error.stack };
  console.error(`FAILED at ${stage}: ${error.message}`);
  if (page) {
    await page.screenshot({ path: '/artifacts/failure.png', fullPage: true }).catch(() => {});
    await writeFile('/artifacts/failure.html', await page.content().catch(() => ''));
  }
  process.exitCode = 1;
} finally {
  await save();
  if (context) await context.tracing.stop({ path: '/artifacts/trace.zip' });
  await browser?.close();
  await client.close();
}
