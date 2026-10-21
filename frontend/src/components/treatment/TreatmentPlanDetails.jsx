import React, { useRef, useState } from 'react';
import { paymentDiscount, paymentSummary } from '../../utils/paymentBalances';
import { money, paymentDate, servicePaymentState } from './payment/PaymentPresentation';
import { PlanDetailsHeader, PlanDisclosure } from './shared/PatientPlanWorkspace';
import { useTreatmentExecution } from './shared/useTreatmentExecution';

function TreatmentService({ allowPayment = true, allowCompletion = true, service, view, execution, autoCompletion, loading, sessionRemaining, onPayService, onPayComplex, onPayComponent, onPaySession }) {
  const [expanded, setExpanded] = useState(false);
  const { paid, remaining, settled } = servicePaymentState(view);
  const counts = execution.executionCounts(service), completed = counts.total > 0 && counts.completed >= counts.total;
  const quantity = service.quantity_total || service.quantity || 1;
  const unitPrice = service.unit_price ?? service.price_per_unit ?? service.price ?? (view.cTotal / quantity);
  const paymentText = settled ? 'Оплачено' : paid > 0 ? 'Частичная оплата' : 'Не оплачено';
  const canPay = view.isPerSession ? view.paidSessions < view.totalSessions : !view.isPaid && !view.cFully;
  const complete = component => allowCompletion && execution.markProcedureCompleted(service, component);
  const pay = () => view.isPerSession ? onPaySession(service) : service.is_complex ? onPayComplex(service.service_id, service.service_row_id) : onPayService(service.service_id, service.service_row_id);
  return <article className="curai-treatment-service" data-service-id={service.service_id}>
    <div className="curai-treatment-service-heading"><h5>{service.service_name || service.name}</h5><strong>{money(view.cTotal)}</strong></div>
    <p className="curai-treatment-service-meta">{service.is_complex ? <>Комплекс · {(service.components || []).length} компонента · Выполнено {counts.completed} из {counts.total}</> : view.isPerSession ? <>Курс · {view.totalSessions} процедур · {money(view.sessionPrice)} за процедуру</> : <>{quantity} × {money(unitPrice)}{service.unit && <> · {service.unit}</>}{service.teeth_numbers?.length > 0 && <> · Зубы: {service.teeth_numbers.join(', ')}</>}</>}{view.cDisc > 0 && <> · Скидка {money(view.cDisc)}</>}{Number(service.discount || 0) > 0 && <> · Скидка {service.discount}%</>}</p>
    <p className="curai-treatment-service-payment">Оплачено {money(paid)} · Остаток {money(remaining)} · {paymentText}{view.isPaid && service.payment_method_name && <> · Способ оплаты: {service.payment_method_name}</>}</p>
    <div className="curai-treatment-service-actions">
      {service.is_complex || service.is_course ? <PlanDisclosure expanded={expanded} onToggle={() => setExpanded(value => !value)} iconFirst className="is-inline" label={service.is_complex ? 'Состав комплекса' : `Процедуры · выполнено ${counts.completed} из ${counts.total}`} /> : <span className={completed ? 'is-completed' : ''}>{completed ? '✓' : '○'} Выполнено: {counts.completed} из {counts.total}</span>}
      <div>{!completed && !service.is_complex && <button type="button" className="curai-button curai-button-secondary curai-treatment-mark" disabled={execution.loading || !allowCompletion} onClick={() => complete()}>{execution.loading ? '…' : '+ Отметить'}</button>}
      {canPay && <button type="button" className="curai-button curai-button-secondary curai-treatment-pay" disabled={loading || !allowPayment} onClick={pay}>{loading ? 'Обработка…' : view.isPerSession ? 'Оплатить 1 процедуру' : service.is_complex ? 'Оплатить всё' : 'Оплатить'}</button>}</div>
    </div>
    {expanded && service.is_complex && <div className="curai-treatment-children" aria-label={`Состав комплекса: ${service.service_name}`}>
      {view.cShares.length ? view.cShares.map((component, index) => {
        const total = component.occurrence_ids?.length || component.quantity || 1, done = component.quantity_completed || 0;
        const due = Math.max(0, (component.share || 0) - Number(component.discount_amount || 0) - Number(component.paid_amount || 0));
        return <div className="curai-treatment-component" key={component.component_id || component.service_id || index}>
          <div><h6>{component.service_name}</h6><p>Цена {money((component.price || 0) * (component.quantity || 1))} → доля {money(component.share)}{Number(component.discount_amount || 0) > 0 && <> · Скидка {money(component.discount_amount)}</>}{Number(component.discount || 0) > 0 && <> · Скидка {component.discount}%</>}{component.quantity > 1 && <> · Количество {component.quantity}</>}</p></div>
          <div><p className={component.paid ? 'is-completed' : ''}>{component.paid ? `✓ Оплачено ${money(component.paid_amount)}` : `○ Не оплачено · ${money(due)}`}</p>
            <div>{component.status !== 'completed' ? <button type="button" className="curai-button curai-button-secondary" disabled={execution.loading || !allowCompletion} onClick={() => complete(component)}>Отметить</button> : <span className="is-completed">✓ Выполнено {done} из {total}</span>}
              {!component.paid && <button type="button" className="curai-button curai-button-secondary" disabled={loading || !allowPayment} onClick={() => onPayComponent(service.service_id, component.service_id, service.service_row_id, component.component_id)}>Оплатить</button>}</div>
          </div>
        </div>;
      }) : <p className="curai-treatment-note">Состав комплекса не указан</p>}
    </div>}
    {expanded && service.is_course && <div className="curai-treatment-children" aria-label={`Процедуры курса: ${service.service_name}`}>
      {(service.sessions || []).map((session, index) => {
        const price = Number(session.price ?? service.session_price ?? service.price_per_unit ?? 0);
        const received = autoCompletion ? Number(session.paid_amount || 0) : session.paid ? view.sessionPrice : 0;
        const due = autoCompletion ? sessionRemaining(service, session) : session.paid ? 0 : view.sessionPrice;
        return <div className="curai-treatment-session" key={session.session_id || session.id || index}><div><h6>Процедура {index + 1}</h6>{session.date && <p>{paymentDate(session.date)}</p>}</div><span>{money(price)}</span><span className={session.paid && session.completed ? 'is-completed' : ''}>{session.paid ? '✓ Оплачена' : '○ Не оплачена'}{session.completed && ' · выполнена'}{!session.paid && received > 0 && <> · Оплачено {money(received)} · Остаток {money(due)}</>}</span></div>;
      })}
      {!service.sessions?.length && <p className="curai-treatment-note">Всего процедур: {view.totalSessions} · Оплачено {view.paidSessions}</p>}
      {autoCompletion && view.isPerSession && view.paidSessions < view.totalSessions && <button type="button" className="curai-button curai-button-secondary" disabled={loading || !allowPayment} onClick={() => onPayComplex(service.service_id, service.service_row_id)}>Оплатить весь курс</button>}
    </div>}
  </article>;
}

