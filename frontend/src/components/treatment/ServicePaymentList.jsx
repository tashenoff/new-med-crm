import React, { useState, useEffect } from 'react';
import { FaChevronDown, FaChevronRight, FaStethoscope, FaClipboardList, FaNotesMedical, FaUserMd, FaFileMedical, FaCreditCard } from 'react-icons/fa';

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
    setPendingPaymentData({ type: 'service', serviceId });
    setShowPaymentModal(true);
  };

  const complexShares = (svc) => {
    // цена комплекса: price | price_per_unit | total_price/количество (в плане price может не быть)
    const complexPrice = svc.price || svc.price_per_unit || (svc.total_price / (svc.quantity || 1)) || 0;
    const sumDefault = (svc.components || []).reduce((a, c) => a + (c.price || 0) * (c.quantity || 1), 0);
    const k = sumDefault > 0 ? complexPrice / sumDefault : 0;
    return (svc.components || []).map(c => ({
      ...c,
      share: (c.price || 0) * (c.quantity || 1) * k * (1 - (c.discount || 0) / 100),
      paid: c.paid || false,
      paid_amount: c.paid_amount || 0,
    }));
  };

  const openPaymentModalForComplexRemaining = (serviceId) => {
    setPendingPaymentData({ type: 'complex-remaining', serviceId });
    setShowPaymentModal(true);
  };

  const openPaymentModalForComponent = (serviceId, componentServiceId) => {
    setPendingPaymentData({ type: 'component', serviceId, componentServiceId });
    setShowPaymentModal(true);
  };

  // Открыть модальное окно выбора способа оплаты для оплаты остатка
  const openPaymentModalForRemaining = () => {
    setPendingPaymentData({ type: 'remaining', serviceId: null });
    setShowPaymentModal(true);
  };

  // Выполнить оплату с выбранным способом оплаты и скидкой
  const executePayment = async (paymentType, discount = 0) => {
    if (!pendingPaymentData) return;
    
    try {
      setLoading(true);
      setShowPaymentModal(false);
      const token = localStorage.getItem('token');
      const paymentData = paymentType ? {
        payment_method_id: paymentType.id,
        payment_method_name: paymentType.name
      } : {};
      if (discount > 0.001 && pendingPaymentData.type !== 'remaining') {
        const target = payableTarget();
        paymentData.amount = Math.max(0, Math.round((target - discount) * 100) / 100 || 0);
      }
      
      if (pendingPaymentData.type === 'service') {
        // Оплата одной услуги
        const response = await fetch(
          `${API}/api/treatment-plans/${plan.id}/services/${pendingPaymentData.serviceId}/mark-paid`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ payment_data: paymentData })
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
      } else if (pendingPaymentData.type === 'component') {
        // Оплата одной услуги (доли) комплекса
        const response = await fetch(
          `${API}/api/treatment-plans/${plan.id}/complex-services/${pendingPaymentData.serviceId}/components/${pendingPaymentData.componentServiceId}/mark-paid`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment_data: paymentData })
          }
        );
        if (!response.ok) throw new Error('Ошибка при оплате услуги комплекса: ' + response.status);
        const updated = await response.json();
        if (onUpdate) onUpdate(updated);
        alert('✅ Услуга комплекса оплачена');
      } else if (pendingPaymentData.type === 'complex-remaining') {
        const response = await fetch(
          `${API}/api/treatment-plans/${plan.id}/complex-services/${pendingPaymentData.serviceId}/pay-remaining`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment_data: paymentData })
          }
        );
        if (!response.ok) throw new Error('Ошибка при оплате остатка: ' + response.status);
        const updated = await response.json();
        if (onUpdate) onUpdate(updated);
        alert('✅ Комплекс оплачен полностью');
      } else if (pendingPaymentData.type === 'remaining') {
        // Оплата остатка - помечаем все неоплаченные услуги;
        // скидка распределяется равномерно по неоплаченным простым услугам (по ТЗ)
        const unpaidServices = plan.services.filter(s => s.payment_status !== 'paid');
        const simpleUnpaid = unpaidServices.filter(s => !s.is_complex);
        const discPer = simpleUnpaid.length && discount > 0.001
          ? Math.round((discount / simpleUnpaid.length) * 100) / 100 : 0;

        for (const service of unpaidServices) {
          const pd = { ...paymentData };
          if (discPer > 0.001 && !service.is_complex) {
            pd.amount = Math.max(0, (service.total_price || 0) - discPer);
          }
          const response = await fetch(
            `${API}/api/treatment-plans/${plan.id}/services/${service.service_id}/mark-paid`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ payment_data: pd })
            }
          );
          
          if (!response.ok) {
            throw new Error(`Ошибка при оплате услуги ${service.service_name}`);
          }
        }
        
        // Обновляем план после оплаты всех услуг
        const planResponse = await fetch(`${API}/api/treatment-plans/${plan.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (planResponse.ok) {
          const updatedPlan = await planResponse.json();
          if (onUpdate) {
            onUpdate(updatedPlan);
          }
          alert(`✅ План лечения полностью оплачен! (${paymentType ? paymentType.name : 'без указания способа'})`);
        }
      }
    } catch (error) {
      console.error('Error executing payment:', error);
      alert('Ошибка при оплате: ' + error.message);
    } finally {
      setLoading(false);
      setPendingPaymentData(null);
      resetPaymentModal();
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
  const usedFromDeposit = Math.min(depositAmount, totalAmount);
  const depositBalance = depositAmount > totalAmount ? depositAmount - totalAmount : 0;
  const depositDebt = depositAmount < totalAmount ? totalAmount - depositAmount : 0;
  // remainingToPay - сумма неоплаченных услуг (без учёта депозита)
  const remainingToPay = Math.max(0, totalAmount - paidAmount);
  // actualRemainingToPay - реальная сумма к доплате с учётом депозита
  // Если есть депозит и он покрывает часть суммы, показываем только недостающую часть
  const actualRemainingToPay = depositAmount > 0 
    ? Math.max(0, totalAmount - paidAmount - depositAmount)  // Учитываем депозит
    : remainingToPay;  // Если нет депозита, показываем полную сумму

  // Функция для добавления доплаты из кассы
  const addDepositPayment = async (amount) => {
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
      return Math.round((total - paid) * 100) / 100;
    }
    if (pd.type === 'service') {
      const svc = (plan.services || []).find(x => x.service_id === pd.serviceId);
      return svc ? svc.total_price : 0;
    }
    return Math.max(0, (plan.total_cost || 0) - (plan.paid_amount || 0));
  };

  const resetPaymentModal = () => { setSelectedPaymentType(null); setDiscountInput(''); };

  const PaymentMethodModal = () => {
    if (!showPaymentModal) return null;
    const total = payableTarget();
    const disc = Math.max(0, Number(discountInput) || 0);
    const finalAmt = Math.max(0, Math.round((total - disc) * 100) / 100);
    const close = () => { resetPaymentModal(); setShowPaymentModal(false); };
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={close}>
        <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <FaCreditCard className="mr-2 text-blue-500" />
              Способ оплаты
            </h3>
            <button onClick={close} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
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
                <label
                  key={pt.id}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${selectedPaymentType && selectedPaymentType.id === pt.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:bg-blue-50'}`}
                >
                  <input type="radio" name="paymethod" checked={selectedPaymentType && selectedPaymentType.id === pt.id}
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
            <div className="flex justify-between text-sm text-gray-600">
              <span>К оплате</span><span className="font-medium text-gray-900">{total.toLocaleString()} ₸</span>
            </div>
            {disc > 0.001 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Скидка</span><span>− {disc.toLocaleString()} ₸</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 whitespace-nowrap">Скидка, ₸</label>
              <input type="number" min="0" step="0.01" value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="0" />
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Итого к оплате</span><span className="text-blue-600">{finalAmt.toLocaleString()} ₸</span>
            </div>
          </div>

          <button onClick={() => executePayment(selectedPaymentType, disc)} disabled={loading}
            className="w-full mt-4 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
            {loading ? 'Обработка...' : `Оплатить ${finalAmt.toLocaleString()} ₸`}
          </button>
        </div>
      </div>
    );
  };

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
              const cRemaining = Math.max(0, cTotal - cPaid);
              const cFully = cRemaining <= 0.001;
              const isPartially = service.is_complex && cPaid > 0 && !cFully;
              const paymentType = service.payment_type || 'single';
              
              // Для курсов с поэтапной оплатой
              const isPerSession = isCourse && paymentType === 'per_session';
              const paidSessions = isPerSession && service.sessions 
                ? service.sessions.filter(s => s.paid).length 
                : 0;
              const totalSessions = service.quantity_total || 1;
              const sessionPrice = service.price_per_unit || 0;
              
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
                                {c.paid ? ' · оплачено' : ''}
                              </div>
                            </div>
                            {c.paid ? (
                              <span className="text-green-600 text-xs font-medium">✅ {(c.paid_amount || 0).toLocaleString()} ₸</span>
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
                            {(paidSessions * sessionPrice).toLocaleString()} ₸
                          </div>
                          <div className="text-xs text-gray-500">
                            осталось {((totalSessions - paidSessions) * sessionPrice).toLocaleString()} ₸
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
                          onClick={() => markSessionPaidForService(plan.id, service.service_id, paidSessions)}
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
                              <div className="text-xs text-green-500">{cTotal.toLocaleString()} ₸</div>
                            </div>
                          </div>
                        ) : isPartially ? (
                          <div className="inline-flex items-center px-4 py-2 bg-amber-100 border-2 border-amber-300 text-amber-700 rounded-lg font-semibold">
                            <span className="text-lg mr-2">🕐</span>
                            <div>
                              <div>Частично</div>
                              <div className="text-xs text-amber-600">{cPaid.toLocaleString()} / {cTotal.toLocaleString()} ₸</div>
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
      <PaymentMethodModal />
    </div>
  );
};

export default ServicePaymentList;