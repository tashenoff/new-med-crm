import { canAction, permissionProps } from '../../utils/permissions.js';
import React, { useState, useEffect } from 'react';
import Modal from '../modals/Modal';
import PanelHeader from '../common/PanelHeader';
import { inputClasses, textareaClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses } from '../modals/modalUtils';

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
      <div className={`calendar-container calendar-view-panel rounded-md`}>
        <PanelHeader
          title="Типы оплат"
          subtitle="Управление способами оплаты и комиссиями"
          onAction={canAction(user, "directory_view", "directory_edit") ? (user?.role === 'admin' || user?.role === 'super_admin' ? () => setShowModal(true) : undefined) : undefined}
          actionLabel="+ Добавить тип оплаты"
        />

        <div className="bg-curai-surface rounded-b-md border border-t-0 border-curai-border p-4 space-y-4 shadow-none">

      {/* Сообщения */}
      {error && (
        <div className="bg-curai-negativeBg border border-curai-negative text-curai-negative px-4 py-3 rounded-md">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-curai-positiveBg border border-curai-positive text-curai-positive px-4 py-3 rounded-md">
          {success}
        </div>
      )}

      {/* Фильтры */}
      <div className="bg-curai-surface p-4 rounded-md shadow-none border">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className={labelClasses}>Поиск типов оплат</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Введите название типа оплаты..."
              className={inputClasses}
            />
          </div>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-curai-surface p-6 rounded-md shadow-none border-l-4 border-curai-control">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-curai-muted text-sm font-medium">Всего типов оплат</p>
              <p className="text-2xl font-semibold text-curai-blue">{paymentTypes.length}</p>
            </div>
            <div className="text-curai-blue text-2xl">💳</div>
          </div>
        </div>
        
        <div className="bg-curai-surface p-6 rounded-md shadow-none border-l-4 border-curai-positive">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-curai-muted text-sm font-medium">Активных типов</p>
              <p className="text-2xl font-semibold text-curai-positive">{paymentTypes.filter(pt => pt.is_active).length}</p>
            </div>
            <div className="text-curai-positive text-2xl">✅</div>
          </div>
        </div>
        
        <div className="bg-curai-surface p-6 rounded-md shadow-none border-l-4 border-curai-warning">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-curai-muted text-sm font-medium">Средняя комиссия</p>
              <p className="text-2xl font-semibold text-curai-warning">
                {paymentTypes.length > 0 
                  ? (paymentTypes.reduce((sum, pt) => sum + pt.commission_rate, 0) / paymentTypes.length).toFixed(1)
                  : 0
                }%
              </p>
            </div>
            <div className="text-curai-warning text-2xl">📊</div>
          </div>
        </div>
        
        <div className="bg-curai-surface p-6 rounded-md shadow-none border-l-4 border-curai-control">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-curai-muted text-sm font-medium">Найдено</p>
              <p className="text-2xl font-semibold text-curai-blue">{filteredPaymentTypes.length}</p>
            </div>
            <div className="text-curai-blue text-2xl">🔍</div>
          </div>
        </div>
      </div>

      {/* Таблица типов оплат */}
      <div className="bg-curai-surface rounded-md shadow-none overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-curai-muted">Загружаем типы оплат...</div>
          </div>
        ) : filteredPaymentTypes.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center text-curai-muted">
              <div className="text-2xl mb-2">💳</div>
              <p>Типы оплат не найдены</p>
              <p className="text-sm mt-1">Добавьте первый тип оплаты для управления способами оплаты</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-curai-border">
              <thead className="bg-curai-subtle">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Название типа оплаты
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Комиссия (%)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Описание
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                    Дата создания
                  </th>
                  {(user?.role === 'admin' || user?.role === 'super_admin') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-curai-muted uppercase tracking-wider">
                      Действия
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-curai-surface divide-y divide-curai-border">
                {filteredPaymentTypes.map(paymentType => (
                  <tr key={paymentType.id} className="hover:bg-curai-subtle">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-2xl mr-3">💳</div>
                        <div className="font-medium text-curai-ink">{paymentType.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-lg font-medium text-curai-blue">
                        {paymentType.commission_rate}%
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-curai-muted max-w-xs">
                      <div className="truncate" title={paymentType.description}>
                        {paymentType.description || '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-curai-muted">
                      {new Date(paymentType.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    {(user?.role === 'admin' || user?.role === 'super_admin') && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(paymentType)}
                            className="text-curai-blue hover:text-curai-blue"
                           {...permissionProps(user, "directory_view", "directory_edit")}>
                            Изменить
                          </button>
                          <button
                            onClick={() => handleDelete(paymentType.id)}
                            className="text-curai-negative hover:text-curai-negative"
                           {...permissionProps(user, "directory_view", "directory_delete")}>
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
      <Modal 
        show={showModal} 
        onClose={() => {
          setShowModal(false);
          setEditingPaymentType(null);
          setPaymentTypeForm({
            name: '',
            description: '',
            is_active: true
          });
        }}
        title={editingPaymentType ? 'Редактировать тип оплаты' : 'Добавить новый тип оплаты'}
        errorMessage={error}
        size="max-w-md"
      >
            
            <form onSubmit={event => { if (!canAction(user, "directory_view", "directory_edit")) { event.preventDefault(); return; } return (handleSubmit)(event); }} className="space-y-4">
              <div>
                <label className={labelClasses}>Название типа оплаты *</label>
                <input
                  type="text"
                  value={paymentTypeForm.name}
                  onChange={(e) => setPaymentTypeForm({...paymentTypeForm, name: e.target.value})}
                  className={inputClasses}
                  required
                  placeholder="Например: Наличные, Карта, Каспи QR, Банковский перевод"
                />
              </div>
              
              <div>
                <label className={labelClasses}>Комиссия платежной системы (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={paymentTypeForm.commission_rate}
                  onChange={(e) => setPaymentTypeForm({...paymentTypeForm, commission_rate: e.target.value})}
                  className={inputClasses}
                  placeholder="Например: 2.5 для 2.5%"
                />
              </div>
              
              <div>
                <label className={labelClasses}>Описание</label>
                <textarea
                  value={paymentTypeForm.description}
                  onChange={(e) => setPaymentTypeForm({...paymentTypeForm, description: e.target.value})}
                  className={inputClasses}
                  rows="3"
                  placeholder="Дополнительная информация о типе оплаты..."
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className={`flex-1 ${buttonPrimaryClasses}`}
                 {...permissionProps(user, "directory_view", "directory_edit")}>
                  {loading ? 'Сохранение...' : (editingPaymentType ? 'Обновить' : 'Создать')}
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className={`flex-1 ${buttonSecondaryClasses}`}
                >
                  Отмена
                </button>
              </div>
            </form>
      </Modal>
        </div>
      </div>
    </div>
  );
};

export default PaymentTypes;
