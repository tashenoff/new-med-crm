import React from 'react';

const FinanceNavigation = ({ activeTab, setActiveTab, user }) => {
  const menuItems = [
    {
      key: 'finance-dashboard',
      label: '📊 Дашборд',
      icon: '📊',
      description: 'Общая финансовая статистика'
    },
    {
      key: 'finance-income',
      label: '💰 Доходы',
      icon: '💰',
      description: 'Управление доходами'
    },
    {
      key: 'finance-expenses',
      label: '💳 Расходы',
      icon: '💳',
      description: 'Управление расходами'
    },
    {
      key: 'finance-salaries',
      label: '👨‍⚕️ Зарплата врачей',
      icon: '👨‍⚕️',
      description: 'Расчет зарплат врачей'
    },
    {
      key: 'finance-reports',
      label: '📊 Отчеты',
      icon: '📊',
      description: 'Финансовые отчеты'
    }
  ];

  return (
    <div className="h-full bg-curai-positiveBg ">
      <div className="p-4">
        <h2 className="text-xl font-semibold text-curai-ink mb-6">
          💰 Финансовая система
        </h2>
        
        <nav className="space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`w-full text-left p-3 rounded-md transition-all duration-200 group ${
                activeTab === item.key
                  ? "bg-curai-positive text-white shadow-none"
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
                    activeTab === item.key ? "text-curai-positive" : "text-curai-muted"
                  }`}>
                    {item.description}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </nav>
        
        <div className="mt-8 p-4 bg-curai-positiveBg rounded-md">
          <h3 className="font-semibold text-curai-positive mb-2">💡 Быстрые действия</h3>
          <div className="space-y-2">
            <button 
              onClick={() => setActiveTab('finance-income')}
              className="w-full text-left text-sm text-curai-positive hover:text-curai-positive"
            >
              + Добавить доход
            </button>
            <button 
              onClick={() => setActiveTab('finance-expenses')}
              className="w-full text-left text-sm text-curai-positive hover:text-curai-positive"
            >
              + Добавить расход
            </button>
            <button 
              onClick={() => setActiveTab('finance-salaries')}
              className="w-full text-left text-sm text-curai-positive hover:text-curai-positive"
            >
              👨‍⚕️ Зарплата врачей
            </button>
            <button 
              onClick={() => setActiveTab('finance-reports')}
              className="w-full text-left text-sm text-curai-positive hover:text-curai-positive"
            >
              📊 Создать отчет
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinanceNavigation;