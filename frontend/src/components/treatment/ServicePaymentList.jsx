import { LoadingSpinner } from '../common/LoadingIndicator';
import { PlanDisclosure } from './shared/PatientPlanWorkspace';
import TreatmentPlanDetails from './TreatmentPlanDetails';
import PaymentPlanDetails from './payment/PaymentPlanDetails';
import { discountedPaymentAmount, planRemainingToPay } from '../../utils/paymentBalances';
import { ledgerFetch, requireSessionId } from '../../utils/accountingLedger';
import React, { useState, useEffect, useRef } from 'react';
import { settleLegacyPlan } from '../../utils/settleLegacyPlan';
import { FaChevronDown, FaChevronRight, FaStethoscope, FaClipboardList, FaNotesMedical, FaUserMd, FaFileMedical, FaCreditCard } from 'react-icons/fa';

const PaymentModal = ({ show, loading, onClose, paymentTypes, loadingPaymentTypes,
  selectedPaymentType, setSelectedPaymentType, discountInput, setDiscountInput,
  discountType, setDiscountType, total, onPay, caption, discountLocked = false, autoCompletion = false }) => {
  if (!show) return null;
  const raw = Math.max(0, Number(discountInput) || 0);
  const disc = discountType === 'percent'
    ? Math.round((total * raw / 100) * 100) / 100
    : Math.min(raw, total);
  const finalAmt = Math.max(0, Math.round((total - disc) * 100) / 100);
  return (
    <div className="curai-payment-overlay fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 curai-glass-modal-layer" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Оплата услуги" className="curai-payment-dialog bg-curai-surface rounded-md shadow-none w-full max-w-md mx-4 curai-glass-shell curai-custom-dialog" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between curai-glass-header">
          <h3 className="text-lg font-semibold text-curai-ink flex items-center">
            <svg className="w-5 h-5 mr-2 text-curai-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h2m4 0h2M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            Оплата услуги
          </h3>
          {caption && <p className="curai-payment-caption">{caption}</p>}
          <button onClick={onClose} className="text-curai-muted hover:text-curai-muted text-2xl leading-none">&times;</button>
        </div><div className="curai-glass-body curai-payment-content">

        <div className="curai-payment-methods space-y-2 max-h-72 overflow-y-auto"><h4>Способ оплаты *</h4>
          {loadingPaymentTypes ? (
            <div className="text-center py-8 text-curai-muted">
              <LoadingSpinner />
              Загрузка способов оплаты...
            </div>
          ) : paymentTypes.length === 0 ? (
            <div className="text-center py-8 text-curai-muted">
              <p>Нет доступных способов оплаты</p>
              <p className="text-xs mt-1">Добавьте их в разделе "Тип оплаты" в справочнике</p>
            </div>
          ) : (
            paymentTypes.map(pt => (
              <label key={pt.id}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-md border cursor-pointer transition-all ${selectedPaymentType && selectedPaymentType.id === pt.id ? "border-curai-control bg-curai-selected" : "border-curai-border bg-curai-subtle hover:bg-curai-selected"}`}>
                <input type="radio" name="paymethod" checked={selectedPaymentType && selectedPaymentType.id === pt.id}
                  onChange={() => setSelectedPaymentType(pt)} className="accent-blue-600" />

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-curai-ink text-sm">{pt.name}</div>
                  {pt.description && <div className="text-xs text-curai-muted">{pt.description}</div>}
                </div>
              </label>
            ))
          )}
        </div>

        <div className="curai-payment-calculation mt-4 pt-3 border-t space-y-2">
          <div key="total" className="flex justify-between text-sm text-curai-muted">
            <span>До скидки</span><span className="font-medium text-curai-ink">{total.toLocaleString()} ₸</span>
          </div>
          <div key="discline" className={`flex justify-between text-sm ${disc > 0.001 ? "text-curai-positive" : "text-curai-muted"}`}>
            <span>Скидка</span><span>− {disc > 0.001 ? disc.toLocaleString() : '0'} ₸</span>
          </div>
          <div key="discinput" className="curai-payment-discount">
            <label>Тип скидки<select aria-label="Тип скидки" value={discountType} onChange={e => setDiscountType(e.target.value)} disabled={discountLocked}><option value="fixed">Фиксированная, ₸</option><option value="percent">Процент, %</option></select></label><label>Размер скидки<input type="number" min="0" step="0.01" value={discountInput} disabled={discountLocked}
              onChange={(e) => setDiscountInput(e.target.value)}
              className="w-full px-3 py-2 border border-curai-control rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-curai-focus" placeholder={discountType === 'percent' ? 'Процент скидки' : 'Сумма скидки, ₸'} /></label><p>Доступные варианты: сумма в ₸ или процент (%)</p>
          </div>
          <div key="final" className="flex justify-between text-base font-semibold">
            <span>Итого к оплате</span><span className="text-curai-blue">{finalAmt.toLocaleString()} ₸</span>
          </div>
        </div>

        {autoCompletion && <p className="mt-3 text-sm text-curai-blue">Полная оплата автоматически отметит выполнение оплачиваемых услуг или сеансов.</p>}
        {discountLocked && <p className="mt-2 text-xs text-curai-muted">Скидку можно задать при отдельной оплате услуги.</p>}
        <div className="curai-payment-dialog-footer"><button type="button" onClick={onClose} className="curai-button curai-button-secondary">Отмена</button><button onClick={() => onPay(selectedPaymentType, disc)} disabled={loading || !selectedPaymentType}
          className="w-full mt-4 px-4 py-3 bg-curai-blue text-white rounded-md hover:bg-curai-blue disabled:opacity-50 font-medium">
          {loading ? 'Обработка...' : `Оплатить ${finalAmt.toLocaleString()} ₸`}
        </button></div>
      </div></div>
    </div>
  );
};

const ServicePaymentList = ({ allowPayment = true, allowCompletion = true, plan, onUpdate, onEdit, paymentFilter = 'all', procedureFilter = 'all', layout = 'legacy', contextActions }) => {
  const [loading, setLoading] = useState(false);
  const paymentInFlight = useRef(false);
  const [consultation, setConsultation] = useState(null);
  const [consultationLoading, setConsultationLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
  const [isCollapsed, setIsCollapsed] = useState(true); // По умолчанию свёрнуто
  const API = import.meta.env.VITE_BACKEND_URL;
  const autoCompletion = plan.payment_completion_policy === 'full_payment_v1';

  // Способы оплаты
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [loadingPaymentTypes, setLoadingPaymentTypes] = useState(false);

  // Модальное окно выбора способа оплаты
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState(null); // { type: 'service' | 'remaining', serviceId: string | null }
  const [selectedPaymentType, setSelectedPaymentType] = useState(null);
  const [discountInput, setDiscountInput] = useState('');
  const [discountType, setDiscountType] = useState('fixed'); // 'fixed' | 'percent'

  // Загрузка способов оплаты
  useEffect(() => {
    const fetchPaymentTypes = async () => {
      setLoadingPaymentTypes(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API}/api/payment-types`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setPaymentTypes(data || []);
        }
      } catch (error) {
        console.error('Error fetching payment types:', error);
      } finally {
        setLoadingPaymentTypes(false);
      }
    };
    fetchPaymentTypes();
  }, [API]);

  // Загрузка данных консультации при монтировании
  useEffect(() => {
    const fetchConsultation = async () => {
      try {
        setConsultationLoading(true);
        const token = localStorage.getItem('token');

        // Пробуем получить консультацию через API плана
        const response = await fetch(
          `${API}/api/treatment-plans/${plan.id}/consultation`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data) {
            setConsultation(data);
          }
        }
      } catch (error) {
        console.error('Error fetching consultation:', error);
      } finally {
        setConsultationLoading(false);
      }
    };

    fetchConsultation();
  }, [plan.id, API]);

  // Функция для переключения раскрытия секции
  const toggleSection = (sectionName) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  };

  // Фильтруем услуги на основе переданных фильтров
  const filteredServices = plan.services.filter(service => {
    // Фильтр по оплате
    if (paymentFilter === 'paid') {
      const isPaid = service.is_paid || service.payment_status === 'paid' ||
                     (service.paid_amount && service.paid_amount >= service.total_price);
      if (!isPaid) return false;
    } else if (paymentFilter === 'unpaid') {
      const isPaid = service.is_paid || service.payment_status === 'paid' ||
                     (service.paid_amount && service.paid_amount >= service.total_price);
      if (isPaid) return false;
    }

    // Фильтр по типу услуг
    if (procedureFilter === 'procedures') {
      if (!service.is_course) return false;
    } else if (procedureFilter === 'non_procedures') {
      if (service.is_course) return false;
    }

    return true;
  });

  // Открыть модальное окно выбора способа оплаты для оплаты услуги
  const openPaymentModalForService = (serviceId, serviceRowId) => {
    if (!allowPayment || (autoCompletion && !allowCompletion)) return;
    setPendingPaymentData({ type: 'service', serviceId, serviceRowId });
    setShowPaymentModal(true);
  };

  const complexShares = (svc) => {
    if (autoCompletion) {
      const comps = svc.components || [];
      const total = Number(svc.total_price || 0);
      const weights = comps.map(c => Number(c.price || 0) * Number(c.quantity || 1));
      const sum = weights.reduce((a, b) => a + b, 0);
      const scale = Number.isInteger(total) ? 1 : 0.01;
      const shares = weights.map(w => Math.floor((sum ? total * w / sum : 0) / scale + 1e-9) * scale);
      if (weights.length) shares[weights.indexOf(Math.max(...weights))] += total - shares.reduce((a, b) => a + b, 0);
      return comps.map((c, i) => ({ ...c, share: Math.round(shares[i] * 100) / 100 }));
    }
    // цена комплекса: price | price_per_unit | total_price/количество (в плане price может не быть)
    const complexPrice = svc.price || svc.price_per_unit || (svc.total_price / (svc.quantity || 1)) || 0;
    const sumDefault = (svc.components || []).reduce((a, c) => a + (c.price || 0) * (c.quantity || 1), 0);
    const k = sumDefault > 0 ? complexPrice / sumDefault : 0;
    const comps = svc.components || [];
    const raw = comps.map(c => (c.price || 0) * (c.quantity || 1) * k * (1 - (c.discount || 0) / 100));
    // целые доли: остаток на самую дорогую, сумма = round(цена пакета)
    const floors = raw.map(v => Math.floor(v));
    let deficit = Math.round(complexPrice) - floors.reduce((a, b) => a + b, 0);
    if (comps.length && deficit) {
      const largest = raw.reduce((bi, v, i, arr) => (v > arr[bi] ? i : bi), 0);
      floors[largest] += deficit;
    }
    return comps.map((c, i) => ({
      ...c,
      share: floors[i] || 0,
      paid: c.paid || false,
      paid_amount: c.paid_amount || 0,
    }));
  };

  const openPaymentModalForComplexRemaining = (serviceId, serviceRowId) => {
    if (!allowPayment || (autoCompletion && !allowCompletion)) return;
    setPendingPaymentData({ type: 'complex-remaining', serviceId, serviceRowId });
    setShowPaymentModal(true);
  };

  const openPaymentModalForComponent = (serviceId, componentServiceId, serviceRowId, componentId) => {
    if (!allowPayment || (autoCompletion && !allowCompletion)) return;
    setPendingPaymentData({ type: 'component', serviceId, componentServiceId, serviceRowId, componentId });
    setShowPaymentModal(true);
  };

  // Открыть модальное окно выбора способа оплаты для оплаты остатка
  const openPaymentModalForRemaining = () => {
    if (!allowPayment || (autoCompletion && !allowCompletion)) return;
    setPendingPaymentData({ type: 'remaining', serviceId: null });
    setShowPaymentModal(true);
  };

  // Выполнить оплату с выбранным способом оплаты и скидкой
  const executePayment = async (paymentType, discount = 0) => {
    if (!allowPayment || (autoCompletion && !allowCompletion)) return;
    if (!pendingPaymentData || !paymentType || paymentInFlight.current) return;
    paymentInFlight.current = true;

    try {
      setLoading(true);
      setShowPaymentModal(false);
      const token = localStorage.getItem('token');
      const paymentData = paymentType ? {
        payment_method_id: paymentType.id,
        payment_method_name: paymentType.name
      } : {};
      const selectedService = plan.services.find(s => s.service_id === pendingPaymentData.serviceId &&
        (!pendingPaymentData.serviceRowId || s.service_row_id === pendingPaymentData.serviceRowId));
      if (pendingPaymentData.type === 'session') {
        const session = selectedService?.sessions?.find(s => requireSessionId(s) === pendingPaymentData.sessionId);
        if (!session || !selectedService.service_row_id) throw new Error('Обновите план: нет стабильного идентификатора сеанса или строки.');
        const updated = await ledgerFetch(`${API}/api/treatment-plans/${plan.id}/services/${selectedService.service_id}/sessions/${requireSessionId(session)}/mark-paid`, {
          service_row_id: selectedService.service_row_id, session_id: requireSessionId(session), amount_kzt: payableTarget(),
          discount_amount_kzt: 0, payment_source: 'cash', payment_method: paymentType.id, ...paymentData
        });
        if (onUpdate) await onUpdate(updated.plan || updated);
        return;
      }
      if (autoCompletion && (pendingPaymentData.type === 'remaining' || pendingPaymentData.type === 'complex-remaining' ||
          (pendingPaymentData.type === 'service' && (selectedService?.is_course || selectedService?.is_complex)))) {
        if (discount) throw new Error('Задайте скидки при отдельной оплате услуг.');
        const scope = pendingPaymentData.type === 'remaining' ? null : selectedService?.service_row_id;
        if (pendingPaymentData.type !== 'remaining' && !scope) throw new Error('Обновите план: нет идентификатора строки.');
        const updated = await ledgerFetch(`${API}/api/treatment-plans/${plan.id}/settle-remaining`, {
          ...(scope ? { service_row_id: scope } : {}), amount_kzt: payableTarget(), discount_amount_kzt: 0,
          payment_source: 'cash', payment_method: paymentType.id, ...paymentData
        });
        if (onUpdate) await onUpdate(updated.plan || updated);
        return;
      }
      if (discount > 0.001 && pendingPaymentData.type !== 'remaining') {
        const target = payableTarget();
        const svc = pendingPaymentData.type === 'service'
          ? selectedService : null;
        // Backend amount is the full discounted obligation, including prior financing.
        paymentData.amount = discountedPaymentAmount(target, discount, svc?.paid_amount || 0);
      }

      if (pendingPaymentData.type === 'service') {
        // Оплата одной услуги
        const service = selectedService;
        const hasPatientDeposit = (plan.accounting_events || []).some(event => event.kind === 'patient_deposit_received');
        if (service?.service_row_id && !hasPatientDeposit) {
          const updatedPlan = await ledgerFetch(
            `${API}/api/treatment-plans/${plan.id}/service-rows/${service.service_row_id}/receipts`,
            {
              amount_kzt: Math.max(0, Math.round((payableTarget() - discount) * 100) / 100),
              discount_amount_kzt: Math.round(((Number(service.discount_amount) || 0) + discount) * 100) / 100,
              payment_source: 'cash',
              payment_method: paymentType?.id || paymentType?.name,
              ...(paymentType?.id ? { payment_method_id: paymentType.id } : {}),
              ...(paymentType?.name ? { payment_method_name: paymentType.name } : {})
            }
          );
          if (onUpdate) onUpdate(updatedPlan.plan || updatedPlan);
        } else {
          const response = await fetch(
            `${API}/api/treatment-plans/${plan.id}/services/${pendingPaymentData.serviceId}/mark-paid`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(paymentData)
            }
          );

          if (response.ok) {
            const updatedPlan = await response.json();
            if (onUpdate) {
              onUpdate(updatedPlan);
            }
          } else {
            alert('Ошибка при отметке оплаты');
          }
        }
      } else if (pendingPaymentData.type === 'component') {
        // Оплата одной услуги (доли) комплекса
        const service = selectedService;
        const component = (service?.components || []).find(c => c.service_id === pendingPaymentData.componentServiceId && (!pendingPaymentData.componentId || c.component_id === pendingPaymentData.componentId));
        const hasPatientDeposit = (plan.accounting_events || []).some(event => event.kind === 'patient_deposit_received');
        if (service?.service_row_id && !component?.component_id) {
          throw new Error('Missing stable component_id for ledger component payment. Refresh the plan.');
        }
        if (service?.service_row_id && !hasPatientDeposit) {
          const updated = await ledgerFetch(
            `${API}/api/treatment-plans/${plan.id}/complex-services/${pendingPaymentData.serviceId}/components/${pendingPaymentData.componentServiceId}/mark-paid`,
            {
              service_row_id: service.service_row_id,
              component_id: component.component_id,
              amount_kzt: Math.max(0, Math.round((payableTarget() - discount) * 100) / 100),
              discount_amount_kzt: Math.round(((Number(component.discount_amount) || 0) + discount) * 100) / 100,
              payment_source: 'cash',
              payment_method: paymentType.id || paymentType.name,
              payment_method_id: paymentType.id,
              payment_method_name: paymentType.name
            }
          );
          if (onUpdate) onUpdate(updated.plan || updated);
        } else {
          const response = await fetch(
            `${API}/api/treatment-plans/${plan.id}/complex-services/${pendingPaymentData.serviceId}/components/${pendingPaymentData.componentServiceId}/mark-paid`,
            {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(paymentData)
            }
          );
          if (!response.ok) throw new Error('Ошибка при оплате услуги комплекса: ' + response.status);
          const updated = await response.json();
          if (onUpdate) onUpdate(updated.plan || updated);
          alert('✅ Услуга комплекса оплачена');
        }
      } else if (pendingPaymentData.type === 'complex-remaining') {
        const response = await fetch(
          `${API}/api/treatment-plans/${plan.id}/complex-services/${pendingPaymentData.serviceId}/pay-remaining`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentData)
          }
        );
        if (!response.ok) throw new Error('Ошибка при оплате остатка: ' + response.status);
        const updated = await response.json();
        if (onUpdate) onUpdate(updated);
        alert('✅ Комплекс оплачен полностью');
      } else if (pendingPaymentData.type === 'remaining') {
        await settleLegacyPlan({ plan, API, paymentData, discount, complexShares, ledgerFetch, requireSessionId, onUpdate });
        alert('✅ Остаток плана оплачен');
      }
    } catch (error) {
      console.error('Error executing payment:', error);
      alert('Ошибка при оплате: ' + error.message);
    } finally {
      setLoading(false);
      setPendingPaymentData(null);
      resetPaymentModal();
      paymentInFlight.current = false;
    }
  };

  const markServicePaid = async (serviceId, serviceRowId) => {
    if (!allowPayment || (autoCompletion && !allowCompletion)) return;
    // Сначала показываем выбор способа оплаты
    openPaymentModalForService(serviceId, serviceRowId);
  };

  // Функция для оплаты остатка (доплаты из депозита)
  const payRemainingDebt = async () => {
    if (!allowPayment || (autoCompletion && !allowCompletion)) return;
    // Сначала показываем выбор способа оплаты
    openPaymentModalForRemaining();
  };

  const getPaymentStatusBadge = (status) => {
    if (status === 'paid') {
      return (
        <span className="px-3 py-1.5 bg-curai-positiveBg text-curai-positive rounded-md text-sm font-medium">
          ✅ Оплачено
        </span>
      );
    }
    return (
      <span className="px-3 py-1.5 bg-curai-negativeBg text-curai-negative rounded-md text-sm font-medium">
        ❌ Не оплачено
      </span>
    );
  };

  // Подсчет статистики оплаты
  const paidServices = plan.services.filter(s => s.payment_status === 'paid').length;
  const totalServices = plan.services.length;
  const paidAmount = typeof plan.paid_amount === 'number'
    ? plan.paid_amount
    : plan.services.reduce((sum, service) => sum + (service.paid_amount
      ?? (service.payment_status === 'paid'
        ? (service.total_price || 0) - (service.discount_amount || 0)
        : 0)), 0);
  const totalAmount = plan.total_cost || 0;
  const paymentProgress = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;

  // Депозит: общая сумма внесённых депозитов (deposit_amount = депозит из записей + extra_deposit)
  const depositAmount = plan.deposit_amount || 0;
  const extraDeposit = plan.extra_deposit || 0;
  // Депозит только из записей (без доплат)
  const appointmentDeposit = depositAmount - extraDeposit;

  // Расчет баланса и долга
  // Если depositAmount >= totalAmount: есть остаток депозита
  // Если depositAmount < totalAmount: есть недоплата/долг
  const usedFromDeposit = Math.min(depositAmount, totalAmount);
  const depositBalance = depositAmount > totalAmount ? depositAmount - totalAmount : 0;
  const depositDebt = depositAmount < totalAmount ? totalAmount - depositAmount : 0;
  // remainingToPay - сумма неоплаченных услуг (без учёта депозита)
  const remainingToPay = planRemainingToPay(plan, paidAmount);
  // paidAmount already includes applied deposit funding.
  const actualRemainingToPay = remainingToPay;

  // Функция для добавления доплаты из кассы
  const addDepositPayment = async (amount) => {
    if (!allowPayment || (autoCompletion && !allowCompletion)) return;
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API}/api/treatment-plans/${plan.id}/add-deposit`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: amount,
            payment_method: 'cash',
            note: 'Доплата из кассы для покрытия плана лечения'
          })
        }
      );

      if (response.ok) {
        const result = await response.json();
        if (onUpdate && result.plan) {
          onUpdate(result.plan);
        }
        alert(`✅ Доплата ${amount.toLocaleString()} ₸ успешно добавлена!`);
      } else {
        const error = await response.json();
        alert('Ошибка: ' + (error.detail || 'Не удалось добавить доплату'));
      }
    } catch (error) {
      console.error('Error adding deposit payment:', error);
      alert('Ошибка при добавлении доплаты: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Компонент раскрывающейся секции
  const AccordionSection = ({ title, icon, content, sectionKey, color = "blue" }) => {
    if (!content) return null;

    const isExpanded = expandedSections[sectionKey];
    if (layout === 'treatment') return <div className="curai-plan-clinical-section"><PlanDisclosure expanded={Boolean(isExpanded)} label={title} onToggle={() => toggleSection(sectionKey)}/>{isExpanded && <div>{content}</div>}</div>;
    const colorClasses = {
      blue: "bg-curai-selected border-curai-control text-curai-blue hover:bg-curai-selected",
      green: "bg-curai-positiveBg border-curai-positive text-curai-positive hover:bg-curai-positiveBg",
      purple: "bg-curai-selected border-curai-control text-curai-blue hover:bg-curai-selected",
      indigo: "bg-curai-selected border-curai-control text-curai-blue hover:bg-curai-selected",
      teal: "bg-curai-positiveBg border-curai-positive text-curai-positive hover:bg-curai-positiveBg",
      pink: "bg-curai-negativeBg border-curai-negative text-curai-negative hover:bg-curai-negativeBg",
      orange: "bg-curai-warningBg border-curai-warning text-curai-warning hover:bg-curai-warningBg",
      gray: "bg-curai-subtle border-curai-border text-curai-ink hover:bg-curai-subtle",
      yellow: "bg-curai-warningBg border-curai-warning text-curai-warning hover:bg-curai-warningBg"
    };

    return (
      <div className={`curai-plan-clinical-section border rounded-md mb-2 overflow-hidden ${colorClasses[color].split(' ').slice(1, 2).join(' ')}`}>
        <button
          aria-expanded={Boolean(isExpanded)}
          onClick={() => toggleSection(sectionKey)}
          className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${colorClasses[color]}`}
        >
          <div className="flex items-center space-x-3">
            <span className="text-lg">{icon}</span>
            <span className="font-medium text-sm">{title}</span>
          </div>
          {isExpanded ? <FaChevronDown className="text-curai-muted" /> : <FaChevronRight className="text-curai-muted" />}
        </button>
        {isExpanded && (
          <div className="px-4 py-3 bg-curai-surface border-t text-sm text-curai-ink whitespace-pre-wrap">
            {content}
          </div>
        )}
      </div>
    );
  };

  const sessionRemaining = (service, session) => Math.max(0, Number(session.price ?? service.session_price ?? service.price_per_unit ?? 0) - Number(session.paid_amount || 0));
  const openSessionPayment = service => {
    if (!allowPayment || (autoCompletion && !allowCompletion)) return;
    try {
      const session = (service.sessions || []).find(s => sessionRemaining(service, s) > 0);
      const sessionId = requireSessionId(session);
      setPendingPaymentData({ type: 'session', serviceId: service.service_id, serviceRowId: service.service_row_id, sessionId });
      setShowPaymentModal(true);
    } catch (error) { alert(error.message); }
  };
  const rowRemaining = service => {
    if (!service) return 0;
    if (service.is_complex) return complexShares(service).reduce((sum, c) => sum + Math.max(0, c.share - Number(c.discount_amount || 0) - Number(c.paid_amount || 0)), 0);
    if (service.is_course || service.payment_type === 'per_session') return (service.sessions || []).reduce((sum, s) => sum + sessionRemaining(service, s), 0);
    return Math.max(0, Number(service.total_price || 0) - Number(service.discount_amount || 0) - Number(service.paid_amount || 0));
  };
  // Компонент модального окна выбора способа оплаты
  const payableTarget = () => {
    const pd = pendingPaymentData;
    if (!pd) return 0;
    const selected = plan.services.find(s => s.service_id === pd.serviceId && (!pd.serviceRowId || s.service_row_id === pd.serviceRowId));
    if (pd.type === 'session') return sessionRemaining(selected, (selected.sessions || []).find(s => requireSessionId(s) === pd.sessionId));
    if (autoCompletion) {
      if (pd.type === 'remaining') return Math.round(plan.services.reduce((sum, s) => sum + rowRemaining(s), 0) * 100) / 100;
      if (pd.type === 'component') {
        const c = complexShares(selected).find(c => c.component_id === pd.componentId);
        return c ? Math.max(0, c.share - Number(c.discount_amount || 0) - Number(c.paid_amount || 0)) : 0;
      }
      return Math.round(rowRemaining(selected) * 100) / 100;
    }
    if (pd.type === 'component') {
      const svc = (plan.services || []).find(x => x.service_id === pd.serviceId);
      const sh = svc ? complexShares(svc).find(c => c.service_id === pd.componentServiceId) : null;
      return sh ? sh.share : 0;
    }
    if (pd.type === 'complex-remaining') {
      const svc = (plan.services || []).find(x => x.service_id === pd.serviceId);
      const shares = svc ? complexShares(svc) : [];
      const total = shares.reduce((a, c) => a + c.share, 0);
      const paid = shares.filter(c => c.paid).reduce((a, c) => a + (c.paid_amount || 0), 0);
        const disc = shares.reduce((a, c) => a + (c.discount_amount || 0), 0);
      return Math.round((total - disc - paid) * 100) / 100;
    }
    if (pd.type === 'service') {
      const svc = (plan.services || []).find(x => x.service_id === pd.serviceId);
      return svc ? Math.max(0, (svc.total_price || 0) - (svc.discount_amount || 0) - (svc.paid_amount || 0)) : 0;
    }
    return Math.max(0, (plan.total_cost || 0) - (plan.paid_amount || 0));
  };

  const resetPaymentModal = () => { setSelectedPaymentType(null); setDiscountInput(''); setDiscountType('fixed'); };

  const servicePaymentView = service => {
              const isPaid = service.payment_status === 'paid';
              const isCourse = service.is_course;
              // для комплексной услуги — фактические остаток/общая по оплаченным долям
              const cShares = service.is_complex ? complexShares(service) : [];
              const cPaid = service.is_complex ? cShares.reduce((a, x) => a + (x.paid_amount || 0), 0) : (service.paid_amount || 0);
              const cTotal = service.total_price || 0;
              // скидка при оплате учитывается: долг = цена − сумма скидок − оплачено
              const cDisc = service.is_complex ? cShares.reduce((a, x) => a + (x.discount_amount || 0), 0) : (service.discount_amount || 0);
              const cDue = Math.max(0, cTotal - cDisc);
              const cRemaining = Math.max(0, cDue - cPaid);
              const cFully = cRemaining <= 0.001;
              const isPartially = cPaid > 0 && !cFully;
              // показанная сумма оплаты/скидки: для комплекса — из долей, для обычной — из услуги
              const paidShown = service.is_complex ? cPaid : (service.paid_amount || cTotal);
              const discShown = service.is_complex ? cDisc : (service.discount_amount || 0);
              const paymentType = service.payment_type || 'single';

              // Для курсов с поэтапной оплатой
              const isPerSession = isCourse && paymentType === 'per_session';
              const paidSessions = isPerSession && service.sessions
                ? service.sessions.filter(s => s.paid).length
                : 0;
              const totalSessions = autoCompletion ? (service.sessions || []).length : service.quantity_total || 1;
              const nextSession = (service.sessions || []).find(s => sessionRemaining(service, s) > 0);
              const sessionPrice = autoCompletion ? Number(nextSession?.price ?? service.session_price ?? service.price_per_unit ?? 0) : service.price_per_unit || 0;
              const sessionDue = autoCompletion && nextSession ? sessionRemaining(service, nextSession) : sessionPrice;
              const coursePaidAmount = autoCompletion ? (service.sessions || []).reduce((sum, s) => sum + Number(s.paid_amount || 0), 0) : paidSessions * sessionPrice;
              const courseRemaining = autoCompletion ? rowRemaining(service) : (totalSessions - paidSessions) * sessionPrice;

              
 return {isPaid, isCourse, cShares, cPaid, cTotal, cDisc, cDue, cRemaining, cFully, isPartially, paidShown, discShown, paymentType, isPerSession, paidSessions, totalSessions, nextSession, sessionPrice, sessionDue, coursePaidAmount, courseRemaining};
};

