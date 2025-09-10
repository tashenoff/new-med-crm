import React, { useState, useEffect } from 'react';

const FinanceDashboard = ({ user }) => {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalExpenses: 0,
    profit: 0,
    pendingPayments: 0
  });

  const [recentTransactions, setRecentTransactions] = useState([]);

  useEffect(() => {
    // Здесь будет загрузка финансовых данных
    // TODO: Реализовать API вызовы
    setStats({
      totalRevenue: 150000,
      totalExpenses: 80000,
      profit: 70000,
      pendingPayments: 25000
    });

    setRecentTransactions([
      { id: 1, description: 'Оплата за лечение', amount: 15000, type: 'income', date: '2025-09-10' },
      { id: 2, description: 'Аренда помещения', amount: -30000, type: 'expense', date: '2025-09-09' },
      { id: 3, description: 'Консультация', amount: 8000, type: 'income', date: '2025-09-09' },
    ]);
  }, []);

  const StatCard = ({ title, value, icon, color, isPrice = false }) => (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center">
        <div className={`p-3 rounded-full ${color}`}>
          <span className="text-2xl">{icon}</span>
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">
            {isPrice ? `${value.toLocaleString('ru-RU')} ₸` : value}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">💰 Финансовый дашборд</h1>
        <div className="flex space-x-3">
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            📊 Создать отчет
          </button>
          <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
            ➕ Добавить транзакцию
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Общая выручка"
          value={stats.totalRevenue}
          icon="💰"
          color="bg-green-100"
          isPrice={true}
        />
        <StatCard
          title="Расходы"
          value={stats.totalExpenses}
          icon="💳"
          color="bg-red-100"
          isPrice={true}
        />
        <StatCard
          title="Прибыль"
          value={stats.profit}
          icon="📈"
          color="bg-blue-100"
          isPrice={true}
        />
        <StatCard
          title="К получению"
          value={stats.pendingPayments}
          icon="⏳"
          color="bg-yellow-100"
          isPrice={true}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">📊 Выручка по месяцам</h3>
          <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
            <p className="text-gray-500">График выручки (TODO: Интеграция Chart.js)</p>
          </div>
        </div>

        {/* Expenses Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">📉 Структура расходов</h3>
          <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
            <p className="text-gray-500">Диаграмма расходов (TODO: Интеграция Chart.js)</p>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">🔄 Последние транзакции</h3>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {recentTransactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    transaction.type === 'income' ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    <span className="text-lg">
                      {transaction.type === 'income' ? '💰' : '💳'}
                    </span>
                  </div>
                  <div className="ml-3">
                    <p className="font-medium text-gray-900">{transaction.description}</p>
                    <p className="text-sm text-gray-500">{new Date(transaction.date).toLocaleDateString('ru-RU')}</p>
                  </div>
                </div>
                <div className={`font-semibold ${
                  transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString('ru-RU')} ₸
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              Показать все транзакции →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinanceDashboard;
