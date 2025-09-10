import React, { useState, useEffect } from 'react';

const IncomeView = ({ user }) => {
  const [incomes, setIncomes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('current_month');

  const [incomeForm, setIncomeForm] = useState({
    description: '',
    amount: '',
    category: 'treatment',
    date: new Date().toISOString().split('T')[0],
    patient_id: '',
    notes: ''
  });

  useEffect(() => {
    // TODO: Загрузка данных о доходах через API
    setIncomes([
      {
        id: 1,
        description: 'Лечение зубов - Иванов И.И.',
        amount: 25000,
        category: 'treatment',
        date: '2025-09-10',
        patient_name: 'Иванов Иван Иванович',
        notes: 'Полная санация'
      },
      {
        id: 2,
        description: 'Консультация - Петров П.П.',
        amount: 8000,
        category: 'consultation',
        date: '2025-09-09',
        patient_name: 'Петров Петр Петрович',
        notes: 'Первичная консультация'
      },
      {
        id: 3,
        description: 'Профилактическая чистка',
        amount: 12000,
        category: 'prevention',
        date: '2025-09-08',
        patient_name: 'Сидорова Анна Владимировна',
        notes: ''
      }
    ]);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: Отправка данных на сервер
    const newIncome = {
      id: incomes.length + 1,
      ...incomeForm,
      amount: parseFloat(incomeForm.amount)
    };
    setIncomes([newIncome, ...incomes]);
    setIncomeForm({
      description: '',
      amount: '',
      category: 'treatment',
      date: new Date().toISOString().split('T')[0],
      patient_id: '',
      notes: ''
    });
    setShowModal(false);
  };

  const filteredIncomes = incomes.filter(income =>
    income.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    income.patient_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalIncome = filteredIncomes.reduce((sum, income) => sum + income.amount, 0);

  const getCategoryIcon = (category) => {
    switch(category) {
      case 'treatment': return '🦷';
      case 'consultation': return '👨‍⚕️';
      case 'prevention': return '🧽';
      case 'surgery': return '🏥';
      case 'other': return '💼';
      default: return '💰';
    }
  };

  const getCategoryName = (category) => {
    switch(category) {
      case 'treatment': return 'Лечение';
      case 'consultation': return 'Консультация';
      case 'prevention': return 'Профилактика';
      case 'surgery': return 'Хирургия';
      case 'other': return 'Прочее';
      default: return 'Неизвестно';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">💰 Доходы</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          ➕ Добавить доход
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Поиск</label>
            <input
              type="text"
              placeholder="Поиск по описанию или пациенту..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Период</label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            >
              <option value="current_month">Текущий месяц</option>
              <option value="last_month">Прошлый месяц</option>
              <option value="current_year">Текущий год</option>
              <option value="all_time">Все время</option>
            </select>
          </div>
          <div className="flex items-end">
            <div className="bg-green-100 p-3 rounded-lg">
              <p className="text-sm text-green-700">Общий доход</p>
              <p className="text-2xl font-bold text-green-800">{totalIncome.toLocaleString('ru-RU')} ₸</p>
            </div>
          </div>
        </div>
      </div>

      {/* Income List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Описание
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Категория
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Сумма
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Дата
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Пациент
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredIncomes.map((income) => (
                <tr key={income.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{income.description}</div>
                    {income.notes && (
                      <div className="text-sm text-gray-500">{income.notes}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {getCategoryIcon(income.category)} {getCategoryName(income.category)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-bold text-green-600">
                      +{income.amount.toLocaleString('ru-RU')} ₸
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(income.date).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {income.patient_name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button className="text-blue-600 hover:text-blue-900">Редактировать</button>
                    <button className="text-red-600 hover:text-red-900">Удалить</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Income Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">➕ Добавить доход</h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание *</label>
                <input
                  type="text"
                  value={incomeForm.description}
                  onChange={(e) => setIncomeForm({...incomeForm, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
                <select
                  value={incomeForm.category}
                  onChange={(e) => setIncomeForm({...incomeForm, category: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="treatment">Лечение</option>
                  <option value="consultation">Консультация</option>
                  <option value="prevention">Профилактика</option>
                  <option value="surgery">Хирургия</option>
                  <option value="other">Прочее</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Сумма (₸) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={incomeForm.amount}
                  onChange={(e) => setIncomeForm({...incomeForm, amount: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Дата *</label>
                <input
                  type="date"
                  value={incomeForm.date}
                  onChange={(e) => setIncomeForm({...incomeForm, date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Примечания</label>
                <textarea
                  value={incomeForm.notes}
                  onChange={(e) => setIncomeForm({...incomeForm, notes: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  rows="3"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700"
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncomeView;
