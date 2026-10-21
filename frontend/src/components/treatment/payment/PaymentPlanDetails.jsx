import { PaymentDue, hasCalculatedPlanBalance } from './PaymentDue';
import { PlanDetailsHeader, PlanDisclosure } from '../shared/PatientPlanWorkspace';
import React, { useState } from 'react';
import { paymentDiscount } from '../../../utils/paymentBalances';
import { money, paymentDate, PaymentColumns, PaymentTableHead, servicePaymentState } from './PaymentPresentation';

function ServicePaymentRow({ allowPayment = true, allowCompletion = true, service, view, loading, autoCompletion, sessionRemaining, onPayService, onPayComplex, onPayComponent, onPaySession }) {
  const [expanded, setExpanded] = useState(false);
  const expandable = service.is_complex || service.is_course;
  const { paid, remaining, settled } = servicePaymentState(view);
  const sessions = service.sessions || [];
  const canPayCourse = autoCompletion && view.isPerSession && view.paidSessions < view.totalSessions;
  return <>
    <tr className="curai-r21-service-row" data-service-id={service.service_id}>
      <td>
        {expandable ? <PlanDisclosure className="curai-plan-disclosure curai-r21-service-toggle" label={service.service_name || service.name} expanded={expanded} onToggle={() => setExpanded(value => !value)}/> : <strong>{service.service_name || service.name}</strong>}
        <p className="curai-r21-service-meta">{view.isPerSession ? <>{money(view.sessionPrice)} × {view.totalSessions} · оплачено {view.paidSessions}</> : <>До скидки {money(view.cTotal)}{view.cDisc > 0 && <> · скидка {money(view.cDisc)}</>}{service.quantity_total > 1 && <> · количество {service.quantity_total}</>}</>}</p>
        <p className={`curai-r21-service-status ${settled ? 'is-paid' : paid > 0 ? 'is-partial' : ''}`}>{settled ? '✓ Оплачено' : paid > 0 ? '◐ Частичная оплата' : '○ Не оплачено'}</p>
        {view.isPaid && service.payment_method_name && <p className="curai-r21-service-meta">Способ оплаты: {service.payment_method_name}</p>}
      </td>
      <td>{money(view.cDue)}</td><td className={paid > 0 ? 'curai-r21-paid-amount' : ''}>{money(paid)}</td><td>{money(remaining)}</td>
      <td>{view.isPerSession ? view.paidSessions < view.totalSessions && <button type="button" className="curai-button curai-button-primary curai-r21-pay-action" disabled={loading || !allowPayment} aria-label={`Оплатить следующую процедуру: ${service.service_name}`} onClick={() => onPaySession(service)}>{loading ? 'Обработка...' : 'Оплатить 1 процедуру'}</button> : !view.isPaid && !view.cFully && <button type="button" className="curai-button curai-button-primary curai-r21-pay-action" disabled={loading || !allowPayment} aria-label={`Оплатить ${service.is_complex ? 'комплекс' : 'услугу'}: ${service.service_name}`} onClick={() => service.is_complex ? onPayComplex(service.service_id, service.service_row_id) : onPayService(service.service_id, service.service_row_id)}>{loading ? 'Обработка...' : service.is_complex ? 'Оплатить всё' : 'Оплатить'}</button>}</td>
    </tr>
    {expanded && service.is_complex && <tr className="curai-r21-expanded-row"><td colSpan={5}>
      <table aria-label={`Состав комплекса: ${service.service_name}`}><PaymentColumns /><PaymentTableHead name="Состав комплекса" amount="Доля" /><tbody>{view.cShares.map((component, index) => <tr key={component.component_id || component.service_id || index}>
        <td><span>{component.service_name}</span>{Number(component.discount_amount || 0) > 0 && <p className="curai-r21-service-meta">Скидка {money(component.discount_amount)}</p>}{Number(component.discount || 0) > 0 && <p className="curai-r21-service-meta">Скидка {component.discount}%</p>}</td>
        <td title={`Прайс: ${money((component.price || 0) * (component.quantity || 1))}`}>{money(component.share)}</td><td>{money(component.paid_amount)}</td><td>{money(Math.max(0, (component.share || 0) - Number(component.discount_amount || 0) - Number(component.paid_amount || 0)))}</td>
        <td>{component.paid ? <span className="curai-r21-paid-amount">✓ Оплачено</span> : <button type="button" className="curai-button curai-button-secondary curai-r21-pay-action is-secondary" disabled={loading || !allowPayment} aria-label={`Оплатить компонент: ${component.service_name}`} onClick={() => onPayComponent(service.service_id, component.service_id, service.service_row_id, component.component_id)}>Оплатить</button>}</td>
      </tr>)}</tbody></table><p className="curai-r21-table-note">Доли уже входят в стоимость комплекса.</p>
    </td></tr>}
    {expanded && service.is_course && <tr className="curai-r21-expanded-row"><td colSpan={5}>
      {sessions.length ? <table aria-label={`Процедуры курса: ${service.service_name}`}><PaymentColumns /><PaymentTableHead name="Процедуры курса" amount="Цена" /><tbody>{sessions.map((session, index) => {
        const price = Number(session.price ?? service.session_price ?? service.price_per_unit ?? 0);
        const sessionPaid = autoCompletion ? Number(session.paid_amount || 0) : session.paid ? view.sessionPrice : 0;
        const due = autoCompletion ? sessionRemaining(service, session) : session.paid ? 0 : view.sessionPrice;
        return <tr key={session.session_id || session.id || index}><td>Процедура {index + 1}{session.date && <p className="curai-r21-service-meta">{paymentDate(session.date)}</p>}</td><td>{money(price)}</td><td>{money(sessionPaid)}</td><td>{money(due)}</td><td><span className={session.paid ? 'curai-r21-paid-amount' : 'curai-r21-service-meta'}>{session.paid ? '✓ Оплачено' : '○ Не оплачено'}</span></td></tr>;
      })}</tbody></table> : <p className="curai-r21-table-note">Всего процедур: {view.totalSessions}. Оплачено: {view.paidSessions}.</p>}
      <p className="curai-r21-table-note">Кнопка выше оплачивает следующую неоплаченную процедуру.</p>
      {canPayCourse && <button type="button" className="curai-r21-course-action" disabled={loading || !allowPayment} onClick={() => onPayComplex(service.service_id, service.service_row_id)}>Оплатить весь курс</button>}
    </td></tr>}
  </>;
}