export default function TreatmentPlanDetails({ allowPayment = true, allowCompletion = true, plan, services, onUpdate, paidAmount, totalAmount, remainingToPay, loading, autoCompletion, servicePaymentView, sessionRemaining, onPayRemaining, onPayService, onPayComplex, onPayComponent, onPaySession, consultationContent, paymentModal, contextActions }) {
  const execution = useTreatmentExecution(plan, onUpdate), facts = useRef(null);
  const summary = paymentSummary([plan]), discount = (plan.services || []).reduce((sum, service) => sum + paymentDiscount(service), 0);
  const createdAt = new Date(plan.created_at), validDate = !Number.isNaN(createdAt.getTime());
  return <section className="curai-plan-pane curai-plan-details curai-treatment-plan-details" aria-label={`План лечения: ${plan.title || 'Без названия'}`}>
    <PlanDetailsHeader className="curai-treatment-plan-header" title={plan.title} metadata={<><time dateTime={plan.created_at} title={validDate ? createdAt.toLocaleString('ru-RU') : undefined}>{paymentDate(plan.created_at)}{validDate && `, ${createdAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`}</time>{plan.created_by_name && <> · {plan.created_by_name}</>}</>} actions={<>
      {remainingToPay > 0 && <button type="button" className="curai-button curai-button-primary" disabled={loading || !allowPayment} onClick={onPayRemaining}>Оплатить остаток</button>}<span>{money(remainingToPay)}</span>
      <button type="button" className="curai-button curai-button-ghost curai-treatment-details-link" onClick={() => facts.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })}>Описание и консультация</button>
    </>} />
    {contextActions && <div className="curai-plan-context-actions">{contextActions}</div>}
    <div className="curai-plan-content-scroll curai-treatment-content" aria-label="Услуги и данные выбранного плана" tabIndex={0}>
      <div className="curai-treatment-progress"><p>{(plan.services || []).length} услуг · Выполнено {execution.progress.completed} из {execution.progress.total} · {execution.progress.percentage}%</p><div><span style={{ width: `${execution.progress.percentage}%` }}/></div></div>
      <div className="curai-treatment-services">{services.map((service, index) => <TreatmentService key={service.service_row_id || `${service.service_id}:${index}`} {...{allowPayment, allowCompletion, service, execution, autoCompletion, loading, sessionRemaining, onPayService, onPayComplex, onPayComponent, onPaySession}} view={servicePaymentView(service)} />)}{!services.length && <p className="curai-treatment-note">Нет услуг по выбранным фильтрам</p>}</div>
      <section className="curai-treatment-facts" ref={facts} tabIndex={-1}><h5>Данные плана</h5><p><strong>Стоимость {money(totalAmount)} · Скидка {money(discount)} · Оплачено {money(summary.paidAmount)}</strong></p><p>Депозит плана {money(plan.deposit_amount)} · {summary.known ? <>Из депозита оплачено {money(summary.depositPaid)}</> : 'Разбивка оплаты с депозита недоступна'} · Остаток {money(summary.remainingToPay)}</p>
        {plan.created_by_name && <p>Создал план: {plan.created_by_name}</p>}{plan.doctor_name && <p>Назначенный врач: {plan.doctor_name}</p>}
        {plan.description && <div><h6>Описание</h6><p>{plan.description}</p></div>}
      </section>
      {consultationContent && <section className="curai-treatment-clinical">{consultationContent}</section>}
      {plan.notes && <section className="curai-treatment-facts"><h6>Примечания к плану</h6><p>{plan.notes}</p></section>}
    </div>
    {paymentModal}
  </section>;
}
