import { LoadingSpinner } from '../common/LoadingIndicator';
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
      category: selectedService.category || '',  // Категория из прайса (specialties)
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
            <LoadingSpinner size="sm" />
          </div>
        )}
        
        {showDropdown && services.length > 0 && !selectedService && (
          <div className="absolute z-10 w-full mt-1 bg-curai-surface border border-curai-control rounded-md shadow-none max-h-60 overflow-y-auto">
            {services.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => handleSelectService(service)}
                className="w-full text-left px-4 py-3 hover:bg-curai-selected border-b border-curai-border last:border-b-0 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium text-curai-ink">{service.service_name}</div>
                    {service.category && (
                      <div className="text-xs text-curai-muted mt-1">
                        {service.category}
                      </div>
                    )}
                  </div>
                  <div className="text-right ml-4">
                    <div className="font-semibold text-curai-blue">
                      {service.price ? `${service.price.toLocaleString()} ₸` : 'Цена не указана'}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        
        {showDropdown && query.length >= 2 && services.length === 0 && !loading && !selectedService && (
          <div className="absolute z-10 w-full mt-1 bg-curai-surface border border-curai-control rounded-md shadow-none px-4 py-3 text-curai-muted text-sm">
            Услуги не найдены. Попробуйте изменить запрос.
          </div>
        )}
      </div>

      {/* Форма настройки услуги */}
      {selectedService && (
        <div className="bg-curai-selected border border-curai-control rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-curai-ink">{selectedService.service_name}</div>
              <div className="text-sm text-curai-muted">
                {selectedService.price ? `${selectedService.price.toLocaleString()} ₸ за процедуру` : 'Цена не указана'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="text-curai-muted hover:text-curai-negative"
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
              className="w-4 h-4 text-curai-blue border-curai-control rounded focus:ring-curai-focus"
            />
            <label htmlFor="isCourse" className="text-sm font-medium text-curai-ink cursor-pointer">
              🔄 Это курс (несколько процедур)
            </label>
          </div>

          {/* Настройки курса */}
          {courseSettings.isCourse && (
            <div className="space-y-3 pl-6 border-l-2 border-curai-control">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-curai-ink mb-1">
                    Длительность (дней)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={courseSettings.durationDays}
                    onChange={(e) => setCourseSettings({ ...courseSettings, durationDays: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus focus:border-curai-control"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-curai-ink mb-1">
                    Раз в день
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={courseSettings.frequencyPerDay}
                    onChange={(e) => setCourseSettings({ ...courseSettings, frequencyPerDay: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus focus:border-curai-control"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-curai-ink mb-1">
                  Тип оплаты
                </label>
                <select
                  value={courseSettings.paymentType}
                  onChange={(e) => setCourseSettings({ ...courseSettings, paymentType: e.target.value })}
                  className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus focus:border-curai-control"
                >
                  <option value="single">Оплата сразу за весь курс</option>
                  <option value="per_session">Оплата за каждую процедуру</option>
                </select>
              </div>

              <div className="bg-curai-surface rounded p-2 text-sm">
                <div className="text-curai-muted">Всего процедур: <span className="font-semibold text-curai-ink">{totalProcedures}</span></div>
                <div className="text-curai-muted">Стоимость курса: <span className="font-semibold text-curai-blue">{totalPrice.toLocaleString()} ₸</span></div>
              </div>
            </div>
          )}

          {/* Кнопка добавить */}
          <button
            type="button"
            onClick={handleAddService}
            className="w-full bg-curai-positive hover:bg-curai-positive text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            ✓ Добавить {courseSettings.isCourse ? 'курс' : 'услугу'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ServiceAutocomplete;