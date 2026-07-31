import React, { useState, useEffect } from 'react';
import { inputClasses } from '../modals/modalUtils';

const ServiceAutocomplete = ({ onAddService }) => {
  const [query, setQuery] = useState('');
  const [services, setServices] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [courseSettings, setCourseSettings] = useState({
    isCourse: false,
    durationDays: 7,
    frequencyPerDay: 2,
    paymentType: 'single'
  });

  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    if (query && query.length >= 2) {
      searchServices(query);
    } else {
      setServices([]);
    }
  }, [query]);

  const searchServices = async (searchQuery) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/service-prices?search=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setServices(data);
      }
    } catch (error) {
      console.error('Error searching services:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectService = (service) => {
    setSelectedService(service);
    setServices([]);
    setShowDropdown(false);
    // Не очищаем query, чтобы показать выбранную услугу
    setQuery(service.service_name);
  };

  const handleAddService = () => {
    if (!selectedService) return;

    const baseService = {
      service_id: selectedService.id,
      service_name: selectedService.service_name,
      price_per_unit: selectedService.price || 0,
    };

    if (courseSettings.isCourse) {
      // Курсовая услуга
      const totalProcedures = courseSettings.durationDays * courseSettings.frequencyPerDay;
      onAddService({
        ...baseService,
        quantity: totalProcedures,
        total_price: (selectedService.price || 0) * totalProcedures,
        is_course: true,
        quantity_total: totalProcedures,
        quantity_completed: 0,
        course_duration_days: courseSettings.durationDays,
        course_frequency_per_day: courseSettings.frequencyPerDay,
        sessions: [],
        payment_type: courseSettings.paymentType
      });
    } else {
      // Разовая услуга
      onAddService({
        ...baseService,
        quantity: 1,
        total_price: selectedService.price || 0,
        is_course: false
      });
    }

    // Сброс
    setQuery('');
    setSelectedService(null);
    setCourseSettings({
      isCourse: false,
      durationDays: 7,
      frequencyPerDay: 2,
      paymentType: 'single'
    });
  };

  const handleCancel = () => {
    setQuery('');
    setSelectedService(null);
    setCourseSettings({
      isCourse: false,
      durationDays: 7,
      frequencyPerDay: 2,
      paymentType: 'single'
    });
  };

  const totalProcedures = courseSettings.durationDays * courseSettings.frequencyPerDay;
  const totalPrice = selectedService ? (selectedService.price || 0) * (courseSettings.isCourse ? totalProcedures : 1) : 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selectedService) setSelectedService(null);
          }}
          onFocus={() => setShowDropdown(true)}
          className={inputClasses}
          placeholder="🔍 Начните вводить название услуги..."
          disabled={!!selectedService}
        />
        
        {loading && (
          <div className="absolute right-3 top-3">
            <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        )}
        
        {showDropdown && services.length > 0 && !selectedService && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {services.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => handleSelectService(service)}
                className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{service.service_name}</div>
                    {service.category && (
                      <div className="text-xs text-gray-500 mt-1">
                        {service.category}
                      </div>
                    )}
                  </div>
                  <div className="text-right ml-4">
                    <div className="font-semibold text-blue-600">
                      {service.price ? `${service.price.toLocaleString()} ₸` : 'Цена не указана'}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        
        {showDropdown && query.length >= 2 && services.length === 0 && !loading && !selectedService && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg px-4 py-3 text-gray-500 text-sm">
            Услуги не найдены. Попробуйте изменить запрос.
          </div>
        )}
      </div>

      {/* Форма настройки услуги */}
      {selectedService && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">{selectedService.service_name}</div>
              <div className="text-sm text-gray-600">
                {selectedService.price ? `${selectedService.price.toLocaleString()} ₸ за процедуру` : 'Цена не указана'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="text-gray-400 hover:text-red-600"
              title="Отменить"
            >
              ✕
            </button>
          </div>

          {/* Чекбокс "Это курс" */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isCourse"
              checked={courseSettings.isCourse}
              onChange={(e) => setCourseSettings({ ...courseSettings, isCourse: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isCourse" className="text-sm font-medium text-gray-700 cursor-pointer">
              🔄 Это курс (несколько процедур)
            </label>
          </div>

          {/* Настройки курса */}
          {courseSettings.isCourse && (
            <div className="space-y-3 pl-6 border-l-2 border-blue-300">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Длительность (дней)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={courseSettings.durationDays}
                    onChange={(e) => setCourseSettings({ ...courseSettings, durationDays: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Раз в день
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={courseSettings.frequencyPerDay}
                    onChange={(e) => setCourseSettings({ ...courseSettings, frequencyPerDay: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Тип оплаты
                </label>
                <select
                  value={courseSettings.paymentType}
                  onChange={(e) => setCourseSettings({ ...courseSettings, paymentType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="single">Оплата сразу за весь курс</option>
                  <option value="per_session">Оплата за каждую процедуру</option>
                </select>
              </div>

              <div className="bg-white rounded p-2 text-sm">
                <div className="text-gray-600">Всего процедур: <span className="font-semibold text-gray-900">{totalProcedures}</span></div>
                <div className="text-gray-600">Стоимость курса: <span className="font-semibold text-blue-600">{totalPrice.toLocaleString()} ₸</span></div>
              </div>
            </div>
          )}

          {/* Кнопка добавить */}
          <button
            type="button"
            onClick={handleAddService}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            ✓ Добавить {courseSettings.isCourse ? 'курс' : 'услугу'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ServiceAutocomplete;