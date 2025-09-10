import React, { useState, useEffect } from 'react';

const ReportsView = ({ user }) => {
  const [reportType, setReportType] = useState('monthly');
  const [selectedPeriod, setSelectedPeriod] = useState('2025-09');
  const [reportData, setReportData] = useState(null);

  useEffect(() => {
    // TODO: Загрузка данных отчета через API
    setReportData({
      totalIncome: 350000,
      totalExpenses: 280000,
      profit: 70000,
      profitMargin: 20,
      categories: {
        income: [
          { name: 'Лечение', amount: 250000, percentage: 71.4 },
          { name: 'Консультации', amount: 50000, percentage: 14.3 },
          { name: 'Профилактика', amount: 50000, percentage: 14.3 }
        ],
        expenses: [
          { name: 'Зарплата', amount: 150000, percentage: 53.6 },
          { name: 'Аренда', amount: 80000, percentage: 28.6 },
          { name: 'Материалы', amount: 30000, percentage: 10.7 },
          { name: 'Прочее', amount: 20000, percentage: 7.1 }
        ]
      }
    });
  }, [reportType, selectedPeriod]);

  const downloadReport = (format) => {
    // TODO: Реализовать экспорт отчета
    alert(`Скачивание отчета в формате ${format.toUpperCase()}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">📊 Финансовые отчеты</h1>
        <div className="flex space-x-2">
          <button
            onClick={() => downloadReport('pdf')}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            📄 PDF
          </button>
          <button
            onClick={() => downloadReport('excel')}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            📊 Excel
          </button>
        </div>
      </div>

      {/* Report Settings */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Тип отчета</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="daily">Ежедневный</option>
              <option value="weekly">Еженедельный</option>
              <option value="monthly">Ежемесячный</option>
              <option value="yearly">Годовой</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Период</label>
            <input
              type={reportType === 'monthly' ? 'month' : reportType === 'yearly' ? 'year' : 'date'}
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {/* TODO: Генерация отчета */}}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              📈 Создать отчет
            </button>
          </div>
        </div>
      </div>

      {reportData && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-green-100">
                  <span className="text-2xl">💰</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Общий доход</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {reportData.totalIncome.toLocaleString('ru-RU')} ₸
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-red-100">
                  <span className="text-2xl">💳</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Общие расходы</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {reportData.totalExpenses.toLocaleString('ru-RU')} ₸
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-blue-100">
                  <span className="text-2xl">📈</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Прибыль</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {reportData.profit.toLocaleString('ru-RU')} ₸
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-yellow-100">
                  <span className="text-2xl">📊</span>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Рентабельность</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {reportData.profitMargin}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Categories Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Income Categories */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">💰 Структура доходов</h3>
              <div className="space-y-3">
                {reportData.categories.income.map((category, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{category.name}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">{category.percentage}%</span>
                      <span className="text-sm font-bold text-green-600">
                        {category.amount.toLocaleString('ru-RU')} ₸
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Expense Categories */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">💳 Структура расходов</h3>
              <div className="space-y-3">
                {reportData.categories.expenses.map((category, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{category.name}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">{category.percentage}%</span>
                      <span className="text-sm font-bold text-red-600">
                        {category.amount.toLocaleString('ru-RU')} ₸
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Chart Placeholder */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">📈 Динамика финансов</h3>
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
              <p className="text-gray-500">График динамики доходов и расходов (TODO: Интеграция Chart.js)</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ReportsView;