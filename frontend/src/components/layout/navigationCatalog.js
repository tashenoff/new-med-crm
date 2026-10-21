import { hasPermission as allowed, canOpenPath, canOpenSpace } from '../../utils/permissions.js';
export const warehouseMenuItems = [
    { key: 'warehouse-materials', label: 'Материалы' },
    { key: 'warehouse-attention', label: 'Требует внимания' },
    { key: 'warehouse-inventory', label: 'Инвентаризация' },
    { key: 'warehouse-deleted', label: 'Удаленные материалы' }
  ];

export const getNavigationMenu = (user, activeSection) => {
  const hasPermission = permission => allowed(user, permission);

  // Структура меню с поддержкой подразделов
  const getMenuStructure = () => {
    // Если активна CRM секция, показываем CRM пункты меню
    if (activeSection === 'crm') {
      const crmItems = [
        { key: 'crm-dashboard', label: 'Дашборд', type: 'tab' },
        { key: 'crm-leads', label: 'Сделки', type: 'tab' },
        { key: 'crm-tasks', label: 'Задачи', type: 'tab' },
        { key: 'crm-clients', label: 'Контакты', type: 'tab' },
        { key: 'crm-deals', label: 'Воронка', type: 'tab' },
        { key: 'crm-contacts', label: 'Источники', type: 'tab' }
      ];

      // Менеджеров могут видеть только админы
      if (user?.role === 'admin') {
        crmItems.push({ key: 'crm-managers', label: 'Менеджеры', type: 'tab' });
      }

      // Справочник CRM - только для админов
      if (user?.role === 'admin' || user?.role === 'super_admin') {
        crmItems.push({
          key: 'crm-directory',
          label: 'Справочник',
          type: 'accordion',
          subItems: [
            { key: 'crm-task-statuses', label: 'Статусы задач', type: 'tab' }
          ]
        });
      }

      return crmItems;
    }

    // Если активна Finance секция, показываем финансовые пункты меню
    if (activeSection === 'finance') {
      if (!canOpenSpace(user, 'finance')) return [];
      const financeItems = [
        { key: 'finance-dashboard', label: 'Дашборд', type: 'tab' },
        { key: 'finance-income', label: 'Доходы', type: 'tab' },
        { key: 'finance-expenses', label: 'Расходы', type: 'tab' },
        { key: 'finance-salaries', label: 'Зарплата врачей', type: 'tab' },
        { key: 'finance-reports', label: 'Отчеты', type: 'tab' }
      ];

      return financeItems.filter(item => canOpenPath(user, '/' + item.key));
    }

    if (activeSection === 'warehouse') {
      return [
        { key: 'warehouse-label', label: 'Приход / Расход', type: 'warehouse-label' },
        ...warehouseMenuItems.map(item => ({
          ...item,
          type: 'warehouse-item'
        }))
      ];
    }

    // HMS меню с проверкой прав доступа
    const baseItems = [];

    // Календарь доступен если есть право calendar_view
    if (hasPermission('calendar_view')) {
      baseItems.push({ key: 'calendar', label: 'Календарь', type: 'tab' });
    }

    // Пациенты доступны если есть право patients_view
    if (hasPermission('patients_view')) {
      baseItems.push({ key: 'patients', label: 'Пациенты', type: 'tab' });
    }

    // Рассылка доступна если есть право broadcast_view
    if (hasPermission('broadcast_view')) {
      baseItems.push({ key: 'broadcast', label: 'Рассылка', type: 'tab' });
    }

    // Отчеты доступны если есть право statistics_view
    if (hasPermission('statistics_view')) {
      baseItems.push({
        key: 'hms-reports',
        label: 'Отчеты',
        type: 'accordion',
        subItems: [
          { key: 'services-report', label: 'Отчет по оказанным услугам', type: 'tab' }
        ]
      });
    }

    // Добавляем секцию статистики если есть право statistics_view
    if (hasPermission('statistics_view')) {
      baseItems.push({
        key: 'statistics',
        label: 'Статистика',
        type: 'section',
        children: [
          { key: 'treatment-statistics', label: 'Планы лечения', type: 'subtab' },
          { key: 'doctor-statistics', label: 'Статистика врачей', type: 'subtab' }
        ]
      });
    }

    // Врачи доступны если есть право doctors_view
    if (hasPermission('doctors_view')) {
      baseItems.push({ key: 'doctors', label: 'Врачи', type: 'tab' });
    }

    // Расписание врачей только для админов
    if (hasPermission('calendar_view')) {
      baseItems.push({ key: 'doctor-schedule', label: 'Расписание врачей', type: 'tab' });
    }

    // Справочник доступен если есть право directory_view
    if (hasPermission('directory_view')) {
      baseItems.push({
        key: 'directory',
        label: 'Справочник',
        type: 'accordion',
        subItems: [
          { key: 'service-prices', label: 'Ценовая политика', type: 'tab' },
          { key: 'laboratories', label: 'Лаборатории', type: 'tab' },
          { key: 'lab-price-statistics', label: 'Статистика прайса лаборатории', type: 'tab' },
          { key: 'room-management', label: 'Кабинеты', type: 'tab' },
          { key: 'specialties', label: 'Специальности', type: 'tab' },
          { key: 'payment-types', label: 'Тип оплаты', type: 'tab' },
          { key: 'loyalty', label: 'Программа лояльности', type: 'tab' }
        ]
      });
    }

    // Управление персоналом (только для админов)
    if (user?.role === 'admin' || user?.role === 'super_admin') {
      baseItems.push({ key: 'staff-management', label: 'Управление персоналом', type: 'tab' });
    }

    // Оценка качества (только для админов) - AI анализ WhatsApp коммуникаций
    if (hasPermission('quality_view')) {
      baseItems.push({ key: 'quality-assessment', label: 'Оценка качества', type: 'tab' });
    }

    // Настройки (только для админов)
    if (user?.role === 'admin' || user?.role === 'super_admin') {
      baseItems.push({ key: 'settings', label: 'Настройки', type: 'tab' });
    }

    if (hasPermission('loyalty_view') && !hasPermission('directory_view')) baseItems.push({key: 'loyalty', label: 'Лояльность', type: 'tab'});
    return baseItems;
  };

  if (!canOpenSpace(user, activeSection)) return [];
  return getMenuStructure().flatMap(item => {
    if (item.subItems || item.children) {
      const field = item.subItems ? 'subItems' : 'children';
      const children = item[field].filter(child => canOpenPath(user, '/' + child.key));
      return children.length ? [{ ...item, [field]: children }] : [];
    }
    return item.type.startsWith('warehouse') || canOpenPath(user, '/' + item.key) ? [item] : [];
  });
};