const consultationContent = (consultationLoading ? (
            <div className="mb-4 p-4 bg-curai-subtle rounded-md text-center text-curai-muted">
              <span className="animate-pulse">Загрузка данных консультации...</span>
            </div>
          ) : consultation ? (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-curai-ink flex items-center">
                  <FaFileMedical className="mr-2 text-curai-blue" />
                  Данные консультации от {new Date(consultation.consultation_date).toLocaleDateString('ru-RU')}
                </h4>
                <span className="text-xs text-curai-muted">
                  Врач: {consultation.doctor_name}
                </span>
              </div>

              <div className="space-y-1">
                <AccordionSection
                  title="Жалобы"
                  icon={<FaClipboardList />}
                  content={consultation.complaints}
                  sectionKey="complaints"
                  color="blue"
                />

                <AccordionSection
                  title="Анамнез"
                  icon={<FaNotesMedical />}
                  content={consultation.anamnesis}
                  sectionKey="anamnesis"
                  color="purple"
                />

                <AccordionSection
                  title="Анамнез заболевания"
                  icon={<FaNotesMedical />}
                  content={consultation.anamnesis_morbi}
                  sectionKey="anamnesis_morbi"
                  color="indigo"
                />

                <AccordionSection
                  title="Анамнез жизни"
                  icon={<FaNotesMedical />}
                  content={consultation.anamnesis_vitae}
                  sectionKey="anamnesis_vitae"
                  color="teal"
                />

                <AccordionSection
                  title="Локальный статус"
                  icon={<FaStethoscope />}
                  content={consultation.local_status}
                  sectionKey="local_status"
                  color="pink"
                />

                <AccordionSection
                  title="Объективный осмотр"
                  icon={<FaStethoscope />}
                  content={consultation.examination}
                  sectionKey="examination"
                  color="green"
                />

                <AccordionSection
                  title={`Диагноз${consultation.icd10_codes?.length > 0 ? ` (МКБ-10: ${consultation.icd10_codes.map(c => c.code).join(', ')})` : ''}`}
                  icon={<FaUserMd />}
                  content={consultation.diagnosis}
                  sectionKey="diagnosis"
                  color="orange"
                />

                <AccordionSection
                  title="Рекомендации"
                  icon="📋"
                  content={consultation.recommendations}
                  sectionKey="recommendations"
                  color="yellow"
                />

                <AccordionSection
                  title="Дополнительные заметки"
                  icon="📝"
                  content={consultation.notes}
                  sectionKey="consultationNotes"
                  color="gray"
                />
              </div>
            </div>
          ) : null);
