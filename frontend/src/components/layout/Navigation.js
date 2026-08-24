import React from 'react';

const Navigation = ({
  activeTab,
  setActiveTab,
  availableTabs,
  sidebarOpen,
  setSidebarOpen,
  user,
  activeSection,
  warehouseView,
  onWarehouseSectionChange,
  onToggleSidebar
}) => {
  const [expandedSections, setExpandedSections] = React.useState({
    statistics: true // Автоматически раскрываем статистику
  });
  const warehouseMenuItems = [
    { key: 'warehouse-materials', label: 'Материалы' },
    { key: 'warehouse-attention', label: 'Требует внимания' },
    { key: 'warehouse-inventory', label: 'Инвентаризация' },
    { key: 'warehouse-deleted', label: 'Удаленные материалы' }
  ];
  const [warehouseActiveItem, setWarehouseActiveItem] = React.useState(warehouseMenuItems[0].key);

  React.useEffect(() => {
    if (activeSection === 'warehouse') {
      setWarehouseActiveItem(warehouseMenuItems[0].key);
    }
  }, [activeSection]);

  React.useEffect(() => {
    if (!warehouseView) return;
    const match = warehouseMenuItems.find(item => item.key === warehouseView);
    setWarehouseActiveItem(match ? match.key : warehouseMenuItems[0].key);
  }, [warehouseView]);
  // Вспомогательная функция для проверки прав доступа
  const hasPermission = (permission) => {
    if (!user) return false;
    // Super admin и admin всегда имеют доступ
    if (user.role === 'super_admin' || user.role === 'admin') return true;
    // Проверяем наличие конкретного разрешения
    return user.permissions && user.permissions.includes(permission);
  };

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
      const financeItems = [
        { key: 'finance-dashboard', label: 'Дашборд', type: 'tab' },
        { key: 'finance-income', label: 'Доходы', type: 'tab' },
        { key: 'finance-expenses', label: 'Расходы', type: 'tab' },
        { key: 'finance-salaries', label: 'Зарплата врачей', type: 'tab' },
        { key: 'finance-reports', label: 'Отчеты', type: 'tab' }
      ];

      return financeItems;
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
    if (user?.role === 'admin' || user?.role === 'super_admin') {
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
    if (user?.role === 'admin' || user?.role === 'super_admin') {
      baseItems.push({ key: 'quality-assessment', label: 'Оценка качества', type: 'tab' });
    }
    
    // Настройки (только для админов)
    if (user?.role === 'admin' || user?.role === 'super_admin') {
      baseItems.push({ key: 'settings', label: 'Настройки', type: 'tab' });
    }

    return baseItems;
  };

  const getTabIcon = (tabKey) => {
    const icons = {
      calendar: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14-7v2m0 0v2m0-2h2m-2 0H3" />
        </svg>
      ),
      patients: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      broadcast: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
      statistics: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      doctors: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      'doctor-schedule': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      directory: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14-7v2M7 7v.01M7 3v.01M12 3v.01m5 0V3.01M17 7v.01M7 11v.01M12 11v.01m5 0v.01M7 15v.01M12 15v.01m5 0v.01M7 19v.01M12 19v.01m5 0v.01" />
        </svg>
      ),
      'service-prices': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
      ),
      'rooms': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      'room-management': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      // CRM иконки
      'crm-dashboard': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      'crm-leads': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      'crm-tasks': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
      'crm-clients': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
      ),
      'crm-deals': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      'crm-contacts': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14-7v2m0 0v2m0-2h2m-2 0H9m10 5v2m0 0v2m0-2h2m-2 0H9m10 5v2m0 0v2m0-2h2m-2 0H9" />
        </svg>
      ),
      'crm-managers': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      'crm-directory': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      'crm-task-statuses': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
      // Finance иконки
      'finance-dashboard': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      'finance-income': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
      ),
      'finance-expenses': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
      'finance-reports': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      loyalty: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      warehouse: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18v11H3z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7l9-4 9 4" />
        </svg>
      ),
      'staff-management': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M21 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      'settings': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      'quality-assessment': (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    };
    return icons[tabKey] || (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    );
  };

  const handleTabClick = (tabKey) => {
    setActiveTab(tabKey);
    // Close sidebar on mobile after selection
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const handleWarehouseItemClick = (itemKey) => {
    setWarehouseActiveItem(itemKey);
    handleTabClick('warehouse');
    if (onWarehouseSectionChange) {
      onWarehouseSectionChange(itemKey);
    }
  };

  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const handleSubTabClick = (subTabKey) => {
    setActiveTab(subTabKey);
    // Автоматически раскрываем родительскую секцию
    setExpandedSections(prev => {
      if (subTabKey === 'treatment-statistics' || subTabKey === 'doctor-statistics') {
        return { ...prev, statistics: true };
      } else if (subTabKey === 'service-prices') {
        return { ...prev, directory: true };
      }
      return prev;
    });
    // Close sidebar on mobile after selection
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };


  return (
    <>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* HMS Sidebar */}
      <nav
        className={`
        fixed left-0 top-0 h-full backdrop-blur-2xl shadow-lg z-50 transform transition-transform duration-300 ease-in-out
        w-64 border-r border-white/40
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:fixed lg:z-50
      `}
        style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="px-6 py-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-purple-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-white font-bold text-lg">Мед Ассистент</h2>
                  <p className="text-blue-100 text-sm">Система управления</p>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <div className="flex-1 py-6 overflow-y-auto">
            <div className="px-3 space-y-1 text-left">
              {getMenuStructure().map(item => (
                <div key={item.key}>
                  {item.type === 'warehouse-label' && (
                    <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                      {item.label}
                    </div>
                  )}
                  {item.type === 'warehouse-item' && (
                    <button
                      onClick={() => handleWarehouseItemClick(item.key)}
                      className={`w-full flex items-center justify-start gap-3 px-3 py-2 rounded-lg transition-colors duration-200 text-sm ${
                        warehouseActiveItem === item.key
                      ? 'text-white'
                      : 'text-white/70 hover:text-white'
                    }`}
                    >
                      <span className={`w-2 h-2 rounded-full transition-all ${warehouseActiveItem === item.key ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}></span>
                      <span>{item.label}</span>
                    </button>
                  )}
                  {item.type === 'tab' && (
                      <button
                        onClick={() => handleTabClick(item.key)}
                      className={`
                        w-full flex items-center justify-start px-3 py-3 text-left rounded-lg font-medium transition-all duration-200
                      ${activeTab === item.key
                        ? 'bg-white/15 text-white border-r-2 border-white/60 shadow-sm'
                        : 'text-white/70 hover:text-white'
                      }
                    `}
                    >
                        <span className={`
                        mr-3 flex-shrink-0
                        ${activeTab === item.key ? 'text-white' : 'text-white/60'}
                      `}>
                        {getTabIcon(item.key)}
                      </span>
                      <span className="text-sm">{item.label}</span>
                      {activeTab === item.key && (
                        <span className="ml-auto">
                          <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
                        </span>
                      )}
                    </button>
                  )}

                  {item.type === 'accordion' && (
                    <div>
                      {/* Accordion Header */}
                      <button
                        onClick={() => toggleSection(item.key)}
                        className={`
                          w-full flex items-center px-3 py-3 text-left rounded-lg font-medium transition-all duration-200
                          ${(item.subItems && item.subItems.some(subItem => activeTab === subItem.key))
                            ? 'bg-white/10 text-white'
                            : 'text-white/70 hover:text-white hover:bg-white/5'
                          }
                        `}
                      >
                        <span className={`
                          mr-3 flex-shrink-0
                          ${(item.subItems && item.subItems.some(subItem => activeTab === subItem.key)) ? 'text-white' : 'text-white/60'}
                        `}>
                          {getTabIcon(item.key)}
                        </span>
                        <span className="text-sm flex-1">{item.label}</span>
                        <svg
                          className={`w-4 h-4 transition-transform duration-200 ${
                            expandedSections[item.key] ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Accordion Content */}
                      <div className={`
                        transition-all duration-300 ease-in-out overflow-hidden
                        ${expandedSections[item.key] ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
                      `}>
                        <div className="pl-6 pt-1 pb-2 space-y-1">
                          {item.subItems && item.subItems.map(subItem => (
                            <button
                              key={subItem.key}
                              onClick={() => handleSubTabClick(subItem.key)}
                              className={`
                                w-full flex items-center px-3 py-2 text-left rounded-lg transition-all duration-200 text-sm
                                ${activeTab === subItem.key
                                  ? 'bg-white/15 text-white font-medium shadow-sm'
                                  : 'text-white/70 hover:text-white hover:bg-white/5'
                                }
                              `}
                            >
                              <span className={`
                                mr-3 flex-shrink-0 text-xs
                                ${activeTab === subItem.key ? 'text-white' : 'text-white/60'}
                              `}>
                                {getTabIcon(subItem.key)}
                              </span>
                              <span>{subItem.label}</span>
                              {activeTab === subItem.key && (
                                <span className="ml-auto">
                                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {item.type === 'section' && (
                    <div>
                      {/* Section Header */}
                      <button
                        onClick={() => toggleSection(item.key)}
                        className={`
                          w-full flex items-center px-3 py-3 text-left rounded-lg font-medium transition-all duration-200
                          ${(activeTab === 'treatment-statistics' || activeTab === 'doctor-statistics')
                            ? 'bg-white/10 text-white'
                            : 'text-white/70 hover:text-white hover:bg-white/5'
                          }
                        `}
                      >
                        <span className={`
                          mr-3 flex-shrink-0
                          ${(activeTab === 'treatment-statistics' || activeTab === 'doctor-statistics') ? 'text-white' : 'text-white/60'}
                        `}>
                          {getTabIcon(item.key)}
                        </span>
                        <span className="text-sm flex-1">{item.label}</span>
                        <svg
                          className={`w-4 h-4 transition-transform duration-200 ${
                            expandedSections[item.key] ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Submenu */}
                      <div className={`
                        overflow-hidden transition-all duration-300 ease-in-out
                        ${expandedSections[item.key] ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
                      `}>
                        <div className="pl-6 pt-1 space-y-1">
                          {item.children?.map(subItem => (
                            <button
                              key={subItem.key}
                              onClick={() => handleSubTabClick(subItem.key)}
                              className={`
                                w-full flex items-center px-3 py-2 text-left rounded-lg font-medium transition-all duration-200
                                ${activeTab === subItem.key
                                  ? 'bg-white/15 text-white border-l-2 border-white/60'
                                  : 'text-white/70 hover:text-white hover:bg-white/5'
                                }
                              `}
                            >
                                <span className="mr-3 w-2 h-2 bg-white rounded-full opacity-60"></span>
                              <span className="text-sm">{subItem.label}</span>
                              {activeTab === subItem.key && (
                                <span className="ml-auto">
                                  <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/30 bg-white/10 dark:bg-white/5">
            <div className="text-xs text-white/70 text-center">
              <p>© 2025 Мед Ассистент</p>
              <p>Версия 1.0.0</p>
            </div>
            {onToggleSidebar && (
              <div className="flex justify-center pt-3">
                <button
                  onClick={onToggleSidebar}
                  aria-label="Закрыть сайдбар"
                  className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6m0 0l5-5m-5 5l5 5" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
};

export default Navigation;
