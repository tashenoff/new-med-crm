import assert from 'node:assert/strict';
import test from 'node:test';
import { appointmentPayment, servicePayment, positiveKzt, createLedgerCommands, requireSessionId } from '../src/utils/accountingLedger.js';

test('appointment receipts require purpose, actual KZT and payment method; deposits are not consultation defaults', () => {
  assert.throws(() => appointmentPayment({ deposit: 5000 }), /назначение/i);
  for (const payment_purpose of ['consultation', 'plan_advance']) {
    const payload = appointmentPayment({ payment_purpose, actual_amount_kzt: '2500', payment_method: 'cash', deposit: 9000 });
    assert.equal(payload.actual_amount_kzt, 2500);
    assert.equal(payload.payment_purpose, payment_purpose);
    assert.equal(payload.payment_method, 'cash');
    assert.equal(payload.deposit, undefined);
  }
  assert.throws(() => appointmentPayment({ payment_purpose: 'consultation', actual_amount_kzt: 1 }), /способ/i);
  assert.throws(() => appointmentPayment({ payment_purpose: 'consultation', actual_amount_kzt: 101, payment_method: 'cash', price: 100 }));
  assert.equal(appointmentPayment({ payment_purpose: 'plan_advance', actual_amount_kzt: 101, payment_method: 'cash', price: 100 }).actual_amount_kzt, 101);
});

test('positive finite KZT, amount bounds, discounts and funding choice are validated', () => {
  for (const value of ['', 0, -1, Infinity, NaN, 'bad']) assert.throws(() => positiveKzt(value));
  assert.throws(() => positiveKzt(101, 100));
  assert.throws(() => positiveKzt(100, NaN));
  assert.throws(() => positiveKzt(100, Infinity));
  assert.throws(() => servicePayment({ amount: 100, total: 100, discount: 0 }));
  assert.throws(() => servicePayment({ amount: 90, total: 100, discount: 20, funding_source: 'cash' }));
  assert.throws(() => servicePayment({ amount: 50, total: 100, discount: -1, funding_source: 'cash' }));
  assert.deepEqual(servicePayment({ amount: '80', total: 100, discount: 10, funding_source: 'cash' }), { amount: 80, discount_amount: 10, funding_source: 'cash' });
  assert.throws(() => servicePayment({ amount: 80, total: 100, discount: 0, funding_source: 'plan_advance', advanceBalance: 50 }));
  assert.equal(servicePayment({ amount: 40, total: 100, discount: 0, funding_source: 'plan_advance', advanceBalance: 50 }).amount, 40);
});

test('ledger retries reuse UUID and exact body, concurrent clicks and acknowledged repeats do not duplicate requests', async () => {
  const commands = createLedgerCommands();
  const bodies = [];
  let fail = true;
  const send = async body => { bodies.push(body); if (fail) throw new Error('offline'); return { ok: true }; };
  await assert.rejects(commands.run('service:1', { amount: 80 }, send));
  fail = false;
  await Promise.all([commands.run('service:1', { amount: 80 }, send), commands.run('service:1', { amount: 80 }, send)]);
  await commands.run('service:1', { amount: 80 }, send);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0], bodies[1]);
  assert.match(bodies[0].operation_id, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
  await commands.run('service:1', { amount: 70 }, send);
  assert.notEqual(bodies[2].operation_id, bodies[0].operation_id);
  assert.equal(commands.occurrence('plan:service:0'), commands.occurrence('plan:service:0'));
  assert.notEqual(commands.occurrence('plan:service:1'), commands.occurrence('plan:service:0'));
  assert.equal(createLedgerCommands().occurrence('plan:service:0'), commands.occurrence('plan:service:0'));
});

test('sessions require stable IDs, never array indexes or dates as identity', () => {
  assert.equal(requireSessionId({ session_id: 'stable' }), 'stable');
  assert.equal(requireSessionId({ id: 'stable' }), 'stable');
  assert.throws(() => requireSessionId({ date: '2026-10-08' }), /идентификатор/i);
});

test('editing a failed payment starts a new operation, while retrying either body retains its key', async () => {
  const commands = createLedgerCommands();
  const operation_id = crypto.randomUUID();
  const bodies = [];
  const send = async body => { bodies.push(body); throw new Error('offline'); };
  await assert.rejects(commands.run('payment', { amount: 80, operation_id }, send));
  await assert.rejects(commands.run('payment', { amount: 70, operation_id }, send));
  await assert.rejects(commands.run('payment', { amount: 70, operation_id }, send));
  assert.notEqual(bodies[0].operation_id, bodies[1].operation_id);
  assert.equal(bodies[1].operation_id, bodies[2].operation_id);
});

test('invalid supplied operation IDs are rejected before issuing a ledger request', async () => {
  const commands = createLedgerCommands();
  let called = false;
  await assert.rejects(async () => commands.run('payment', { operation_id: 'not-a-uuid' }, () => { called = true; }));
  assert.equal(called, false);
});
