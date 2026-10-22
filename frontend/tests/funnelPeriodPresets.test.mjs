import assert from 'node:assert/strict';
import test from 'node:test';
import { funnelPeriodPresets, funnelPresetRange, initialPeriod, reportPeriod } from '../src/utils/eventFunnel.js';

test('funnel presets expose six distinct readable choices and custom does not replace dates', () => {
  assert.deepEqual(funnelPeriodPresets.map(row => row.label), [
    'Сегодня', 'Вчера', 'Последние 7 дней', 'Последние 30 дней', 'Этот месяц', 'Свой диапазон'
  ]);
  assert.equal(funnelPresetRange('custom'), null);
  assert.equal(funnelPresetRange('unknown'), null);
});

test('calendar presets cross year boundaries and preserve the existing inclusive 30-day default', () => {
  const now = new Date(2026, 0, 1, 0, 15);
  const stamp = now.getTime();
  const expected = {
    today: { from: '2026-01-01', to: '2026-01-01' },
    yesterday: { from: '2025-12-31', to: '2025-12-31' },
    '7days': { from: '2025-12-26', to: '2026-01-01' },
    '30days': { from: '2025-12-03', to: '2026-01-01' },
    month: { from: '2026-01-01', to: '2026-01-01' }
  };
  for (const [preset, range] of Object.entries(expected)) assert.deepEqual(funnelPresetRange(preset, now), range);
  assert.deepEqual(initialPeriod(now), expected['30days']);
  assert.equal(now.getTime(), stamp);
});

test('leap day and month-to-date use real calendar arithmetic rather than fixed milliseconds', () => {
  assert.deepEqual(funnelPresetRange('7days', new Date(2024, 2, 1)), { from: '2024-02-24', to: '2024-03-01' });
  assert.deepEqual(funnelPresetRange('30days', new Date(2024, 2, 1)), { from: '2024-02-01', to: '2024-03-01' });
  assert.deepEqual(funnelPresetRange('7days', new Date(2025, 2, 1)), { from: '2025-02-23', to: '2025-03-01' });
  assert.deepEqual(funnelPresetRange('30days', new Date(2025, 2, 1)), { from: '2025-01-31', to: '2025-03-01' });
  assert.deepEqual(funnelPresetRange('month', new Date(2024, 1, 29)), { from: '2024-02-01', to: '2024-02-29' });
  assert.deepEqual(funnelPresetRange('month', new Date(2026, 11, 31)), { from: '2026-12-01', to: '2026-12-31' });
});

test('date field keys remain browser-local east and west of UTC even near midnight', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles', 'Asia/Kolkata']) {
      process.env.TZ = zone;
      for (const hour of [0, 23]) {
        const now = new Date(2026, 0, 1, hour, 15);
        assert.deepEqual(funnelPresetRange('today', now), { from: '2026-01-01', to: '2026-01-01' }, zone);
        assert.deepEqual(funnelPresetRange('7days', now), { from: '2025-12-26', to: '2026-01-01' }, zone);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test('API bounds keep the existing local-midnight contract across 23/25-hour DST days', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    for (const [date, hours] of [['2026-03-08', 23], ['2026-11-01', 25]]) {
      const bounds = reportPeriod(date, date);
      assert.equal((new Date(bounds.end) - new Date(bounds.start)) / 3600000, hours);
      assert.equal(new Date(bounds.start).getHours(), 0);
      assert.equal(new Date(bounds.end).getHours(), 0);
    }
    process.env.TZ = 'Pacific/Kiritimati';
    const range = funnelPresetRange('today', new Date(2026, 0, 1, 0, 15));
    assert.equal(range.from, '2026-01-01');
    assert.equal(reportPeriod(range.from, range.to).start, '2025-12-31T10:00:00.000Z');
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});
