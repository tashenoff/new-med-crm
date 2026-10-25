import { hasPermission } from '../../utils/permissions';
import React, { useState, useEffect, useMemo } from 'react';
import Modal from './Modal';
import CuraiColorPicker from '../common/CuraiColorPicker';
import CuraiSelectionToolbar from '../common/CuraiSelectionToolbar';
import { inputClasses, selectClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses } from './modalUtils';
import { initializeDoctorForm, initializeDoctorServices, buildDoctorPayload, serializeDoctorServices, updateServiceCommission } from '../../utils/doctorCompensation';
import { formatPhoneChange } from '../../hooks/phoneFormatter';

const DoctorModal = ({ 
  user,
  show, 
  onClose, 
  onSave, 
  doctorForm = {},
  setDoctorForm = () => {}, 
  editingItem = null, 
  loading = false, 
  errorMessage = null 
}) => {
  const canConfigureCompensation = hasPermission(user, 'payroll_view');
  const [specialties, setSpecialties] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [serviceCommissions, setServiceCommissions] = useState({}); // Только явно заданные комиссии услуг; отсутствие наследует основную схему
  const [paymentMode, setPaymentMode] = useState('general'); // 'general' или 'individual'
  const [validationError, setValidationError] = useState(null);
  const [specialtyQuery, setSpecialtyQuery] = useState('');
  const [serviceQuery, setServiceQuery] = useState('');
  const [selectedServicesOnly, setSelectedServicesOnly] = useState(false);
  
  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    if (show) {
      const initialForm = initializeDoctorForm(editingItem || doctorForm);
      // Legacy local numbers relied on the separate +7 prefix in the old UI.
      const legacyPhone = String(initialForm.phone || '').trim();
      const legacyDigits = legacyPhone.replace(/\D/g, '');
      const isLegacyLocalNumber = !legacyPhone.startsWith('+') && legacyDigits.length === 10;
      initialForm.phone = formatPhoneChange(isLegacyLocalNumber ? `+7${legacyDigits}` : legacyPhone);
      const { selected, commissions } = initializeDoctorServices(initialForm);
      setDoctorForm(initialForm);
      setSelectedServices(selected);
      setServiceCommissions(commissions);
      setPaymentMode(initialForm.payment_mode);
      setValidationError(null);
      setSpecialtyQuery('');
      setServiceQuery('');
      setSelectedServicesOnly(false);
      fetchSpecialties();
      if (canConfigureCompensation) fetchServices();
    }
  }, [show, editingItem, canConfigureCompensation]);

  const fetchSpecialties = async () => {
    try {
      const token = localStorage.getItem('token');
      console.log('DoctorModal: Fetching specialties...');
      
      const response = await fetch(`${API}/api/specialties`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('DoctorModal: API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('DoctorModal: Fetched specialties:', data);
        setSpecialties(data || []);
      } else {
        console.error('DoctorModal: Failed to fetch specialties:', response.status);
      }
    } catch (error) {
      console.error('DoctorModal: Error fetching specialties:', error);
    }
  };

  const fetchServices = async () => {
    try {
      const token = localStorage.getItem('token');
      console.log('DoctorModal: Fetching service prices...');
      
      const response = await fetch(`${API}/api/service-prices`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('DoctorModal: Fetched service prices:', data);
        setServices(data || []);
      } else {
        console.error('DoctorModal: Failed to fetch service prices:', response.status);
      }
    } catch (error) {
      console.error('DoctorModal: Error fetching service prices:', error);
    }
  };

  // Фильтруем услуги по выбранным специальностям (категориям)
  const filteredServices = useMemo(() => {
    const selectedSpecialties = doctorForm.specialties || [];
    if (selectedSpecialties.length === 0) {
      return []; // Пока не выбрана специальность — не показываем услуги
    }
    return services.filter(service => {
      const serviceCategory = (service.category || '').toLowerCase().trim();
      return selectedSpecialties.some(spec => spec.toLowerCase().trim() === serviceCategory);
    });
  }, [services, doctorForm.specialties]);

  const removeServiceCommissions = (ids) => {
    setServiceCommissions(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.includes(id))));
  };

  const handleServiceToggle = (serviceId) => {
    if (selectedServices.includes(serviceId)) removeServiceCommissions([serviceId]);
    setSelectedServices(prev => prev.includes(serviceId) ? prev.filter(id => id !== serviceId) : [...prev, serviceId]);
  };

  const handleCommissionChange = (serviceId, field, value) => {
    setServiceCommissions(prev => updateServiceCommission(prev, serviceId, field, value));
  };

  const handlePaymentModeChange = (newMode) => {
    setPaymentMode(newMode);
  };

  // НЕ синхронизируем услуги автоматически, чтобы не затирать поля формы
  // Услуги будут добавлены при сохранении формы

  const visibleSpecialties = specialties.filter(item => item.name.toLocaleLowerCase('ru').includes(specialtyQuery.toLocaleLowerCase('ru').trim()));
  const visibleServices = filteredServices.filter(item => (!selectedServicesOnly || selectedServices.includes(item.id)) && (item.service_name || '').toLocaleLowerCase('ru').includes(serviceQuery.toLocaleLowerCase('ru').trim()));

  if (!show) return null;

  return (
    <Modal 
      show={show} 
      onClose={onClose}
      title={editingItem ? 'Редактировать врача' : 'Новый врач'}
      errorMessage={errorMessage}
      size="max-w-[1120px]"
      className="curai-doctor-dialog"
    >
        
        <form onSubmit={(e) => {
          e.preventDefault();
          const servicesData = serializeDoctorServices(selectedServices, serviceCommissions, paymentMode);
          try {
            const payload = buildDoctorPayload({ ...doctorForm, services: servicesData, payment_mode: paymentMode }, { includeCompensation: canConfigureCompensation });
            setValidationError(null);
            onSave(e, { ...payload, editingItem });
          } catch (error) {
            setValidationError(error.message);
          }
        }} className="space-y-6">
          {validationError && <p role="alert" className="text-curai-negative">{validationError}</p>}
          {canConfigureCompensation && ((doctorForm.currency && doctorForm.currency !== 'KZT') || Object.values(serviceCommissions).some(commission => commission.currency !== 'KZT')) && (
            <p role="alert" className="text-curai-negative">В записи есть иностранная валюта ({doctorForm.currency !== 'KZT' ? doctorForm.currency : Object.values(serviceCommissions).filter(commission => commission.currency !== 'KZT').map(commission => commission.currency).join(', ')}). Значения не конвертированы. Сохранение требует явного согласования значений в KZT.</p>
          )}
          
          {/* Две колонки: Основная информация и Услуги врача */}
          <div className={`grid grid-cols-1 ${canConfigureCompensation ? 'lg:grid-cols-2' : ''} gap-6`}>
            
            {/* Левая колонка - Основная информация */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-curai-ink border-b pb-2">
                Основная информация
              </h3>
              
              <label className="curai-doctor-field">Полное имя *
<input
                type="text"
                placeholder="Полное имя *"
                value={doctorForm.full_name || ''}
                onChange={(e) => setDoctorForm({...doctorForm, full_name: e.target.value})}
                className={inputClasses}
                required
              />
</label>
              
              <div className="curai-doctor-specialties">
                <label className={labelClasses}>Специальности *</label>
                {(doctorForm.specialties || []).length > 0 && (
                    <div className="curai-doctor-specialty-chips flex flex-wrap gap-2">
                      {(doctorForm.specialties || []).map((spec, idx) => (
                        <span
                          key={spec}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full ${
                            idx === 0
                              ? "bg-curai-selected text-curai-blue "
                              : "bg-curai-subtle text-curai-ink "
                          }`}
                        >
                          {spec}
                          <button
                            type="button"
                            onClick={() => {
                              const newSpecialties = (doctorForm.specialties || []).filter(s => s !== spec);
                              setDoctorForm({
                                ...doctorForm,
                                specialties: newSpecialties,
                                specialty: newSpecialties.length > 0 ? newSpecialties[0] : null
                              });
                            }}
                            className="ml-1 hover:text-curai-negative"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                <CuraiSelectionToolbar label="Поиск специальностей" query={specialtyQuery} onQueryChange={setSpecialtyQuery} />
                <div className="space-y-2">
                  {specialties.length === 0 ? (
                    <p className="text-sm text-curai-negative ">
                      ⚠️ Специальности не найдены. Создайте специальности в разделе "Справочники"
                    </p>
                  ) : (
                    <div className="max-h-[108px] overflow-y-auto border border-curai-control rounded-md p-2 space-y-1">
                      {visibleSpecialties.length === 0 && <p role="status" className="p-3 text-curai-muted">Ничего не найдено</p>}
                      {visibleSpecialties.map(specialty => {
                        const isSelected = (doctorForm.specialties || []).includes(specialty.name);
                        return (
                          <label
                            key={specialty.id}
                            className={`flex items-center space-x-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-curai-selected border border-curai-control "
                                : "hover:bg-curai-subtle border border-transparent"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                const current = doctorForm.specialties || [];
                                const exists = current.includes(specialty.name);
                                const newSpecialties = exists
                                  ? current.filter(s => s !== specialty.name)
                                  : [...current, specialty.name];
                                setDoctorForm({
                                  ...doctorForm,
                                  specialties: newSpecialties,
                                  specialty: newSpecialties.length > 0 ? newSpecialties[0] : null
                                });
                              }}
                              className="rounded text-curai-blue focus:ring-curai-focus"
                            />
                            <span className={`text-sm ${isSelected ? "font-medium text-curai-blue " : "text-curai-ink "}`}>
                              {specialty.name}
                            </span>
                            {isSelected && (
                              <span className="ml-auto text-xs text-curai-blue ">
                                {(doctorForm.specialties || []).indexOf(specialty.name) === 0 ? '✅ Основная' : ''}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <p className="text-xs text-curai-muted mt-1">
                    Загружено специальностей: {specialties.length} | Выбрано: {(doctorForm.specialties || []).length}
                  </p>
                </div>
              </div>
              
              <label className="curai-doctor-field">Телефон
<input
                type="tel"
                placeholder="+7 (XXX) XXX-XX-XX"
                value={doctorForm.phone || ''}
                onChange={(e) => setDoctorForm({...doctorForm, phone: formatPhoneChange(e.target.value)})}
                className={inputClasses}
              />
</label>
              
              <CuraiColorPicker value={doctorForm.calendar_color || '#3B82F6'} onChange={color => setDoctorForm({...doctorForm, calendar_color: color})} />
            </div>
            
            {/* Правая колонка - Услуги врача */}
            {canConfigureCompensation && <div className="space-y-4">
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-curai-ink border-b pb-2">
                  Услуги врача
                  <span className="text-xs text-curai-muted ml-2">
                    {paymentMode === 'general' 
                      ? '(используется общая оплата)'
                      : '(индивидуальные комиссии)'
                    }
                  </span>
                </h3>
                
                {/* Переключатель режима оплаты */}
                <label className="curai-doctor-field">Режим настройки комиссий
  <select name="paymentMode" aria-label="Режим настройки комиссий" value={paymentMode} onChange={event => handlePaymentModeChange(event.target.value)} className={selectClasses}>
    <option value="general">Общая оплата</option><option value="individual">Индивидуальные комиссии</option>
  </select>
</label>
              </div>
              
              {/* Индикатор фильтрации по специальностям */}

              {!doctorForm.specialty && services.length > 0 && (
                <div className="text-xs text-curai-muted bg-curai-subtle px-3 py-2 rounded-md">
                  👆 Выберите специальность, чтобы увидеть соответствующие услуги
                </div>
              )}
              
              {filteredServices.length > 0 && <CuraiSelectionToolbar label="Поиск услуг" query={serviceQuery} onQueryChange={setServiceQuery} total={filteredServices.length} selected={selectedServices.length} selectedOnly={selectedServicesOnly} onSelectedOnlyChange={setSelectedServicesOnly} />}
              {filteredServices.length > 0 ? (
                <div className="curai-doctor-service-picker">
<div className="px-3 py-2 border-b border-curai-border bg-curai-subtle ">
                    <label className="flex items-center space-x-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={visibleServices.length === 0}
                        checked={visibleServices.length > 0 && visibleServices.every(s => selectedServices.includes(s.id))}
                        onChange={() => {
                          const allSelected = visibleServices.every(s => selectedServices.includes(s.id));
                          if (allSelected) {
                            // Снять все фильтрованные
                            const filteredIds = visibleServices.map(s => s.id);
                            setSelectedServices(prev => prev.filter(id => !filteredIds.includes(id)));
                            removeServiceCommissions(filteredIds);
                          } else {
                            // Выбрать все фильтрованные
                            const filteredIds = visibleServices.map(s => s.id);
                            setSelectedServices(prev => {
                              const newSet = new Set([...prev, ...filteredIds]);
                              return Array.from(newSet);
                            });
                          }
                        }}
                        className="text-curai-blue rounded"
                      />
                      <span className="text-curai-ink font-medium">Выбрать все найденные</span>
                      <span className="text-xs text-curai-muted ">
                        ({visibleServices.length} услуг)
                      </span>
                    </label>
                  </div>
<div className="curai-doctor-service-scroll">
                  {visibleServices.length === 0 && <p role="status" className="p-3 text-curai-muted">Ничего не найдено. Выбор вне поиска сохранён.</p>}
                  {(() => {
                    const servicesByCategory = visibleServices.reduce((acc, service) => {
                      const category = service.category || 'Без категории';
                      if (!acc[category]) acc[category] = [];
                      acc[category].push(service);
                      return acc;
                    }, {});
                    
                    return Object.keys(servicesByCategory).map(category => (
                      <div key={category} className="border-b border-curai-border last:border-b-0">
                        <div className="px-3 py-2 bg-curai-subtle font-medium text-sm text-curai-ink ">
                          {category}
                        </div>
                        <div className="px-3 py-2 space-y-3">
                          {servicesByCategory[category].map(service => (
                            <div key={service.id} className="space-y-2">
                              {/* Чекбокс и название услуги */}
                              <label className="curai-doctor-service-label flex items-start gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={selectedServices.includes(service.id)}
                                  onChange={() => handleServiceToggle(service.id)}
                                  className="text-curai-blue rounded"
                                />
                                <span className="curai-doctor-service-name text-curai-ink font-medium">{service.service_name}</span>
                                <span className="text-xs text-curai-muted ">
                                  ({service.price.toLocaleString()} ₸)
                                </span>
                              </label>
                              
                              {/* Настройки комиссии для выбранной услуги (только в индивидуальном режиме) */}
                              {selectedServices.includes(service.id) && paymentMode === 'individual' && (
                                <div className="curai-doctor-service-commission ml-6 p-3 bg-curai-subtle rounded-md border border-curai-border ">
                                  <p className="text-xs mb-2">Без комиссии услуги применяется основная схема. Явный 0 означает оплату 0. Очистите значение или выберите «Основная схема» для сброса.</p>
                                  <div className="curai-doctor-commission-grid grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <label className="block text-curai-ink mb-1">Тип комиссии</label>
                                      <select
                                        aria-label={`Комиссия ${service.service_name || service.id}`}
                                        value={serviceCommissions[service.id]?.type || 'inherit'}
                                        onChange={(e) => handleCommissionChange(service.id, 'type', e.target.value)}
                                        className="w-full px-2 py-1 text-xs border border-curai-control rounded bg-curai-surface text-curai-ink "
                                      >
                                        <option value="inherit">Основная схема</option>
                                        <option value="percentage">%</option>
                                        <option value="fixed">Фикс.</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-curai-ink mb-1">
                                        {serviceCommissions[service.id]?.type === 'percentage' ? 'Процент' : 'Сумма (KZT за завершённую услугу)'}
                                      </label>
                                      <div className="flex">
                                        <input
                                          type="number"
                                          min="0"
                                          max={serviceCommissions[service.id]?.type === 'percentage' ? '100' : undefined}
                                          step="any"
                                          aria-label={`Значение комиссии ${service.service_name || service.id}`}
                                          disabled={!serviceCommissions[service.id]?.type}
                                          value={serviceCommissions[service.id]?.value ?? ''}
                                          onChange={(e) => handleCommissionChange(service.id, 'value', e.target.validity.badInput ? NaN : e.target.value)}
                                          className="flex-1 px-2 py-1 text-xs border border-curai-control rounded-l bg-curai-surface text-curai-ink "
                                          placeholder="Основная схема"
                                        />
                                        {serviceCommissions[service.id]?.type === 'percentage' ? (
                                          <span className="px-2 py-1 text-xs bg-curai-border border border-l-0 border-curai-control rounded-r text-curai-muted ">%</span>
                                        ) : (
                                          <span className="px-2 py-1 text-xs">{serviceCommissions[service.id]?.currency || 'KZT'}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
</div>
              ) : (
                <div className="text-center py-8 text-curai-muted ">
                  <p>🔧 Услуги не найдены</p>
                  <p className="text-sm">
                    {doctorForm.specialty 
                      ? `В категории "${doctorForm.specialty}" пока нет услуг. Создайте услуги в разделе "Справочник"`
                      : 'Создайте услуги в разделе "Справочник"'}
                  </p>
                </div>
              )}
{(doctorForm.specialties || []).length > 0 && (
                <div className="text-xs text-curai-blue bg-curai-selected px-3 py-2 rounded-md">
                  📋 Показаны услуги для специальностей: <strong>{(doctorForm.specialties || []).join(', ')}</strong>
                  {filteredServices.length === 0 && services.length > 0 && (
                    <span className="ml-1 text-curai-warning ">
                      — нет услуг с этой категорией
                    </span>
                  )}
                </div>
              )}
              
              {filteredServices.length > 0 && doctorForm.specialty && (
                <div className="text-xs text-curai-positive mt-1">
                  📊 Найдено услуг: {filteredServices.length}
                  <span className="ml-2">✅ Выбрано: {selectedServices.length}</span>
                  {paymentMode === 'individual' && (
                    <span className="ml-2 text-curai-blue ">
                      (с индивидуальными комиссиями)
                    </span>
                  )}
                </div>
              )}
              {selectedServices.length > 0 && !doctorForm.specialty && (
                <div className="text-xs text-curai-positive mt-1">
                  ✅ Выбрано услуг: {selectedServices.length}
                </div>
              )}
              
              {paymentMode === 'individual' && selectedServices.length === 0 && (
                <div className="text-xs text-curai-warning mt-2">
                  ⚠️ Выберите услуги для настройки индивидуальных комиссий
                </div>
              )}
            </div>}
          </div>
          
          {canConfigureCompensation && <>
          <fieldset disabled={paymentMode === 'individual' && doctorForm.consultation_compensation_mode !== 'inherit' && selectedServices.every(serviceId => serviceCommissions[serviceId] !== undefined)}>
          <div className="bg-curai-warningBg p-4 rounded-md border border-curai-warning ">
            <h3 className="flex items-center text-sm font-medium text-curai-warning mb-4">
              <span className="mr-2">💰</span> Основная схема оплаты
            </h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClasses}>Тип оплаты</label>
                  <select
                    name="payment_type"
                    aria-label="Тип основной оплаты"
                    value={doctorForm.payment_type || 'percentage'}
                  onChange={(e) => {
                    const newPaymentType = e.target.value;
                    const updatedForm = {
                      ...doctorForm,
                      payment_type: newPaymentType,
                      payment_value: 0 // Сброс значения при смене типа
                    };

                    // Только для гибридного типа сбрасываем дополнительные поля
                    if (newPaymentType === 'hybrid') {
                      updatedForm.hybrid_percentage_value = 0;
                    }

                    setDoctorForm(updatedForm);
                  }}
                    className={inputClasses}
                  >
                    <option value="percentage">Процент от выручки</option>
                    <option value="fixed">Фиксированная оплата</option>
                    <option value="hybrid">Гибридная оплата</option>
                  </select>
                </div>

                <div>
                  <label className={labelClasses}>
                    {doctorForm.payment_type === 'percentage' ? 'Процент (%)' : 'Фиксированная сумма (KZT за завершённую услугу/приём)'}
                  </label>
                  <div className="flex">
                    <input
                      name="payment_value"
                      aria-label="Значение основной оплаты"
                      type="number"
                      min="0"
                      max={doctorForm.payment_type === 'percentage' ? '100' : undefined}
                      step="any"
                      value={doctorForm.payment_value ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDoctorForm({...doctorForm, payment_value: val === '' ? '' : parseFloat(val) || 0});
                      }}
                      className="flex-1 px-3 py-2 border border-curai-control rounded-l-md focus:ring-2 focus:ring-curai-focus bg-curai-surface text-curai-ink "
                      placeholder={doctorForm.payment_type === 'percentage' ? '0.0' : '0'}
                    />
                    {doctorForm.payment_type === 'percentage' ? (
                      <span className="px-3 py-2 bg-curai-subtle border border-l-0 border-curai-control rounded-r-md text-curai-muted ">%</span>
                    ) : (
                      <span className="px-3 py-2">{doctorForm.currency || 'KZT'}</span>
                    )}
                  </div>
                  {doctorForm.payment_type === 'percentage' && (
                    <p className="text-xs text-curai-muted mt-1">Укажите процент от общей выручки врача</p>
                  )}
                  {doctorForm.payment_type === 'fixed' && (
                    <p className="text-xs text-curai-muted mt-1">KZT за каждую завершённую услугу/приём, не за отчётный период</p>
                  )}
                  {doctorForm.payment_type === 'hybrid' && (
                    <p className="text-xs text-curai-muted mt-1">Фиксированная часть KZT за каждую завершённую услугу/приём плюс процент от выручки; 0% допустим</p>
                  )}
                </div>
              </div>

              {doctorForm.payment_type === 'hybrid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClasses}>Процент от выручки</label>
                    <div className="flex">
                      <input
                        name="hybrid_percentage_value"
                        aria-label="Процентная часть основной гибридной оплаты"
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={doctorForm.hybrid_percentage_value ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDoctorForm({...doctorForm, hybrid_percentage_value: val === '' ? '' : parseFloat(val) || 0});
                        }}
                        className="flex-1 px-3 py-2 border border-curai-control rounded-l-md focus:ring-2 focus:ring-curai-focus bg-curai-surface text-curai-ink "
                        placeholder="0.0"
                      />
                      <span className="px-3 py-2 bg-curai-positiveBg text-curai-positive border border-l-0 border-curai-control rounded-r-md">%</span>
                    </div>
                    <p className="text-xs text-curai-positive mt-1">Процентная часть от выручки</p>
                  </div>

                  <div className="text-sm text-curai-muted ">
                    <div className="font-medium mb-2">Сводка гибридной оплаты:</div>
                    <div className="space-y-1">
                      <div>💰 Фиксированная: {(doctorForm.payment_value || 0).toLocaleString()} {(doctorForm.currency || 'KZT')}</div>
                      <div>📊 Процентная: {(doctorForm.hybrid_percentage_value || 0)}% от выручки</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          </fieldset>

          <section className="space-y-4 rounded-md border border-curai-warning p-4">
            <h3 className={labelClasses}>Оплата консультаций</h3>
            <label htmlFor="consultation_compensation_mode" className={labelClasses}>Режим оплаты консультаций (обязательно)</label>
            <select
              id="consultation_compensation_mode"
              name="consultation_compensation_mode"
              required
              value={doctorForm.consultation_compensation_mode || ''}
              onChange={event => setDoctorForm({ ...doctorForm, consultation_compensation_mode: event.target.value })}
              className={selectClasses}
            >
              <option value="">Выберите режим</option>
              <option value="none">Без оплаты</option>
              <option value="inherit">Основная схема оплаты</option>
              <option value="separate">Отдельная схема оплаты</option>
            </select>
            {doctorForm.consultation_compensation_mode === 'none' && <p>Консультации не оплачиваются.</p>}
            {doctorForm.consultation_compensation_mode === 'inherit' && <p>Консультации оплачиваются по основной схеме, даже при индивидуальных комиссиях услуг плана.</p>}
            {doctorForm.consultation_compensation_mode === 'separate' && (
              <div className="space-y-4">
                <label htmlFor="consultation_payment_type" className={labelClasses}>Тип оплаты консультаций</label>
                <select
                  id="consultation_payment_type"
                  name="consultation_payment_type"
                  value={doctorForm.consultation_payment_type || 'percentage'}
                  onChange={event => setDoctorForm({ ...doctorForm, consultation_payment_type: event.target.value, consultation_payment_value: 0, consultation_hybrid_percentage_value: 0 })}
                  className={selectClasses}
                >
                  <option value="percentage">Процент от выручки</option>
                  <option value="fixed">Фиксированная оплата (KZT)</option>
                  <option value="hybrid">Гибридная оплата (KZT + %)</option>
                </select>
                <label htmlFor="consultation_payment_value" className={labelClasses}>
                  {doctorForm.consultation_payment_type === 'percentage' ? 'Процент консультаций (0–100%)' : 'KZT за каждую завершённую консультацию'}
                </label>
                <input
                  id="consultation_payment_value"
                  name="consultation_payment_value"
                  type="number" min="0" max={doctorForm.consultation_payment_type === 'percentage' ? '100' : undefined} step="any"
                  value={doctorForm.consultation_payment_value ?? 0}
                  onChange={event => setDoctorForm({ ...doctorForm, consultation_payment_value: event.target.value })}
                  className={inputClasses}
                />
                {doctorForm.consultation_payment_type === 'hybrid' && (
                  <div>
                    <label htmlFor="consultation_hybrid_percentage_value" className={labelClasses}>Процентная часть консультаций (0–100%, 0% допустим)</label>
                    <input
                      id="consultation_hybrid_percentage_value"
                      name="consultation_hybrid_percentage_value"
                      type="number" min="0" max="100" step="any"
                      value={doctorForm.consultation_hybrid_percentage_value ?? 0}
                      onChange={event => setDoctorForm({ ...doctorForm, consultation_hybrid_percentage_value: event.target.value })}
                      className={inputClasses}
                    />
                  </div>
                )}
              </div>
            )}
          </section>
          </>}

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 ${buttonPrimaryClasses}`}
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 ${buttonSecondaryClasses}`}
            >
              Отмена
            </button>
          </div>
        </form>
    </Modal>
  );
};

export default DoctorModal;
