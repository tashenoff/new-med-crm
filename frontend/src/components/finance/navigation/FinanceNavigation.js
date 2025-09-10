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
      key: 'finance-reports',
      label: '📊 Отчеты',
      icon: '📊',
      description: 'Финансовые отчеты'
    }
  ];

  return (
    <div className="h-full bg-gradient-to-b from-green-50 to-emerald-100">
      <div className="p-4">
        <h2 className="text-xl font-bold text-gray-800 mb-6">
          💰 Финансовая система
        </h2>
        
        <nav className="space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`w-full text-left p-3 rounded-lg transition-all duration-200 group ${
                activeTab === item.key
                  ? 'bg-green-600 text-white shadow-lg'
                  : 'text-gray-700 hover:bg-white hover:shadow-md'
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className="text-lg">{item.icon}</span>
                <div>
                  <div className={`font-medium ${
                    activeTab === item.key ? 'text-white' : 'text-gray-800'
                  }`}>
                    {item.label.replace(/^.+ /, '')}
                  </div>
                  <div className={`text-xs ${
                    activeTab === item.key ? 'text-green-100' : 'text-gray-500'
                  }`}>
                    {item.description}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </nav>
        
        <div className="mt-8 p-4 bg-green-100 rounded-lg">
          <h3 className="font-semibold text-green-800 mb-2">💡 Быстрые действия</h3>
          <div className="space-y-2">
            <button 
              onClick={() => setActiveTab('finance-income')}
              className="w-full text-left text-sm text-green-700 hover:text-green-900"
            >
              + Добавить доход
            </button>
            <button 
              onClick={() => setActiveTab('finance-expenses')}
              className="w-full text-left text-sm text-green-700 hover:text-green-900"
            >
              + Добавить расход
            </button>
            <button 
              onClick={() => setActiveTab('finance-reports')}
              className="w-full text-left text-sm text-green-700 hover:text-green-900"
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