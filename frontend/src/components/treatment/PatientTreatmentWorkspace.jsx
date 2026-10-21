import React from 'react';
import ServicePaymentList from './ServicePaymentList';
import { PlanWorkspace, PlanList, PlanEmptyState, usePlanSelection } from './shared/PatientPlanWorkspace';

// Preserve the patient-tab filter: it determines which plans remain visible.
export function visibleTreatmentPlans(plans, paymentFilter, procedureFilter) {
  return plans.filter(plan => (plan.services || []).some(service => {
    const isPaid = service.is_paid || (service.paid_amount && service.paid_amount >= service.total_price);
    if (paymentFilter === 'paid' && !isPaid) return false;
    if (paymentFilter === 'unpaid' && isPaid) return false;
    if (procedureFilter === 'procedures' && !service.is_course) return false;
    if (procedureFilter === 'non_procedures' && service.is_course) return false;
    return true;
  }));
}

export default function PatientTreatmentWorkspace({ allowPayment = true, allowCompletion = true, plans, patientId, paymentFilter = 'all', onPaymentFilter, procedureFilter = 'all', onProcedureFilter, onUpdate, onCreatePlan, createLabel = "Создать через консультацию", createEmptyLabel = "Открыть консультации", creationHint = "Планы формируются из услуг консультационного листа.", emptyDescription = "Добавьте услуги в консультационный лист — план появится в этом списке.", planActions, includeEmptyPlans = false }) {
  const filtered = visibleTreatmentPlans(plans, paymentFilter, procedureFilter);
  const visible = includeEmptyPlans && paymentFilter === "all" && procedureFilter === "all" ? plans : filtered;
  const [selectedPlan, selectPlan] = usePlanSelection(visible, patientId);
  const create = onCreatePlan && <button type="button" className="curai-button curai-button-secondary" onClick={onCreatePlan}>{createLabel}</button>;
  const filters = plans.length ? <div className="curai-treatment-filters">
    <label>Оплата<select aria-label="Оплата услуг" value={paymentFilter} onChange={event => onPaymentFilter(event.target.value)}><option value="all">Все</option><option value="paid">Оплачено</option><option value="unpaid">Не оплачено</option></select></label>
    <label>Тип услуг<select aria-label="Тип услуг" value={procedureFilter} onChange={event => onProcedureFilter(event.target.value)}><option value="all">Все</option><option value="procedures">Процедуры</option><option value="non_procedures">Не процедуры</option></select></label>
  </div> : <p className="curai-treatment-empty-intro">{creationHint}</p>;
  return <PlanWorkspace variant="treatment" top={filters} list={<PlanList variant="treatment" plans={visible} selectedId={selectedPlan?.id} onSelect={selectPlan} action={create} emptyText={plans.length ? 'Нет планов по выбранным фильтрам' : 'Планов пока нет'} />}>
    {selectedPlan ? <ServicePaymentList allowPayment={allowPayment} allowCompletion={allowCompletion} key={`${patientId ?? ''}:${selectedPlan.id}`} layout="treatment" plan={selectedPlan} paymentFilter={paymentFilter} procedureFilter={procedureFilter} onUpdate={onUpdate} contextActions={planActions?.(selectedPlan)} /> : <section className="curai-plan-pane curai-plan-details"><PlanEmptyState title={plans.length ? 'Нет подходящих услуг' : 'Планы лечения пока не созданы'} action={onCreatePlan && <button type="button" className="curai-button curai-button-primary" onClick={onCreatePlan}>{createEmptyLabel}</button>}>{plans.length ? 'Измените фильтры оплаты или типа услуг.' : emptyDescription}</PlanEmptyState></section>}
  </PlanWorkspace>;
}
