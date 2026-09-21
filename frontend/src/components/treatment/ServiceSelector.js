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
  const [availByDate, setAvailByDate] = useState({}); // date -> availability(complex)
  const [selSlots, setSelSlots] = useState({});       // "serviceId:doctorId" -> {date, start, end}
  const [selDoctors, setSelDoctors] = useState({});   // "serviceId" -> doctor_id

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

  const ensureAvailability = async (date) => {
    if (!selectedService || !date) return null;
    if (availByDate[date]) return availByDate[date];
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`${API}/api/service-prices/${selectedService}/specialists-availability?date=${date}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const data = r.ok ? await r.json() : null;
      if (data) setAvailByDate(prev => ({ ...prev, [date]: data }));
      return data;
    } catch (error) {
      console.error('Error fetching availability:', error);
      return null;
    }
  };

  useEffect(() => {
    if (selectedServiceData?.service_type === 'complex') {
      ensureAvailability(new Date().toISOString().slice(0, 10));
    } else {
      setAvailByDate({});
      setSelSlots({});
    }
  }, [selectedService]);

  // Конец по умолчанию = начало + 30 минут
  const defaultEndTime = (start) => {
    if (!start) return '';
    const [hh, mm] = start.split(':').map(Number);
    const dt = new Date();
    dt.setHours(hh, mm + 30, 0, 0);
    return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  };

  // Специалисты комплекса из самой свежей загруженной доступности (по любой дате)
  const availabilityServices = () => {
    if (!availByDate) return [];
    const all = Object.values(availByDate);
    if (!all.length) return [];
    return all[all.length - 1].services || [];
  };

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

    // Для комплекса собираем выбранные слоты специалистов (у каждого своя дата и окно времени)
    let scheduling = null;
    if (service.service_type === 'complex') {
      const today = new Date().toISOString().slice(0, 10);
      const slots = Object.entries(selSlots)
        .filter(([, sl]) => sl && sl.start)
        .map(([k, sl]) => {
          const parts = k.split(':');
          const svcId = parts[0];
          const did = parts[1];
          const date = sl.date || today; // дата не менялась явно — берём сегодня
          const svc = availByDate[date]?.services?.find(x => x.service_id === svcId);
          const doc = svc?.doctors?.find(d => d.doctor_id === did);
          const end = sl.end || defaultEndTime(sl.start);
          return {
            doctor_id: did,
            doctor_name: doc?.doctor_name || '',
            service_id: svcId,
            service_name: svc?.service_name || service.components?.find(c => c.service_id === svcId)?.service_name || service.name,
            date,
            start_time: sl.start,
            end_time: end,
          };
        });
      scheduling = { slots };
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
        ? {
            is_complex: true,
            // штампуем выбранного при добавлении врача в компоненты (для зарплаты/печати)
            components: (service.components || []).map((c) => {
              const entry = Object.entries(selSlots).find(([k, sl]) => sl && sl.start && k.startsWith(`${service.id}:${c.service_id}:`));
              const did = entry ? entry[0].split(':')[2] : null;
              return did ? { ...c, doctor_id: did } : c;
            }),
            ...(scheduling ? { scheduling } : {}),
          }
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
              <div className="font-medium text-sm text-gray-800">📅 Расписание специалистов комплекса — по каждой услуге своя дата и время</div>
              {(() => {
                const today = new Date().toISOString().slice(0, 10);
                const rows = availabilityServices();
                if (rows.length === 0) return <p className="text-xs text-gray-500 mt-1">Загрузка доступности…</p>;
                return (
                  <div className="space-y-2 mt-1">
                    {rows.map((svc) => {
                      const doctorId = selDoctors[svc.service_id] || svc.doctors?.[0]?.doctor_id || '';
                      const key = `${svc.service_id}:${doctorId}`;
                      const sl = selSlots[key] || { date: today, start: '', end: '' };
                      const date = sl.date || today;
                      const dateAvail = availByDate[date];
                      const svcForDate = dateAvail?.services?.find(x => x.service_id === svc.service_id);
                      const doc = svcForDate?.doctors?.find(d => d.doctor_id === doctorId) || null;
                      const times = doc ? freeTimesFor(doc) : [];
                      return (
                        <div key={svc.service_id} className="bg-white border border-gray-200 rounded p-2">
                          <div className="text-sm font-medium">{svc.service_name}{svc.quantity && svc.quantity > 1 ? ` ×${svc.quantity}` : ''}</div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <label className="text-[10px] text-gray-500">Врач</label>
                            <select
                              value={doctorId}
                              onChange={(e) => { const d = e.target.value; setSelDoctors(prev => ({ ...prev, [svc.service_id]: d })); const kk = `${svc.service_id}:${d}`; setSelSlots(prev => ({ ...prev, [kk]: prev[key] || { date: today, start: '', end: '' } })); }}
                              className="flex-1 min-w-0 px-1.5 py-1 border border-gray-300 rounded text-sm"
                            >
                              <option value="">—</option>
                              {(svc.doctors || []).map(doc => (
                                <option key={doc.doctor_id} value={doc.doctor_id}>{doc.doctor_name}{doc.has_schedule ? ` (${doc.schedule_start}-${doc.schedule_end})` : ''}{doc.working_days && doc.working_days.length ? ` · работает: ${doc.working_days.join(', ')}` : ''}</option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 mt-1">
                            <label className="text-[10px] text-gray-500">Дата</label>
                            <label className="text-[10px] text-gray-500">С</label>
                            <label className="text-[10px] text-gray-500">До</label>
                            <input
                              type="date"
                              value={date}
                              onChange={(e) => { const dd = e.target.value; setSelSlots(prev => ({ ...prev, [key]: { ...(prev[key] || {}), date: dd } })); ensureAvailability(dd); }}
                              className="w-full px-1.5 py-1 border border-gray-300 rounded text-sm"
                            />
                            {doc && doc.has_schedule ? (
                              <select
                                value={sl.start}
                                onChange={(e) => setSelSlots(prev => ({ ...prev, [key]: { ...(prev[key] || {}), start: e.target.value, end: defaultEndTime(e.target.value) } }))}
                                className="w-full px-1.5 py-1 border border-gray-300 rounded text-sm"
                              >
                                <option value="">—</option>
                                {times.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            ) : (
                              <input
                                type="time"
                                value={sl.start}
                                onChange={(e) => setSelSlots(prev => ({ ...prev, [key]: { ...(prev[key] || {}), start: e.target.value, end: defaultEndTime(e.target.value) } }))}
                                className="w-full px-1.5 py-1 border border-gray-300 rounded text-sm"
                              />
                            )}
                            <input
                              type="time"
                              value={sl.end || defaultEndTime(sl.start)}
                              onChange={(e) => setSelSlots(prev => ({ ...prev, [key]: { ...(prev[key] || {}), end: e.target.value } }))}
                              className="w-full px-1.5 py-1 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          {doc && doc.has_schedule ? (
                            <div className="text-[10px] text-green-600 mt-0.5">окно {doc.schedule_start}-{doc.schedule_end}, занято: {doc.booked?.length || 0}</div>
                          ) : (
                            <div className="text-[10px] text-amber-600 mt-0.5">у врача нет расписания на {date} — выберите время вручную</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
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
