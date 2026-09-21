import React, { useState, useEffect } from 'react';
import ToothChart from '../dental/ToothChart';

const ServiceSelector = ({ onServiceAdd, selectedPatient }) => {
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [selectedTeeth, setSelectedTeeth] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [apptDate, setApptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [availability, setAvailability] = useState(null);
  const [slotTimes, setSlotTimes] = useState({}); // doctor_id -> выбранное время

  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      fetchServices(selectedCategory);
    }
  }, [selectedCategory]);

  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/service-categories`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        // API возвращает массив объектов ServiceCategory [{id, name, ...}]
        const categoryNames = data.map(cat => cat.name);
        setCategories(categoryNames);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchAvailability = async () => {
    if (!selectedService || !apptDate) return;
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`${API}/api/service-prices/${selectedService}/specialists-availability?date=${apptDate}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      setAvailability(r.ok ? await r.json() : null);
    } catch (error) {
      console.error('Error fetching availability:', error);
      setAvailability(null);
    }
  };

  useEffect(() => {
    if (selectedServiceData?.service_type === 'complex') {
      fetchAvailability();
    } else {
      setAvailability(null);
      setSlotTimes({});
    }
  }, [selectedService, apptDate]);

  // Свободные 30-минутные слоты в окне расписания минус занятые; [] если расписания нет
  const freeTimesFor = (spec) => {
    if (!spec.has_schedule || !spec.schedule_start || !spec.schedule_end) return [];
    const booked = new Set(spec.booked || []);
    const times = [];
    let cur = spec.schedule_start;
    const end = spec.schedule_end;
    while (cur < end) {
      if (!booked.has(cur)) times.push(cur);
      const [hh, mm] = cur.split(':').map(Number);
      const dt = new Date();
      dt.setHours(hh, mm + 30, 0, 0);
      cur = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    }
    return times;
  };

  const fetchServices = async (category) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/service-prices?category=${encodeURIComponent(category)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        // Преобразуем данные из справочника цен в формат услуг
        const transformedServices = data.map(servicePrice => ({
          id: servicePrice.id,
          name: servicePrice.service_name,
          code: servicePrice.service_code || '',
          category: servicePrice.category,
          price: servicePrice.price,
          unit: servicePrice.unit || 'процедура',
          description: servicePrice.description || '',
          service_type: servicePrice.service_type || 'regular',
          components: servicePrice.components || []
        }));
        
        setServices(transformedServices);
      }
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const selectedServiceData = services.find(s => s.id === selectedService);
  const isToothService = selectedServiceData?.unit === 'зуб';
  const finalQuantity = isToothService ? selectedTeeth.length : quantity;
  
  // Безопасный расчет цены с проверками на undefined
  const basePrice = selectedServiceData?.price || 0;
  const safeQuantity = finalQuantity || 1;
  const safeDiscount = discount || 0;
  const totalPrice = basePrice * safeQuantity * (1 - safeDiscount / 100);

  const handleAddService = () => {
    if (!selectedService) return;
    
    const service = services.find(s => s.id === selectedService);
    if (!service) return;

    // Проверка на выбор зубов для услуг по зубам
    if (isToothService && selectedTeeth.length === 0) {
      alert('Выберите зубы для данной услуги');
      return;
    }

    // Для комплекса собираем выбранные слоты специалистов
    let scheduling = null;
    if (service.service_type === 'complex' && availability) {
      const slots = Object.entries(slotTimes)
        .filter(([, t]) => t)
        .map(([did, time]) => {
          const spec = availability.specialists.find(sp => sp.doctor_id === did);
          return {
            doctor_id: did,
            doctor_name: spec?.doctor_name || '',
            service_id: spec?.service_id || service.id,
            service_name: spec?.service_name || service.name,
            time,
          };
        });
      scheduling = { date: apptDate, slots };
    }

    const serviceToAdd = {
      service_id: service.id,
      service_name: service.name,
      category: service.category,
      unit: service.unit,
      teeth_numbers: isToothService ? selectedTeeth : null,
      unit_price: service.price || 0,
      price: service.price || 0, // Добавляем поле price для совместимости с расчетом зарплат
      quantity: finalQuantity || 1,
      discount: discount || 0, // Исправляем название поля
      total_price: totalPrice || 0,
      description: service.description || '',
      // Комплексная услуга: одна строка, состав встроен внутри (для зарплаты/печати)
      ...(service.service_type === 'complex'
        ? { is_complex: true, components: service.components || [], ...(scheduling ? { scheduling } : {}) }
        : {})
    };

    onServiceAdd(serviceToAdd);

    // Reset form
    setSelectedService('');
    setSelectedTeeth([]);
    setQuantity(1);
    setDiscount(0);
    setSlotTimes({});
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Категория услуг</label>
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setSelectedService('');
              setSelectedTeeth([]);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Выберите категорию</option>
            {categories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Услуга</label>
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={!selectedCategory}
          >
            <option value="">Выберите услугу</option>
            {services.map(service => (
              <option key={service.id} value={service.id}>
                {service.name} - {service.price} ₸
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tooth chart for dental services */}
      {isToothService && (
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            🦷 Выбор зубов для услуги: <span className="font-medium">{selectedServiceData.name}</span>
          </div>
          <ToothChart 
            selectedTeeth={selectedTeeth}
            onTeethSelect={setSelectedTeeth}
            multiSelect={true}
            disabled={false}
          />
          {selectedTeeth.length > 0 && (
            <div className="text-sm text-green-600">
              Выбрано зубов: {selectedTeeth.join(', ')} (всего: {selectedTeeth.length})
            </div>
          )}
        </div>
      )}

      {/* Service details and quantity */}
      {selectedServiceData && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h5 className="font-medium text-blue-800 mb-2 flex items-center">
            {selectedServiceData.name}
            {isToothService && (
              <span className="ml-2 px-2 py-1 bg-blue-200 text-blue-700 text-xs rounded-full">
                🦷 по зубам
              </span>
            )}
            {selectedServiceData.service_type === 'complex' && (
              <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                🧩 Комплекс
              </span>
            )}
          </h5>
          {selectedServiceData.service_type === 'complex' && (
            <div className="mb-3 p-2 bg-purple-50 rounded text-sm text-purple-700">
              <div className="font-medium">🧩 Что входит:</div>
              <ul className="list-disc pl-3 mt-1 space-y-0.5">
                {selectedServiceData.components && selectedServiceData.components.length
                  ? selectedServiceData.components.map(c => (
                      <li key={c.service_id || c.service_name}>
                        {c.service_name}{c.quantity && c.quantity > 1 ? ` ×${c.quantity}` : ''}{c.price ? ` — ${c.price.toLocaleString()} ₸` : ''}
                      </li>
                    ))
                  : <li>—</li>}
              </ul>
            </div>
          )}

          {selectedServiceData.service_type === 'complex' && (
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="font-medium text-sm text-gray-800">📅 Расписание специалистов комплекса</div>
              <label className="block text-xs text-gray-600 mt-1">Дата приёма</label>
              <input
                type="date"
                value={apptDate}
                onChange={(e) => setApptDate(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              />
              {!availability ? (
                <p className="text-xs text-gray-500 mt-2">Загрузка доступности…</p>
              ) : availability.specialists.length === 0 ? (
                <p className="text-xs text-amber-600 mt-2">У специалистов состава нет данных — укажите врача вручную при записи.</p>
              ) : (
                <div className="space-y-2 mt-2">
                  {availability.specialists.map((spec) => {
                    const times = freeTimesFor(spec);
                    return (
                      <div key={spec.doctor_id} className="bg-white border border-gray-200 rounded p-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">{spec.doctor_name || 'Без имени'}</div>
                          {spec.has_schedule ? (
                            <span className="text-xs text-green-600">{spec.schedule_start}-{spec.schedule_end}</span>
                          ) : (
                            <span className="text-xs text-amber-600">нет расписания — вручную</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {spec.service_name}{spec.quantity && spec.quantity > 1 ? ` ×${spec.quantity}` : ''}
                        </div>
                        {spec.has_schedule ? (
                          <select
                            value={slotTimes[spec.doctor_id] || ''}
                            onChange={(e) => setSlotTimes(prev => ({ ...prev, [spec.doctor_id]: e.target.value }))}
                            className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            <option value="">Выберите время</option>
                            {times.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        ) : (
                          <input
                            type="time"
                            value={slotTimes[spec.doctor_id] || ''}
                            onChange={(e) => setSlotTimes(prev => ({ ...prev, [spec.doctor_id]: e.target.value }))}
                            className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          
          {isToothService && (
            <div className="mb-3 p-2 bg-blue-100 rounded text-sm text-blue-700">
              💡 Для этой услуги выберите зубы на карте ниже. Цена будет рассчитана за каждый зуб: {selectedServiceData.price}₸ × количество зубов
            </div>
          )}
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {isToothService ? 'Количество (зубы)' : 'Количество'}
              </label>
              <input
                type="number"
                min="1"
                value={isToothService ? finalQuantity : quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                disabled={isToothService}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm ${isToothService ? 'bg-gray-100' : ''}`}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Скидка (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Итого</label>
              <div className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium">
                {(totalPrice || 0).toFixed(0)} ₸
              </div>
            </div>
          </div>
          
          <button
            type="button"
            onClick={handleAddService}
            className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Добавить в план
          </button>
        </div>
      )}
    </div>
  );
};

export default ServiceSelector;
