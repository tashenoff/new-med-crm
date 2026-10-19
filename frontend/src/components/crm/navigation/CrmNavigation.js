import React from 'react';

const CrmNavigation = ({ activeTab, setActiveTab, user }) => {
  const menuItems = [
    {
      key: 'crm-dashboard',
      label: '📊 Дашборд',
      icon: '📊',
      description: 'Общая статистика CRM'
    },
    {
      key: 'crm-leads',
      label: '🎯 Заявки',
      icon: '🎯',
      description: 'Управление заявками'
    },
    {
      key: 'crm-clients',
      label: '👥 Контакты',
      icon: '👥',
      description: 'База контактов'
    },
    {
      key: 'crm-deals',
      label: '💼 Сделки',
      icon: '💼',
      description: 'Управление сделками'
    },
    {
      key: 'crm-contacts',
      label: '📱 Источники',
      icon: '📱',
      description: 'Источники обращений'
    }
  ];

  // Менеджеров могут видеть только админы
  if (user?.role === 'admin') {
    menuItems.push({
      key: 'crm-managers',
      label: '👨‍💼 Менеджеры',
      icon: '👨‍💼',
      description: 'Управление менеджерами'
    });
  }

  return (
    <div className="h-full bg-curai-selected ">
      <div className="p-4">
        <h2 className="text-xl font-semibold text-curai-ink mb-6">
          🏢 CRM Система
        </h2>
        
        <nav className="space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`w-full text-left p-3 rounded-md transition-all duration-200 group ${
                activeTab === item.key
                  ? "bg-curai-blue text-white shadow-none"
                  : "text-curai-ink hover:bg-curai-surface hover:shadow-none"
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className="text-lg">{item.icon}</span>
                <div>
                  <div className={`font-medium ${
                    activeTab === item.key ? 'text-white' : "text-curai-ink"
                  }`}>
                    {item.label.replace(/^.+ /, '')}
                  </div>
                  <div className={`text-xs ${
                    activeTab === item.key ? "text-curai-blue" : "text-curai-muted"
                  }`}>
                    {item.description}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </nav>
        
        <div className="mt-8 p-4 bg-curai-selected rounded-md">
          <h3 className="font-semibold text-curai-blue mb-2">💡 Быстрые действия</h3>
          <div className="space-y-2">
            <button 
              onClick={() => setActiveTab('crm-leads')}
              className="w-full text-left text-sm text-curai-blue hover:text-curai-blue"
            >
              + Новая заявка
            </button>
            <button 
              onClick={() => setActiveTab('crm-deals')}
              className="w-full text-left text-sm text-curai-blue hover:text-curai-blue"
            >
              + Новая сделка
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CrmNavigation;


