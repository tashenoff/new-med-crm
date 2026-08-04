import React, { useState } from 'react';

const TreatmentPlanView = ({ plan, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const API = import.meta.env.VITE_BACKEND_URL;

  const markProcedureCompleted = async (serviceId) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API}/api/treatment-plans/${plan.id}/services/${serviceId}/mark-completed`,
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
      console.error('Error marking procedure completed:', error);
      alert('Ошибка при отметке процедуры');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      'pending': { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Ожидает' },
      'in_progress': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'В процессе' },
      'completed': { bg: 'bg-green-100', text: 'text-green-700', label: 'Завершено' },
      'cancelled': { bg: 'bg-red-100', text: 'text-red-700', label: 'Отменено' }
    };
    const badge = badges[status] || badges['pending'];
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const getPaymentStatusBadge = (status) => {
    const badges = {
      'unpaid': { bg: 'bg-red-100', text: 'text-red-700', label: 'Не оплачено' },
      'partially_paid': { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Частично оплачено' },
      'paid': { bg: 'bg-green-100', text: 'text-green-700', label: 'Оплачено' }
    };
    const badge = badges[status] || badges['unpaid'];
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const calculateProgress = () => {
    let totalProcedures = 0;
    let completedProcedures = 0;

    plan.services.forEach(service => {
      totalProcedures += service.quantity_total || 1;
      completedProcedures += service.quantity_completed || 0;
    });

    return {
      total: totalProcedures,
      completed: completedProcedures,
      percentage: totalProcedures > 0 ? Math.round((completedProcedures / totalProcedures) * 100) : 0
    };
  };

  const progress = calculateProgress();

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Заголовок */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900">{plan.title}</h3>
          <p className="text-sm text-gray-600 mt-1">{plan.description}</p>
        </div>
        <div className="flex flex-col items-end">
          {/* Показываем только статус оплаты */}
          {getPaymentStatusBadge(plan.payment_status)}
        </div>
      </div>

      {/* Общий прогресс */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Общий прогресс: {progress.completed} из {progress.total} процедур</span>
          <span className="font-medium">{progress.percentage}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </div>

      {/* Финансовая информация */}
      <div className="grid grid-cols-4 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
        <div>
          <div className="text-xs text-gray-500">Стоимость плана</div>
          <div className="text-lg font-semibold text-gray-900">
            {(plan.total_cost || 0).toLocaleString()} ₸
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Депозит</div>
          <div className="text-lg font-semibold text-blue-600">
            {(plan.deposit_amount || 0).toLocaleString()} ₸
          </div>
          {(plan.deposit_amount || 0) > 0 && (
            <div className="text-xs text-blue-500">из записей</div>
          )}
        </div>
        <div>
          <div className="text-xs text-gray-500">Оплачено</div>
          <div className="text-lg font-semibold text-green-600">
            {((plan.paid_amount || 0) + (plan.deposit_amount || 0)).toLocaleString()} ₸
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Остаток</div>
          <div className="text-lg font-semibold text-red-600">
            {((plan.total_cost || 0) - (plan.paid_amount || 0) - (plan.deposit_amount || 0)).toLocaleString()} ₸
          </div>
        </div>
      </div>

      {/* Список услуг */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Назначенные услуги:</h4>
        
        {plan.services.map((service, index) => {
          const isCompleted = (service.quantity_completed || 0) >= (service.quantity_total || 1);
          const canAddMore = (service.quantity_completed || 0) < (service.quantity_total || 1);
          
          return (
            <div
              key={index}
              className={`border rounded-lg p-4 ${
                isCompleted ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    {isCompleted && <span className="text-green-600 text-xl">✓</span>}
                    {!isCompleted && (service.quantity_completed || 0) > 0 && (
                      <span className="text-blue-600 text-xl">⏳</span>
                    )}
                    <h5 className="font-medium text-gray-900">{service.service_name}</h5>
                  </div>
                  
                  <div className="mt-2 space-y-1">
                    <div className="text-sm text-gray-600">
                      Выполнено: <span className="font-medium">
                        {service.quantity_completed || 0} из {service.quantity_total || 1}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      Сумма: <span className="font-medium">
                        {(service.total_price || 0).toLocaleString()} ₸
                      </span>
                    </div>
                    
                    {/* Прогресс-бар для отдельной услуги */}
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            isCompleted ? 'bg-green-600' : 'bg-blue-600'
                          }`}
                          style={{
                            width: `${Math.round(
                              ((service.quantity_completed || 0) / (service.quantity_total || 1)) * 100
                            )}%`
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Кнопка отметки */}
                <div className="ml-4">
                  {canAddMore && (
<button
                      onClick={() => markProcedureCompleted(service.service_id)}
                      disabled={loading}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    >
                      {loading ? '...' : '+ Отметить'}
                    </button>
                  )}
                  {isCompleted && (
                    <div className="px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
                      Завершено
                    </div>
                  )}
                </div>
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

export default TreatmentPlanView;