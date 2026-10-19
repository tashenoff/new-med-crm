import React, { useState } from 'react';
import { planRemainingToPay } from '../../../utils/paymentBalances';
import { displayedPlanPaid, money, paymentDate, PaymentStatus } from '../payment/PaymentPresentation';

export function usePlanSelection(plans, patientId) {
  const [selection, setSelection] = useState(() => ({ patientId, id: plans[0]?.id ?? null }));
  const selectedPlan = plans.find(plan => selection.patientId === patientId && plan.id === selection.id) || plans[0];
  return [selectedPlan, id => setSelection({ patientId, id })];
}

export function PlanWorkspace({ variant = 'payment', top, list, children, empty }) {
  return <div className={`curai-plan-workspace curai-plan-workspace-${variant}${variant === 'payment' ? ' curai-r21-payment-workspace' : ''}`}>
    {top}
    {list ? <div className={`curai-plan-workspace-panes${variant === 'payment' ? ' curai-r21-payment-panes' : ''}`}>{list}{children}</div> : empty}
  </div>;
}

export function PlanList({ plans, selectedId, onSelect, variant = 'payment', action, emptyText = 'Планов пока нет' }) {
  const payment = variant === 'payment';
  return <aside className={`curai-plan-pane curai-plan-list curai-plan-list-${variant}${payment ? ' curai-r21-plan-list' : ''}`} aria-label={payment ? 'Планы лечения для оплаты' : 'Список планов лечения'}>
    <div className={`curai-plan-list-header${payment ? ' curai-r21-plan-list-header' : ''}`}><div><h4>Планы лечения</h4><span>{plans.length}</span></div>{action}</div>
    <div className={`curai-plan-list-scroll${payment ? ' curai-r21-plan-list-scroll' : ''}`} role="list" aria-label="Выбор плана лечения" tabIndex={0}>
      {plans.map(plan => {
        const paid = displayedPlanPaid(plan), remaining = planRemainingToPay(plan, paid);
        return <div role="listitem" key={plan.id}><button type="button" title={plan.title || 'План лечения'} className={`curai-plan-option${payment ? ' curai-r21-plan-option' : ''}${plan.id === selectedId ? ' is-selected' : ''}`} aria-pressed={plan.id === selectedId} onClick={() => onSelect(plan.id)}>
          <strong>{plan.title || 'План лечения'}</strong>
          {payment ? <><span className="curai-plan-option-meta curai-r21-plan-option-meta"><time>{paymentDate(plan.created_at)}</time><span>Остаток</span></span><span className="curai-plan-option-balance curai-r21-plan-option-balance"><PaymentStatus paid={paid} remaining={remaining} /><strong>{money(remaining)}</strong></span></> : <span className="curai-plan-option-balance"><PaymentStatus paid={paid} remaining={remaining} /><time>{paymentDate(plan.created_at)}</time></span>}
        </button></div>;
      })}
      {!plans.length && <p className="curai-plan-list-empty">{emptyText}</p>}
    </div>
  </aside>;
}

export function PlanDetailsHeader({ title, metadata, actions, className = '', children }) {
  return <header className={`curai-plan-details-header ${className}`}><div className="curai-plan-header-title"><h4>{title || 'План лечения'}</h4></div>{actions && <div className="curai-plan-header-actions">{actions}</div>}<p className="curai-plan-details-meta">{metadata}</p>{children}</header>;
}

export function PlanEmptyState({ title, children, action, className = '' }) {
  return <div className={`curai-plan-empty ${className}`}><h4>{title}</h4>{children && <p>{children}</p>}{action}</div>;
}

export function PlanDisclosure({ expanded, onToggle, label, iconFirst = false, className = '' }) {
  const icon = <span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span>;
  return <button type="button" className={`curai-plan-disclosure ${className}`} aria-expanded={expanded} onClick={onToggle}>{iconFirst && icon}<strong>{label}</strong>{!iconFirst && icon}</button>;
}
