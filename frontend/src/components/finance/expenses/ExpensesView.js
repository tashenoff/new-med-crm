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
        <h1 className="text-2xl font-semibold text-curai-ink">💳 Расходы</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-curai-negative text-white px-4 py-2 rounded-md hover:bg-curai-negative transition-colors"
        >
          ➕ Добавить расход
        </button>
      </div>

      {/* Filters */}
      <div className="bg-curai-surface rounded-md shadow-none p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-curai-ink mb-2">Поиск</label>
            <input
              type="text"
              placeholder="Поиск по описанию..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
            />
          </div>
          <div></div>
          <div className="flex items-end">
            <div className="bg-curai-negativeBg p-3 rounded-md">
              <p className="text-sm text-curai-negative">Общие расходы</p>
              <p className="text-2xl font-semibold text-curai-negative">{totalExpenses.toLocaleString('ru-RU')} ₸</p>
            </div>
          </div>
        </div>
      </div>

      {/* Expenses List */}
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
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="bg-curai-surface divide-y divide-curai-border">
              {filteredExpenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-curai-subtle">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-curai-ink">{expense.description}</div>
                    {expense.notes && (
                      <div className="text-sm text-curai-muted">{expense.notes}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-curai-negativeBg text-curai-negative">
                      {getCategoryIcon(expense.category)} {getCategoryName(expense.category)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-curai-negative">
                      -{expense.amount.toLocaleString('ru-RU')} ₸
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
                    {new Date(expense.date).toLocaleDateString('ru-RU')}
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

      {/* Add Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-curai-surface rounded-md w-full max-w-md mx-4 curai-glass-shell curai-custom-dialog">
            <div className="curai-glass-header curai-modal-glass-heading has-title-gap"><h3 className="text-lg font-semibold mb-4">➕ Добавить расход</h3></div><div className="curai-glass-body curai-glass-body-padded">
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Описание *</label>
                <input
                  type="text"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Категория</label>
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({...expenseForm, category: e.target.value})}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
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
                <label className="block text-sm font-medium text-curai-ink mb-1">Сумма (₸) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Дата *</label>
                <input
                  type="date"
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm({...expenseForm, date: e.target.value})}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Примечания</label>
                <textarea
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({...expenseForm, notes: e.target.value})}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus"
                  rows="3"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  type="submit"
                  className="flex-1 bg-curai-negative text-white py-2 rounded-md hover:bg-curai-negative"
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

export default ExpensesView;