import assert from 'node:assert/strict';
import test from 'node:test';
import { permissionGroups, allPermissionKeys, canOpenPath, canOpenSpace, homeForUser, permissionsForEditor } from '../src/utils/permissions.js';

const cases = [
  ['CRM', ['crm_view'], '/crm-dashboard', ['hms', 'warehouse', 'finance']],
  ['HMS', ['calendar_view'], '/calendar', ['crm', 'warehouse', 'finance']],
  ['warehouse', ['warehouse_view'], '/warehouse', ['hms', 'crm', 'finance']],
  ['finance', ['finance_view'], '/finance-dashboard', ['hms', 'crm', 'warehouse']],
  ['payroll', ['payroll_view'], '/finance-salaries', ['hms', 'crm', 'warehouse']],
  ['mixed', ['crm_view', 'warehouse_view'], '/crm-dashboard', ['hms', 'finance']],
  ['empty', [], '/no-access', ['hms', 'crm', 'warehouse', 'finance']],
];
for (const [name, permissions, home, denied] of cases) test(`${name}: independent spaces and direct route denial`, () => {
  for (const role of ['super_admin', 'admin', 'marketer', 'doctor']) {
    const user = { role, permissions };
    assert.equal(homeForUser(user), home);
    for (const space of denied) assert.equal(canOpenSpace(user, space), false);
    for (const path of ['/patients', '/calendar', '/crm-leads', '/warehouse', '/finance-dashboard', '/finance-salaries']) {
      const required = path === '/patients' ? 'patients_view' : path === '/calendar' ? 'calendar_view'
        : path === '/crm-leads' ? 'crm_view' : path === '/warehouse' ? 'warehouse_view'
        : path === '/finance-dashboard' ? 'finance_view' : 'payroll_view';
      assert.equal(canOpenPath(user, path), permissions.includes(required));
    }
    assert.equal(canOpenPath(user, '/unknown-section'), false);
  }
});
test('four groups have unique keys, payroll is separate, no hidden role grants', () => {
  assert.deepEqual(permissionGroups.map(group => group.key), ['hms', 'crm', 'warehouse', 'finance']);
  assert.equal(new Set(allPermissionKeys).size, allPermissionKeys.length);
  assert.ok(allPermissionKeys.includes('payroll_view'));
  assert.equal(homeForUser({role: 'super_admin'}), '/no-access');
});
test('editor preserves effective legacy rights and exact explicit lists on reopening', () => {
  assert.deepEqual(permissionsForEditor({permissions: ['crm_view', 'patients_view'], custom_permissions: ['crm_view']}), ['crm_view', 'patients_view']);
  assert.deepEqual(permissionsForEditor({permission_mode: 'explicit', permissions: ['patients_view'], custom_permissions: []}), []);
  assert.deepEqual(permissionsForEditor({permission_mode: 'explicit', custom_permissions: ['crm_view']}), ['crm_view']);
});
