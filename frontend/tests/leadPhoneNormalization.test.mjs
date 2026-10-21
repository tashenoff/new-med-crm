import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { formatPhoneChange } from '../src/hooks/phoneFormatter.js';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
bootstrap.window.close();

const compiled = await build({
  stdin: {
    contents: `import React from 'react';
      import View from './src/components/crm/leads/EnhancedLeadsView.js';
      import { ThemeProvider } from './src/hooks/useTheme.js';
      export default () => <ThemeProvider><View user={{ id: 'manager', permissions: ['crm_view','crm_edit','crm_delete','patients_view','patients_edit','calendar_view','calendar_edit','finance_view','finance_edit'] }} /></ThemeProvider>;`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx'
  },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom'], loader: { '.js': 'jsx' },
  define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'lead-phone-fixture', setup(builder) {
    builder.onResolve({ filter: /\/useCrm$|\/useKanbanColumns$|\/ModalContext$|\/WhatsAppSidebar$/ }, args => ({
      path: args.path, namespace: 'lead-phone-fixture'
    }));
    builder.onLoad({ filter: /.*/, namespace: 'lead-phone-fixture' }, args => ({ contents:
      args.path.endsWith('/useCrm')
        ? 'export const useCrm = () => globalThis.leadPhoneFixture;'
        : args.path.endsWith('/useKanbanColumns')
          ? `export const useKanbanColumns = () => ({ columns: [], loading: false, busy: false });`
          : args.path.endsWith('/ModalContext')
            ? 'export const useModal = () => ({ openModal() {}, closeModal() {} });'
            : 'export default () => null;'
    }));
  } }]
});
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  createRequire(import.meta.url), loaded, loaded.exports
);
const View = loaded.exports.default;
const cases = [
  ['8 (701) 234-56-78', '+77012345678'],
  ['+8 (123) 456-78-901', '+812345678901']
];
const emptyLead = {
  first_name: '', last_name: '', middle_name: '', phone: '', email: '',
  source: 'website', source_id: '', priority: 'medium', company: '',
  description: '', services_interested: []
};

async function mount(context) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
  const checked = [], created = [], alerts = [];
  const noop = () => {};
  const globals = {
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true, alert: value => alerts.push(value),
    leadPhoneFixture: {
      leads: [], managers: [], sources: [], loading: false,
      fetchLeads: noop, fetchAvailableManagers: noop, fetchSources: noop, clearError: noop,
      checkPatientByPhone: async phone => { checked.push(phone); return { patient: null, active_lead: null }; },
      createLead: async data => { created.push(data); }
    },
    fetch: async () => ({ ok: true, json: async () => [] })
  };
  const saved = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.assign(globalThis, globals);
  const root = createRoot(document.getElementById('root'));
  context.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await act(async () => root.render(React.createElement(View)));
  const click = async text => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === text);
    assert.ok(button, `${text} button exists`);
    assert.equal(button.disabled, false);
    await act(async () => button.click());
  };
  await click('+ Добавить');
  assert.match(document.querySelector('.modal-content').textContent, /Новая заявка/);
  return { checked, created, alerts, click, change: async (selector, value) => {
    const input = document.querySelector(`.modal-content ${selector}`);
    assert.ok(input, `${selector} exists in the create-lead modal`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    return input.value;
  } };
}

test('create-lead phone uses shared normalization for input, duplicate checks and saved payloads', async context => {
  for (const [phone, expected] of cases) {
    await context.test(`edited modal input: ${phone}`, async child => {
      const ui = await mount(child);
      await ui.change('input[type="text"]', 'Тестовый пациент');
      const displayed = await ui.change('input[type="tel"]', phone);
      // Let the existing 300 ms debounce complete before saving or unmounting.
      await act(async () => new Promise(resolve => setTimeout(resolve, 350)));
      await ui.click('Создать');
      assert.deepEqual(ui.created, [{
        ...emptyLead, first_name: 'Тестовый пациент', phone: expected,
        middle_name: null, email: null, source_id: null, company: null, description: null
      }]);
      assert.equal(displayed, expected);
      assert.deepEqual(ui.checked, [expected]);
      assert.deepEqual(ui.alerts, ['Заявка успешно создана!']);
    });
  }

  // No prefill entry point exists in this modal. Exercise its actual save handler
  // with untouched state to independently guard normalization at the payload boundary.
  const source = await readFile(new URL('../src/components/crm/leads/EnhancedLeadsView.js', import.meta.url), 'utf8');
  const start = source.indexOf('const handleCreateLead =');
  const end = source.indexOf('const handleCreateTask =', start);
  assert.ok(start >= 0 && end > start);
  for (const [phone, expected] of cases) {
    await context.test(`untouched state at save: ${phone}`, async () => {
      const newLead = { ...emptyLead, first_name: 'Тест', phone, source: '',
        source_id: 'source-id', email: 'test@example.test', company: 'Клиника',
        description: 'Описание', services_interested: ['service-id'] };
      const before = structuredClone(newLead);
      const created = [];
      const noop = () => {};
      const save = new Function(
        'newLead', 'formatPhoneChange', 'createLead', 'setShowCreateModal', 'setNewLead',
        'setFoundPatient', 'setFoundActiveLead', 'alert',
        `${source.slice(start, end)}; return handleCreateLead;`
      )(newLead, formatPhoneChange, async data => created.push(data), noop, noop, noop, noop, noop);
      await save();
      assert.deepEqual(created, [{ ...newLead, phone: expected, source: 'website', middle_name: null }]);
      assert.deepEqual(newLead, before);
    });
  }
});
