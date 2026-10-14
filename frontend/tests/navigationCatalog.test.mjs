import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { getNavigationMenu, getSearchNavigation, filterSearchNavigation } from '../src/components/layout/navigationCatalog.js';

// Compare against the actual target revision, rather than duplicating its rules.
const baseline = execFileSync('git', ['show', 'c35a02c:frontend/src/components/layout/Navigation.js'], { encoding: 'utf8' });
const warehouse = baseline.slice(baseline.indexOf('  const warehouseMenuItems'), baseline.indexOf('  const [warehouseActiveItem'));
const logic = baseline.slice(baseline.indexOf('  const hasPermission'), baseline.indexOf('  const getTabIcon'));
const originalMenu = new Function('user', 'activeSection', `${warehouse}\n${logic}\nreturn getMenuStructure();`);
const permissions = ['calendar_view', 'patients_view', 'broadcast_view', 'statistics_view', 'doctors_view', 'directory_view', 'crm_view', 'warehouse_view'];

test('sidebar catalog matches origin/main for every role, section and permission combination', () => {
  for (const role of ['admin', 'super_admin', 'doctor', 'marketer', 'administrator', 'nurse', 'patient', 'unknown']) {
    for (let mask = 0; mask < 2 ** permissions.length; mask++) {
      const user = { role, permissions: permissions.filter((_, index) => mask & (1 << index)) };
      for (const section of ['hms', 'crm', 'finance', 'warehouse', undefined]) {
        assert.deepEqual(getNavigationMenu(user, section), originalMenu(user, section), `${role}/${section}/${mask}`);
      }
    }
    for (const section of ['hms', 'crm', 'finance', 'warehouse']) {
      assert.deepEqual(getNavigationMenu({ role }, section), originalMenu({ role }, section));
    }
  }
  for (const section of ['hms', 'crm', 'finance', 'warehouse']) {
    assert.deepEqual(getNavigationMenu(null, section), originalMenu(null, section));
  }
});

test('search contains only accessible route destinations, excluding accordion and warehouse view keys', () => {
  assert.deepEqual(getSearchNavigation(null), []);
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  for (const role of ['admin', 'super_admin', 'doctor', 'patient']) {
    for (const permissions of [[], ['calendar_view'], ['crm_view', 'warehouse_view'], ['directory_view', 'statistics_view']]) {
      const user = { role, permissions };
      const entries = getSearchNavigation(user);
      const admin = ['admin', 'super_admin'].includes(role);
      assert.equal(entries.some(item => item.section === 'crm'), admin || permissions.includes('crm_view'));
      assert.equal(entries.some(item => item.key === 'warehouse'), admin || permissions.includes('warehouse_view'));
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
  const entries = getSearchNavigation({ role: 'admin' });
  assert.deepEqual(filterSearchNavigation(entries, '  РАСПИСАНИЕ   ').map(item => item.key), ['calendar', 'doctor-schedule']);
  assert.deepEqual(filterSearchNavigation(entries, 'справочник кабинеты').map(item => item.key), ['room-management']);
  assert.deepEqual(filterSearchNavigation(entries, 'nonexistent destination'), []);
});
