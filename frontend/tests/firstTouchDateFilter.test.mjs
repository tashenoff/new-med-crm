import assert from 'node:assert/strict';
import test from 'node:test';
import { firstTouchDateRange, localDateKey, matchesFirstTouchDate } from '../src/utils/firstTouchDateFilter.js';

process.env.TZ = 'America/New_York';

const now = new Date('2026-03-10T12:00:00-04:00');
const matches = (created_at, range) => matchesFirstTouchDate({ created_at }, range);

test('all dates includes absent, invalid and future dates without modifying cards', () => {
  const range = firstTouchDateRange('all');
  assert.equal(range, null);
  for (const created_at of [undefined, null, '', 'invalid', '2026-02-30T12:00:00Z', '2030-01-01']) {
    const lead = Object.freeze({ created_at });
    assert.equal(matchesFirstTouchDate(lead, range), true);
  }
});

test('presets cover calendar days including today, across the DST transition', () => {
  const expected = {
    today: { from: '2026-03-10', to: '2026-03-10' },
    yesterday: { from: '2026-03-09', to: '2026-03-09' },
    '7days': { from: '2026-03-04', to: '2026-03-10' },
    '30days': { from: '2026-02-09', to: '2026-03-10' }
  };
  for (const [preset, range] of Object.entries(expected)) {
    assert.deepEqual(firstTouchDateRange(preset, {}, now), range);
    assert.equal(matches(`${range.from}T00:00:00`, range), true);
    assert.equal(matches(`${range.to}T23:59:59.999`, range), true);
    const before = new Date(`${range.from}T00:00:00`);
    before.setMilliseconds(-1);
    const after = new Date(`${range.to}T23:59:59.999`);
    after.setMilliseconds(1000);
    assert.equal(matches(before.toISOString(), range), false);
    assert.equal(matches(after.toISOString(), range), false);
  }
});

test('preset arithmetic crosses month and year boundaries', () => {
  const january = new Date('2026-01-01T12:00:00');
  assert.deepEqual(firstTouchDateRange('yesterday', {}, january), { from: '2025-12-31', to: '2025-12-31' });
  assert.deepEqual(firstTouchDateRange('7days', {}, january), { from: '2025-12-26', to: '2026-01-01' });
  assert.deepEqual(firstTouchDateRange('30days', {}, january), { from: '2025-12-03', to: '2026-01-01' });
});

test('timestamp boundaries use the user local date, not the UTC date or timestamp offset', () => {
  const range = { from: '2026-03-10', to: '2026-03-10' };
  assert.equal(matches('2026-03-10T03:59:59.999Z', range), false);
  assert.equal(matches('2026-03-10T04:00:00Z', range), true);
  assert.equal(matches('2026-03-11T03:59:59.999Z', range), true);
  assert.equal(matches('2026-03-11T04:00:00Z', range), false);
  assert.equal(matches('2026-03-11T05:00:00+02:00', range), true);
  assert.equal(matches('2026-03-10', range), true);
  assert.equal(matches('2026-03-10T00:00:00', range), true);
});

test('local boundaries also work for a user east of UTC', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Almaty';
    const range = firstTouchDateRange('today', {}, new Date('2026-03-09T20:00:00Z'));
    assert.deepEqual(range, { from: '2026-03-10', to: '2026-03-10' });
    assert.equal(matches('2026-03-09T18:59:59.999Z', range), false);
    assert.equal(matches('2026-03-09T19:00:00Z', range), true);
    assert.equal(matches('2026-03-10T18:59:59.999Z', range), true);
    assert.equal(matches('2026-03-10T19:00:00Z', range), false);
  } finally {
    process.env.TZ = original;
  }
});

test('custom range includes both entire local boundary days', () => {
  const range = firstTouchDateRange('custom', { from: '2026-03-01', to: '2026-03-05' });
  assert.deepEqual(range, { from: '2026-03-01', to: '2026-03-05' });
  for (const value of ['2026-03-01T00:00:00', '2026-03-03', '2026-03-05T23:59:59.999']) {
    assert.equal(matches(value, range), true);
  }
  for (const value of ['2026-02-28T23:59:59.999', '2026-03-06T00:00:00']) {
    assert.equal(matches(value, range), false);
  }
});

test('custom range allows either open boundary and an empty range is unrestricted', () => {
  assert.equal(matches('2026-03-10', firstTouchDateRange('custom', { from: '2026-03-01' })), true);
  assert.equal(matches('2026-02-28', firstTouchDateRange('custom', { from: '2026-03-01' })), false);
  assert.equal(matches('2026-02-28', firstTouchDateRange('custom', { to: '2026-03-01' })), true);
  assert.equal(matches('2026-03-02', firstTouchDateRange('custom', { to: '2026-03-01' })), false);
  assert.equal(matches(undefined, firstTouchDateRange('custom')), true);
});

test('limited periods exclude missing and invalid dates, including impossible calendar dates', () => {
  const range = { from: '2026-01-01', to: '2026-12-31' };
  for (const value of [undefined, null, '', ' ', 0, false, 'invalid', '2026-02-30', '2026-02-30T12:00:00Z', '2026-13-01', '2026-03-10T99:00:00Z']) {
    assert.equal(matches(value, range), false, String(value));
  }
  assert.equal(localDateKey(new Date('invalid')), null);
});

test('invalid or reversed custom bounds never match', () => {
  for (const range of [
    { from: '2026-03-11', to: '2026-03-10' },
    { from: '2026-02-30', to: '' },
    { from: '', to: 'invalid' }
  ]) assert.equal(matches('2026-03-10', range), false);
});

test('only the canonical first touch date counts; linked dates and history are untouched', () => {
  const linked = Object.freeze([{ created_at: '2026-03-10' }]);
  const history = Object.freeze([{ created_at: '2026-03-10' }]);
  const lead = Object.freeze({ created_at: '2026-01-01', linked_inquiries: linked, history });
  assert.equal(matchesFirstTouchDate(lead, firstTouchDateRange('today', {}, now)), false);
  assert.equal(lead.linked_inquiries, linked);
  assert.equal(lead.history, history);
  assert.equal(matchesFirstTouchDate({ created_at: '2026-03-10', linked_inquiries: [{ created_at: '2026-01-01' }] }, firstTouchDateRange('today', {}, now)), true);
});
