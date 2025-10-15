import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { inputClasses, selectClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses } from './modalUtils';

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
  
  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    if (show) {
      console.log('🏥 МОДАЛЬНОЕ ОКНО ВРАЧА ОТКРЫТО:');
      console.log('  - editingItem:', editingItem);
      console.log('  - doctorForm:', doctorForm);
      console.log('  - Это редактирование?', !!editingItem);
      
      // Сначала инициализируем форму данными врача (если редактирование)
      if (editingItem) {
        console.log('🔄 ИНИЦИАЛИЗАЦИЯ ФОРМЫ ДАННЫМИ ВРАЧА:');
        console.log('  - specialty:', editingItem.specialty);
        console.log('  - payment_type:', editingItem.payment_type);
        console.log('  - payment_value:', editingItem.payment_value);
        console.log('  - hybrid_percentage_value:', editingItem.hybrid_percentage_value);
        
        const initialForm = {
          full_name: editingItem.full_name || '',
          specialty: editingItem.specialty || '',
          phone: editingItem.phone || '',
          calendar_color: editingItem.calendar_color || '#3B82F6',
          payment_type: editingItem.payment_type || 'percentage',
          payment_value: editingItem.payment_value || 0,
          hybrid_percentage_value: editingItem.hybrid_percentage_value || 0,
          currency: editingItem.currency || 'KZT',
          services: editingItem.services || [],
          payment_mode: editingItem.payment_mode || 'general'
        };
        
        console.log('  ✅ Инициализируем форму:', initialForm);
        setDoctorForm(initialForm);
      }
      
      fetchSpecialties();
      fetchServices();
      // Загружаем существующие услуги врача при редактировании
      if (editingItem && editingItem.services) {
        if (Array.isArray(editingItem.services) && editingItem.services.length > 0) {
          // Проверяем формат данных - если это массив объектов или массив строк
          if (typeof editingItem.services[0] === 'object') {
            // Новый формат: массив объектов с настройками комиссий (индивидуальный режим)
            const serviceIds = editingItem.services.map(s => s.service_id || s.id);
            const commissions = {};
            editingItem.services.forEach(s => {
              const id = s.service_id || s.id;
              commissions[id] = {
                type: s.commission_type || 'percentage',
                value: s.commission_value || 0,
                currency: s.commission_currency || 'KZT'
              };
            });
            setSelectedServices(serviceIds);
            setServiceCommissions(commissions);
            setPaymentMode('individual');
          } else {
            // Старый формат: массив строк (ID услуг) - общий режим
            setSelectedServices([...editingItem.services]);
            setServiceCommissions({});
            setPaymentMode('general');
          }
        }
      } else {
        setSelectedServices([]);
        setServiceCommissions({});
        setPaymentMode('general');
      }

    }
  }, [show, editingItem]);

  // Дополнительный useEffect для переинициализации формы после загрузки специальностей
  useEffect(() => {
    if (editingItem && specialties.length > 0) {
      console.log('🔄 ПЕРЕИНИЦИАЛИЗАЦИЯ ПОСЛЕ ЗАГРУЗКИ СПЕЦИАЛЬНОСТЕЙ:');
      console.log('  - specialties загружены:', specialties.length);
      console.log('  - editingItem.specialty:', editingItem.specialty);
      console.log('  - doctorForm.specialty текущий:', doctorForm.specialty);
      console.log('  - specialties список:', specialties.map(s => s.name));
      
      // Проверяем, есть ли специальность врача в списке загруженных специальностей
      const specialtyExists = specialties.some(s => s.name === editingItem.specialty);
      console.log('  - specialty exists in list:', specialtyExists);
      
      if (editingItem.specialty && (doctorForm.specialty !== editingItem.specialty)) {
        console.log('  ✅ Принудительно устанавливаем specialty');
        setDoctorForm(prev => ({
          ...prev,
          specialty: editingItem.specialty
        }));
      }
    }
  }, [specialties, editingItem, doctorForm.specialty]);

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
          console.log('🔍 DoctorModal form onSubmit вызван, onSave:', typeof onSave);
          console.log('🔍 DoctorModal передает doctorForm:', doctorForm);
          console.log('📋 ОТПРАВКА ДАННЫХ ВРАЧА:');
          console.log('  - Режим комиссий (paymentMode):', paymentMode);
          console.log('  - Выбранные услуги (selectedServices):', selectedServices);
          console.log('  - Настройки комиссий (serviceCommissions):', serviceCommissions);
          
          // Объединяем данные формы с выбранными услугами
          let servicesData;
          
          if (paymentMode === 'individual') {
            console.log('  ✅ Используется ИНДИВИДУАЛЬНЫЙ режим');
            // Индивидуальный режим: массив объектов с настройками комиссий
            servicesData = selectedServices.map(serviceId => ({
              service_id: serviceId,
              commission_type: serviceCommissions[serviceId]?.type || 'percentage',
              commission_value: serviceCommissions[serviceId]?.value || 0,
              commission_currency: serviceCommissions[serviceId]?.currency || 'KZT'
            }));
            console.log('  - Данные услуг (объекты с комиссиями):', servicesData);
          } else {
            console.log('  ✅ Используется ОБЩИЙ режим');
            // Общий режим: простой массив ID услуг
            servicesData = selectedServices;
            console.log('  - Данные услуг (простые ID):', servicesData);
          }
          
          const formDataWithServices = {
            ...doctorForm,
            services: servicesData,
            payment_mode: paymentMode // Добавляем информацию о режиме оплаты
          };
          
          console.log('🚀 ФИНАЛЬНЫЕ ДАННЫЕ ДЛЯ ОТПРАВКИ НА СЕРВЕР:');
          console.log('  - payment_mode:', formDataWithServices.payment_mode);
          console.log('  - payment_type:', formDataWithServices.payment_type);
          console.log('  - payment_value:', formDataWithServices.payment_value);
          console.log('  - hybrid_percentage_value:', formDataWithServices.hybrid_percentage_value);
          console.log('  - services:', formDataWithServices.services);
          console.log('  - Полные данные:', JSON.stringify(formDataWithServices, null, 2));
          
          // КРИТИЧЕСКАЯ ПРОВЕРКА ГИБРИДНЫХ ПОЛЕЙ
          if (formDataWithServices.payment_type === 'hybrid') {
            console.log('🔍 ПРОВЕРКА ГИБРИДНЫХ ПОЛЕЙ ПЕРЕД ОТПРАВКОЙ:');
            console.log('  ✅ payment_type = hybrid');
            console.log('  💰 payment_value =', formDataWithServices.payment_value);
            console.log('  📊 hybrid_percentage_value =', formDataWithServices.hybrid_percentage_value);
            
            if (!formDataWithServices.hybrid_percentage_value || formDataWithServices.hybrid_percentage_value === 0) {
              console.log('  ❌ КРИТИЧЕСКАЯ ОШИБКА: hybrid_percentage_value равен 0 или отсутствует!');
              console.log('  📋 doctorForm на момент отправки:', doctorForm);
              alert('ОШИБКА: Процентная часть гибридной оплаты не указана! Проверьте поле "Процент от выручки".');
              return; // Прерываем отправку
            } else {
              console.log('  ✅ Гибридные поля заполнены корректно');
            }
          }
          
          onSave(e, formDataWithServices);
        }} className="space-y-6">
          
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
                <label className={labelClasses}>Специальность *</label>
                <select
                  value={doctorForm.specialty || ''}
                  onChange={(e) => {
                    console.log('🔄 Изменение специальности:', e.target.value);
                    setDoctorForm({...doctorForm, specialty: e.target.value});
                  }}
                  className={inputClasses}
                  required
                >
                  <option value="">Выберите специальность</option>
                  {specialties.map(specialty => (
                    <option key={specialty.id} value={specialty.name}>{specialty.name}</option>
                  ))}
                </select>
                {specialties.length === 0 && (
                  <p className="text-sm text-red-500 dark:text-red-400 mt-1">
                    ⚠️ Специальности не найдены. Создайте специальности в разделе "Специальности"
                  </p>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Загружено специальностей: {specialties.length} | Текущее значение: "{doctorForm.specialty || 'пусто'}"
                </p>
              </div>
              
              <input
                type="tel"
                placeholder="Телефон *"
                value={doctorForm.phone || ''}
                onChange={(e) => setDoctorForm({...doctorForm, phone: e.target.value})}
                className={inputClasses}
                required
              />
              
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
              
              {services.length > 0 ? (
                <div className="max-h-64 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                  {(() => {
                    const servicesByCategory = services.reduce((acc, service) => {
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
                                        {serviceCommissions[service.id]?.type === 'percentage' ? 'Процент' : 'Сумма'}
                                      </label>
                                      <div className="flex">
                                        <input
                                          type="number"
                                          min="0"
                                          max={serviceCommissions[service.id]?.type === 'percentage' ? '100' : undefined}
                                          step={serviceCommissions[service.id]?.type === 'percentage' ? '0.1' : '1'}
                                          value={serviceCommissions[service.id]?.value || 0}
                                          onChange={(e) => handleCommissionChange(service.id, 'value', parseFloat(e.target.value) || 0)}
                                          className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-l bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                          placeholder="0"
                                        />
                                        {serviceCommissions[service.id]?.type === 'percentage' ? (
                                          <span className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r text-gray-600 dark:text-gray-300">%</span>
                                        ) : (
                                          <select
                                            value={serviceCommissions[service.id]?.currency || 'KZT'}
                                            onChange={(e) => handleCommissionChange(service.id, 'currency', e.target.value)}
                                            className="px-2 py-1 text-xs border border-l-0 border-gray-300 dark:border-gray-600 rounded-r bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                          >
                                            <option value="KZT">₸</option>
                                            <option value="USD">$</option>
                                            <option value="EUR">€</option>
                                            <option value="RUB">₽</option>
                                          </select>
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
                  <p className="text-sm">Создайте услуги в разделе "Услуги"</p>
                </div>
              )}
              
              {selectedServices.length > 0 && (
                <div className="text-xs text-green-600 dark:text-green-400 mt-2">
                  ✅ Выбрано услуг: {selectedServices.length}
                  {paymentMode === 'individual' && (
                    <span className="ml-2 text-blue-600 dark:text-blue-400">
                      (с индивидуальными комиссиями)
                    </span>
                  )}
                </div>
              )}
              
              {paymentMode === 'individual' && selectedServices.length === 0 && (
                <div className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  ⚠️ Выберите услуги для настройки индивидуальных комиссий
                </div>
              )}
            </div>
          </div>
          
          {/* Настройки оплаты - внизу на всю ширину (только в общем режиме) */}
          {paymentMode === 'general' && (
          <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
            <h3 className="flex items-center text-sm font-medium text-orange-800 dark:text-orange-200 mb-4">
              <span className="mr-2">💰</span> Настройки оплаты
            </h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClasses}>Тип оплаты</label>
                  <select
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
                    {doctorForm.payment_type === 'percentage' ? 'Процент (%)' :
                     doctorForm.payment_type === 'hybrid' ? 'Фиксированная сумма' : 'Сумма'}
                  </label>
                  <div className="flex">
                    <input
                      type="number"
                      min="0"
                      max={doctorForm.payment_type === 'percentage' ? '100' : undefined}
                      step={doctorForm.payment_type === 'percentage' ? '0.1' : '1'}
                      value={doctorForm.payment_value ?? 0}
                      onChange={(e) => setDoctorForm({...doctorForm, payment_value: parseFloat(e.target.value) || 0})}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-l-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder={doctorForm.payment_type === 'percentage' ? '0.0' : '0'}
                    />
                    {doctorForm.payment_type === 'percentage' ? (
                      <span className="px-3 py-2 bg-gray-100 dark:bg-gray-600 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-lg text-gray-600 dark:text-gray-300">%</span>
                    ) : (
                      <select
                        value={doctorForm.currency || 'KZT'}
                        onChange={(e) => setDoctorForm({...doctorForm, currency: e.target.value})}
                        className="px-3 py-2 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="KZT">₸</option>
                        <option value="USD">$</option>
                        <option value="EUR">€</option>
                        <option value="RUB">₽</option>
                      </select>
                    )}
                  </div>
                  {doctorForm.payment_type === 'percentage' && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Укажите процент от общей выручки врача</p>
                  )}
                  {doctorForm.payment_type === 'fixed' && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Фиксированная оплата за период работы</p>
                  )}
                  {doctorForm.payment_type === 'hybrid' && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Фиксированная часть гибридной оплаты</p>
                  )}
                </div>
              </div>

              {doctorForm.payment_type === 'hybrid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClasses}>Процент от выручки</label>
                    <div className="flex">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={doctorForm.hybrid_percentage_value ?? 0}
                        onChange={(e) => setDoctorForm({...doctorForm, hybrid_percentage_value: parseFloat(e.target.value) || 0})}
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
          )}

          
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
