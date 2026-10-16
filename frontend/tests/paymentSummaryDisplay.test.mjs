import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bootstrap = new JSDOM('<html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const { createRoot } = await import('react-dom/client');
delete globalThis.window; delete globalThis.document; bootstrap.window.close();

const compiled = await build({
  stdin: { contents: `
    export { default as ServicePaymentList } from './src/components/treatment/ServicePaymentList.jsx';
    export { default as TreatmentPlanView } from './src/components/treatment/TreatmentPlanView.jsx';
  `, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom', 'react-dom/client'],
  define: { 'import.meta.env': '{"VITE_BACKEND_URL":"https://crm.test"}' },
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { ServicePaymentList, TreatmentPlanView } = module.exports;

async function mount(t, Component, plan) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://crm.test' });
  const reads = [];
  const globals = {
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (url, options = {}) => {
      assert.equal(options.method || 'GET', 'GET', 'Display tests cannot issue payment commands');
      const path = new URL(url).pathname;
      assert.ok(['/api/payment-types', '/api/treatment-plans/plan-fixture/consultation'].includes(path), path);
      reads.push(path);
      return { ok: true, json: async () => path === '/api/payment-types' ? [] : null };
    },
  };
  const previous = new Map();
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const render = async updatedPlan => act(async () => root.render(React.createElement(Component, { plan: updatedPlan })));
  await render(plan);
  return { render, reads, container: document.getElementById('root') };
}

// These are synthetic API-shaped snapshots, not production observations.
const initialPlan = () => ({
  id: 'plan-fixture', title: 'Fixture plan', created_at: '2026-10-17',
  total_cost: 45000, paid_amount: 0, deposit_amount: 10000, payment_status: 'unpaid',
  services: [{ service_id: 'package', service_name: 'Fixture complex', is_complex: true,
    total_price: 45000, price: 45000, quantity: 1, payment_status: 'unpaid',
    components: [
      { service_id: 'a', service_name: 'Fixture A', price: 60000, quantity: 1 },
      { service_id: 'b', service_name: 'Fixture B', price: 30000, quantity: 1 },
    ],
  }],
});
const updatedPlan = plan => ({ ...plan, paid_amount: 40000, payment_status: 'partially_paid',
  services: [{ ...plan.services[0], paid_amount: 40000, discount_total: 5000, discount_amount: 5000,
    payment_status: 'paid', components: [
      { ...plan.services[0].components[0], paid: true, paid_amount: 25000, discount_amount: 5000 },
      { ...plan.services[0].components[1], paid: true, paid_amount: 15000, discount_amount: 0 },
    ],
  }],
});
const normalized = node => node.textContent.replace(/[\s\u00a0\u202f]+/g, ' ').trim();

test('real payment list rerenders updated complex and summary as settled without remount or reload', async t => {
  const plan = initialPlan();
  const { render, reads, container } = await mount(t, ServicePaymentList, plan);
  await act(async () => container.querySelector('button').click());
  const payRemaining = () => [...container.querySelectorAll('button')].find(button => normalized(button).includes('Оплатить остаток'));
  assert.match(normalized(payRemaining()), /45[ ,]?000/);
  const readsBefore = reads.length;
  await render(updatedPlan(plan));
  assert.ok(!payRemaining(), 'General remaining is zero');
  assert.match(normalized(container), /План лечения полностью оплачен/);
  assert.doesNotMatch(normalized(container), /Остаток:/, 'Complex has zero remaining too');
  assert.match(normalized(container), /40[ ,]?000 ₸ · скидка 5[ ,]?000 ₸/);
  assert.equal(reads.length, readsBefore, 'No refetch or page reload is needed for this rerender');
});

test('real plan view uses the same balance, actual money and one child discount despite parent mirrors', async t => {
  const plan = updatedPlan(initialPlan());
  // Retain a nonzero balance so a duplicate discount or deposit subtraction cannot hide behind a zero clamp.
  plan.paid_amount = 30000;
  plan.services[0].paid_amount = 30000;
  plan.services[0].components[0].paid_amount = 15000;
  const { container } = await mount(t, TreatmentPlanView, plan);
  const valueFor = label => {
    const node = [...container.querySelectorAll('div')].find(node => node.textContent === label);
    assert.ok(node, label);
    return normalized(node.nextElementSibling);
  };
  assert.match(valueFor('Оплачено'), /^30[ ,]?000 ₸$/);
  assert.match(valueFor('Остаток'), /^10[ ,]?000 ₸$/);
  assert.match(valueFor('Скидка'), /^−5[ ,]?000 ₸$/);
});
