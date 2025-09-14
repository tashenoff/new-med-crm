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
  
  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    if (show) {
      fetchSpecialties();
      fetchServices();
      // Загружаем существующие услуги врача при редактировании
      if (editingItem && editingItem.services) {
        setSelectedServices([...editingItem.services]);
      } else {
        setSelectedServices([]);
      }
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

  // Обработчик для изменения услуг
  const handleServiceToggle = (serviceId) => {
    setSelectedServices(prev => {
      const newSelected = prev.includes(serviceId) 
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId];
      
      return newSelected;
    });
  };

  // Синхронизируем выбранные услуги с формой врача
  React.useEffect(() => {
    setDoctorForm(prevForm => ({
      ...prevForm,
      services: selectedServices
    }));
  }, [selectedServices, setDoctorForm]);

  if (!show) return null;

  return (
    <Modal 
      show={show} 
      onClose={onClose}
      title={editingItem ? 'Редактировать врача' : 'Новый врач'}
      errorMessage={errorMessage}
      size="max-w-md"
    >
        
        <form onSubmit={onSave} className="space-y-4">
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
              onChange={(e) => setDoctorForm({...doctorForm, specialty: e.target.value})}
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
              Загружено специальностей: {specialties.length}
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

          {/* Настройки оплаты */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <h4 className="text-md font-semibold text-gray-800 dark:text-gray-200 mb-3">💰 Настройки оплаты</h4>
            
            <div className="space-y-3">
              <div>
                <label className={labelClasses}>Тип оплаты</label>
                <select
                  value={doctorForm.payment_type || 'percentage'}
                  onChange={(e) => setDoctorForm({...doctorForm, payment_type: e.target.value})}
                  className={inputClasses}
                >
                  <option value="percentage">Процент от выручки</option>
                  <option value="fixed">Фиксированная оплата</option>
                </select>
              </div>

              <div>
                <label className={labelClasses}>
                  {doctorForm.payment_type === 'percentage' ? 'Процент (%)' : 'Сумма'}
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
              </div>
            </div>
          </div>
          
          {/* Блок выбора услуг */}
          <div className="space-y-3">
            <label className={labelClasses}>
              Услуги врача 
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                (для расчета зарплаты с планов лечения)
              </span>
            </label>
            
            {services.length > 0 ? (
              <div className="max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
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
                      <div className="px-3 py-2 space-y-1">
                        {servicesByCategory[category].map(service => (
                          <label key={service.id} className="flex items-center space-x-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedServices.includes(service.id)}
                              onChange={() => handleServiceToggle(service.id)}
                              className="text-blue-600 dark:text-blue-400 rounded"
                            />
                            <span className="text-gray-900 dark:text-white">{service.service_name}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              ({service.price.toLocaleString()} ₸)
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800">
                📋 Услуги не найдены. Создайте услуги в разделе "Справочники" → "Ценовая политика"
              </div>
            )}
            
            {selectedServices.length > 0 && (
              <div className="text-xs text-green-600 dark:text-green-400">
                ✅ Выбрано услуг: {selectedServices.length}
              </div>
            )}
          </div>
          
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