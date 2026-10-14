import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
bootstrap.window.close();

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
      if (['./NavigationSearch', './navigationCatalog', '../modals/Modal'].includes(args.path)) return;
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

async function mount(context, role, path = '/calendar', width = 1024) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
  dom.window.innerWidth = width;
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

function assertSidebar(document, open) {
  const nav = document.querySelector('nav');
  assert.equal(nav.classList.contains('translate-x-0'), open);
  assert.equal(nav.classList.contains('-translate-x-full'), !open);
  const content = document.querySelector('header').parentElement;
  assert.equal(content.classList.contains('lg:ml-64'), open);
  assert.equal(content.classList.contains('lg:ml-0'), !open);
  assert.equal(!!document.querySelector('header [aria-label="Open sidebar"]'), !open);
  assert.equal(!!document.querySelector('.bg-opacity-50.lg\\:hidden'), open);
}

async function resize(document, width) {
  await act(async () => {
    document.defaultView.innerWidth = width;
    document.defaultView.dispatchEvent(new document.defaultView.Event('resize'));
  });
}

test('desktop sidebar starts collapsed and header opens it; sidebar toggle closes it', async context => {
  const document = await mount(context, 'admin');
  assertSidebar(document, false);
  await act(async () => document.querySelector('header [aria-label="Open sidebar"]').click());
  assertSidebar(document, true);
  await act(async () => document.querySelector('nav button[aria-label]').click());
  assertSidebar(document, false);
  await resize(document, 1440);
  assertSidebar(document, false);
});

test('desktop resize preserves an open sidebar until mobile and never reopens it', async context => {
  const document = await mount(context, 'admin', '/calendar', 1440);
  assertSidebar(document, false);
  await act(async () => document.querySelector('header [aria-label="Open sidebar"]').click());
  await resize(document, 1024);
  assertSidebar(document, true);
  await act(async () => document.querySelector('nav [data-guide="nav-patients"]').click());
  assert.equal(document.querySelector('#location').textContent, '/patients');
  assertSidebar(document, true);
  await resize(document, 1023);
  assertSidebar(document, false);
  await resize(document, 1280);
  assertSidebar(document, false);
});

test('mobile sidebar starts collapsed, closes via overlay and navigation, and stays closed on desktop', async context => {
  const document = await mount(context, 'admin', '/calendar', 390);
  assertSidebar(document, false);
  const open = async () => act(async () => document.querySelector('header [aria-label="Open sidebar"]').click());
  await open();
  assertSidebar(document, true);
  await act(async () => document.querySelector('.bg-opacity-50.lg\\:hidden').click());
  assertSidebar(document, false);
  await open();
  await act(async () => document.querySelector('nav [data-guide="nav-patients"]').click());
  assert.equal(document.querySelector('#location').textContent, '/patients');
  assertSidebar(document, false);
  await resize(document, 1024);
  assertSidebar(document, false);
});

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

for (const role of [...staff, 'patient']) {
  test(`Search respects finance access and keyboard navigation for ${role}`, async context => {
    const document = await mount(context, role);
    const trigger = document.querySelector('header [aria-haspopup="dialog"]');
    await act(async () => trigger.click());
    const input = document.querySelector('[role="combobox"]');
    const listbox = document.getElementById(input.getAttribute('aria-controls'));
    assert.equal(document.activeElement, input);
    assert.equal(listbox.getAttribute('role'), 'listbox');
    assert.equal(listbox.querySelectorAll('button, a, input, [tabindex]').length, 0);
    const financeKeys = [...listbox.querySelectorAll('[role="option"]')]
      .map(option => option.id.replace('navigation-result-', '')).filter(key => key.startsWith('finance-'));
    assert.deepEqual(financeKeys, role === 'patient' ? [] : ['admin', 'super_admin'].includes(role)
      ? ['finance-dashboard', 'finance-income', 'finance-expenses', 'finance-salaries', 'finance-reports']
      : ['finance-salaries']);
    if (role === 'patient') {
      await act(async () => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    } else {
      await act(async () => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
      const option = document.getElementById(input.getAttribute('aria-activedescendant'));
      assert.equal(option.getAttribute('aria-selected'), 'true');
      const destination = option.id.replace('navigation-result-', '');
      await act(async () => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
      assert.equal(document.querySelector('#location').textContent, `/${destination}`);
    }
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, trigger);
  });
}

test('search traps focus, wraps arrows, ignores composing Enter and handles empty results', async context => {
  const document = await mount(context, 'admin');
  const trigger = document.querySelector('header [aria-haspopup="dialog"]');
  await act(async () => trigger.click());
  const input = document.querySelector('[role="combobox"]');
  const closeButton = document.querySelector('[role="dialog"] button');
  await act(async () => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
  assert.equal(document.activeElement, closeButton);
  await act(async () => closeButton.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
  assert.equal(document.activeElement, input);
  await act(async () => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
  assert.equal(input.getAttribute('aria-activedescendant'), document.querySelector('[role="option"]:last-child').id);
  await act(async () => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
  assert.ok(document.querySelector('[role="dialog"]'));
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'nonexistent destination');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.equal(document.querySelectorAll('[role="option"]').length, 0);
  assert.equal(input.hasAttribute('aria-activedescendant'), false);
  await act(async () => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  assert.equal(document.querySelector('#location').textContent, '/calendar');
  await act(async () => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, trigger);
});
