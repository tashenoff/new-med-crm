import React, { useState, useEffect, useMemo } from 'react';
import Modal from './Modal';
import { inputClasses, selectClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses } from './modalUtils';
import { initializeDoctorForm, initializeDoctorServices, buildDoctorPayload } from '../../utils/doctorCompensation';

const DoctorModal = ({ 
  show, 
  onClose, 
  onSave, 
  doctorForm = {},
  setDoctorForm = () => {}, 
  editingItem = null, 
  loading = false, 
  errorMessage = null 
}) => {
  const [specialties, setSpecialties] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [serviceCommissions, setServiceCommissions] = useState({}); // Объект {serviceId: {type: 'percentage', value: 0, currency: 'KZT'}}
  const [paymentMode, setPaymentMode] = useState('general'); // 'general' или 'individual'
  const [validationError, setValidationError] = useState(null);
  
  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    if (show) {
      const initialForm = initializeDoctorForm(editingItem || doctorForm);
      const { selected, commissions } = initializeDoctorServices(initialForm);
      setDoctorForm(initialForm);
      setSelectedServices(selected);
      setServiceCommissions(commissions);
      setPaymentMode(initialForm.payment_mode);
      setValidationError(null);
      fetchSpecialties();
      fetchServices();
    }
  }, [show, editingItem]);

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

  // Обработчик для изменения услуг
  const handleServiceToggle = (serviceId) => {
    setSelectedServices(prev => {
      const newSelected = prev.includes(serviceId) 
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId];
      
      // Если режим индивидуальный и услуга добавлена, инициализируем настройки комиссии
      if (paymentMode === 'individual' && !prev.includes(serviceId)) {
        setServiceCommissions(prevCommissions => ({
          ...prevCommissions,
          [serviceId]: {
            type: 'percentage',
            value: 0,
            currency: 'KZT'
          }
        }));
      } else if (paymentMode === 'individual' && prev.includes(serviceId)) {
        // Если услуга убрана в индивидуальном режиме, удаляем настройки комиссии
        setServiceCommissions(prevCommissions => {
          const newCommissions = { ...prevCommissions };
          delete newCommissions[serviceId];
          return newCommissions;
        });
      }
      
      return newSelected;
    });
  };

  // Обработчик для изменения настроек комиссии услуги
  const handleCommissionChange = (serviceId, field, value) => {
    setServiceCommissions(prev => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        [field]: value
      }
    }));
  };

  // Обработчик переключения режима оплаты
  const handlePaymentModeChange = (newMode) => {
    console.log('🔄 ПЕРЕКЛЮЧЕНИЕ РЕЖИМА КОМИССИЙ:');
    console.log('  - Старый режим:', paymentMode);
    console.log('  - Новый режим:', newMode);
    
    setPaymentMode(newMode);
    
    if (newMode === 'individual') {
      console.log('  ✅ Переключение на ИНДИВИДУАЛЬНЫЙ режим');
      // При переходе в индивидуальный режим инициализируем комиссии для выбранных услуг
      const commissions = {};
      selectedServices.forEach(serviceId => {
        commissions[serviceId] = {
          type: 'percentage',
          value: 0,
          currency: 'KZT'
        };
      });
      setServiceCommissions(commissions);
      console.log('  - Инициализированы комиссии:', commissions);
    } else {
      console.log('  ✅ Переключение на ОБЩИЙ режим');
      // При переходе в общий режим очищаем индивидуальные настройки
      setServiceCommissions({});
      console.log('  - Комиссии очищены');
    }
  };

  // НЕ синхронизируем услуги автоматически, чтобы не затирать поля формы
  // Услуги будут добавлены при сохранении формы

  if (!show) return null;

  return (
    <Modal 
      show={show} 
      onClose={onClose}
      title={editingItem ? 'Редактировать врача' : 'Новый врач'}
      errorMessage={errorMessage}
      size="max-w-4xl"
    >
        
        <form onSubmit={(e) => {
          e.preventDefault();
          const servicesData = paymentMode === 'individual' ? selectedServices.map(serviceId => ({
            service_id: serviceId,
            commission_type: serviceCommissions[serviceId]?.type || 'percentage',
            commission_value: serviceCommissions[serviceId]?.value ?? 0,
            commission_currency: serviceCommissions[serviceId]?.currency || 'KZT'
          })) : selectedServices;
          try {
            const payload = buildDoctorPayload({ ...doctorForm, services: servicesData, payment_mode: paymentMode });
            setValidationError(null);
            onSave(e, { ...payload, editingItem });
          } catch (error) {
            setValidationError(error.message);
          }
        }} className="space-y-6">
          {validationError && <p role="alert" className="text-red-600">{validationError}</p>}
          {((doctorForm.currency && doctorForm.currency !== 'KZT') || Object.values(serviceCommissions).some(commission => commission.currency !== 'KZT')) && (
            <p role="alert" className="text-red-600">В записи есть иностранная валюта ({doctorForm.currency !== 'KZT' ? doctorForm.currency : Object.values(serviceCommissions).filter(commission => commission.currency !== 'KZT').map(commission => commission.currency).join(', ')}). Значения не конвертированы. Сохранение требует явного согласования значений в KZT.</p>
          )}
          
          {/* Две колонки: Основная информация и Услуги врача */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Левая колонка - Основная информация */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 border-b pb-2">
                Основная информация
              </h3>
              
              <input
                type="text"
                placeholder="Полное имя *"
                value={doctorForm.full_name || ''}
                onChange={(e) => setDoctorForm({...doctorForm, full_name: e.target.value})}
                className={inputClasses}
                required
              />
              
              <div>
                <label className={labelClasses}>Специальности *</label>
                <div className="space-y-2">
                  {specialties.length === 0 ? (
                    <p className="text-sm text-red-500 dark:text-red-400">
                      ⚠️ Специальности не найдены. Создайте специальности в разделе "Справочники"
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 space-y-1">
                      {specialties.map(specialty => {
                        const isSelected = (doctorForm.specialties || []).includes(specialty.name);
                        return (
                          <label
                            key={specialty.id}
                            className={`flex items-center space-x-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent'
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
                              className="rounded text-purple-600 focus:ring-purple-500"
                            />
                            <span className={`text-sm ${isSelected ? 'font-medium text-purple-800 dark:text-purple-200' : 'text-gray-700 dark:text-gray-300'}`}>
                              {specialty.name}
                            </span>
                            {isSelected && (
                              <span className="ml-auto text-xs text-purple-500 dark:text-purple-400">
                                {(doctorForm.specialties || []).indexOf(specialty.name) === 0 ? '✅ Основная' : ''}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {(doctorForm.specialties || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(doctorForm.specialties || []).map((spec, idx) => (
                        <span
                          key={spec}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full ${
                            idx === 0
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
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
                            className="ml-1 hover:text-red-500"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Загружено специальностей: {specialties.length} | Выбрано: {(doctorForm.specialties || []).length}
                  </p>
                </div>
              </div>
              
              <div className="flex">
                <span className="inline-flex items-center px-3 text-sm text-gray-900 bg-gray-200 border border-r-0 border-gray-300 rounded-l-lg dark:bg-gray-600 dark:text-gray-300 dark:border-gray-600">
                  +7
                </span>
                <input
                  type="tel"
                  placeholder="(XXX) XXX-XX-XX"
                  value={doctorForm.phone || ''}
                  onChange={(e) => setDoctorForm({...doctorForm, phone: e.target.value})}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-r-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              
              <div>
                <label className={labelClasses}>Цвет календаря</label>
                <input
                  type="color"
                  value={doctorForm.calendar_color || '#3B82F6'}
                  onChange={(e) => setDoctorForm({...doctorForm, calendar_color: e.target.value})}
                  className="w-full h-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                />
              </div>
            </div>
            
            {/* Правая колонка - Услуги врача */}
            <div className="space-y-4">
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 border-b pb-2">
                  Услуги врача
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                    {paymentMode === 'general' 
                      ? '(используется общая оплата)'
                      : '(индивидуальные комиссии)'
                    }
                  </span>
                </h3>
                
                {/* Переключатель режима оплаты */}
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-2">
                    Режим настройки комиссий
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="paymentMode"
                        value="general"
                        checked={paymentMode === 'general'}
                        onChange={(e) => handlePaymentModeChange(e.target.value)}
                        className="text-blue-600 dark:text-blue-400"
                      />
                      <span className="text-xs text-gray-700 dark:text-gray-300">
                        Общая оплата
                      </span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="paymentMode"
                        value="individual"
                        checked={paymentMode === 'individual'}
                        onChange={(e) => handlePaymentModeChange(e.target.value)}
                        className="text-blue-600 dark:text-blue-400"
                      />
                      <span className="text-xs text-gray-700 dark:text-gray-300">
                        Индивидуальные комиссии
                      </span>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {paymentMode === 'general' 
                      ? 'Используется общая настройка оплаты для всех услуг' 
                      : 'Для каждой услуги настраивается своя комиссия'
                    }
                  </p>
                </div>
              </div>
              
              {/* Индикатор фильтрации по специальностям */}
              {(doctorForm.specialties || []).length > 0 && (
                <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg">
                  📋 Показаны услуги для специальностей: <strong>{(doctorForm.specialties || []).join(', ')}</strong>
                  {filteredServices.length === 0 && services.length > 0 && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                      — нет услуг с этой категорией
                    </span>
                  )}
                </div>
              )}
              {!doctorForm.specialty && services.length > 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-lg">
                  👆 Выберите специальность, чтобы увидеть соответствующие услуги
                </div>
              )}
              
              {filteredServices.length > 0 ? (
                <div className="max-h-64 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                  {/* Чекбокс "Выбрать все" */}
                  <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-750">
                    <label className="flex items-center space-x-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filteredServices.every(s => selectedServices.includes(s.id))}
                        onChange={() => {
                          const allSelected = filteredServices.every(s => selectedServices.includes(s.id));
                          if (allSelected) {
                            // Снять все фильтрованные
                            const filteredIds = filteredServices.map(s => s.id);
                            setSelectedServices(prev => prev.filter(id => !filteredIds.includes(id)));
                          } else {
                            // Выбрать все фильтрованные
                            const filteredIds = filteredServices.map(s => s.id);
                            setSelectedServices(prev => {
                              const newSet = new Set([...prev, ...filteredIds]);
                              return Array.from(newSet);
                            });
                          }
                        }}
                        className="text-blue-600 dark:text-blue-400 rounded"
                      />
                      <span className="text-gray-700 dark:text-gray-300 font-medium">Выбрать все</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        ({filteredServices.length} услуг)
                      </span>
                    </label>
                  </div>
                  {(() => {
                    const servicesByCategory = filteredServices.reduce((acc, service) => {
                      const category = service.category || 'Без категории';
                      if (!acc[category]) acc[category] = [];
                      acc[category].push(service);
                      return acc;
                    }, {});
                    
                    return Object.keys(servicesByCategory).map(category => (
                      <div key={category} className="border-b border-gray-200 dark:border-gray-600 last:border-b-0">
                        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 font-medium text-sm text-gray-700 dark:text-gray-300">
                          {category}
                        </div>
                        <div className="px-3 py-2 space-y-3">
                          {servicesByCategory[category].map(service => (
                            <div key={service.id} className="space-y-2">
                              {/* Чекбокс и название услуги */}
                              <label className="flex items-center space-x-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={selectedServices.includes(service.id)}
                                  onChange={() => handleServiceToggle(service.id)}
                                  className="text-blue-600 dark:text-blue-400 rounded"
                                />
                                <span className="text-gray-900 dark:text-white font-medium">{service.service_name}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  ({service.price.toLocaleString()} ₸)
                                </span>
                              </label>
                              
                              {/* Настройки комиссии для выбранной услуги (только в индивидуальном режиме) */}
                              {selectedServices.includes(service.id) && paymentMode === 'individual' && (
                                <div className="ml-6 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <label className="block text-gray-700 dark:text-gray-300 mb-1">Тип комиссии</label>
                                      <select
                                        value={serviceCommissions[service.id]?.type || 'percentage'}
                                        onChange={(e) => handleCommissionChange(service.id, 'type', e.target.value)}
                                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                      >
                                        <option value="percentage">%</option>
                                        <option value="fixed">Фикс.</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-gray-700 dark:text-gray-300 mb-1">
                                        {serviceCommissions[service.id]?.type === 'percentage' ? 'Процент' : 'Сумма (KZT за завершённую услугу)'}
                                      </label>
                                      <div className="flex">
                                        <input
                                          type="number"
                                          min="0"
                                          max={serviceCommissions[service.id]?.type === 'percentage' ? '100' : undefined}
                                          step="any"
                                          value={serviceCommissions[service.id]?.value || 0}
                                          onChange={(e) => handleCommissionChange(service.id, 'value', parseFloat(e.target.value) || 0)}
                                          className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-l bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                          placeholder="0"
                                        />
                                        {serviceCommissions[service.id]?.type === 'percentage' ? (
                                          <span className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r text-gray-600 dark:text-gray-300">%</span>
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
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <p>🔧 Услуги не найдены</p>
                  <p className="text-sm">
                    {doctorForm.specialty 
                      ? `В категории "${doctorForm.specialty}" пока нет услуг. Создайте услуги в разделе "Справочник"`
                      : 'Создайте услуги в разделе "Справочник"'}
                  </p>
                </div>
              )}
              
              {filteredServices.length > 0 && doctorForm.specialty && (
                <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                  📊 Найдено услуг: {filteredServices.length}
                  <span className="ml-2">✅ Выбрано: {selectedServices.length}</span>
                  {paymentMode === 'individual' && (
                    <span className="ml-2 text-blue-600 dark:text-blue-400">
                      (с индивидуальными комиссиями)
                    </span>
                  )}
                </div>
              )}
              {selectedServices.length > 0 && !doctorForm.specialty && (
                <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                  ✅ Выбрано услуг: {selectedServices.length}
                </div>
              )}
              
              {paymentMode === 'individual' && selectedServices.length === 0 && (
                <div className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  ⚠️ Выберите услуги для настройки индивидуальных комиссий
                </div>
              )}
            </div>
          </div>
          
          <fieldset disabled={paymentMode === 'individual' && doctorForm.consultation_compensation_mode !== 'inherit'}>
          <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
            <h3 className="flex items-center text-sm font-medium text-orange-800 dark:text-orange-200 mb-4">
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
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-l-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder={doctorForm.payment_type === 'percentage' ? '0.0' : '0'}
                    />
                    {doctorForm.payment_type === 'percentage' ? (
                      <span className="px-3 py-2 bg-gray-100 dark:bg-gray-600 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-lg text-gray-600 dark:text-gray-300">%</span>
                    ) : (
                      <span className="px-3 py-2">{doctorForm.currency || 'KZT'}</span>
                    )}
                  </div>
                  {doctorForm.payment_type === 'percentage' && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Укажите процент от общей выручки врача</p>
                  )}
                  {doctorForm.payment_type === 'fixed' && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">KZT за каждую завершённую услугу/приём, не за отчётный период</p>
                  )}
                  {doctorForm.payment_type === 'hybrid' && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Фиксированная часть KZT за каждую завершённую услугу/приём плюс процент от выручки; 0% допустим</p>
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
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-l-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="0.0"
                      />
                      <span className="px-3 py-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-lg">%</span>
                    </div>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">Процентная часть от выручки</p>
                  </div>

                  <div className="text-sm text-gray-600 dark:text-gray-400">
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

          <section className="space-y-4 rounded-lg border border-orange-200 p-4">
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

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 ${buttonPrimaryClasses}`}
            >
              {loading ? 'Сохранение...' : (editingItem ? 'Обновить' : 'Создать')}
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
