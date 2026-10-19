import PatientFundingSummary from './payment/PatientFundingSummary';
import { PaymentDue, hasCalculatedPlanBalance } from './payment/PaymentDue';
import React from 'react';
import { paymentDiscount, paymentSummary } from '../../utils/paymentBalances';
import ServicePaymentList from './ServicePaymentList';
import { money } from './payment/PaymentPresentation';
import { PlanWorkspace, PlanList, PlanEmptyState, usePlanSelection } from './shared/PatientPlanWorkspace';
export { PlanList as PaymentPlanList } from './shared/PatientPlanWorkspace';
export function PatientPaymentTotals({ plans, patientId }) {
  const { totalAmount, paidAmount, remainingToPay } = paymentSummary(plans);
  const discount = plans.reduce((sum, plan) => sum + (plan.services || []).reduce((part, service) => part + paymentDiscount(service), 0), 0);
  return <section className="curai-r21-totals" aria-label="Сводка оплаты по всем планам">
    <div><span>Всего</span><strong>{money(totalAmount)}</strong></div>
    <div><span>Оплачено</span><strong>{money(paidAmount)}</strong></div>
    <PatientFundingSummary patientId={patientId} plans={plans}/>
    <div className="curai-r21-total-due"><PaymentDue amount={remainingToPay} calculated={hasCalculatedPlanBalance(plans)}/></div>
    <p>По всем планам: {plans.length}.{discount > 0 && <> Скидка {money(discount)} учтена.</>} Применённый депозит включён в оплаченную сумму.</p>
  </section>;
}
export default function PatientPaymentWorkspace({ plans, patientId, onUpdate, onCreatePlan }) {
 const [selectedPlan, selectPlan] = usePlanSelection(plans, patientId);
 return <PlanWorkspace top={<PatientPaymentTotals plans={plans} patientId={patientId}/>} list={selectedPlan ? <PlanList plans={plans} selectedId={selectedPlan.id} onSelect={selectPlan}/> : null} empty={<PlanEmptyState className="curai-r21-payment-empty" title="Планы лечения не созданы" action={onCreatePlan && <button type="button" className="curai-button curai-button-primary" onClick={onCreatePlan}>Создать план лечения</button>}>Для оплаты сначала создайте план лечения.</PlanEmptyState>}>
  {selectedPlan && <ServicePaymentList key={(patientId ?? '') + ':' + selectedPlan.id} layout="workspace" plan={selectedPlan} onUpdate={onUpdate}/>}
 </PlanWorkspace>;
}