// Search uses the sidebar catalog, restricted to route-backed entries.
export const getSearchNavigation = (user) => {
  if (!user) return [];

  const sections = canOpenSpace(user, 'hms') ? ['hms'] : [];
  if (canOpenSpace(user, 'crm')) sections.push('crm');
  if (canOpenSpace(user, 'finance')) sections.push('finance');
  const flatten = (items, section, parent = '') => items.flatMap(item => {
    if (item.subItems || item.children) return flatten(item.subItems || item.children, section, item.label);
    return ['tab', 'subtab'].includes(item.type)
      ? [{ ...item, section, parent, aliases: item.key === 'calendar' ? '\u0440\u0430\u0441\u043f\u0438\u0441\u0430\u043d\u0438\u0435' : '' }]
      : [];
  });
  const entries = sections.flatMap(section => flatten(getNavigationMenu(user, section), section));
  if (canOpenSpace(user, 'warehouse')) {
    entries.push({ key: 'warehouse', label: '\u0421\u043a\u043b\u0430\u0434', section: 'warehouse' });
  }
  return entries;
};
export const normalizeNavigationQuery = (value) => value.toLocaleLowerCase('ru-RU').trim().replace(/\s+/g, ' ');
export const filterSearchNavigation = (entries, query) => {
  const words = normalizeNavigationQuery(query).split(' ').filter(Boolean);
  return entries.filter(item => {
    const text = normalizeNavigationQuery(`${item.label} ${item.parent || ''} ${item.aliases || ''}`);
    return words.every(word => text.includes(word));
  });
};