export default function PaymentPlanDetails({ allowPayment = true, allowCompletion = true, plan, services, paidAmount, totalAmount, remainingToPay, loading, autoCompletion, servicePaymentView, sessionRemaining, onPayRemaining, onPayService, onPayComplex, onPayComponent, onPaySession, consultationContent, paymentModal }) {
  const discount = (plan.services || []).reduce((sum, service) => sum + paymentDiscount(service), 0);
  return <section className="curai-plan-pane curai-plan-details curai-r21-plan-details" aria-label={`Детали оплаты: ${plan.title || 'План лечения'}`}>
    <PlanDetailsHeader className="curai-r21-plan-details-header" title={plan.title || 'План лечения'} metadata={<>{paymentDate(plan.created_at)}{plan.created_by_name && <> · Ответственный: {plan.created_by_name}</>}</>}>
      <p className="curai-r21-plan-balance">Всего {money(totalAmount)} <span>·</span> Оплачено {money(paidAmount)} <span>·</span> Остаток {money(remainingToPay)}</p>
      <p className="curai-r21-plan-details-note">{discount > 0 ? <>Скидка {money(discount)} учтена. </> : 'Скидки учтены в остатке. '}Депозит показан в сводке пациента.</p>
    </PlanDetailsHeader>
    <div className="curai-plan-content-scroll curai-r21-service-scroll" tabIndex={0} aria-label="Услуги выбранного плана">
      <table className="curai-r21-service-table" aria-label="Оплата услуг выбранного плана"><PaymentColumns /><PaymentTableHead /><tbody>
        {services.map((service, index) => <ServicePaymentRow key={service.service_row_id || `${service.service_id}-${index}`} {...{allowPayment, allowCompletion, service, loading, autoCompletion, sessionRemaining, onPayService, onPayComplex, onPayComponent, onPaySession}} view={servicePaymentView(service)} />)}
        {!services.length && <tr><td colSpan={5} className="curai-r21-table-note">Услуги не найдены</td></tr>}
      </tbody></table>
      {(plan.description || plan.notes) && <details className="curai-r21-plan-notes"><summary>Сведения о плане</summary>{plan.description && <p>{plan.description}</p>}{plan.notes && <p>{plan.notes}</p>}</details>}
      {consultationContent && <details className="curai-r21-plan-notes"><summary>Данные консультации</summary>{consultationContent}</details>}
    </div>
    <footer className="curai-r21-selected-plan-action"><div><PaymentDue amount={remainingToPay} calculated={hasCalculatedPlanBalance([plan])} label="К оплате по этому плану"/></div>{remainingToPay > 0 ? <button type="button" disabled={loading || !allowPayment} className="curai-button curai-button-primary curai-r21-pay-action" onClick={onPayRemaining}>{loading ? 'Обработка...' : 'Оплатить остаток плана'}</button> : paidAmount > 0 && <span className="curai-r21-plan-settled">✓ План лечения полностью оплачен</span>}</footer>
    {paymentModal}
  </section>;
}
