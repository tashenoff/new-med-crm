import React from 'react';

export const money = value => `${Number(value || 0).toLocaleString('ru-RU')} ₸`;
export const paymentDate = value => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('ru-RU') : '—';
};

// This is the same fallback already used by ServicePaymentList for legacy snapshots.
export const displayedPlanPaid = plan => typeof plan.paid_amount === 'number'
  ? plan.paid_amount
  : (plan.services || []).reduce((sum, service) => sum + (service.paid_amount
    ?? (service.payment_status === 'paid' ? (service.total_price || 0) - (service.discount_amount || 0) : 0)), 0);

export function PaymentStatus({ paid, remaining, className = '' }) {
  const status = remaining <= 0.001 && paid > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  return <span className={`curai-r21-status curai-r21-status-${status} ${className}`}>
    {status === 'paid' ? '✓ Оплачен' : status === 'partial' ? '◐ Частично оплачен' : '○ Не оплачен'}
  </span>;
}

export function PaymentColumns() {
  return <colgroup><col className="curai-r21-col-name" /><col className="curai-r21-col-money" /><col className="curai-r21-col-money" /><col className="curai-r21-col-money" /><col className="curai-r21-col-action" /></colgroup>;
}

export function PaymentTableHead({ name = 'Услуга', amount = 'К оплате' }) {
  return <thead><tr><th scope="col">{name}</th><th scope="col">{amount}</th><th scope="col">Оплачено</th><th scope="col">Остаток</th><th scope="col"><span className="sr-only">Действия</span></th></tr></thead>;
}

export function servicePaymentState(view) {
  const paid = view.isPerSession ? view.coursePaidAmount : (view.isPaid ? view.paidShown : view.cPaid);
  const remaining = view.isPerSession ? view.courseRemaining : view.cRemaining;
  const settled = view.isPerSession ? view.paidSessions >= view.totalSessions : view.isPaid || view.cFully;
  return { paid, remaining, settled };
}
