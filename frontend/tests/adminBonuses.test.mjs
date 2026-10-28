import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { canOpenPath, canOpenSpace, allPermissionKeys } from '../src/utils/permissions.js';
import { getNavigationMenu } from '../src/components/layout/navigationCatalog.js';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window; delete globalThis.document; bootstrap.window.close();
const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/components/finance/AdminBonuses.jsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'],
  loader: { '.js': 'jsx' },
  plugins: [{ name: 'synthetic-bonus-api', setup(builder) {
    builder.onResolve({ filter: /api\/config$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export const apiClient = {get: (...args) => globalThis.adminBonusApi.get(...args), put: (...args) => globalThis.adminBonusApi.put(...args)};
      export const handleApiError = error => error.response?.data?.detail || error.message;
    ` }));
  } }],
});
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), loaded, loaded.exports);
const AdminBonuses = loaded.exports.default;
const grants = ['admin_bonus_view', 'patients_view'];
const empty = { rows: [], employees: [], total: 0, timezone: 'Asia/Almaty' };
const configured = { enabled: true, rate_type: 'percentage', rate_value: 10, revision: 'revision-1' };
const report = { total: 1, timezone: 'Asia/Almaty', employees: [{ user_id: 'cashier-a', employee_name: 'Synthetic employee', bonus_amount_kzt: 300 }], rows: [{
  event_id: 'receipt-1', plan_id: 'plan-1', service_row_id: 'row-1', paid_at: '2026-09-30T23:59:00Z',
  employee_name: 'Synthetic employee', patient_name: 'Synthetic patient', service_name: 'Synthetic analysis',
  basis_amount_kzt: 3000, rate_type: 'percentage', rate_value: 10, amount_kzt: 300, status: 'accrued', payment_method: 'cash',
}] };

async function mount(t, permissions = grants, options = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://synthetic' });
  const calls = [];
  const api = {
    get: async (path, config) => {
      calls.push({ method: 'GET', path, config });
      if (path.endsWith('settings')) return { data: options.setting ?? configured };
      if (path.endsWith('context')) {
        if (options.contextError) throw new Error('ADMIN_BONUS_TIMEZONE is not configured');
        return { data: options.context ?? { timezone: 'Asia/Almaty', current_month: '2026-10' } };
      }
      return options.getReport ? options.getReport(config) : { data: options.report ?? report };
    },
    put: async (path, body) => {
      calls.push({ method: 'PUT', path, body });
      if (options.conflict) throw { response: { data: { detail: 'Bonus setting changed; refresh before saving' } } };
      return { data: { ...body, revision: 'revision-2' } };
    },
  };
  const globals = { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true, adminBonusApi: api };
  const saved = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  });
  await act(async () => root.render(React.createElement(AdminBonuses, { user: { permissions, role: options.role || 'admin', is_active: options.active !== false } })));
  const change = async (control, value) => act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value').set.call(control, value);
    control.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    control.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  const submit = async () => act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
  return { document, dom, calls, change, submit };
}

test('bonus navigation uses explicit grants and permits manager-only settings', () => {
  for (const role of ['admin', 'administrator', 'doctor']) {
    assert.equal(canOpenPath({ role, permissions: ['finance_view', 'finance_edit', 'payroll_view'] }, '/finance-admin-bonuses'), false);
  }
  for (const permission of ['admin_bonus_view', 'admin_bonus_manage']) {
    const user = { permissions: [permission] };
    assert.equal(canOpenSpace(user, 'finance'), true);
    assert.deepEqual(getNavigationMenu(user, 'finance').map(item => item.key), ['finance-admin-bonuses']);
    assert.ok(allPermissionKeys.includes(permission));
  }
});

test('super-admin with no scopes opens bonus menu, register and configuration through common access', async t => {
  const user = { role: 'super_admin', permissions: [], is_active: true };
  assert.equal(canOpenPath(user, '/finance-admin-bonuses'), true);
  assert.equal(canOpenSpace(user, 'finance'), true);
  assert.ok(getNavigationMenu(user, 'finance').some(item => item.key === 'finance-admin-bonuses'));
  const view = await mount(t, [], { role: 'super_admin' });
  assert.ok(view.document.querySelector('form'));
  assert.match(view.document.querySelector('tbody').textContent, /Synthetic patient/);
  await view.change(view.document.querySelector('[aria-label="Значение ставки"]'), '25');
  await view.submit();
  assert.equal(view.calls.find(call => call.method === 'PUT').body.rate_value, '25');
});

test('inactive super-admin gets no bonus access', async t => {
  assert.equal(canOpenPath({ role: 'super_admin', permissions: [], is_active: false }, '/finance-admin-bonuses'), false);
  const view = await mount(t, [], { role: 'super_admin', active: false });
  assert.equal(view.calls.length, 0);
});

test('unauthorized account mounts no financial requests', async t => {
  const view = await mount(t, ['finance_view', 'finance_edit']);
  assert.equal(view.calls.length, 0);
  assert.match(view.document.body.textContent, /Недостаточно прав/);
});

test('viewer sees patient, exact position, payment and historical bonus without setting controls', async t => {
  const view = await mount(t);
  const text = view.document.body.textContent;
  for (const expected of ['Synthetic employee', 'Synthetic patient', 'Synthetic analysis', 'receipt-1', 'row-1', 'Начислено']) assert.ok(text.includes(expected), expected);
  assert.equal(view.document.querySelector('form'), null);
});

test('manager without patient report rights can configure only, with revision and no recipient override', async t => {
  const view = await mount(t, ['admin_bonus_manage']);
  assert.equal(view.calls.filter(c => c.path === '/admin-bonuses').length, 0);
  await view.change(view.document.querySelector('[aria-label="Тип ставки"]'), 'fixed');
  await view.change(view.document.querySelector('[aria-label="Значение ставки"]'), '75');
  await view.submit();
  assert.deepEqual(view.calls.find(c => c.method === 'PUT').body, { enabled: true, rate_type: 'fixed', rate_value: '75', expected_revision: 'revision-1' });
  assert.match(view.document.body.textContent, /Ставка сохранена/);
});

test('unset global setting never invents a price and configuration conflict stays visible', async t => {
  const view = await mount(t, [...grants, 'admin_bonus_manage'], { setting: { enabled: false, rate_type: null, rate_value: null, revision: null }, report: empty, conflict: true });
  assert.equal(view.document.querySelector('[aria-label="Значение ставки"]').value, '');
  assert.equal(view.document.querySelector('input[type=checkbox]').checked, false);
  await view.submit();
  assert.deepEqual(view.calls.find(c => c.method === 'PUT').body, { enabled: false, rate_type: null, rate_value: null, expected_revision: null });
  assert.match(view.document.querySelector('[role=alert]').textContent, /changed; refresh/);
  assert.match(view.document.body.textContent, /начислений нет/);
});

test('switching employee and month sends precise filters and suppresses stale response', async t => {
  let resolveOld;
  let counter = 0;
  const view = await mount(t, grants, { getReport: () => {
    counter++;
    if (counter === 2) return new Promise(resolve => { resolveOld = resolve; });
    return { data: report };
  } });
  const employee = [...view.document.querySelectorAll('select')].find(select => select.textContent.includes('Все сотрудники'));
  await view.change(employee, 'cashier-a');
  assert.equal(view.calls.at(-1).config.params.employee_id, 'cashier-a');
  await view.change(view.document.querySelector('input[type=month]'), '2026-09');
  assert.equal(view.calls.at(-1).config.params.month, '2026-09');
  assert.equal(view.calls.at(-1).config.params.employee_id, undefined);
  await act(async () => resolveOld({ data: { ...report, rows: [{ ...report.rows[0], patient_name: 'STALE PATIENT' }] } }));
  assert.ok(!view.document.body.textContent.includes('STALE PATIENT'));
});

test('base bonus module exposes no advance, cancellation or preview workflow', async t => {
  const view = await mount(t);
  const text = view.document.body.textContent.toLowerCase();
  for (const excluded of ['аванс', 'возврат', 'отмен', 'ожидают правила', 'preview']) assert.ok(!text.includes(excluded), excluded);
  assert.equal(view.calls.filter(call => call.method === 'POST').length, 0);
});

test('month and displayed dates use server clinic timezone with a hostile browser clock', async t => {
  const NativeDate = globalThis.Date;
  const previousZone = process.env.TZ;
  globalThis.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : ['1970-01-01T00:00:00Z'])); }
  };
  process.env.TZ = 'America/New_York';
  t.after(() => { globalThis.Date = NativeDate; if (previousZone === undefined) delete process.env.TZ; else process.env.TZ = previousZone; });
  const view = await mount(t, grants, { report: { ...report, rows: [{ ...report.rows[0], paid_at: '2026-09-30T19:00:00Z' }] } });
  assert.equal(view.document.querySelector('input[type=month]').value, '2026-10');
  const request = view.calls.find(call => call.path === '/admin-bonuses');
  assert.equal(request.config.params.month, '2026-10');
  assert.match(view.document.querySelector('tbody').textContent, /01\.10\.2026/);
  assert.match(view.document.querySelector('tbody').textContent, /00:00:00/);
  assert.match(view.document.querySelector('thead').textContent, /Asia\/Almaty/);
});

test('missing clinic timezone is visible and does not fetch an assumed UTC report', async t => {
  const view = await mount(t, grants, { contextError: true });
  assert.equal(view.calls.filter(call => call.path === '/admin-bonuses').length, 0);
  assert.equal(view.document.querySelector('input[type=month]').disabled, true);
  assert.match(view.document.querySelector('[role=alert]').textContent, /ADMIN_BONUS_TIMEZONE/);
  assert.ok(!view.document.body.textContent.includes('За выбранный месяц начислений нет'));
});
