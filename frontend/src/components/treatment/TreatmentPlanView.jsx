import React, { useState } from 'react';
import { paymentDiscount, paymentSummary } from '../../utils/paymentBalances';
import { completionRequest, ledgerFetch } from '../../utils/accountingLedger';

const TreatmentPlanView = ({ plan, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  // Раскрытие списка «Что входит» для комплексных услуг, по индексу услуги
  const [openComps, setOpenComps] = useState({});
  const API = import.meta.env.VITE_BACKEND_URL;

  const toggleComps = (index) =>
    setOpenComps(prev => ({ ...prev, [index]: !prev[index] }));

  // Скидка компонента: приоритет у discount_amount, иначе discount
  const getCompDiscount = (c) => (Number(c.discount_amount) || 0) || (Number(c.discount) || 0);

  const { paidAmount, remainingToPay } = paymentSummary([plan]);
  const totalPlanDiscount = () =>
    (plan.services || []).reduce((sum, service) => sum + paymentDiscount(service), 0);

  const markProcedureCompleted = async (service, component) => {
    if (loading) return;
    try {
      setLoading(true);
      const { path, payload } = completionRequest(plan, service, component);
      const updatedPlan = await ledgerFetch(`${API}${path}`, payload);
      if (onUpdate) await onUpdate(updatedPlan.plan || updatedPlan);
    } catch (error) {
      console.error('Error marking procedure completed:', error);
      alert('Ошибка при отметке процедуры: ' + error.message);
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

  const executionCounts = service => {
    if (service.is_complex) {
      return (service.components || []).reduce((sum, part) => ({
        total: sum.total + (part.occurrence_ids?.length || part.quantity || 1),
        completed: sum.completed + (part.quantity_completed || 0)
      }), { total: 0, completed: 0 });
    }
    if (service.is_course || service.payment_type === 'per_session') {
      return { total: (service.sessions || []).length,
        completed: (service.sessions || []).filter(session => session.completed).length };
    }
    return { total: service.occurrence_ids?.length || service.quantity_total || service.quantity || 1,
      completed: service.quantity_completed || 0 };
  };
  const calculateProgress = () => {
    const counts = plan.services.map(executionCounts).reduce((sum, part) => ({
      total: sum.total + part.total, completed: sum.completed + part.completed
    }), { total: 0, completed: 0 });
    return { ...counts, percentage: counts.total ? Math.round(counts.completed / counts.total * 100) : 0 };
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
      <div className="grid grid-cols-5 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
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
            {paidAmount.toLocaleString()} ₸
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Остаток</div>
          <div className="text-lg font-semibold text-red-600">
            {remainingToPay.toLocaleString()} ₸
          </div>
        </div>
        {/* Денежные скидки строк без повторного учёта скидок компонентов */}
        <div>
          <div className="text-xs text-gray-500">Скидка</div>
          <div className="text-lg font-semibold text-red-500">
            −{totalPlanDiscount().toLocaleString()} ₸
          </div>
        </div>
      </div>

      {/* Список услуг */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Назначенные услуги:</h4>
        
        {plan.services.map((service, index) => {
          const { total, completed } = executionCounts(service);
          const isCompleted = total > 0 && completed >= total;
          const canAddMore = !isCompleted;
          
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
                    {!isCompleted && completed > 0 && (
                      <span className="text-blue-600 text-xl">⏳</span>
                    )}
                    <h5 className="font-medium text-gray-900">{service.service_name}</h5>
                    {service.is_complex && (
                      <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">🧩 Комплекс</span>
                    )}
                  </div>
                  
                  <div className="mt-2 space-y-1">
                    <div className="text-sm text-gray-600">
                      Выполнено: <span className="font-medium">
                        {completed} из {total}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      Сумма: <span className="font-medium">
                        {(service.total_price || 0).toLocaleString()} ₸
                      </span>
                    </div>
                    {(Number(service.discount_amount) || 0) > 0 && (
                      <div className="text-sm text-red-500">
                        Скидка: −{(Number(service.discount_amount) || 0).toLocaleString()} ₸
                      </div>
                    )}
                    {service.is_complex && (
                      <button
                        type="button"
                        onClick={() => toggleComps(index)}
                        className="text-xs text-purple-600 flex items-center gap-1 hover:underline focus:outline-none"
                      >
                        <svg
                          className={`w-3 h-3 transform transition-transform ${openComps[index] ? 'rotate-90' : ''}`}
                          fill="currentColor"
                          viewBox="0 0 16 16"
                        >
                          <path d="M6 3 L14 3 M8 3 L8 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        <span>🧩 Что входит</span>
                      </button>
                    )}
                    {service.is_complex && openComps[index] && (
                      <div className="text-xs text-purple-600 mt-1">
                        <ul className="list-disc pl-3 mt-0.5 space-y-0.5">
                          {service.components && service.components.length
                            ? service.components.map(c => {
                                const compDiscount = getCompDiscount(c);
                                return (
                                  <li key={c.component_id || c.service_id || c.service_name}>
                                    {c.service_name}{c.quantity && c.quantity > 1 ? ` ×${c.quantity}` : ''}{c.price ? ` — ${c.price.toLocaleString()} ₸` : ''}
                                    {compDiscount > 0 && (
                                      <span className="text-red-500"> — скидка {compDiscount.toLocaleString()} ₸</span>
                                    )}
                                    {c.status !== 'completed' && (
                                      <button type="button" disabled={loading} onClick={() => markProcedureCompleted(service, c)}
                                        className="ml-2 text-blue-700 underline disabled:opacity-50">Отметить выполнение</button>
                                    )}
                                  </li>
                                );
                              })
                            : <li>—</li>}
                        </ul>
                      </div>
                    )}
                    
                    {/* Прогресс-бар для отдельной услуги */}
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            isCompleted ? 'bg-green-600' : 'bg-blue-600'
                          }`}
                          style={{
                            width: `${Math.round(
                              (completed / (total || 1)) * 100
                            )}%`
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Кнопка отметки */}
                <div className="ml-4">
                  {canAddMore && !service.is_complex && (
                    <button
                      onClick={() => markProcedureCompleted(service)}
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
