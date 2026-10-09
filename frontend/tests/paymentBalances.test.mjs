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
