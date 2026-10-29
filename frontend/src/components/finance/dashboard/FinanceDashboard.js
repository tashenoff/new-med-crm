import React, { useState, useEffect } from 'react';
import PanelHeader from '../../common/PanelHeader';
import PagePanel from '../../common/PagePanel';

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
    <div className="bg-curai-surface rounded-md shadow-none p-6">
      <div className="flex items-center">
        <div className={`p-3 rounded-full ${color}`}>
          <span className="text-2xl">{icon}</span>
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-curai-muted">{title}</p>
          <p className="text-2xl font-semibold text-curai-ink">
            {isPrice ? `${value.toLocaleString('ru-RU')} ₸` : value}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <p role="note" className="rounded-md bg-curai-warningBg p-3 text-sm">Демонстрационный раздел: данные и операции пока не подключены к учёту клиники.</p>
      <PagePanel>
        <PanelHeader
          title="💰 Финансовый дашборд"
          subtitle="Анализ финансовой деятельности клиники"
          onAction={() => {}}
          actionLabel="➕ Добавить транзакцию"
        />

        <div className="curai-page-panel-body p-6 space-y-4">
          {/* Дополнительные кнопки */}
          <div className="flex justify-end">
            <button className="bg-curai-blue text-white px-4 py-2 rounded-md hover:bg-curai-blue transition-colors">
              📊 Создать отчет
            </button>
          </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Общая выручка"
          value={stats.totalRevenue}
          icon="💰"
          color="bg-curai-positiveBg"
          isPrice={true}
        />
        <StatCard
          title="Расходы"
          value={stats.totalExpenses}
          icon="💳"
          color="bg-curai-negativeBg"
          isPrice={true}
        />
        <StatCard
          title="Прибыль"
          value={stats.profit}
          icon="📈"
          color="bg-curai-selected"
          isPrice={true}
        />
        <StatCard
          title="К получению"
          value={stats.pendingPayments}
          icon="⏳"
          color="bg-curai-warningBg"
          isPrice={true}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="bg-curai-surface rounded-md shadow-none p-6">
          <h3 className="text-lg font-semibold mb-4">📊 Выручка по месяцам</h3>
          <div className="h-64 flex items-center justify-center bg-curai-subtle rounded-md">
            <p className="text-curai-muted">График выручки (TODO: Интеграция Chart.js)</p>
          </div>
        </div>

        {/* Expenses Chart */}
        <div className="bg-curai-surface rounded-md shadow-none p-6">
          <h3 className="text-lg font-semibold mb-4">📉 Структура расходов</h3>
          <div className="h-64 flex items-center justify-center bg-curai-subtle rounded-md">
            <p className="text-curai-muted">Диаграмма расходов (TODO: Интеграция Chart.js)</p>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-curai-surface rounded-md shadow-none">
        <div className="px-6 py-4 border-b border-curai-border">
          <h3 className="text-lg font-semibold">🔄 Последние транзакции</h3>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {recentTransactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between p-3 bg-curai-subtle rounded-md">
                <div className="flex items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    transaction.type === 'income' ? "bg-curai-positiveBg" : "bg-curai-negativeBg"
                  }`}>
                    <span className="text-lg">
                      {transaction.type === 'income' ? '💰' : '💳'}
                    </span>
                  </div>
                  <div className="ml-3">
                    <p className="font-medium text-curai-ink">{transaction.description}</p>
                    <p className="text-sm text-curai-muted">{new Date(transaction.date).toLocaleDateString('ru-RU')}</p>
                  </div>
                </div>
                <div className={`font-semibold ${
                  transaction.amount > 0 ? "text-curai-positive" : "text-curai-negative"
                }`}>
                  {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString('ru-RU')} ₸
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <button className="text-curai-blue hover:text-curai-blue text-sm font-medium">
              Показать все транзакции →
            </button>
          </div>
        </div>
      </div>
        </div>
      </PagePanel>
    </div>
  );
};

export default FinanceDashboard;
