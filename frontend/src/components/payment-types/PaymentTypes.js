import React, { useState, useEffect } from 'react';

const PaymentTypes = ({ user }) => {
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPaymentType, setEditingPaymentType] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [paymentTypeForm, setPaymentTypeForm] = useState({
    name: '',
    commission_rate: '',
    description: ''
  });

  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    fetchPaymentTypes();
  }, []);

  const fetchPaymentTypes = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/payment-types`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPaymentTypes(data || []);
      } else {
        setError('Ошибка загрузки типов оплат');
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error fetching payment types:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      const url = editingPaymentType 
        ? `${API}/api/payment-types/${editingPaymentType.id}`
        : `${API}/api/payment-types`;
      
      const method = editingPaymentType ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...paymentTypeForm,
          commission_rate: parseFloat(paymentTypeForm.commission_rate) || 0
        })
      });

      if (response.ok) {
        setSuccess(editingPaymentType ? 'Тип оплаты обновлен успешно' : 'Тип оплаты создан успешно');
        fetchPaymentTypes();
        handleCloseModal();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при сохранении типа оплаты');
        setTimeout(() => setError(''), 5000);
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error saving payment type:', error);
      setTimeout(() => setError(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (paymentType) => {
    setEditingPaymentType(paymentType);
    setPaymentTypeForm({
      name: paymentType.name,
      commission_rate: paymentType.commission_rate.toString(),
      description: paymentType.description || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (paymentTypeId) => {
    if (!window.confirm('Удалить этот тип оплаты?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/payment-types/${paymentTypeId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setSuccess('Тип оплаты удален успешно');
        fetchPaymentTypes();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при удалении типа оплаты');
        setTimeout(() => setError(''), 5000);
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error deleting payment type:', error);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingPaymentType(null);
    setPaymentTypeForm({
      name: '',
      commission_rate: '',
      description: ''
    });
  };

  const filteredPaymentTypes = paymentTypes.filter(paymentType => 
    paymentType.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (paymentType.description && paymentType.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Типы оплат</h2>
          <p className="text-gray-600">Управление способами оплаты и комиссиями</p>
        </div>
        {user?.role === 'admin' && (
          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + Добавить тип оплаты
          </button>
        )}
      </div>

      {/* Сообщения */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Фильтры */}
      <div className="bg-white p-4 rounded-lg shadow border">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Поиск типов оплат</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Введите название типа оплаты..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-indigo-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Всего типов оплат</p>
              <p className="text-2xl font-bold text-indigo-600">{paymentTypes.length}</p>
            </div>
            <div className="text-indigo-500 text-2xl">💳</div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Активных типов</p>
              <p className="text-2xl font-bold text-green-600">{paymentTypes.filter(pt => pt.is_active).length}</p>
            </div>
            <div className="text-green-500 text-2xl">✅</div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Средняя комиссия</p>
              <p className="text-2xl font-bold text-orange-600">
                {paymentTypes.length > 0 
                  ? (paymentTypes.reduce((sum, pt) => sum + pt.commission_rate, 0) / paymentTypes.length).toFixed(1)
                  : 0
                }%
              </p>
            </div>
            <div className="text-orange-500 text-2xl">📊</div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Найдено</p>
              <p className="text-2xl font-bold text-purple-600">{filteredPaymentTypes.length}</p>
            </div>
            <div className="text-purple-500 text-2xl">🔍</div>
          </div>
        </div>
      </div>

      {/* Таблица типов оплат */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Загружаем типы оплат...</div>
          </div>
        ) : filteredPaymentTypes.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center text-gray-500">
              <div className="text-4xl mb-2">💳</div>
              <p>Типы оплат не найдены</p>
              <p className="text-sm mt-1">Добавьте первый тип оплаты для управления способами оплаты</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Название типа оплаты
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Комиссия (%)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Описание
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Дата создания
                  </th>
                  {user?.role === 'admin' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Действия
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPaymentTypes.map(paymentType => (
                  <tr key={paymentType.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-2xl mr-3">💳</div>
                        <div className="font-medium text-gray-900">{paymentType.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-lg font-medium text-indigo-600">
                        {paymentType.commission_rate}%
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                      <div className="truncate" title={paymentType.description}>
                        {paymentType.description || '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(paymentType.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    {user?.role === 'admin' && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(paymentType)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Изменить
                          </button>
                          <button
                            onClick={() => handleDelete(paymentType.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Модальное окно для создания/редактирования типа оплаты */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingPaymentType ? 'Редактировать тип оплаты' : 'Добавить новый тип оплаты'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Название типа оплаты *</label>
                <input
                  type="text"
                  value={paymentTypeForm.name}
                  onChange={(e) => setPaymentTypeForm({...paymentTypeForm, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                  placeholder="Например: Наличные, Карта, Каспи QR, Банковский перевод"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Комиссия платежной системы (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={paymentTypeForm.commission_rate}
                  onChange={(e) => setPaymentTypeForm({...paymentTypeForm, commission_rate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="Например: 2.5 для 2.5%"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <textarea
                  value={paymentTypeForm.description}
                  onChange={(e) => setPaymentTypeForm({...paymentTypeForm, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  rows="3"
                  placeholder="Дополнительная информация о типе оплаты..."
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading ? 'Сохранение...' : (editingPaymentType ? 'Обновить' : 'Создать')}
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400"
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

export default PaymentTypes;