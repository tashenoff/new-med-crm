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
        <h1 className="text-2xl font-semibold text-curai-ink">💰 Доходы</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-curai-positive text-white px-4 py-2 rounded-md hover:bg-curai-positive transition-colors"
        >
          ➕ Добавить доход
        </button>
      </div>

      {/* Filters */}
      <div className="bg-curai-surface rounded-md shadow-none p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-curai-ink mb-2">Поиск</label>
            <input
              type="text"
              placeholder="Поиск по описанию или пациенту..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-curai-ink mb-2">Период</label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
            >
              <option value="current_month">Текущий месяц</option>
              <option value="last_month">Прошлый месяц</option>
              <option value="current_year">Текущий год</option>
              <option value="all_time">Все время</option>
            </select>
          </div>
          <div className="flex items-end">
            <div className="bg-curai-positiveBg p-3 rounded-md">
              <p className="text-sm text-curai-positive">Общий доход</p>
              <p className="text-2xl font-semibold text-curai-positive">{totalIncome.toLocaleString('ru-RU')} ₸</p>
            </div>
          </div>
        </div>
      </div>

      {/* Income List */}
      <div className="bg-curai-surface rounded-md shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-curai-border">
            <thead className="bg-curai-subtle">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                  Описание
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                  Категория
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                  Сумма
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                  Дата
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                  Пациент
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="bg-curai-surface divide-y divide-curai-border">
              {filteredIncomes.map((income) => (
                <tr key={income.id} className="hover:bg-curai-subtle">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-curai-ink">{income.description}</div>
                    {income.notes && (
                      <div className="text-sm text-curai-muted">{income.notes}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-curai-positiveBg text-curai-positive">
                      {getCategoryIcon(income.category)} {getCategoryName(income.category)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-curai-positive">
                      +{income.amount.toLocaleString('ru-RU')} ₸
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
                    {new Date(income.date).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
                    {income.patient_name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button className="text-curai-blue hover:text-curai-blue">Редактировать</button>
                    <button className="text-curai-negative hover:text-curai-negative">Удалить</button>
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
          <div className="bg-curai-surface rounded-md w-full max-w-md mx-4 curai-glass-shell curai-custom-dialog">
            <div className="curai-glass-header curai-modal-glass-heading has-title-gap"><h3 className="text-lg font-semibold mb-4">➕ Добавить доход</h3></div><div className="curai-glass-body curai-glass-body-padded">
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Описание *</label>
                <input
                  type="text"
                  value={incomeForm.description}
                  onChange={(e) => setIncomeForm({...incomeForm, description: e.target.value})}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Категория</label>
                <select
                  value={incomeForm.category}
                  onChange={(e) => setIncomeForm({...incomeForm, category: e.target.value})}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                >
                  <option value="treatment">Лечение</option>
                  <option value="consultation">Консультация</option>
                  <option value="prevention">Профилактика</option>
                  <option value="surgery">Хирургия</option>
                  <option value="other">Прочее</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Сумма (₸) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={incomeForm.amount}
                  onChange={(e) => setIncomeForm({...incomeForm, amount: e.target.value})}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Дата *</label>
                <input
                  type="date"
                  value={incomeForm.date}
                  onChange={(e) => setIncomeForm({...incomeForm, date: e.target.value})}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Примечания</label>
                <textarea
                  value={incomeForm.notes}
                  onChange={(e) => setIncomeForm({...incomeForm, notes: e.target.value})}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  rows="3"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  type="submit"
                  className="flex-1 bg-curai-positive text-white py-2 rounded-md hover:bg-curai-positive"
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-curai-control text-curai-ink py-2 rounded-md hover:bg-curai-disabled"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div></div>
        </div>
      )}
    </div>
  );
};

export default IncomeView;
