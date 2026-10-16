import assert from 'node:assert/strict';
import test from 'node:test';
import { paymentBreakdown, paymentSummary, discountedPaymentAmount } from '../src/utils/paymentBalances.js';

const plans = [
  { total_cost: 2500, paid_amount: 2000, accounting_events: [
    { kind: 'patient_deposit_received', amount_kzt: 2000 },
    { kind: 'service_deposit_allocation', amount_kzt: 2000 },
  ] },
  { total_cost: 3000, paid_amount: 3000, accounting_events: [
    { kind: 'payment_received', amount_kzt: 3000 },
  ] },
];

test('API accounting allocations split 5000 into deposit 2000 and other payments 3000', () => {
  assert.deepEqual(paymentBreakdown(plans), { depositPaid: 2000, otherPaid: 3000, known: true });
});

test('missing accounting events leaves breakdown unknown without inventing deposit financing', () => {
  assert.deepEqual(paymentBreakdown([{ paid_amount: 5000, deposit_amount: 2000 }]),
    { depositPaid: 0, otherPaid: 5000, known: false });
});

test('discount payload includes 2000 prior financing; no discount omits amount', () => {
  assert.equal(discountedPaymentAmount(500, 100, 2000), 2400);
  assert.equal(discountedPaymentAmount(500, 0, 2000), undefined);
});

test('API summary totals 5500, paid 5000 and remaining 500 without subtracting deposit twice', () => {
  assert.deepEqual(paymentSummary(plans), {
    totalAmount: 5500, paidAmount: 5000, remainingToPay: 500,
    depositPaid: 2000, otherPaid: 3000, known: true,
  });
});

test('ordinary partial service retains 500 remaining after 2000 paid', () => {
  const summary = paymentSummary([plans[0]]);
  assert.equal(summary.totalAmount, 2500);
  assert.equal(summary.paidAmount, 2000);
  assert.equal(summary.remainingToPay, 500);
});


// API contracts: total_price includes selector discount (%), discount_amount is
// the additional monetary payment discount; complex parent discounts mirror children.
const ordinary = (overrides = {}) => ({ total_price: 45000, paid_amount: 40000,
  discount_amount: 5000, payment_status: 'paid', ...overrides });
const complex = (overrides = {}) => ({ is_complex: true, total_price: 45000,
  paid_amount: 40000, discount_total: 5000, discount_amount: 5000,
  components: [
    { service_id: 'a', price: 60000, quantity: 1, paid: true, paid_amount: 25000, discount_amount: 5000 },
    { service_id: 'b', price: 30000, quantity: 1, paid: true, paid_amount: 15000, discount_amount: 0 },
  ], ...overrides });
const summaryFor = (service, overrides = {}) => paymentSummary([{ total_cost: 45000,
  paid_amount: service.paid_amount, services: [service], ...overrides }]);

test('ordinary 45000 less 5000 payment discount and 40000 actual money has no debt', () => {
  const summary = summaryFor(ordinary());
  assert.equal(summary.totalAmount, 45000, 'Keep stored cost unchanged');
  assert.equal(summary.paidAmount, 40000, 'Discount is not money received');
  assert.equal(summary.remainingToPay, 0);
});

test('ordinary no-discount and partial-payment obligations remain accurate', () => {
  assert.equal(summaryFor(ordinary({ discount_amount: 0 })).remainingToPay, 5000);
  assert.equal(summaryFor(ordinary({ paid_amount: 30000 })).remainingToPay, 10000);
  assert.equal(summaryFor(ordinary({ paid_amount: 0, discount_amount: 0 })).remainingToPay, 45000);
});

test('complex uses allocated package total, not larger positive catalog component prices', () => {
  assert.equal(summaryFor(complex()).remainingToPay, 0);
  assert.equal(summaryFor(complex({ paid_amount: 30000 })).remainingToPay, 10000);
});

test('complex parent monetary mirrors are not added to child discounts', () => {
  const service = complex({ paid_amount: 30000 });
  for (const mirror of [{}, { discount_amount: 5000 }, { discount_total: 5000 },
    { discount_amount: 5000, discount_total: 5000 }]) {
    delete service.discount_amount; delete service.discount_total;
    Object.assign(service, mirror);
    assert.equal(summaryFor(service).remainingToPay, 10000);
  }
});

test('a net plan aggregate is not discounted again when rows still carry gross obligations', () => {
  assert.equal(summaryFor(ordinary({ paid_amount: 30000 }), { total_cost: 40000 }).remainingToPay, 10000);
  assert.equal(summaryFor(complex({ paid_amount: 30000 }), { total_cost: 40000 }).remainingToPay, 10000);
});

test('selector percentage is already in row total_price and is not applied again', () => {
  const service = ordinary({ price: 50000, quantity: 1, discount: 10, total_price: 45000,
    paid_amount: 30000, discount_amount: 0 });
  assert.equal(summaryFor(service).remainingToPay, 15000);
  service.discount_amount = 5000;
  assert.equal(summaryFor(service).remainingToPay, 10000, 'Only additional payment discount is subtracted');
});

test('already reduced component prices and percentage metadata are not another payment discount', () => {
  const service = complex({ paid_amount: 30000, components: [
    { price: 30000, quantity: 1, discount: 50, paid_amount: 15000, discount_amount: 5000 },
    { price: 15000, quantity: 1, discount: 0, paid_amount: 15000, discount_amount: 0 },
  ] });
  assert.equal(summaryFor(service).remainingToPay, 10000);
  // No explicit monetary discount: precomputed package total remains authoritative.
  delete service.components[0].discount_amount;
  delete service.components[1].discount_amount;
  assert.equal(summaryFor(service).remainingToPay, 15000, 'Ignore stale parent mirrors when children exist');
});

test('mixed ordinary and complex debt keeps deposit allocation inside actual paid once', () => {
  const plan = { total_cost: 90000, paid_amount: 70000, deposit_amount: 20000,
    services: [ordinary(), complex({ paid_amount: 30000 })], accounting_events: [
      { kind: 'patient_deposit_received', amount_kzt: 20000 },
      { kind: 'service_deposit_allocation', amount_kzt: 20000 },
      { kind: 'service_receipt', amount_kzt: 50000 },
    ] };
  const before = structuredClone(plan);
  assert.deepEqual(paymentSummary([plan]), { totalAmount: 90000, paidAmount: 70000,
    remainingToPay: 10000, depositPaid: 20000, otherPaid: 50000, known: true });
  assert.deepEqual(plan, before, 'Pure calculation does not alter monetary snapshots');
});

test('legacy summaries with absent, empty or incomplete row totals retain the aggregate fallback', () => {
  for (const services of [undefined, [], [{ price: 45000, discount_amount: 5000 }]]) {
    assert.equal(paymentSummary([{ total_cost: 45000, paid_amount: 30000, services }]).remainingToPay, 15000);
  }
});

test('multiple-plan summary retains the existing aggregate payment treatment', () => {
  assert.equal(paymentSummary([
    { total_cost: 45000, paid_amount: 30000, services: [ordinary({ paid_amount: 30000 })] },
    { total_cost: 5000, paid_amount: 10000 },
  ]).remainingToPay, 5000);
});
