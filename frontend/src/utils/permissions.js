// Mirrors the canonical backend permission check; active super-admin has full access.
export const permissionGroups = [
  { key: 'hms', title: 'HMS', rows: [
    ['Пациенты и лечение', ['patients_view', 'patients_edit', 'patients_delete', 'patients_export']],
    ['Врачи', ['doctors_view', 'doctors_create', 'doctors_edit', 'doctors_delete']],
    ['Календарь и расписание', ['calendar_view', 'calendar_edit', 'calendar_delete']],
    ['Справочники и цены', ['directory_view', 'directory_edit', 'directory_delete']],
    ['Рассылки', ['broadcast_view', 'broadcast_edit']],
    ['Статистика и отчёты', ['statistics_view']],
    ['Лояльность', ['loyalty_view', 'loyalty_edit', 'loyalty_delete']],
    ['Оценка качества', ['quality_view', 'quality_edit', 'quality_delete']],
    ['Управление сотрудниками¹', ['staff_view', 'staff_edit', 'staff_delete']],
    ['Системные настройки¹', ['system_settings']],
  ] },
  { key: 'crm', title: 'CRM', rows: [
    ['Заявки, воронка, контакты, задачи, источники, сообщения', ['crm_view', 'crm_edit', 'crm_delete', 'crm_export']],
  ] },
  { key: 'warehouse', title: 'Склад', rows: [
    ['Материалы и инвентаризация', ['warehouse_view', 'warehouse_edit', 'warehouse_delete', 'warehouse_export']],
  ] },
  { key: 'finance', title: 'Финансы', rows: [
    ['Финансовая отчётность', ['finance_view', 'finance_edit', 'finance_delete', 'finance_export']],
    ['Персональные зарплаты и ставки²', ['payroll_view']],
    ['Начисления по сотрудникам (явное разрешение)', ['admin_bonus_view']],
    ['Единая ставка (уполномоченный руководитель)', ['admin_bonus_manage']],
  ] },
];
export const allPermissionKeys = permissionGroups.flatMap(group => group.rows.flatMap(row => row[1]));
export const hasPermission = (user, key) => user?.is_active !== false && Boolean(user?.role === 'super_admin' || user?.permissions?.includes(key));
export const canAction = (user, ...keys) => keys.every(key => hasPermission(user, key));
// Spread last: deny must win over a pending/loading disabled expression.
// For an allowed action, leave its existing busy/validation state untouched.
export const permissionProps = (user, ...keys) => ({
  'data-permissions': keys.join(' '),
  ...(!canAction(user, ...keys) ? {
    disabled: true, 'aria-disabled': true, title: 'Недостаточно прав для этого действия',
  } : {}),
});
export const permissionLabel = key => key === 'system_settings' ? 'Настройки'
  : key === 'admin_bonus_view' ? 'Просмотр начислений'
  : key === 'admin_bonus_manage' ? 'Изменение ставки'
  : key === 'doctors_create' ? 'Создание врача'
  : key === 'doctors_edit' ? 'Изменение'
  : key === 'payroll_view' ? 'Зарплаты (явное разрешение)'
  : ({ view: 'Просмотр', edit: 'Создание / изменение', delete: 'Удаление', export: 'Экспорт' }[key.split('_').at(-1)] || key);

export function requiredForPath(path) {
  const key = path.replace(/^\//, '').split('/')[0];
  if (key === 'no-access') return [];
  if (key === 'finance-salaries') return ['payroll_view'];
  if (key === 'finance-admin-bonuses') return ['admin_bonus_view|admin_bonus_manage'];
  if (key.startsWith('finance')) return ['finance_view'];
  if (key.startsWith('crm')) return ['crm_view'];
  if (key.startsWith('warehouse')) return ['warehouse_view'];
  const map = {
    '': 'calendar_view', calendar: 'calendar_view', patients: 'patients_view',
    doctors: 'doctors_view', 'doctor-schedule': 'calendar_view', broadcast: 'broadcast_view',
    statistics: 'statistics_view', 'treatment-statistics': 'statistics_view',
    'doctor-statistics': 'statistics_view', 'services-report': 'statistics_view',
    'lab-price-statistics': 'directory_view', 'service-prices': 'directory_view',
    laboratories: 'directory_view', specialties: 'directory_view',
    'payment-types': 'directory_view', 'room-management': 'directory_view',
    loyalty: 'loyalty_view', 'quality-assessment': 'quality_view',
    'staff-management': 'staff_view',
  };
  return map[key] ? [map[key]] : null;
}
export const canOpenPath = (user, path) => {
  const required = requiredForPath(path);
  return required !== null && required.every(clause => clause.split('|').some(key => hasPermission(user, key)));
};
export const homeForUser = user => [
  '/calendar', '/patients', '/doctors', '/crm-dashboard', '/warehouse',
  '/finance-dashboard', '/finance-salaries', '/finance-admin-bonuses', '/staff-management',
  '/service-prices', '/statistics', '/broadcast', '/loyalty', '/quality-assessment',
].find(path => canOpenPath(user, path)) || '/no-access';
export const canOpenSpace = (user, space) => space === 'hms'
  ? permissionGroups[0].rows.some(row => row[1].some(key => hasPermission(user, key)))
  : space === 'finance' ? hasPermission(user, 'finance_view') || hasPermission(user, 'payroll_view') || canOpenPath(user, '/finance-admin-bonuses')
  : hasPermission(user, space + '_view');

export const permissionsForEditor = record => record?.permission_mode === 'explicit'
  ? [...(record.custom_permissions || [])] : [...(record?.permissions || record?.custom_permissions || [])];
