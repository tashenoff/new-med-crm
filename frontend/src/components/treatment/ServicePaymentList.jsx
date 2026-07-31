import React, { useState } from 'react';

const ServicePaymentList = ({ plan, onUpdate, paymentFilter = 'all', procedureFilter = 'all' }) => {
  const [loading, setLoading] = useState(false);
  const API = import.meta.env.VITE_BACKEND_URL;

  // Фильтруем услуги на основе переданных фильтров
  const filteredServices = plan.services.filter(service => {
    // Фильтр по оплате
    if (paymentFilter === 'paid') {
      const isPaid = service.is_paid || service.payment_status === 'paid' || 
                     (service.paid_amount && service.paid_amount >= service.total_price);
      if (!isPaid) return false;
    } else if (paymentFilter === 'unpaid') {
      const isPaid = service.is_paid || service.payment_status === 'paid' || 
                     (service.paid_amount && service.paid_amount >= service.total_price);
      if (isPaid) return false;
    }

    // Фильтр по типу услуг
    if (procedureFilter === 'procedures') {
      if (!service.is_course) return false;
    } else if (procedureFilter === 'non_procedures') {
      if (service.is_course) return false;
    }

    return true;
  });

  const markServicePaid = async (serviceId) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API}/api/treatment-plans/${plan.id}/services/${serviceId}/mark-paid`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const updatedPlan = await response.json();
        if (onUpdate) {
          onUpdate(updatedPlan);
        }
      }
    } catch (error) {
      console.error('Error marking service paid:', error);
      alert('Ошибка при отметке оплаты');
    } finally {
      setLoading(false);
    }
  };

  const markSessionPaidForService = async (planId, serviceId, sessionIndex) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API}/api/treatment-plans/${planId}/services/${serviceId}/sessions/${sessionIndex}/mark-paid`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const updatedPlan = await response.json();
        if (onUpdate) {
          onUpdate(updatedPlan);
        }
      } else {
        alert('Ошибка при отметке оплаты процедуры');
      }
    } catch (error) {
      console.error('Error marking session paid:', error);
      alert('Ошибка при отметке оплаты процедуры');
    } finally {
      setLoading(false);
    }
  };

  const getPaymentStatusBadge = (status) => {
    if (status === 'paid') {
      return (
        <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
          ✅ Оплачено
        </span>
      );
    }
    return (
      <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium">
        ❌ Не оплачено
      </span>
    );
  };

  // Подсчет статистики оплаты
  const paidServices = plan.services.filter(s => s.payment_status === 'paid').length;
  const totalServices = plan.services.length;
  const paidAmount = plan.services
    .filter(s => s.payment_status === 'paid')
    .reduce((sum, s) => sum + (s.total_price || 0), 0);
  const totalAmount = plan.total_cost || 0;
  const paymentProgress = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Заголовок */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{plan.title}</h3>
        {plan.description && (
          <p className="text-sm text-gray-600">{plan.description}</p>
        )}
      </div>

      {/* Прогресс оплаты */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Оплачено услуг: {paidServices} из {totalServices}</span>
          <span className="font-medium">{paymentProgress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
          <div
            className="bg-green-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${paymentProgress}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-gray-500">Всего к оплате</div>
            <div className="text-lg font-semibold text-gray-900">
              {totalAmount.toLocaleString()} ₸
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Оплачено</div>
            <div className="text-lg font-semibold text-green-600">
              {paidAmount.toLocaleString()} ₸
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Остаток</div>
            <div className="text-lg font-semibold text-red-600">
              {(totalAmount - paidAmount).toLocaleString()} ₸
            </div>
          </div>
        </div>
      </div>

      {/* Список услуг */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900 mb-3">Услуги в счете:</h4>
        
        {filteredServices.map((service, index) => {
          const isPaid = service.payment_status === 'paid';
          const isCourse = service.is_course;
          const paymentType = service.payment_type || 'single';
          
          // Для курсов с поэтапной оплатой
          const isPerSession = isCourse && paymentType === 'per_session';
          const paidSessions = isPerSession && service.sessions 
            ? service.sessions.filter(s => s.paid).length 
            : 0;
          const totalSessions = service.quantity_total || 1;
          const sessionPrice = service.price_per_unit || 0;
          
          return (
            <div
              key={index}
              className={`border rounded-lg overflow-hidden transition-all ${
                isPaid ? 'border-green-300' : 'border-gray-200'
              }`}
            >
              {/* Заголовок услуги */}
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <h5 className="font-semibold text-gray-900 text-lg">{service.service_name}</h5>
                    {isCourse && (
                      <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                        🔄 Курс
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Тело карточки */}
              <div className="p-4">
                {isPerSession ? (
                  /* Курс с поэтапной оплатой */
                  <div className="space-y-4">
                    {/* Информация о курсе */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 rounded-lg p-3">
                        <div className="text-xs text-blue-600 font-medium mb-1">ТИП ОПЛАТЫ</div>
                        <div className="text-sm font-semibold text-blue-900">
                          За каждую процедуру
                        </div>
                        <div className="text-xs text-blue-700 mt-1">
                          {sessionPrice.toLocaleString()} ₸ за 1 процедуру
                        </div>
                      </div>
                      
                      <div className="bg-purple-50 rounded-lg p-3">
                        <div className="text-xs text-purple-600 font-medium mb-1">ВСЕГО ПРОЦЕДУР</div>
                        <div className="text-sm font-semibold text-purple-900">
                          {totalSessions} процедур
                        </div>
                        <div className="text-xs text-purple-700 mt-1">
                          на сумму {(totalSessions * sessionPrice).toLocaleString()} ₸
                        </div>
                      </div>
                    </div>

                    {/* Статус оплаты */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-xs text-gray-500 font-medium mb-1">ОПЛАЧЕНО ПРОЦЕДУР</div>
                          <div className="text-2xl font-bold text-gray-900">
                            {paidSessions} <span className="text-lg text-gray-500">из {totalSessions}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500 font-medium mb-1">ОПЛАЧЕНО ДЕНЕГ</div>
                          <div className="text-xl font-bold text-green-600">
                            {(paidSessions * sessionPrice).toLocaleString()} ₸
                          </div>
                          <div className="text-xs text-gray-500">
                            осталось {((totalSessions - paidSessions) * sessionPrice).toLocaleString()} ₸
                          </div>
                        </div>
                      </div>

                      {/* Прогресс-бар */}
                      <div className="relative">
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${(paidSessions / totalSessions) * 100}%` }}
                          />
                        </div>
                        <div className="text-center text-xs font-semibold text-gray-600 mt-1">
                          {Math.round((paidSessions / totalSessions) * 100)}% оплачено
                        </div>
                      </div>
                    </div>

                    {/* Кнопка оплаты */}
                    <div className="flex justify-end">
                      {paidSessions < totalSessions ? (
                        <button
                          onClick={() => markSessionPaidForService(plan.id, service.service_id, paidSessions)}
                          disabled={loading}
                          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-md hover:shadow-lg"
                        >
                          {loading ? (
                            <span>Обработка...</span>
                          ) : (
                            <span className="flex items-center space-x-2">
                              <span>💳</span>
                              <span>Оплатить 1 процедуру</span>
                              <span className="ml-2 px-2 py-0.5 bg-green-700 rounded">
                                {sessionPrice.toLocaleString()} ₸
                              </span>
                            </span>
                          )}
                        </button>
                      ) : (
                        <div className="px-6 py-3 bg-green-100 border-2 border-green-300 text-green-700 rounded-lg font-semibold flex items-center space-x-2">
                          <span className="text-xl">✅</span>
                          <span>Все процедуры оплачены</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Обычная услуга или курс с единовременной оплатой */
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-gray-500 font-medium mb-1">СТОИМОСТЬ</div>
                          <div className="text-xl font-bold text-gray-900">
                            {(service.total_price || 0).toLocaleString()} ₸
                          </div>
                        </div>
                        
                        {service.quantity_total > 1 && (
                          <div>
                            <div className="text-xs text-gray-500 font-medium mb-1">КОЛИЧЕСТВО</div>
                            <div className="text-xl font-bold text-gray-900">
                              {service.quantity_total}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-3">
                        {isPaid ? (
                          <span className="inline-flex items-center px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-semibold">
                            <span className="text-lg mr-2">✅</span> Оплачено
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-semibold">
                            <span className="text-lg mr-2">❌</span> Не оплачено
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Кнопка оплаты */}
                    <div className="ml-6">
                      {!isPaid && (
                        <button
                          onClick={() => markServicePaid(service.service_id)}
                          disabled={loading}
                          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-md hover:shadow-lg"
                        >
                          {loading ? 'Обработка...' : '💳 Оплатить полностью'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Примечания */}
      {plan.notes && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="text-sm font-medium text-gray-700 mb-1">Примечания:</div>
          <div className="text-sm text-gray-600 whitespace-pre-wrap">{plan.notes}</div>
        </div>
      )}

      {/* Информация о создании */}
      <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
        Создано: {new Date(plan.created_at).toLocaleString('ru-RU')} • {plan.created_by_name}
      </div>
    </div>
  );
};

export default ServicePaymentList;