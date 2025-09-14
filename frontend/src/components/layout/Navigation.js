import React from 'react';

const Navigation = ({ activeTab, setActiveTab, availableTabs, sidebarOpen, setSidebarOpen, user, activeSection }) => {
  const [expandedSections, setExpandedSections] = React.useState({
    statistics: true // Автоматически раскрываем статистику
  });
  // Структура меню с поддержкой подразделов
  const getMenuStructure = () => {
    // Если активна CRM секция, показываем CRM пункты меню
    if (activeSection === 'crm') {
      const crmItems = [
        { key: 'crm-dashboard', label: 'Дашборд', type: 'tab' },
        { key: 'crm-leads', label: 'Заявки', type: 'tab' },
        { key: 'crm-clients', label: 'Контакты', type: 'tab' },
        { key: 'crm-deals', label: 'Сделки', type: 'tab' },
        { key: 'crm-contacts', label: 'Источники', type: 'tab' }
      ];

      // Менеджеров могут видеть только админы
      if (user?.role === 'admin') {
        crmItems.push({ key: 'crm-managers', label: 'Менеджеры', type: 'tab' });
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

    // HMS меню
    const baseItems = [
      { key: 'calendar', label: 'Календарь', type: 'tab' },
    ];

    if (availableTabs.some(tab => tab.key === 'patients')) {
      baseItems.push({ key: 'patients', label: 'Пациенты', type: 'tab' });
      
      // Добавляем секцию статистики с подразделами
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

    if (availableTabs.some(tab => tab.key === 'doctors')) {
      baseItems.push({ key: 'doctors', label: 'Врачи', type: 'tab' });
    }

    if (user?.role === 'admin') {
      baseItems.push({ key: 'doctor-schedule', label: 'Расписание врачей', type: 'tab' });
    }

    // Справочник с подразделами (только для админов)
    if (user?.role === 'admin') {
      baseItems.push({
        key: 'directory',
        label: 'Справочник',
        type: 'accordion',
        subItems: [
          { key: 'service-prices', label: 'Ценовая политика', type: 'tab' },
          { key: 'room-management', label: 'Кабинеты', type: 'tab' },
          { key: 'specialties', label: 'Специальности', type: 'tab' },
          { key: 'payment-types', label: 'Тип оплаты', type: 'tab' }
        ]
      });
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
      <nav className={`
        fixed left-0 top-0 h-full bg-white dark:bg-gray-900 shadow-lg z-50 transform transition-transform duration-300 ease-in-out
        w-64 border-r border-gray-200 dark:border-gray-700
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:fixed lg:z-50
      `}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="px-6 py-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-purple-600">
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

          {/* Navigation Items */}
          <div className="flex-1 py-6">
            <div className="px-3 space-y-1">
              {getMenuStructure().map(item => (
                <div key={item.key}>
                  {item.type === 'tab' && (
                    <button
                      onClick={() => handleTabClick(item.key)}
                      className={`
                        w-full flex items-center px-3 py-3 text-left rounded-lg font-medium transition-all duration-200
                        ${activeTab === item.key
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-r-2 border-blue-600 dark:border-blue-400 shadow-sm'
                          : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
                        }
                      `}
                    >
                      <span className={`
                        mr-3 flex-shrink-0
                        ${activeTab === item.key ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}
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
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                          }
                        `}
                      >
                        <span className={`
                          mr-3 flex-shrink-0
                          ${(item.subItems && item.subItems.some(subItem => activeTab === subItem.key)) ? 'text-blue-600' : 'text-gray-400'}
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
                                  ? 'bg-blue-100 text-blue-700 font-medium shadow-sm'
                                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }
                              `}
                            >
                              <span className={`
                                mr-3 flex-shrink-0 text-xs
                                ${activeTab === subItem.key ? 'text-blue-600' : 'text-gray-400'}
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
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                          }
                        `}
                      >
                        <span className={`
                          mr-3 flex-shrink-0
                          ${(activeTab === 'treatment-statistics' || activeTab === 'doctor-statistics') ? 'text-blue-600' : 'text-gray-400'}
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
                                  ? 'bg-blue-100 text-blue-700 border-l-2 border-blue-600'
                                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }
                              `}
                            >
                              <span className="mr-3 w-2 h-2 bg-current rounded-full opacity-60"></span>
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
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
              <p>© 2025 Мед Ассистент</p>
              <p>Версия 1.0.0</p>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
};

export default Navigation;