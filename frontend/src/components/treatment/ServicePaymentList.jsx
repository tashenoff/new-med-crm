import React, { useState, useEffect } from 'react';
import { ledgerFetch, positiveKzt, requireSessionId, servicePayment } from '../../utils/accountingLedger';
import { FaChevronDown, FaChevronRight, FaStethoscope, FaClipboardList, FaNotesMedical, FaUserMd, FaFileMedical, FaCreditCard } from 'react-icons/fa';

const PaymentModal = ({ show, loading, onClose, paymentTypes, loadingPaymentTypes,
  selectedPaymentType, setSelectedPaymentType, discountInput, setDiscountInput,
  discountType, setDiscountType, total, onPay, actualAmount, setActualAmount,
  fundingSource, setFundingSource, allocations, setAllocations, isAdvance, isSession }) => {
  if (!show) return null;
  const raw = Math.max(0, Number(discountInput) || 0);
  const disc = discountType === 'percent'
    ? Math.round((total * raw / 100) * 100) / 100
    : Math.min(raw, total);
  const finalAmt = Math.max(0, Math.round((total - disc) * 100) / 100);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h2m4 0h2M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            Способ оплаты
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {loadingPaymentTypes ? (
            <div className="text-center py-8 text-gray-500">
              <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-2"></div>
              Загрузка способов оплаты...
            </div>
          ) : paymentTypes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>Нет доступных способов оплаты</p>
              <p className="text-xs mt-1">Добавьте их в разделе "Тип оплаты" в справочнике</p>
            </div>
          ) : (
            paymentTypes.map(pt => (
              <label key={pt.id}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${selectedPaymentType && selectedPaymentType.id === pt.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:bg-blue-50'}`}>
                <input type="radio" name="paymethod" checked={Boolean(selectedPaymentType && selectedPaymentType.id === pt.id)} disabled={loading}
                  onChange={() => setSelectedPaymentType(pt)} className="accent-blue-600" />
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                  {pt.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">{pt.name}</div>
                  {pt.description && <div className="text-xs text-gray-500">{pt.description}</div>}
                </div>
              </label>
            ))
          )}
        </div>

        <div className="mt-4 pt-3 border-t space-y-2">
          <label className="block text-sm">Источник оплаты
            <select aria-label="Источник оплаты" value={fundingSource} onChange={event => setFundingSource(event.target.value)} className="w-full border rounded p-2" required disabled={loading}>
              <option value="">Выберите источник оплаты</option>
              <option value="cash">Новый платеж (касса / безналичный)</option>
              {!isAdvance && <option value="plan_advance">Явно направить аванс на эту услугу / компонент</option>}
            </select>
          </label>
          <p className="text-xs text-gray-600">Аванс не начисляется врачу до точного распределения сервером. Начисление рассчитывает только сервер.</p>
          {allocations.length ? allocations.map((allocation, index) => (
            <div key={allocation.key} className="border rounded p-2">
              <div className="text-sm">{allocation.name}: остаток {allocation.total.toLocaleString()} ₸</div>
              <label className="block text-sm">Сумма для этой услуги / компонента, ₸
                <input aria-label={`Сумма распределения ${allocation.key}`} type="number" min="0.01" max={allocation.total} step="0.01" required value={allocation.amount} disabled={loading}
                  onChange={event => setAllocations(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))} className="w-full border rounded p-2" />
              </label>
              {!allocation.sessionId && <label className="block text-sm">Скидка для этой услуги / компонента, ₸
                <input type="number" min="0" max={allocation.total} step="0.01" value={allocation.discount} disabled={loading}
                  onChange={event => setAllocations(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, discount: event.target.value } : item))} className="w-full border rounded p-2" />
              </label>}
            </div>
          )) : <label className="block text-sm">{isAdvance ? 'Фактически внесенный аванс, ₸' : fundingSource === 'plan_advance' ? 'Сумма явного распределения аванса, ₸' : 'Фактически получено, ₸'}
            <input aria-label="Фактически получено, ₸" type="number" min="0.01" step="0.01" max={total} required value={actualAmount} onChange={event => setActualAmount(event.target.value)} disabled={loading} className="w-full border rounded p-2" />
          </label>}
          {!isAdvance && <div key="total" className="flex justify-between text-sm text-gray-600">
            <span>К оплате</span><span className="font-medium text-gray-900">{total.toLocaleString()} ₸</span>
          </div>}
          {!isAdvance && !isSession && allocations.length === 0 && <>
          <div key="discline" className={`flex justify-between text-sm ${disc > 0.001 ? 'text-green-600' : 'text-gray-400'}`}>
            <span>Скидка</span><span>− {disc > 0.001 ? disc.toLocaleString() : '0'} ₸</span>
          </div>
          <div key="discinput">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-600">Скидка</span>
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                <button type="button" onClick={() => setDiscountType('fixed')}
                  className={`px-3 py-1.5 text-xs ${discountType === 'fixed' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>фикс. ₸</button>
                <button type="button" onClick={() => setDiscountType('percent')}
                  className={`px-3 py-1.5 text-xs ${discountType === 'percent' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>%</button>
              </div>
            </div>
            <input type="number" min="0" step="0.01" value={discountInput} disabled={loading}
              onChange={(e) => setDiscountInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={discountType === 'percent' ? 'Процент скидки' : 'Сумма скидки, ₸'} />
          </div>
          <div key="final" className="flex justify-between text-base font-semibold">
            <span>Итого к оплате</span><span className="text-blue-600">{finalAmt.toLocaleString()} ₸</span>
          </div>
          </>}
        </div>

        <button onClick={() => onPay(selectedPaymentType, discountType === 'percent' ? total * Number(discountInput || 0) / 100 : Number(discountInput || 0))} disabled={loading}
          className="w-full mt-4 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
          {loading ? 'Обработка...' : isAdvance && !actualAmount ? 'Внести аванс' : `Оплатить ${(Number(actualAmount) || finalAmt).toLocaleString()} ₸`}
        </button>
      </div>
    </div>
  );
};

const ServicePaymentList = ({ plan, onUpdate, onEdit, paymentFilter = 'all', procedureFilter = 'all' }) => {
  const [loading, setLoading] = useState(false);
  const [consultation, setConsultation] = useState(null);
  const [consultationLoading, setConsultationLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
  const [isCollapsed, setIsCollapsed] = useState(true); // По умолчанию свёрнуто
  const API = import.meta.env.VITE_BACKEND_URL;
  
  // Способы оплаты
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [loadingPaymentTypes, setLoadingPaymentTypes] = useState(false);
  
  // Модальное окно выбора способа оплаты
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState(null); // { type: 'service' | 'remaining', serviceId: string | null }
  const [selectedPaymentType, setSelectedPaymentType] = useState(null);
  const [discountInput, setDiscountInput] = useState('');
  const [discountType, setDiscountType] = useState('fixed'); // 'fixed' | 'percent'
  const [actualAmount, setActualAmount] = useState('');
  const [fundingSource, setFundingSource] = useState('');
  const [allocations, setAllocations] = useState([]);

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
  const openPaymentModalForService = (serviceId) => {
    if (resumePayment('service', serviceId)) return;
    resetPaymentModal();
    setPendingPaymentData({ type: 'service', serviceId, operation_id: crypto.randomUUID() });
    setShowPaymentModal(true);
  };

  const complexShares = (svc) => {
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

  const openPaymentModalForComplexRemaining = (serviceId) => {
    if (resumePayment('complex-remaining', serviceId)) return;
    resetPaymentModal();
    const service = plan.services.find(item => item.service_id === serviceId);
    setAllocations(paymentTargets(service));
    setPendingPaymentData({ type: 'complex-remaining', serviceId, operation_id: crypto.randomUUID() });
    setShowPaymentModal(true);
  };

  const openPaymentModalForComponent = (serviceId, componentServiceId) => {
    if (resumePayment('component', serviceId, componentServiceId)) return;
    resetPaymentModal();
    setPendingPaymentData({ type: 'component', serviceId, componentServiceId, operation_id: crypto.randomUUID() });
    setShowPaymentModal(true);
  };

  // Открыть модальное окно выбора способа оплаты для оплаты остатка
  const openPaymentModalForRemaining = () => {
    if (resumePayment('remaining', null)) return;
    try {
      const targets = plan.services.filter(service => service.payment_status !== 'paid').flatMap(paymentTargets);
      if (!targets.length) throw new Error('Нет услуг / сеансов с доступным остатком для распределения');
      resetPaymentModal();
      setAllocations(targets);
      setPendingPaymentData({ type: 'remaining', serviceId: null, operation_id: crypto.randomUUID() });
      setShowPaymentModal(true);
    } catch (error) { alert(error.message); }
  };

  const resumePayment = (type, serviceId, componentServiceId) => {
    if (pendingPaymentData?.type !== type || pendingPaymentData.serviceId !== serviceId || pendingPaymentData.componentServiceId !== componentServiceId) return false;
    setShowPaymentModal(true);
    return true;
  };

  const paymentTargets = (service) => service.is_course && (service.payment_type || service.course_payment_type) === 'per_session'
    ? (service.sessions || []).filter(session => !session.paid && !session.is_paid && session.payment_status !== 'paid').map(session => {
      const sessionId = requireSessionId(session);
      return { key: `${service.service_id}:${sessionId}`, serviceId: service.service_id, sessionId, name: `${service.service_name || service.name}: сеанс ${sessionId}`,
        total: Number(session.amount_due_kzt ?? (Number(session.price ?? service.session_price ?? service.price_per_unit ?? 0) - Number(session.paid_amount || 0))),
        amount: '', discount: '', operation_id: crypto.randomUUID() };
    }).filter(target => target.total > 0)
    : service.is_complex
    ? complexShares(service).map(component => ({
      key: `${service.service_id}:${component.service_id}`, serviceId: service.service_id, componentServiceId: component.service_id,
      name: component.name || component.service_name, total: Math.max(0, component.share - Number(component.paid_amount || 0) - Number(component.discount_amount || 0)),
      amount: '', discount: '', operation_id: crypto.randomUUID()
    })).filter(target => target.total > 0)
    : [{ key: service.service_id, serviceId: service.service_id, name: service.service_name || service.name,
      total: Math.max(0, Number(service.total_price || 0) - Number(service.paid_amount || 0) - Number(service.discount_amount || 0)),
      amount: '', discount: '', operation_id: crypto.randomUUID() }].filter(target => target.total > 0);

  const markSessionPaidForService = (service) => {
    try {
      const session = (service.sessions || []).find(item => !item.paid && !item.is_paid && item.payment_status !== 'paid');
      const sessionId = requireSessionId(session);
      if (resumePayment('session', service.service_id)) return;
      resetPaymentModal();
      setPendingPaymentData({ type: 'session', serviceId: service.service_id, sessionId,
        total: Number(session.amount_due_kzt ?? (Number(session.price ?? service.session_price ?? service.price_per_unit ?? 0) - Number(session.paid_amount || 0))), operation_id: crypto.randomUUID() });
      setShowPaymentModal(true);
    } catch (error) { alert(error.message); }
  };

  // Выполнить оплату с выбранным способом оплаты и скидкой
  const executePayment = async (paymentType, discount = 0) => {
    if (!pendingPaymentData || loading) return;
    
    try {
      const pending = pendingPaymentData;
      if (!fundingSource) throw new Error('Выберите источник оплаты');
      if (fundingSource === 'cash' && !paymentType) throw new Error('Выберите способ оплаты');
      const method = { operation_id: pending.operation_id, ...(fundingSource === 'cash' && paymentType ? { payment_method_id: paymentType.id, payment_method_name: paymentType.name } : {}) };
      const advanceBalance = Number(plan.advance_balance_kzt ?? plan.deposit_balance ?? 0);
      let commands;
      if (pending.type === 'deposit') {
        if (fundingSource !== 'cash') throw new Error('Аванс вносится только новым платежом');
        commands = [{ url: `${API}/api/treatment-plans/${plan.id}/add-deposit`, body: {
          ...method, amount: positiveKzt(actualAmount), payment_method: paymentType.id,
          payment_purpose: 'plan_advance', note: 'Аванс без автоматического начисления врачу'
        } }];
      } else if (pending.type === 'session') {
        commands = [{ url: `${API}/api/treatment-plans/${plan.id}/services/${pending.serviceId}/sessions/${pending.sessionId}/mark-paid`, body: {
          ...method, amount_kzt: positiveKzt(actualAmount, payableTarget()), session_id: pending.sessionId, funding_source: fundingSource
        } }];
        if (fundingSource === 'plan_advance') positiveKzt(actualAmount, advanceBalance);
      } else {
        const targets = allocations.length ? allocations : [{ serviceId: pending.serviceId, componentServiceId: pending.componentServiceId,
          total: payableTarget(), amount: actualAmount, discount }];
        const allocationTotal = targets.reduce((sum, target) => sum + Number(target.amount), 0);
        if (fundingSource === 'plan_advance') positiveKzt(allocationTotal, advanceBalance);
        commands = targets.map(target => ({
          url: target.sessionId
            ? `${API}/api/treatment-plans/${plan.id}/services/${target.serviceId}/sessions/${target.sessionId}/mark-paid`
            : target.componentServiceId
            ? `${API}/api/treatment-plans/${plan.id}/complex-services/${target.serviceId}/components/${target.componentServiceId}/mark-paid`
            : `${API}/api/treatment-plans/${plan.id}/services/${target.serviceId}/mark-paid`,
          body: target.sessionId
            ? { ...method, operation_id: target.operation_id, amount_kzt: positiveKzt(target.amount, target.total), session_id: target.sessionId, funding_source: fundingSource }
            : { ...method, operation_id: target.operation_id || pending.operation_id, ...servicePayment({ amount: target.amount, total: target.total, discount: target.discount, funding_source: fundingSource, advanceBalance }) }
        }));
      }
      setLoading(true);
      for (const command of commands) {
        const updated = await ledgerFetch(command.url, command.body);
        if (onUpdate) onUpdate(updated.plan || updated);
      }
      setShowPaymentModal(false);
      setPendingPaymentData(null);
      resetPaymentModal();
    } catch (error) {
      console.error('Error executing payment:', error);
      alert('Ошибка при оплате: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const markServicePaid = async (serviceId) => {
    // Сначала показываем выбор способа оплаты
    openPaymentModalForService(serviceId);
  };

  // Функция для оплаты остатка (доплаты из депозита)
  const payRemainingDebt = async () => {
    // Сначала показываем выбор способа оплаты
    openPaymentModalForRemaining();
  };

  const getPaymentStatusBadge = (status) => {
    if (status === 'paid') {
      return (
        <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium">
          ✅ Оплачено
        </span>
      );
    }
    return (
      <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium">
        ❌ Не оплачено
      </span>
    );
  };

  // Подсчет статистики оплаты
  const paidServices = plan.services.filter(s => s.payment_status === 'paid').length;
  const totalServices = plan.services.length;
  const paidAmount = plan.services
    .filter(s => s.payment_status === 'paid')
    .reduce((sum, s) => sum + (s.total_price || 0), 0);
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
  const depositDebt = depositAmount < totalAmount ? totalAmount - depositAmount : 0;
  // remainingToPay - сумма неоплаченных услуг (без учёта депозита)
  const remainingToPay = Math.max(0, totalAmount - paidAmount);
  // actualRemainingToPay - реальная сумма к доплате с учётом депозита
  // Если есть депозит и он покрывает часть суммы, показываем только недостающую часть
  const actualRemainingToPay = remainingToPay;

  // Функция для добавления доплаты из кассы
  const addDepositPayment = async (amount) => {
    if (resumePayment('deposit', undefined)) return;
    resetPaymentModal();
    setPendingPaymentData({ type: 'deposit', operation_id: crypto.randomUUID() });
    setActualAmount(amount || '');
    setShowPaymentModal(true);
  };

  // Компонент раскрывающейся секции
  const AccordionSection = ({ title, icon, content, sectionKey, color = "blue" }) => {
    if (!content) return null;
    
    const isExpanded = expandedSections[sectionKey];
    const colorClasses = {
      blue: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100",
      green: "bg-green-50 border-green-200 text-green-700 hover:bg-green-100",
      purple: "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100",
      indigo: "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100",
      teal: "bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100",
      pink: "bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100",
      orange: "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100",
      gray: "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100",
      yellow: "bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100"
    };
    
    return (
      <div className={`border rounded-lg mb-2 overflow-hidden ${colorClasses[color].split(' ').slice(1, 2).join(' ')}`}>
        <button
          onClick={() => toggleSection(sectionKey)}
          className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${colorClasses[color]}`}
        >
          <div className="flex items-center space-x-3">
            <span className="text-lg">{icon}</span>
            <span className="font-medium text-sm">{title}</span>
          </div>
          {isExpanded ? <FaChevronDown className="text-gray-400" /> : <FaChevronRight className="text-gray-400" />}
        </button>
        {isExpanded && (
          <div className="px-4 py-3 bg-white border-t text-sm text-gray-700 whitespace-pre-wrap">
            {content}
          </div>
        )}
      </div>
    );
  };

  // Компонент модального окна выбора способа оплаты
  const payableTarget = () => {
    const pd = pendingPaymentData;
    if (!pd) return 0;
    if (pd.type === 'deposit') return Number.MAX_SAFE_INTEGER;
    if (pd.type === 'session') return pd.total;
    if (allocations.length) return allocations.reduce((sum, target) => sum + target.total, 0);
    if (pd.type === 'component') {
      const svc = (plan.services || []).find(x => x.service_id === pd.serviceId);
      const sh = svc ? complexShares(svc).find(c => c.service_id === pd.componentServiceId) : null;
      return sh ? Math.max(0, sh.share - Number(sh.paid_amount || 0) - Number(sh.discount_amount || 0)) : 0;
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
      return svc ? Math.max(0, Number(svc.total_price || 0) - Number(svc.paid_amount || 0) - Number(svc.discount_amount || 0)) : 0;
    }
    return Math.max(0, (plan.total_cost || 0) - (plan.paid_amount || 0));
  };

  const resetPaymentModal = () => { setSelectedPaymentType(null); setDiscountInput(''); setDiscountType('fixed'); setActualAmount(''); setFundingSource(''); setAllocations([]); };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Заголовок карточки - всегда видимый */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 transition-colors border-b border-gray-200"
      >
        <div className="flex items-center space-x-3 min-w-0">
          <div className={`transform transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}>
            <FaChevronRight className="text-gray-400 text-sm" />
          </div>
          <div className="text-left min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{plan.title}</h3>
            <div className="flex items-center space-x-2 text-xs text-gray-500 mt-0.5">
              <span>{new Date(plan.created_at).toLocaleDateString('ru-RU')}</span>
              {plan.created_by_name && (
                <>
                  <span>•</span>
                  <span className="flex items-center">
                    <FaUserMd className="mr-1 text-gray-400" />
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
              className="px-2 py-1 text-blue-600 border border-blue-600 rounded hover:bg-blue-50 text-xs whitespace-nowrap"
              title="Редактировать"
            >
              ✏️
            </button>
          )}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            plan.payment_status === 'paid' 
              ? 'bg-green-100 text-green-700' 
              : plan.payment_status === 'partially_paid'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-red-100 text-red-700'
          }`}>
            {plan.payment_status === 'paid' ? '✓ Оплачено' : 
             plan.payment_status === 'partially_paid' ? '⚠ Частично' : '✗ Не оплачено'}
          </span>
          {isCollapsed ? <FaChevronDown className="text-gray-400" /> : <FaChevronDown className="text-gray-400 rotate-180" />}
        </div>
      </button>

      {/* Детальное содержимое - отображается только при раскрытии */}
      {!isCollapsed && (
        <div className="p-4">
          {/* Описание */}
          {plan.description && (
            <p className="text-sm text-gray-600 mb-4">{plan.description}</p>
          )}

          {/* Детали консультации (аккордеон) */}
          {consultationLoading ? (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg text-center text-gray-500">
              <span className="animate-pulse">Загрузка данных консультации...</span>
            </div>
          ) : consultation ? (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-800 flex items-center">
                  <FaFileMedical className="mr-2 text-blue-500" />
                  Данные консультации от {new Date(consultation.consultation_date).toLocaleDateString('ru-RU')}
                </h4>
                <span className="text-xs text-gray-500">
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
          ) : null}

          {/* Кнопка оплаты остатка если есть недоплата */}
          <div className="mt-4 text-sm text-gray-600">
            Аванс не начисляется врачу автоматически. Требуется явное распределение на услугу / компонент; расчет выполняет сервер.
            <button type="button" onClick={() => addDepositPayment()} disabled={loading} className="ml-3 px-3 py-2 border rounded">Внести аванс</button>
          </div>
          {actualRemainingToPay > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  {depositAmount > 0 && depositDebt > 0 && (
                    <span className="text-orange-600">
                      ⚠️ Депозита недостаточно. Требуется доплата: <strong>{depositDebt.toLocaleString()} ₸</strong>
                    </span>
                  )}
                </div>
                <button
                  onClick={payRemainingDebt}
                  disabled={loading}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all shadow-md hover:shadow-lg flex items-center space-x-2"
                >
                  {loading ? (
                    <span>Обработка...</span>
                  ) : (
                    <>
                      <span>💳</span>
                      <span>Оплатить остаток</span>
                      <span className="ml-2 px-2 py-1 bg-green-700 rounded text-sm">
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
            <div className="mt-4 pt-4 border-t border-gray-200 text-center">
              <div className="inline-flex items-center px-6 py-3 bg-green-100 text-green-700 rounded-lg font-semibold">
                <span className="text-2xl mr-2">✅</span>
                <span>План лечения полностью оплачен</span>
              </div>
              {depositDebt > 0 && (
                <div className="text-xs text-gray-500 mt-2">
                  Депозит: {depositAmount.toLocaleString()} ₸ · С депозита оплачено: {plan.services.reduce((sum, s) => sum + (s.paid_from_deposit || 0), 0).toLocaleString()} ₸ · Наличными/терминалом: {(paidAmount - plan.services.reduce((sum, s) => sum + (s.paid_from_deposit || 0), 0)).toLocaleString()} ₸
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Список услуг */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 mb-3">Услуги в счете:</h4>
            
            {filteredServices.map((service, index) => {
              const isPaid = service.payment_status === 'paid';
              const isCourse = service.is_course;
              // для комплексной услуги — фактические остаток/общая по оплаченным долям
              const cShares = service.is_complex ? complexShares(service) : [];
              const cPaid = cShares.reduce((a, x) => a + (x.paid_amount || 0), 0);
              const cTotal = service.total_price || 0;
              // скидка при оплате учитывается: долг = цена − сумма скидок − оплачено
              const cDisc = cShares.reduce((a, x) => a + (x.discount_amount || 0), 0);
              const cDue = Math.max(0, cTotal - cDisc);
              const cRemaining = Math.max(0, cDue - cPaid);
              const cFully = cRemaining <= 0.001;
              const isPartially = service.is_complex && cPaid > 0 && !cFully;
              // показанная сумма оплаты/скидки: для комплекса — из долей, для обычной — из услуги
              const paidShown = service.is_complex ? cPaid : (service.paid_amount || cTotal);
              const discShown = service.is_complex ? cDisc : (service.discount_amount || 0);
              const paymentType = service.payment_type || service.course_payment_type || 'single';
              
              // Для курсов с поэтапной оплатой
              const isPerSession = isCourse && paymentType === 'per_session';
              const paidSessions = isPerSession && service.sessions 
                ? service.sessions.filter(s => s.paid).length 
                : 0;
              const totalSessions = service.quantity_total || 1;
              const sessionPrice = service.price_per_unit || 0;
              const sessionReceived = Number(service.paid_amount ?? (service.sessions || []).reduce((sum, session) => sum + Number(session.paid_amount ?? session.actual_amount_kzt ?? 0), 0));
              
              return (
            <div
              key={index}
              className={`border rounded-lg overflow-hidden transition-all ${
                isPaid ? 'border-green-300' : 'border-gray-200'
              }`}
            >
              {/* Заголовок услуги */}
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <h5 className="font-semibold text-gray-900 text-lg">{service.service_name}</h5>
                    {service.is_complex && (
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                        🧩 Комплекс
                      </span>
                    )}
                    {isCourse && (
                      <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
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
                    <div className="mb-2 border border-blue-200 rounded-lg overflow-hidden">
                      <div className="px-3 py-2 bg-blue-50 text-xs font-semibold text-blue-800">Оплата по услугам комплекса</div>
                      <div className="divide-y divide-gray-100">
                        {shares.map(c => (
                          <div key={c.service_id} className="flex items-center justify-between px-3 py-2 text-sm">
                            <div>
                              <div className="text-gray-900 font-medium">{c.service_name}</div>
                              <div className="text-xs text-gray-500">
                                {(c.price || 0).toLocaleString()} ₸ → доля {(c.share || 0).toLocaleString()} ₸
                                {(c.discount || 0) > 0 ? ` · скидка ${c.discount}%` : ''}
                                {c.paid ? (c.discount_amount > 0 ? ' · оплачено со скидкой' : ' · оплачено') : ''}
                              </div>
                            </div>
                            {c.paid ? (
                              <span className="text-right">
                                <div className="text-green-600 text-xs font-medium">✅ {(c.paid_amount || 0).toLocaleString()} ₸</div>
                                {c.discount_amount > 0 && <div className="text-gray-400 text-[10px]">скидка −{(c.discount_amount || 0).toLocaleString()} ₸</div>}
                              </span>
                            ) : (
                              <button type="button" onClick={() => openPaymentModalForComponent(service.service_id, c.service_id)}
                                className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">Оплатить</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })())}
                {isPerSession ? (
                  /* Курс с поэтапной оплатой */
                  <div className="space-y-4">
                    {/* Информация о курсе */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 rounded-lg p-3">
                        <div className="text-xs text-blue-600 font-medium mb-1">ТИП ОПЛАТЫ</div>
                        <div className="text-sm font-semibold text-blue-900">
                          За каждую процедуру
                        </div>
                        <div className="text-xs text-blue-700 mt-1">
                          {sessionPrice.toLocaleString()} ₸ за 1 процедуру
                        </div>
                      </div>
                      
                      <div className="bg-purple-50 rounded-lg p-3">
                        <div className="text-xs text-purple-600 font-medium mb-1">ВСЕГО ПРОЦЕДУР</div>
                        <div className="text-sm font-semibold text-purple-900">
                          {totalSessions} процедур
                        </div>
                        <div className="text-xs text-purple-700 mt-1">
                          на сумму {(totalSessions * sessionPrice).toLocaleString()} ₸
                        </div>
                      </div>
                    </div>

                    {/* Статус оплаты */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-xs text-gray-500 font-medium mb-1">ОПЛАЧЕНО ПРОЦЕДУР</div>
                          <div className="text-2xl font-bold text-gray-900">
                            {paidSessions} <span className="text-lg text-gray-500">из {totalSessions}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500 font-medium mb-1">ОПЛАЧЕНО ДЕНЕГ</div>
                          <div className="text-xl font-bold text-green-600">
                            {sessionReceived.toLocaleString()} ₸
                          </div>
                          <div className="text-xs text-gray-500">
                            осталось {Math.max(0, totalSessions * sessionPrice - sessionReceived).toLocaleString()} ₸
                          </div>
                        </div>
                      </div>

                      {/* Прогресс-бар */}
                      <div className="relative">
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${(paidSessions / totalSessions) * 100}%` }}
                          />
                        </div>
                        <div className="text-center text-xs font-semibold text-gray-600 mt-1">
                          {Math.round((paidSessions / totalSessions) * 100)}% оплачено
                        </div>
                      </div>
                    </div>

                    {/* Кнопка оплаты */}
                    <div className="flex justify-end">
                      {paidSessions < totalSessions ? (
                        <button
                          onClick={() => markSessionPaidForService(service)}
                          disabled={loading}
                          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-md hover:shadow-lg"
                        >
                          {loading ? (
                            <span>Обработка...</span>
                          ) : (
                            <span className="flex items-center space-x-2">
                              <span>💳</span>
                              <span>Оплатить 1 процедуру</span>
                              <span className="ml-2 px-2 py-0.5 bg-green-700 rounded">
                                {sessionPrice.toLocaleString()} ₸
                              </span>
                            </span>
                          )}
                        </button>
                      ) : (
                        <div className="px-6 py-3 bg-green-100 border-2 border-green-300 text-green-700 rounded-lg font-semibold flex items-center space-x-2">
                          <span className="text-xl">✅</span>
                          <span>Все процедуры оплачены</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Обычная услуга или курс с единовременной оплатой */
                  <div className="space-y-4">
                    {/* Цена и статус */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-6">
                        <div>
                          <div className="text-xs text-gray-500 font-medium mb-1">{service.is_complex ? 'ОБЩАЯ СУММА / ОСТАТОК' : 'СТОИМОСТЬ'}</div>
                          <div className="text-2xl font-bold text-gray-900">
                            {cTotal.toLocaleString()} ₸
                          </div>
                          {service.is_complex && !cFully && (
                            <div className="text-sm font-semibold text-amber-600">Остаток: {cRemaining.toLocaleString()} ₸</div>
                          )}
                        </div>
                        
                        {service.quantity_total > 1 && (
                          <div>
                            <div className="text-xs text-gray-500 font-medium mb-1">КОЛИЧЕСТВО</div>
                            <div className="text-xl font-bold text-gray-900">
                              {service.quantity_total}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="text-right">
                        {isPaid || cFully ? (
                          <div className="inline-flex items-center px-4 py-2 bg-green-100 border-2 border-green-300 text-green-700 rounded-lg font-semibold">
                            <span className="text-lg mr-2">✅</span>
                            <div>
                              <div>Оплачено</div>
                              <div className="text-xs text-green-500">{paidShown.toLocaleString()} ₸{discShown > 0 ? ` · скидка ${discShown.toLocaleString()} ₸` : ''}</div>
                            </div>
                          </div>
                        ) : isPartially ? (
                          <div className="inline-flex items-center px-4 py-2 bg-amber-100 border-2 border-amber-300 text-amber-700 rounded-lg font-semibold">
                            <span className="text-lg mr-2">🕐</span>
                            <div>
                              <div>Частично</div>
                              <div className="text-xs text-amber-600">{cPaid.toLocaleString()} / {cDue.toLocaleString()} ₸{cDisc > 0 ? ` · скидка ${cDisc.toLocaleString()} ₸` : ''}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="inline-flex items-center px-4 py-2 bg-red-100 border-2 border-red-300 text-red-700 rounded-lg font-semibold">
                            <span className="text-lg mr-2">❌</span>
                            <div>
                              <div>Не оплачено</div>
                              <div className="text-xs text-red-500">{cTotal.toLocaleString()} ₸</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Способ оплаты (если уже оплачено) */}
                    {isPaid && service.payment_method_name && (
                      <div className="text-xs text-gray-500">
                        Способ оплаты: <span className="font-medium text-gray-700">{service.payment_method_name}</span>
                      </div>
                    )}

                    {/* Кнопка оплаты (для комплекса — «Оплатить всё» за остаток) */}
                    {!isPaid && !(service.is_complex && cFully) && (
                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => service.is_complex
                            ? openPaymentModalForComplexRemaining(service.service_id)
                            : markServicePaid(service.service_id)}
                          disabled={loading}
                          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-md hover:shadow-lg flex items-center space-x-2"
                        >
                          {loading ? (
                            <span>Обработка...</span>
                          ) : (
                            <>
                              <span>💳</span>
                              <span>{service.is_complex ? 'Оплатить всё' : 'Оплатить'}</span>
                              <span className="ml-2 px-2 py-0.5 bg-blue-700 rounded text-sm">
                                {(service.is_complex ? cRemaining : service.total_price || 0).toLocaleString()} ₸
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
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="text-sm font-medium text-gray-700 mb-1">Примечания:</div>
              <div className="text-sm text-gray-600 whitespace-pre-wrap">{plan.notes}</div>
            </div>
          )}

          {/* Информация о создании */}
          <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
            Создано: {new Date(plan.created_at).toLocaleString('ru-RU')} • {plan.created_by_name}
          </div>
      
      {/* Модальное окно выбора способа оплаты */}
      <PaymentModal
        show={showPaymentModal}
        loading={loading}
        onClose={() => { if (!loading) setShowPaymentModal(false); }}
        paymentTypes={paymentTypes}
        loadingPaymentTypes={loadingPaymentTypes}
        selectedPaymentType={selectedPaymentType}
        setSelectedPaymentType={setSelectedPaymentType}
        discountInput={discountInput}
        setDiscountInput={setDiscountInput}
        discountType={discountType}
        setDiscountType={setDiscountType}
        total={payableTarget()}
        actualAmount={actualAmount}
        setActualAmount={setActualAmount}
        fundingSource={fundingSource}
        setFundingSource={setFundingSource}
        allocations={allocations}
        setAllocations={setAllocations}
        isAdvance={pendingPaymentData?.type === 'deposit'}
        isSession={pendingPaymentData?.type === 'session'}
        onPay={(pType, d) => executePayment(pType, d)}
      />
    </div>
  );
};

export default ServicePaymentList;
