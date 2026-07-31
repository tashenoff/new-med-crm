import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../api/config';

const LabServiceCashbackSettings = () => {
  const [services, setServices] = useState([]);
  const [labServices, setLabServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [cashbackRate, setCashbackRate] = useState(5.0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [servicesRes, labServicesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/service-prices`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch(`${API_BASE_URL}/loyalty/cashback/services`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
      ]);

      if (servicesRes.ok) {
        const servicesData = await servicesRes.json();
        setServices(servicesData);
      }

      if (labServicesRes.ok) {
        const labServicesData = await labServicesRes.json();
        setLabServices(labServicesData);
      }
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCashback = async (e) => {
    e.preventDefault();
    
    if (!selectedService) {
      setMessage('Выберите услугу');
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const service = services.find(s => s.id === selectedService);
      
      const response = await fetch(`${API_BASE_URL}/loyalty/cashback/service`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          service_id: selectedService,
          service_name: service.service_name,
          cashback_rate: cashbackRate
        })
      });

      if (response.ok) {
        setMessage('Настройки кэшбэка сохранены');
        setSelectedService('');
        setCashbackRate(5.0);
        setTimeout(() => setMessage(''), 3000);
        await loadData();
      } else {
        throw new Error('Ошибка сохранения');
      }
    } catch (error) {
      setMessage('Ошибка при сохранении настроек');
      console.error('Ошибка:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRate = async (serviceId, newRate) => {
    try {
      const response = await fetch(`${API_BASE_URL}/loyalty/cashback/service/${serviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cashback_rate: newRate })
      });

      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      console.error('Ошибка обновления:', error);
    }
  };

  const handleDeactivate = async (serviceId) => {
    if (!confirm('Отключить кэшбэк для этой услуги?')) return;

    try {
      const response = await fetch(`${API_BASE_URL}/loyalty/cashback/service/${serviceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      console.error('Ошибка удаления:', error);
    }
  };

  if (loading) {
    return <div className="p-4">Загрузка...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Настройка кэшбэка для анализов</h2>

      {/* Форма добавления */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Добавить кэшбэк для услуги</h3>
        
        <form onSubmit={handleAddCashback} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Выберите услугу (анализ)
            </label>
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              required
            >
              <option value="">-- Выберите услугу --</option>
              {services.map(service => (
                <option key={service.id} value={service.id}>
                  {service.service_name} ({service.price} ₸)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Процент кэшбэка врачу
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={cashbackRate}
                onChange={(e) => setCashbackRate(parseFloat(e.target.value))}
                className="border border-gray-300 rounded-lg px-4 py-2 w-32"
                required
              />
              <span className="text-gray-600">%</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Процент от стоимости услуги, который получит врач после оплаты
            </p>
          </div>

          {message && (
            <div className={`rounded-lg p-4 ${message.includes('успешно') || message.includes('сохранены') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {saving ? 'Сохранение...' : 'Добавить настройку кэшбэка'}
          </button>
        </form>
      </div>

      {/* Список услуг с кэшбэком */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Услуги с настроенным кэшбэком</h3>
        
        {labServices.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            Нет настроенных услуг. Добавьте первую услугу выше.
          </div>
        ) : (
          <div className="space-y-3">
            {labServices.map(labService => {
              const fullService = services.find(s => s.id === labService.service_id);
              
              return (
                <div
                  key={labService.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {labService.service_name}
                      </div>
                      {fullService && (
                        <div className="text-sm text-gray-500">
                          Стоимость: {fullService.price} ₸
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={labService.cashback_rate}
                          onChange={(e) => handleUpdateRate(labService.service_id, parseFloat(e.target.value))}
                          className="border border-gray-300 rounded px-3 py-1 w-20 text-sm"
                        />
                        <span className="text-sm text-gray-600">%</span>
                      </div>

                      <button
                        onClick={() => handleDeactivate(labService.service_id)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                  
                  {fullService && (
                    <div className="text-xs text-green-600 mt-2">
                      Врач получит: {(fullService.price * labService.cashback_rate / 100).toFixed(0)} ₸ за направление
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Информационный блок */}
      <div className="mt-6 bg-blue-50 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">ℹ️ Как это работает</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Врач направляет пациента на анализ</li>
          <li>• Пациент оплачивает анализ</li>
          <li>• Врач автоматически получает кэшбэк</li>
          <li>• Кэшбэк отображается в профиле врача</li>
        </ul>
      </div>
    </div>
  );
};

export default LabServiceCashbackSettings;
