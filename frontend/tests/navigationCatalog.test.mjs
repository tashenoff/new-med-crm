import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { getNavigationMenu, getSearchNavigation, filterSearchNavigation } from '../src/components/layout/navigationCatalog.js';

const permissions = ['calendar_view', 'patients_view', 'broadcast_view', 'statistics_view', 'doctors_view', 'directory_view', 'crm_view', 'warehouse_view', 'finance_view', 'payroll_view'];

test('role names never expand the navigation permission list', () => {
  for (let mask = 0; mask < 2 ** permissions.length; mask++) {
    const selected = permissions.filter((_, index) => mask & (1 << index));
    for (const section of ['hms', 'crm', 'finance', 'warehouse']) {
      const restricted = getNavigationMenu({role: 'super_admin', permissions: selected}, section);
      for (const item of restricted.flatMap(item => item.subItems || item.children || [item])) {
        const required = item.key === 'finance-salaries' ? 'payroll_view'
          : item.key.startsWith('finance') ? 'finance_view'
          : item.key.startsWith('crm') ? 'crm_view'
          : item.key.startsWith('warehouse') ? 'warehouse_view' : null;
        if (required) assert.ok(selected.includes(required), item.key);
      }
    }
  }
  for (const section of ['hms', 'crm', 'finance', 'warehouse']) {
    assert.deepEqual(getNavigationMenu({role: 'super_admin', permissions: []}, section), []);
    assert.deepEqual(getNavigationMenu(null, section), []);
  }
});

test('search contains only accessible route destinations, excluding accordion and warehouse view keys', () => {
  assert.deepEqual(getSearchNavigation(null), []);
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  for (const role of ['admin', 'super_admin', 'doctor', 'patient']) {
    for (const permissions of [[], ['calendar_view'], ['crm_view', 'warehouse_view'], ['directory_view', 'statistics_view']]) {
      const user = { role, permissions };
      const entries = getSearchNavigation(user);

      assert.equal(entries.some(item => item.section === 'crm'), permissions.includes('crm_view'));
      assert.equal(entries.some(item => item.key === 'warehouse'), permissions.includes('warehouse_view'));
      assert.deepEqual(entries.filter(item => item.section === 'finance').map(item => item.key),
        getNavigationMenu(user, 'finance').map(item => item.key));
      for (const item of entries) {
        assert.ok(!item.children && !item.subItems && !item.key.startsWith('warehouse-'));
        assert.ok(app.includes(`path="/${item.key}"`) || app.includes(`activeTab === '${item.key}'`), item.key);
      }
      assert.equal(new Set(entries.map(item => item.key)).size, entries.length);
    }
  }
});

test('search normalizes case and whitespace and matches parent labels and aliases', () => {
  const entries = getSearchNavigation({ role: 'admin', permissions: ['calendar_view', 'directory_view'] });
  assert.deepEqual(filterSearchNavigation(entries, '  РАСПИСАНИЕ   ').map(item => item.key), ['calendar', 'doctor-schedule']);
  assert.deepEqual(filterSearchNavigation(entries, 'справочник кабинеты').map(item => item.key), ['room-management']);
  assert.deepEqual(filterSearchNavigation(entries, 'nonexistent destination'), []);
});
