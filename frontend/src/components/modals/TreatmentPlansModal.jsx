import React from 'react';
import Modal from './Modal';

const TreatmentPlansModal = ({ show, onClose, patient, plans }) => {
  const getPlanStatusBadge = (status) => {
    const badges = {
      'draft': { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', label: 'Черновик' },
      'approved': { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: 'Утвержден' },
      'in_progress': { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', label: 'В работе' },
      'completed': { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: 'Завершен' },
      'cancelled': { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'Отменен' }
    };
    const badge = badges[status] || badges['draft'];
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const getPaymentBadge = (status, paidAmount, totalCost) => {
    if (paidAmount >= totalCost && totalCost > 0) {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">✅ Оплачено</span>;
    } else if (paidAmount > 0) {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">⏳ Частично</span>;
    }
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">❌ Не оплачено</span>;
  };

  const formatMoney = (amount) => {
    return ((amount || 0)).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₸';
  };

  const patientName = patient?.full_name || patient?.name || 'Пациент';
  const totalCost = plans.reduce((sum, plan) => sum + (plan.total_cost || 0), 0);
  const totalPaid = plans.reduce((sum, plan) => sum + (plan.paid_amount || 0), 0);

  return (
    <Modal
      show={show}
      onClose={onClose}
      title={`📋 Планы лечения: ${patientName}`}
      size="max-w-4xl"
    >
      <div className="space-y-4">
        {/* Сводка */}
        {plans.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{plans.length}</div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">Планов</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{formatMoney(totalCost)}</div>
              <div className="text-xs text-green-600 dark:text-green-400 mt-1">На сумму</div>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(totalPaid)}</div>
              <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Оплачено</div>
            </div>
          </div>
        )}

        {/* Список планов */}
        {plans.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <div className="text-4xl mb-3">📭</div>
            <p>У пациента нет планов лечения</p>
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map((plan, index) => (
              <div
                key={plan.id || index}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {plan.title || 'План лечения'}
                      </h4>
                      {getPlanStatusBadge(plan.status)}
                    </div>
                    {plan.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 line-clamp-2">
                        {plan.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span>📅 {new Date(plan.created_at).toLocaleDateString('ru-RU')}</span>
                      {plan.doctor_name && <span>👨‍⚕️ {plan.doctor_name}</span>}
                      <span>📋 {(plan.services || []).length} услуг</span>
                    </div>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatMoney(plan.total_cost || 0)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Оплачено: {formatMoney(plan.paid_amount || 0)}
                    </div>
                    <div className="mt-1">
                      {getPaymentBadge(plan.payment_status, plan.paid_amount, plan.total_cost)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TreatmentPlansModal;