import test from 'node:test';
import assert from 'node:assert/strict';
import { allPermissionKeys, canOpenPath, canOpenSpace, permissionsForEditor, hasTaskPermission } from '../src/utils/permissions.js';
import { getNavigationMenu } from '../src/components/layout/navigationCatalog.js';

test('CRM task rights are distinct and selectable for staff', () => {
  for (const key of ['crm_tasks_view', 'crm_tasks_create', 'crm_tasks_edit']) assert.ok(allPermissionKeys.includes(key));
  const keys = ['crm_tasks_view', 'crm_tasks_create'];
  assert.deepEqual(permissionsForEditor({ permission_mode: 'explicit', custom_permissions: keys }), keys);
});
test('general CRM access does not grant task access, including administrative roles', () => {
  for (const role of ['admin', 'marketer']) {
    const user = { role, permissions: ['crm_view', 'crm_edit'] };
    assert.equal(canOpenPath(user, '/crm-tasks'), false);
    assert.equal(hasTaskPermission(user, 'crm_tasks_create'), false);
    assert.equal(getNavigationMenu(user, 'crm').some(item => item.key === 'crm-tasks'), false);
  }
});
test('task-only viewer can enter CRM and see tasks without edit rights', () => {
  const user = { permissions: ['crm_tasks_view'] };
  assert.equal(canOpenSpace(user, 'crm'), true);
  assert.equal(canOpenPath(user, '/crm-tasks'), true);
  assert.equal(canOpenPath(user, '/crm-dashboard'), false);
  assert.equal(hasTaskPermission(user, 'crm_tasks_create'), false);
  assert.equal(canOpenPath({ ...user, is_active: false }, '/crm-tasks'), false);
});
test('dictionary uses directory permission, not task create', () => {
  assert.equal(canOpenPath({ permissions: ['crm_tasks_create'] }, '/crm-task-titles'), false);
  assert.equal(canOpenPath({ permissions: ['directory_view'] }, '/crm-task-titles'), true);
});

test("active super-admin retains canonical full access", () => {
 assert.equal(canOpenPath({role: "super_admin"}, "/crm-tasks"), true);
 assert.equal(canOpenPath({role: "super_admin", is_active: false}, "/crm-tasks"), false);
});
