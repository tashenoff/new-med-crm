import React, { useState } from 'react';
import { paymentDiscount, paymentSummary } from '../../utils/paymentBalances';
import { useTreatmentExecution } from './shared/useTreatmentExecution';

const TreatmentPlanView = ({ plan, onUpdate }) => {
  const { loading, markProcedureCompleted, executionCounts, progress } = useTreatmentExecution(plan, onUpdate);
  
  // Раскрытие списка «Что входит» для комплексных услуг, по индексу услуги
  const [openComps, setOpenComps] = useState({});
  

  const toggleComps = (index) =>
    setOpenComps(prev => ({ ...prev, [index]: !prev[index] }));

  // Скидка компонента: приоритет у discount_amount, иначе discount
  const getCompDiscount = (c) => (Number(c.discount_amount) || 0) || (Number(c.discount) || 0);

  const { paidAmount, remainingToPay } = paymentSummary([plan]);
  const totalPlanDiscount = () =>
    (plan.services || []).reduce((sum, service) => sum + paymentDiscount(service), 0);

  

  const getStatusBadge = (status) => {
    const badges = {
      'pending': { bg: "bg-curai-subtle", text: "text-curai-ink", label: 'Ожидает' },
      'in_progress': { bg: "bg-curai-selected", text: "text-curai-blue", label: 'В процессе' },
      'completed': { bg: "bg-curai-positiveBg", text: "text-curai-positive", label: 'Завершено' },
      'cancelled': { bg: "bg-curai-negativeBg", text: "text-curai-negative", label: 'Отменено' }
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
      'unpaid': { bg: "bg-curai-negativeBg", text: "text-curai-negative", label: 'Не оплачено' },
      'partially_paid': { bg: "bg-curai-warningBg", text: "text-curai-warning", label: 'Частично оплачено' },
      'paid': { bg: "bg-curai-positiveBg", text: "text-curai-positive", label: 'Оплачено' }
    };
    const badge = badges[status] || badges['unpaid'];
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  
  

  

  return (
    <div className="bg-curai-surface rounded-md shadow-none border border-curai-border p-6">
      {/* Заголовок */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-curai-ink">{plan.title}</h3>
          <p className="text-sm text-curai-muted mt-1">{plan.description}</p>
        </div>
        <div className="flex flex-col items-end">
          {/* Показываем только статус оплаты */}
          {getPaymentStatusBadge(plan.payment_status)}
        </div>
      </div>

      {/* Общий прогресс */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-curai-muted mb-2">
          <span>Общий прогресс: {progress.completed} из {progress.total} процедур</span>
          <span className="font-medium">{progress.percentage}%</span>
        </div>
        <div className="w-full bg-curai-border rounded-full h-2">
          <div
            className="bg-curai-blue h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </div>

      {/* Финансовая информация */}
      <div className="grid grid-cols-5 gap-4 mb-4 p-3 bg-curai-subtle rounded-md">
        <div>
          <div className="text-xs text-curai-muted">Стоимость плана</div>
          <div className="text-lg font-semibold text-curai-ink">
            {(plan.total_cost || 0).toLocaleString()} ₸
          </div>
        </div>
        <div>
          <div className="text-xs text-curai-muted">Депозит</div>
          <div className="text-lg font-semibold text-curai-blue">
            {(plan.deposit_amount || 0).toLocaleString()} ₸
          </div>
          {(plan.deposit_amount || 0) > 0 && (
            <div className="text-xs text-curai-blue">из записей</div>
          )}
        </div>
        <div>
          <div className="text-xs text-curai-muted">Оплачено</div>
          <div className="text-lg font-semibold text-curai-positive">
            {paidAmount.toLocaleString()} ₸
          </div>
        </div>
        <div>
          <div className="text-xs text-curai-muted">Остаток</div>
          <div className="text-lg font-semibold text-curai-negative">
            {remainingToPay.toLocaleString()} ₸
          </div>
        </div>
        {/* Денежные скидки строк без повторного учёта скидок компонентов */}
        <div>
          <div className="text-xs text-curai-muted">Скидка</div>
          <div className="text-lg font-semibold text-curai-negative">
            −{totalPlanDiscount().toLocaleString()} ₸
          </div>
        </div>
      </div>

      {/* Список услуг */}
      <div className="space-y-3">
        <h4 className="font-medium text-curai-ink">Назначенные услуги:</h4>
        
        {plan.services.map((service, index) => {
          const { total, completed } = executionCounts(service);
          const isCompleted = total > 0 && completed >= total;
          const canAddMore = !isCompleted;
          
          return (
            <div
              key={index}
              className={`border rounded-md p-4 ${
                isCompleted ? "bg-curai-positiveBg border-curai-positive" : "bg-curai-surface border-curai-border"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    {isCompleted && <span className="text-curai-positive text-xl">✓</span>}
                    {!isCompleted && completed > 0 && (
                      <span className="text-curai-blue text-xl">⏳</span>
                    )}
                    <h5 className="font-medium text-curai-ink">{service.service_name}</h5>
                    {service.is_complex && (
                      <span className="ml-2 px-2 py-0.5 bg-curai-selected text-curai-blue text-xs rounded-full">🧩 Комплекс</span>
                    )}
                  </div>
                  
                  <div className="mt-2 space-y-1">
                    <div className="text-sm text-curai-muted">
                      Выполнено: <span className="font-medium">
                        {completed} из {total}
                      </span>
                    </div>
                    <div className="text-sm text-curai-muted">
                      Сумма: <span className="font-medium">
                        {(service.total_price || 0).toLocaleString()} ₸
                      </span>
                    </div>
                    {(Number(service.discount_amount) || 0) > 0 && (
                      <div className="text-sm text-curai-negative">
                        Скидка: −{(Number(service.discount_amount) || 0).toLocaleString()} ₸
                      </div>
                    )}
                    {service.is_complex && (
                      <button
                        type="button"
                        onClick={() => toggleComps(index)}
                        className="text-xs text-curai-blue flex items-center gap-1 hover:underline focus:outline-none"
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
                      <div className="text-xs text-curai-blue mt-1">
                        <ul className="list-disc pl-3 mt-0.5 space-y-0.5">
                          {service.components && service.components.length
                            ? service.components.map(c => {
                                const compDiscount = getCompDiscount(c);
                                return (
                                  <li key={c.component_id || c.service_id || c.service_name}>
                                    {c.service_name}{c.quantity && c.quantity > 1 ? ` ×${c.quantity}` : ''}{c.price ? ` — ${c.price.toLocaleString()} ₸` : ''}
                                    {compDiscount > 0 && (
                                      <span className="text-curai-negative"> — скидка {compDiscount.toLocaleString()} ₸</span>
                                    )}
                                    {c.status !== 'completed' && (
                                      <button type="button" disabled={loading} onClick={() => markProcedureCompleted(service, c)}
                                        className="ml-2 text-curai-blue underline disabled:opacity-50">Отметить выполнение</button>
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
                      <div className="w-full bg-curai-border rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            isCompleted ? "bg-curai-positive" : "bg-curai-blue"
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
                      className="px-3 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    >
                      {loading ? '...' : '+ Отметить'}
                    </button>
                  )}
                  {isCompleted && (
                    <div className="px-3 py-2 bg-curai-positiveBg text-curai-positive rounded-md text-sm font-medium">
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
        <div className="mt-4 p-3 bg-curai-warningBg border border-curai-warning rounded-md">
          <div className="text-sm font-medium text-curai-ink mb-1">Примечания:</div>
          <div className="text-sm text-curai-muted whitespace-pre-wrap">{plan.notes}</div>
        </div>
      )}

      {/* Информация о создании */}
      <div className="mt-4 pt-4 border-t border-curai-border text-xs text-curai-muted">
        Создано: {new Date(plan.created_at).toLocaleString('ru-RU')} • {plan.created_by_name}
      </div>
    </div>
  );
};

export default TreatmentPlanView;
