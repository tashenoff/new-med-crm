import React, { useState, useEffect } from 'react';

const ExpensesView = ({ user }) => {
  const [expenses, setExpenses] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [expenseForm, setExpenseForm] = useState({
    description: '',
    amount: '',
    category: 'rent',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  useEffect(() => {
    // TODO: Загрузка данных о расходах через API
    setExpenses([
      {
        id: 1,
        description: 'Аренда помещения',
        amount: 150000,
        category: 'rent',
        date: '2025-09-01',
        notes: 'Месячная аренда клиники'
      },
      {
        id: 2,
        description: 'Зарплата персонала',
        amount: 200000,
        category: 'salary',
        date: '2025-09-05',
        notes: 'Зарплата за сентябрь'
      },
      {
        id: 3,
        description: 'Медицинские материалы',
        amount: 45000,
        category: 'materials',
        date: '2025-09-08',
        notes: 'Пломбировочные материалы'
      }
    ]);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const newExpense = {
      id: expenses.length + 1,
      ...expenseForm,
      amount: parseFloat(expenseForm.amount)
    };
    setExpenses([newExpense, ...expenses]);
    setExpenseForm({
      description: '',
      amount: '',
      category: 'rent',
      date: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setShowModal(false);
  };

  const filteredExpenses = expenses.filter(expense =>
    expense.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  const getCategoryIcon = (category) => {
    switch(category) {
      case 'rent': return '🏢';
      case 'salary': return '👥';
      case 'materials': return '🧰';
      case 'equipment': return '🔧';
      case 'utilities': return '💡';
      case 'marketing': return '📢';
      case 'other': return '📦';
      default: return '💳';
    }
  };

  const getCategoryName = (category) => {
    switch(category) {
      case 'rent': return 'Аренда';
      case 'salary': return 'Зарплата';
      case 'materials': return 'Материалы';
      case 'equipment': return 'Оборудование';
      case 'utilities': return 'Коммунальные';
      case 'marketing': return 'Маркетинг';
      case 'other': return 'Прочее';
      default: return 'Неизвестно';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">💳 Расходы</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
        >
          ➕ Добавить расход
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Поиск</label>
            <input
              type="text"
              placeholder="Поиск по описанию..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div></div>
          <div className="flex items-end">
            <div className="bg-red-100 p-3 rounded-lg">
              <p className="text-sm text-red-700">Общие расходы</p>
              <p className="text-2xl font-bold text-red-800">{totalExpenses.toLocaleString('ru-RU')} ₸</p>
            </div>
          </div>
        </div>
      </div>

      {/* Expenses List */}
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
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredExpenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{expense.description}</div>
                    {expense.notes && (
                      <div className="text-sm text-gray-500">{expense.notes}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      {getCategoryIcon(expense.category)} {getCategoryName(expense.category)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-bold text-red-600">
                      -{expense.amount.toLocaleString('ru-RU')} ₸
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(expense.date).toLocaleDateString('ru-RU')}
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

      {/* Add Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">➕ Добавить расход</h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание *</label>
                <input
                  type="text"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({...expenseForm, category: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                >
                  <option value="rent">Аренда</option>
                  <option value="salary">Зарплата</option>
                  <option value="materials">Материалы</option>
                  <option value="equipment">Оборудование</option>
                  <option value="utilities">Коммунальные</option>
                  <option value="marketing">Маркетинг</option>
                  <option value="other">Прочее</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Сумма (₸) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Дата *</label>
                <input
                  type="date"
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm({...expenseForm, date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Примечания</label>
                <textarea
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({...expenseForm, notes: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                  rows="3"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  type="submit"
                  className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700"
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

export default ExpensesView;