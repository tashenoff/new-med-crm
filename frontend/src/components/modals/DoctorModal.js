import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { inputClasses, selectClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses } from './modalUtils';

const DoctorModal = ({ 
  show, 
  onClose, 
  onSave, 
  doctorForm, 
  setDoctorForm, 
  editingItem, 
  loading, 
  errorMessage 
}) => {
  const [specialties, setSpecialties] = useState([]);
  
  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    if (show) {
      fetchSpecialties();
    }
  }, [show]);

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
            value={doctorForm.full_name}
            onChange={(e) => setDoctorForm({...doctorForm, full_name: e.target.value})}
            className={inputClasses}
            required
          />
          
          <div>
            <label className={labelClasses}>Специальность *</label>
            <select
              value={doctorForm.specialty}
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
            value={doctorForm.phone}
            onChange={(e) => setDoctorForm({...doctorForm, phone: e.target.value})}
            className={inputClasses}
            required
          />
          
          <input
            type="email"
            placeholder="Email"
            value={doctorForm.email}
            onChange={(e) => setDoctorForm({...doctorForm, email: e.target.value})}
            className={inputClasses}
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
                    value={doctorForm.payment_value || ''}
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