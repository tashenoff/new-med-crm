import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Keep App routing and both navigation components real; replace unrelated screens
// and providers so payroll mounts can be observed without network requests.
const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/App.jsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom', 'react-router-dom'],
  loader: { '.js': 'jsx', '.css': 'empty' },
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'unrelated-app-dependencies', setup(builder) {
    builder.onResolve({ filter: /^\.\.?\// }, args => {
      if (/App\.jsx$/.test(args.importer) && /layout\/(Header|Navigation)$/.test(args.path)) return;
      return { path: args.path, namespace: 'fixture' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: `
      import React from 'react';
      const passthrough = ({children}) => children;
      export const AuthProvider = passthrough, ModalProvider = passthrough,
        NotificationProvider = passthrough, GuideProvider = passthrough,
        ThemeProvider = passthrough, GlobalRefreshProvider = passthrough;
      export const useAuth = () => ({user: globalThis.financeUser});
      export const useNotifications = () => ({unreadCount: 0});
      export const useGuide = () => ({});
      export const useDoctors = () => ({doctors: []});
      export const useGlobalRefresh = () => ({refreshTriggers: {doctors: 0}});
      export const useApi = () => ({});
      export const materialsApi = {};
      const screen = name => () => {
        globalThis.financeMounts.push(name);
        return React.createElement('div', {'data-screen': name}, name);
      };
      export const CalendarPage = screen('CalendarPage'), PatientsPage = screen('PatientsPage'),
        DoctorsPage = screen('DoctorsPage'), WarehousePage = screen('WarehousePage'),
        QualityAssessmentPage = screen('QualityAssessmentPage');
      export const GuideTourModal = () => null, GuideTour = () => null;
      export default screen(${JSON.stringify(args.path.split('/').at(-1))});
    ` }));
  } }]
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const App = module.exports.default;

async function mount(context, role, path = '/calendar') {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
  const globals = { window: dom.window, document: dom.window.document,
    localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
    financeUser: role ? { role, full_name: 'Employee', permissions: [] } : null,
    financeMounts: [] };
  const saved = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  const root = createRoot(dom.window.document.getElementById('root'));
  context.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  function Location() { return React.createElement('output', { id: 'location' }, useLocation().pathname); }
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [path] },
    React.createElement(App), React.createElement(Location))));
  return dom.window.document;
}

const staff = ['admin', 'super_admin', 'doctor', 'marketer', 'administrator', 'nurse'];
for (const role of staff) {
  test(`Finance header visible and opens salaries for ${role}`, async context => {
    const document = await mount(context, role);
    const button = [...document.querySelectorAll('header button')].find(b => b.textContent.trim() === 'Финансы');
    assert.ok(button, 'Finance header entry must be visible');
    await act(async () => button.click());
    assert.equal(document.querySelector('#location').textContent, '/finance-salaries');
    assert.ok(document.querySelector('[data-screen="SalariesView"]'));
    assert.ok(!globalThis.financeMounts.includes('FinanceDashboard'));
  });
}
for (const role of ['patient', null]) {
  test(`Finance header hidden for ${role}`, async context => {
    const document = await mount(context, role);
    assert.ok(![...document.querySelectorAll('header button')].some(b => b.textContent.trim() === 'Финансы'));
  });
}
for (const role of staff) {
  test(`Finance sidebar exposes appropriate tabs for ${role}`, async context => {
    const document = await mount(context, role, '/finance-salaries');
    const labels = [...document.querySelectorAll('nav .space-y-1 button')].map(b => b.textContent.trim());
    assert.deepEqual(labels, ['admin', 'super_admin'].includes(role)
      ? ['Дашборд', 'Доходы', 'Расходы', 'Зарплата врачей', 'Отчеты'] : ['Зарплата врачей']);
  });
}
test('patient direct payroll navigation never mounts salary screen', async context => {
  const document = await mount(context, 'patient', '/finance-salaries');
  assert.ok(!globalThis.financeMounts.includes('SalariesView'));
  assert.equal(document.querySelector('#location').textContent, '/calendar');
});
test('nonadmin direct dashboard navigation lands on salaries without mounting fake dashboard', async context => {
  const document = await mount(context, 'doctor', '/finance-dashboard');
  assert.ok(!globalThis.financeMounts.includes('FinanceDashboard'));
  assert.equal(document.querySelector('#location').textContent, '/finance-salaries');
  assert.ok(document.querySelector('[data-screen="SalariesView"]'));
});
