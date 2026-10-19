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
    new: { label: 'Новая', color: "bg-curai-selected text-curai-blue" },
    in_progress: { label: 'В работе', color: "bg-curai-warningBg text-curai-warning" },
    won: { label: 'Выиграна', color: "bg-curai-positiveBg text-curai-positive" },
    lost: { label: 'Проиграна', color: "bg-curai-negativeBg text-curai-negative" }
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-curai-control"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-curai-negativeBg border border-curai-negative text-curai-negative px-4 py-3 rounded">
          <h3 className="font-semibold">Ошибка загрузки</h3>
          <p>{error}</p>
          <button 
            onClick={clearError}
            className="mt-2 bg-curai-negative text-white px-3 py-1 rounded text-sm hover:bg-curai-negative"
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
          <h1 className="text-2xl font-semibold text-curai-ink">💼 Сделки</h1>
          <p className="text-curai-muted mt-1">Управление сделками</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="bg-curai-blue text-white px-4 py-2 rounded-md hover:bg-curai-blue transition-colors"
        >
          + Новая сделка
        </button>
      </div>

      <div className="bg-curai-surface rounded-md shadow-none border border-curai-border">
        {deals.length === 0 ? (
          <div className="text-center py-8 text-curai-muted">
            <p>Сделки не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-curai-border">
              <thead className="bg-curai-subtle">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Сделка
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Контакт
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Сумма
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Дата закрытия
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-curai-surface divide-y divide-curai-border">
                {deals.map((deal) => {
                  // Найдем клиента по ID
                  const client = clients.find(c => c.id === deal.client_id);
                  const clientName = client ? `${client.first_name} ${client.last_name}` : 'Контакт не найден';
                  
                  return (
                    <tr key={deal.id} className="hover:bg-curai-subtle">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-curai-ink">{deal.title}</div>
                        <div className="text-sm text-curai-muted">{deal.description}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-curai-ink">{clientName}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-curai-positive">
                          {(deal.amount || 0).toLocaleString()}₸
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${dealStatuses[deal.status].color}`}>
                          {dealStatuses[deal.status].label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-ink">
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
                              className="text-curai-positive hover:text-curai-positive"
                              title="Выиграть сделку"
                            >
                              ✅
                            </button>
                            <button
                              onClick={() => handleCloseDeal(deal.id, 'lost')}
                              className="text-curai-negative hover:text-curai-negative"
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
          <div className="bg-curai-surface rounded-md shadow-none p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-curai-ink mb-4">Новая сделка</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Название сделки *</label>
                <input
                  type="text"
                  value={newDeal.title}
                  onChange={(e) => setNewDeal({...newDeal, title: e.target.value})}
                  className="w-full border border-curai-control rounded-md px-3 py-2 text-sm"
                  placeholder="Введите название сделки"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Контакт *</label>
                <select
                  value={newDeal.client_id}
                  onChange={(e) => setNewDeal({...newDeal, client_id: e.target.value})}
                  className="w-full border border-curai-control rounded-md px-3 py-2 text-sm"
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
                <label className="block text-sm font-medium text-curai-ink mb-1">Сумма сделки *</label>
                <input
                  type="number"
                  value={newDeal.amount}
                  onChange={(e) => setNewDeal({...newDeal, amount: parseFloat(e.target.value) || 0})}
                  className="w-full border border-curai-control rounded-md px-3 py-2 text-sm"
                  placeholder="0"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Ожидаемая дата закрытия</label>
                <input
                  type="date"
                  value={newDeal.expected_close_date}
                  onChange={(e) => setNewDeal({...newDeal, expected_close_date: e.target.value})}
                  className="w-full border border-curai-control rounded-md px-3 py-2 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">Описание</label>
                <textarea
                  value={newDeal.description}
                  onChange={(e) => setNewDeal({...newDeal, description: e.target.value})}
                  className="w-full border border-curai-control rounded-md px-3 py-2 text-sm"
                  rows="3"
                  placeholder="Описание сделки..."
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-curai-muted hover:text-curai-ink transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateDeal}
                disabled={!newDeal.title || !newDeal.client_id || newDeal.amount <= 0}
                className="bg-curai-blue text-white px-4 py-2 rounded-md hover:bg-curai-blue disabled:bg-curai-control disabled:cursor-not-allowed transition-colors"
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

