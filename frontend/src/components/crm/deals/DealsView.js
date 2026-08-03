import React, { useState } from 'react';
import { useCrm } from '../../../hooks/useCrm';

const DealsView = ({ user }) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDeal, setNewDeal] = useState({
    title: '',
    client_id: '',
    amount: 0,
    expected_close_date: '',
    description: '',
    services: []
  });

  const {
    deals,
    clients,
    loading,
    error,
    isInitialized,
    createDeal,
    updateDeal,
    closeDealAsWon,
    clearError
  } = useCrm();

  const dealStatuses = {
    new: { label: 'Новая', color: 'bg-blue-100 text-blue-800' },
    in_progress: { label: 'В работе', color: 'bg-yellow-100 text-yellow-800' },
    won: { label: 'Выиграна', color: 'bg-green-100 text-green-800' },
    lost: { label: 'Проиграна', color: 'bg-red-100 text-red-800' }
  };

  const handleCreateDeal = async () => {
    try {
      await createDeal(newDeal);
      setShowCreateModal(false);
      setNewDeal({
        title: '',
        client_id: '',
        amount: 0,
        expected_close_date: '',
        description: '',
        services: []
      });
      alert('Сделка успешно создана!');
    } catch (error) {
      console.error('Error creating deal:', error);
      alert('Ошибка при создании сделки');
    }
  };

  const handleCloseDeal = async (dealId, status) => {
    try {
      if (status === 'won') {
        await closeDealAsWon(dealId);
      } else {
        await updateDeal(dealId, { status });
      }
      alert(`Сделка ${status === 'won' ? 'выиграна' : 'проиграна'}!`);
    } catch (error) {
      console.error('Error closing deal:', error);
      alert('Ошибка при закрытии сделки');
    }
  };

  if (!isInitialized || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <h3 className="font-bold">Ошибка загрузки</h3>
          <p>{error}</p>
          <button 
            onClick={clearError}
            className="mt-2 bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">💼 Сделки</h1>
          <p className="text-gray-600 mt-1">Управление сделками</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
        >
          + Новая сделка
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {deals.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>Сделки не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Сделка
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Контакт
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Сумма
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Дата закрытия
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {deals.map((deal) => {
                  // Найдем клиента по ID
                  const client = clients.find(c => c.id === deal.client_id);
                  const clientName = client ? `${client.first_name} ${client.last_name}` : 'Контакт не найден';
                  
                  return (
                    <tr key={deal.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{deal.title}</div>
                        <div className="text-sm text-gray-500">{deal.description}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{clientName}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-green-600">
                          {(deal.amount || 0).toLocaleString()}₸
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${dealStatuses[deal.status].color}`}>
                          {dealStatuses[deal.status].label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {deal.expected_close_date ? 
                          new Date(deal.expected_close_date).toLocaleDateString('ru-RU') : 
                          'Не указана'
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        {deal.status !== 'won' && deal.status !== 'lost' && (
                          <>
                            <button
                              onClick={() => handleCloseDeal(deal.id, 'won')}
                              className="text-green-600 hover:text-green-900"
                              title="Выиграть сделку"
                            >
                              ✅
                            </button>
                            <button
                              onClick={() => handleCloseDeal(deal.id, 'lost')}
                              className="text-red-600 hover:text-red-900"
                              title="Проиграть сделку"
                            >
                              ❌
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Deal Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Новая сделка</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Название сделки *</label>
                <input
                  type="text"
                  value={newDeal.title}
                  onChange={(e) => setNewDeal({...newDeal, title: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="Введите название сделки"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Контакт *</label>
                <select
                  value={newDeal.client_id}
                  onChange={(e) => setNewDeal({...newDeal, client_id: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Выберите клиента</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.full_name || `${client.first_name} ${client.last_name}`}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Сумма сделки *</label>
                <input
                  type="number"
                  value={newDeal.amount}
                  onChange={(e) => setNewDeal({...newDeal, amount: parseFloat(e.target.value) || 0})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  placeholder="0"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ожидаемая дата закрытия</label>
                <input
                  type="date"
                  value={newDeal.expected_close_date}
                  onChange={(e) => setNewDeal({...newDeal, expected_close_date: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <textarea
                  value={newDeal.description}
                  onChange={(e) => setNewDeal({...newDeal, description: e.target.value})}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  rows="3"
                  placeholder="Описание сделки..."
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateDeal}
                disabled={!newDeal.title || !newDeal.client_id || newDeal.amount <= 0}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DealsView;

