import React from 'react';
import { money } from './PaymentPresentation';

const monetaryValue = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
export function hasCalculatedPlanBalance(plans) {
  return plans.length > 0 && plans.every(plan => plan && (
    monetaryValue(plan.total_cost) || (plan.services?.length > 0 && plan.services.every(service => monetaryValue(service.total_price)))
  ));
}

// Presentation only: callers supply the existing computed balance unchanged.
export function PaymentDue({ amount, calculated = false, loading = false, error = false, label = 'К оплате' }) {
  const ready = calculated && !loading && !error && typeof amount === 'number' && Number.isFinite(amount);
  const settled = ready && amount === 0;
  return <><span aria-hidden={settled || undefined}>{settled ? '\u00a0' : label}</span><strong>{settled ? 'Оплачено' : ready ? money(amount) : 'Нет данных'}</strong></>;
}