const paymentModal = (<PaymentModal
        caption={plan.services.find(s => pendingPaymentData?.serviceRowId ? s.service_row_id === pendingPaymentData.serviceRowId : s.service_id === pendingPaymentData?.serviceId)?.service_name || plan.title}
        show={showPaymentModal}
        loading={loading}
        onClose={() => { resetPaymentModal(); setShowPaymentModal(false); }}
        paymentTypes={paymentTypes}
        loadingPaymentTypes={loadingPaymentTypes}
        selectedPaymentType={selectedPaymentType}
        setSelectedPaymentType={setSelectedPaymentType}
        discountInput={discountInput}
        setDiscountInput={setDiscountInput}
        discountType={discountType}
        setDiscountType={setDiscountType}
        autoCompletion={autoCompletion}
        discountLocked={pendingPaymentData?.type === 'session' || (autoCompletion && (pendingPaymentData?.type === 'remaining' || pendingPaymentData?.type === 'complex-remaining' || (pendingPaymentData?.type === 'service' && plan.services.find(s => s.service_row_id === pendingPaymentData.serviceRowId)?.is_course)))}
        total={payableTarget()}
        onPay={(pType, d) => executePayment(pType, d)}
      />);
const presentation = { allowPayment: allowPayment && (!autoCompletion || allowCompletion), allowCompletion, plan, services: filteredServices, paidAmount, totalAmount, remainingToPay: actualRemainingToPay, loading, autoCompletion, servicePaymentView, sessionRemaining,
onPayRemaining: payRemainingDebt, onPayService: markServicePaid, onPayComplex: openPaymentModalForComplexRemaining, onPayComponent: openPaymentModalForComponent, onPaySession: openSessionPayment, consultationContent, paymentModal };
if (layout === 'workspace') return <PaymentPlanDetails {...presentation}/>;
if (layout === 'treatment') return <TreatmentPlanDetails {...presentation} onUpdate={onUpdate} contextActions={contextActions}/>;
return (
    <div className="curai-payment-plan bg-curai-surface rounded-md shadow-none border border-curai-border overflow-hidden">
      {/* Заголовок карточки - всегда видимый */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="curai-payment-plan-header w-full px-4 py-3 flex items-center justify-between bg-curai-subtle transition-colors border-b border-curai-border"
      >
        <div className="flex items-center space-x-3 min-w-0">
          <div className={`transform transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}>
            <FaChevronRight className="text-curai-muted text-sm" />
          </div>
          <div className="text-left min-w-0">
            <h3 className="text-sm font-semibold text-curai-ink truncate">{plan.title}</h3>
            <div className="flex items-center space-x-2 text-xs text-curai-muted mt-0.5">
              <span>{new Date(plan.created_at).toLocaleDateString('ru-RU')}</span>
              {plan.created_by_name && (
                <>
                  <span>•</span>
                  <span className="flex items-center">
                    <FaUserMd className="mr-1 text-curai-muted" />
                    {plan.created_by_name}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(plan); }}
              className="px-2 py-1 text-curai-blue border border-curai-control rounded hover:bg-curai-selected text-xs whitespace-nowrap"
              title="Редактировать"
            >
              ✏️
            </button>
          )}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            plan.payment_status === 'paid'
              ? "bg-curai-positiveBg text-curai-positive"
              : plan.payment_status === 'partially_paid'
                ? "bg-curai-warningBg text-curai-warning"
                : "bg-curai-negativeBg text-curai-negative"
          }`}>
            {plan.payment_status === 'paid' ? '✓ Оплачено' :
             plan.payment_status === 'partially_paid' ? '⚠ Частично' : '✗ Не оплачено'}
          </span>
          {isCollapsed ? <FaChevronDown className="text-curai-muted" /> : <FaChevronDown className="text-curai-muted rotate-180" />}
        </div>
      </button>

      {/* Детальное содержимое - отображается только при раскрытии */}
      {!isCollapsed && (
        <div className="p-4">
          {/* Описание */}
          {plan.description && (
            <p className="text-sm text-curai-muted mb-4">{plan.description}</p>
          )}

          {/* Детали консультации (аккордеон) */}
          {consultationContent}

          {/* Кнопка оплаты остатка если есть недоплата */}
          {actualRemainingToPay > 0 && (
            <div className="mt-4 pt-4 border-t border-curai-border">
              <div className="flex items-center justify-between">
                <div className="text-sm text-curai-muted">
                  {depositAmount > 0 && depositDebt > 0 && (
                    <span className="text-curai-warning">
                      ⚠️ Депозита недостаточно. Требуется доплата: <strong>{depositDebt.toLocaleString()} ₸</strong>
                    </span>
                  )}
                </div>
                <button
                  onClick={payRemainingDebt}
                  disabled={loading}
                  className="px-6 py-3 bg-curai-positive text-white rounded-md hover:bg-curai-positive disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all shadow-none hover:shadow-none flex items-center space-x-2"
                >
                  {loading ? (
                    <span>Обработка...</span>
                  ) : (
                    <>
                      <span>💳</span>
                      <span>Оплатить остаток</span>
                      <span className="ml-2 px-2 py-1 bg-curai-positive rounded text-sm">
                        {actualRemainingToPay.toLocaleString()} ₸
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Показываем статус если всё оплачено */}
          {remainingToPay === 0 && paidAmount > 0 && (
            <div className="mt-4 pt-4 border-t border-curai-border text-center">
              <div className="inline-flex items-center px-6 py-3 bg-curai-positiveBg text-curai-positive rounded-md font-semibold">
                <span className="text-2xl mr-2">✅</span>
                <span>План лечения полностью оплачен</span>
              </div>
              {depositDebt > 0 && (
                <div className="text-xs text-curai-muted mt-2">
                  Депозит: {depositAmount.toLocaleString()} ₸ · С депозита оплачено: {plan.services.reduce((sum, s) => sum + (s.paid_from_deposit || 0), 0).toLocaleString()} ₸ · Наличными/терминалом: {(paidAmount - plan.services.reduce((sum, s) => sum + (s.paid_from_deposit || 0), 0)).toLocaleString()} ₸
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Список услуг */}
          <div className="curai-payment-services space-y-3">
            <h4 className="font-medium text-curai-ink mb-3">Услуги в счете:</h4>

            {filteredServices.map((service, index) => {
 const { isPaid, isCourse, cShares, cPaid, cTotal, cDisc, cDue, cRemaining, cFully, isPartially, paidShown, discShown, paymentType, isPerSession, paidSessions, totalSessions, nextSession, sessionPrice, sessionDue, coursePaidAmount, courseRemaining } = servicePaymentView(service);
return (
            <div
              key={index}
              className={`curai-payment-service border rounded-md overflow-hidden transition-all ${
                isPaid ? "border-curai-positive" : "border-curai-border"
              }`}
            >
              {/* Заголовок услуги */}
              <div className="curai-payment-service-header bg-curai-subtle px-4 py-3 border-b border-curai-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <h5 className="font-semibold text-curai-ink text-lg">{service.service_name}</h5>
                    {service.is_complex && (
                      <span className="px-3 py-1 bg-curai-selected text-curai-blue rounded-full text-xs font-semibold">
                        🧩 Комплекс
                      </span>
                    )}
                    {isCourse && (
                      <span className="px-3 py-1 bg-curai-selected text-curai-blue rounded-full text-xs font-semibold">
                        🔄 Курс
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Тело карточки */}
              <div className="p-4">
                {service.is_complex && ((() => {
                  const shares = complexShares(service);
                  return (
                    <div className="curai-complex-payment mb-2 border border-curai-control rounded-md overflow-hidden">
                      <div className="px-3 py-2 bg-curai-selected text-xs font-semibold text-curai-blue">Оплата по услугам комплекса</div>
                      <div className="divide-y divide-curai-border">
                        {shares.map(c => (
                          <div key={c.component_id || c.service_id} className="flex items-center justify-between px-3 py-2 text-sm">
                            <div>
                              <div className="text-curai-ink font-medium">{c.service_name}</div>
                              <div className="text-xs text-curai-muted">
                                {(c.price || 0).toLocaleString()} ₸ → доля {(c.share || 0).toLocaleString()} ₸
                                {(c.discount || 0) > 0 ? ` · скидка ${c.discount}%` : ''}
                                {c.paid ? (c.discount_amount > 0 ? ' · оплачено со скидкой' : ' · оплачено') : ''}
                              </div>
                            </div>
                            {c.paid ? (
                              <span className="text-right">
                                <div className="text-curai-positive text-xs font-medium">✅ {(c.paid_amount || 0).toLocaleString()} ₸</div>
                                {c.discount_amount > 0 && <div className="text-curai-muted text-[10px]">скидка −{(c.discount_amount || 0).toLocaleString()} ₸</div>}
                              </span>
                            ) : (
                              <button type="button" onClick={() => openPaymentModalForComponent(service.service_id, c.service_id, service.service_row_id, c.component_id)}
                                className="px-3 py-1 bg-curai-blue text-white rounded-md text-xs hover:bg-curai-blue">Оплатить</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })())}
                {isPerSession ? (
                  /* Курс с поэтапной оплатой */
                  <div className="curai-payment-course space-y-4">
                    {/* Информация о курсе */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-curai-selected rounded-md p-3">
                        <div className="text-xs text-curai-blue font-medium mb-1">ТИП ОПЛАТЫ</div>
                        <div className="text-sm font-semibold text-curai-blue">
                          За каждую процедуру
                        </div>
                        <div className="text-xs text-curai-blue mt-1">
                          {sessionPrice.toLocaleString()} ₸ за 1 процедуру
                        </div>
                      </div>

                      <div className="bg-curai-selected rounded-md p-3">
                        <div className="text-xs text-curai-blue font-medium mb-1">ВСЕГО ПРОЦЕДУР</div>
                        <div className="text-sm font-semibold text-curai-blue">
                          {totalSessions} процедур
                        </div>
                        <div className="text-xs text-curai-blue mt-1">
                          на сумму {(autoCompletion ? service.total_price : totalSessions * sessionPrice).toLocaleString()} ₸
                        </div>
                      </div>
                    </div>

                    {/* Статус оплаты */}
                    <div className="bg-curai-subtle rounded-md p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-xs text-curai-muted font-medium mb-1">ОПЛАЧЕНО ПРОЦЕДУР</div>
                          <div className="text-2xl font-semibold text-curai-ink">
                            {paidSessions} <span className="text-lg text-curai-muted">из {totalSessions}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-curai-muted font-medium mb-1">ОПЛАЧЕНО ДЕНЕГ</div>
                          <div className="text-xl font-semibold text-curai-positive">
                            {coursePaidAmount.toLocaleString()} ₸
                          </div>
                          <div className="text-xs text-curai-muted">
                            осталось {courseRemaining.toLocaleString()} ₸
                          </div>
                        </div>
                      </div>

                      {/* Прогресс-бар */}
                      <div className="relative">
                        <div className="w-full bg-curai-border rounded-full h-3 overflow-hidden">
                          <div
                            className="bg-curai-positive h-3 rounded-full transition-all duration-500"
                            style={{ width: `${(paidSessions / totalSessions) * 100}%` }}
                          />
                        </div>
                        <div className="text-center text-xs font-semibold text-curai-muted mt-1">
                          {Math.round((paidSessions / totalSessions) * 100)}% оплачено
                        </div>
                      </div>
                    </div>

                    {/* Кнопка оплаты */}
                    {autoCompletion && paidSessions < totalSessions && <button type="button" disabled={loading}
                      onClick={() => openPaymentModalForComplexRemaining(service.service_id, service.service_row_id)}
                      className="text-curai-blue underline">Оплатить весь курс</button>}
                    <div className="flex justify-end">
                      {paidSessions < totalSessions ? (
                        <button
                          onClick={() => openSessionPayment(service)}
                          disabled={loading}
                          className="px-6 py-3 bg-curai-positive text-white rounded-md hover:bg-curai-positive disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-none hover:shadow-none"
                        >
                          {loading ? (
                            <span>Обработка...</span>
                          ) : (
                            <span className="flex items-center space-x-2">
                              <span>💳</span>
                              <span>Оплатить 1 процедуру</span>
                              <span className="ml-2 px-2 py-0.5 bg-curai-positive rounded">
                                {sessionDue.toLocaleString()} ₸
                              </span>
                            </span>
                          )}
                        </button>
                      ) : (
                        <div className="px-6 py-3 bg-curai-positiveBg border-2 border-curai-positive text-curai-positive rounded-md font-semibold flex items-center space-x-2">
                          <span className="text-xl">✅</span>
                          <span>Все процедуры оплачены</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Обычная услуга или курс с единовременной оплатой */
                  <div className="curai-payment-service-balance space-y-4">
                    {/* Цена и статус */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-6">
                        <div>
                          <div className="text-xs text-curai-muted font-medium mb-1">{service.is_complex ? 'ОБЩАЯ СУММА / ОСТАТОК' : 'СТОИМОСТЬ'}</div>
                          <div className="text-2xl font-semibold text-curai-ink">
                            {cTotal.toLocaleString()} ₸
                          </div>
                          {service.is_complex && !cFully && (
                            <div className="text-sm font-semibold text-curai-warning">Остаток: {cRemaining.toLocaleString()} ₸</div>
                          )}
                        </div>

                        {service.quantity_total > 1 && (
                          <div>
                            <div className="text-xs text-curai-muted font-medium mb-1">КОЛИЧЕСТВО</div>
                            <div className="text-xl font-semibold text-curai-ink">
                              {service.quantity_total}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="text-right">
                        {isPaid || cFully ? (
                          <div className="inline-flex items-center px-4 py-2 bg-curai-positiveBg border-2 border-curai-positive text-curai-positive rounded-md font-semibold">
                            <span className="text-lg mr-2">✅</span>
                            <div>
                              <div>Оплачено</div>
                              <div className="text-xs text-curai-positive">{paidShown.toLocaleString()} ₸{discShown > 0 ? ` · скидка ${discShown.toLocaleString()} ₸` : ''}</div>
                            </div>
                          </div>
                        ) : isPartially ? (
                          <div className="inline-flex items-center px-4 py-2 bg-curai-warningBg border-2 border-curai-warning text-curai-warning rounded-md font-semibold">
                            <span className="text-lg mr-2">🕐</span>
                            <div>
                              <div>Частично</div>
                              <div className="text-xs text-curai-warning">{cPaid.toLocaleString()} / {cDue.toLocaleString()} ₸{cDisc > 0 ? ` · скидка ${cDisc.toLocaleString()} ₸` : ''}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="inline-flex items-center px-4 py-2 bg-curai-negativeBg border-2 border-curai-negative text-curai-negative rounded-md font-semibold">
                            <span className="text-lg mr-2">❌</span>
                            <div>
                              <div>Не оплачено</div>
                              <div className="text-xs text-curai-negative">{cTotal.toLocaleString()} ₸</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Способ оплаты (если уже оплачено) */}
                    {isPaid && service.payment_method_name && (
                      <div className="text-xs text-curai-muted">
                        Способ оплаты: <span className="font-medium text-curai-ink">{service.payment_method_name}</span>
                      </div>
                    )}

                    {/* Кнопка оплаты (для комплекса — «Оплатить всё» за остаток) */}
                    {!isPaid && !cFully && (
                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => service.is_complex
                            ? openPaymentModalForComplexRemaining(service.service_id, service.service_row_id)
                            : markServicePaid(service.service_id, service.service_row_id)}
                          disabled={loading}
                          className="px-6 py-3 bg-curai-blue text-white rounded-md hover:bg-curai-blue disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-none hover:shadow-none flex items-center space-x-2"
                        >
                          {loading ? (
                            <span>Обработка...</span>
                          ) : (
                            <>
                              <span>💳</span>
                              <span>{service.is_complex ? 'Оплатить всё' : 'Оплатить'}</span>
                              <span className="ml-2 px-2 py-0.5 bg-curai-blue rounded text-sm">
                                {cRemaining.toLocaleString()} ₸
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
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

      {/* Модальное окно выбора способа оплаты */}
      {paymentModal}
    </div>
  );
};

export default ServicePaymentList;
