import React, { useState, useEffect } from 'react';
import { FaChevronDown, FaChevronRight, FaStethoscope, FaClipboardList, FaNotesMedical, FaUserMd, FaFileMedical } from 'react-icons/fa';

const ServicePaymentList = ({ plan, onUpdate, onEdit, paymentFilter = 'all', procedureFilter = 'all' }) => {
  const [loading, setLoading] = useState(false);
  const [consultation, setConsultation] = useState(null);
  const [consultationLoading, setConsultationLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
  const [isCollapsed, setIsCollapsed] = useState(true); // По умолчанию свёрнуто
  const API = import.meta.env.VITE_BACKEND_URL;

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

  const markServicePaid = async (serviceId) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API}/api/treatment-plans/${plan.id}/services/${serviceId}/mark-paid`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const updatedPlan = await response.json();
        if (onUpdate) {
          onUpdate(updatedPlan);
        }
      }
    } catch (error) {
      console.error('Error marking service paid:', error);
      alert('Ошибка при отметке оплаты');
    } finally {
      setLoading(false);
    }
  };

  const markSessionPaidForService = async (planId, serviceId, sessionIndex) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API}/api/treatment-plans/${planId}/services/${serviceId}/sessions/${sessionIndex}/mark-paid`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const updatedPlan = await response.json();
        if (onUpdate) {
          onUpdate(updatedPlan);
        }
      } else {
        alert('Ошибка при отметке оплаты процедуры');
      }
    } catch (error) {
      console.error('Error marking session paid:', error);
      alert('Ошибка при отметке оплаты процедуры');
    } finally {
      setLoading(false);
    }
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

  // Функция для оплаты остатка (доплаты из депозита)
  const payRemainingDebt = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Помечаем все неоплаченные услуги как оплаченные
      const unpaidServices = plan.services.filter(s => s.payment_status !== 'paid');
      
      for (const service of unpaidServices) {
        const response = await fetch(
          `${API}/api/treatment-plans/${plan.id}/services/${service.service_id}/mark-paid`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
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
        alert(`✅ План лечения полностью оплачен!\nДоплачено: ${actualRemainingToPay.toLocaleString()} ₸`);
      }
    } catch (error) {
      console.error('Error paying remaining debt:', error);
      alert('Ошибка при оплате: ' + error.message);
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

          {/* Прогресс оплаты */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Оплачено услуг: {paidServices} из {totalServices}</span>
            <span className="font-medium">{paymentProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
            <div
              className="bg-green-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${paymentProgress}%` }}
            />
          </div>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-xs text-gray-500">Всего к оплате</div>
              <div className="text-lg font-semibold text-gray-900">
                {totalAmount.toLocaleString()} ₸
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Депозит (баланс)</div>
              {depositBalance > 0 ? (
                <div className="text-lg font-semibold text-green-600">
                  {depositBalance.toLocaleString()} ₸
                </div>
              ) : depositDebt > 0 ? (
                <div className="text-lg font-semibold text-red-600">
                  -{depositDebt.toLocaleString()} ₸
                </div>
              ) : (
                <div className="text-lg font-semibold text-gray-500">
                  0 ₸
                </div>
              )}
            {/* Детализация депозита */}
              <div className="text-xs mt-1">
                {appointmentDeposit > 0 && (
                  <div className="text-blue-500">
                    💰 Депозит: {appointmentDeposit.toLocaleString()} ₸
                  </div>
                )}
                {extraDeposit > 0 && (
                  <div className="text-green-500">
                    💳 Доплата: +{extraDeposit.toLocaleString()} ₸
                  </div>
                )}
                {depositAmount > 0 && (
                  <div className="text-gray-600 font-medium">
                    Итого: {depositAmount.toLocaleString()} ₸
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Оплачено</div>
              <div className="text-lg font-semibold text-green-600">
                {paidAmount.toLocaleString()} ₸
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Остаток к оплате</div>
              <div className="text-lg font-semibold text-red-600">
                {actualRemainingToPay.toLocaleString()} ₸
              </div>
            </div>
          </div>
        
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
          
          {/* Показываем статус если всё оплачено И депозит покрыл всю сумму */}
          {remainingToPay === 0 && paidAmount > 0 && depositDebt === 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 text-center">
              <div className="inline-flex items-center px-6 py-3 bg-green-100 text-green-700 rounded-lg font-semibold">
                <span className="text-2xl mr-2">✅</span>
                <span>План лечения полностью оплачен</span>
              </div>
            </div>
          )}
          
          {/* Показываем предупреждение и кнопку доплаты если услуги помечены как оплаченные, но депозит не покрыл всю сумму */}
          {remainingToPay === 0 && paidAmount > 0 && depositDebt > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex flex-col items-center space-y-3">
                <div className="inline-flex items-center px-6 py-3 bg-orange-100 text-orange-700 rounded-lg font-semibold">
                  <span className="text-2xl mr-2">⚠️</span>
                  <span>Услуги оплачены, но депозита было недостаточно</span>
                </div>
                <div className="text-sm text-gray-600">
                  Недоплата из депозита: <span className="font-bold text-red-600">{depositDebt.toLocaleString()} ₸</span>
                </div>
                <button
                  onClick={() => {
                    if (!loading && window.confirm(`Подтвердите доплату ${depositDebt.toLocaleString()} ₸ из кассы`)) {
                      addDepositPayment(depositDebt);
                    }
                  }}
                  disabled={loading}
                  className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all shadow-md hover:shadow-lg flex items-center space-x-2"
                >
                  {loading ? (
                    <span>Обработка...</span>
                  ) : (
                    <>
                      <span>💳</span>
                      <span>Доплатить из кассы</span>
                      <span className="ml-2 px-2 py-1 bg-orange-600 rounded text-sm">
                        {depositDebt.toLocaleString()} ₸
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

      {/* Список услуг */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 mb-3">Услуги в счете:</h4>
            
            {filteredServices.map((service, index) => {
              const isPaid = service.payment_status === 'paid';
              const isCourse = service.is_course;
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
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-gray-500 font-medium mb-1">СТОИМОСТЬ</div>
                          <div className="text-xl font-bold text-gray-900">
                            {(service.total_price || 0).toLocaleString()} ₸
                          </div>
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
                      
                      <div className="mt-3">
                        {isPaid ? (
                          <span className="inline-flex items-center px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-semibold">
                            <span className="text-lg mr-2">✅</span> Оплачено
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-semibold">
                            <span className="text-lg mr-2">❌</span> Не оплачено
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Кнопка оплаты */}
                    <div className="ml-6">
                      {!isPaid && (
                        <button
                          onClick={() => markServicePaid(service.service_id)}
                          disabled={loading}
                          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-md hover:shadow-lg"
                        >
                          {loading ? 'Обработка...' : '💳 Оплатить полностью'}
                        </button>
                      )}
                    </div>
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
        </div>
      )}
    </div>
  );
};

export default ServicePaymentList;