import React, { useState, useEffect } from 'react';
import ToothChart from '../dental/ToothChart';
import { nextWorkDate, autofillSlot, isBookableSlot, freeTimesFor, hasScheduleWindow } from '../../utils/scheduling';

const ServiceSelector = ({ onServiceAdd, selectedPatient, onlyComplex = false }) => {
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [selectedTeeth, setSelectedTeeth] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [availabilityByDate, setAvailabilityByDate] = useState({}); // date -> availability(complex)
  const [selSlots, setSelSlots] = useState({});       // service_id -> {date, start, end} (НЕ зависит от врача!)
  const [selDoctors, setSelDoctors] = useState({});   // service_id -> doctor_id
  const [selDates, setSelDates] = useState({});       // service_id -> выбранная дата (fiX: держать отдельно)
  const [oneDoctor, setOneDoctor] = useState(false);

  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
      if (onlyComplex) {
        // Режим «только комплексные услуги»: тянем их напрямую, без категорий
        fetchComplexServices();
      }
      fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onlyComplex]);

    useEffect(() => {
      if (!onlyComplex && selectedCategory) {
        fetchServices(selectedCategory);
      }
    }, [selectedCategory]);

    const fetchComplexServices = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API}/api/service-prices?service_type=complex`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
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
        console.error('Error fetching complex services:', error);
      }
    };

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

  const ensureAvailability = async (date, reload = false) => {
    if (!selectedService || !date) return null;
    if (!reload && availabilityByDate[date]) return availabilityByDate[date];
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`${API}/api/service-prices/${selectedService}/specialists-availability?date=${date}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const data = r.ok ? await r.json() : null;
      if (data) setAvailabilityByDate(prev => ({ ...prev, [date]: data }));
      return data;
    } catch (error) {
      console.error('Error fetching availability:', error);
      return null;
    }
  };

  useEffect(() => {
    setAvailabilityByDate({});
    setSelSlots({});
    setSelDates({});
    setSelDoctors({});
    setOneDoctor(false);
    if (selectedServiceData?.service_type === 'complex') {
      ensureAvailability(new Date().toISOString().slice(0, 10), true);
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

  const availabilityServices = () => {
    if (!availabilityByDate) return [];
    const all = Object.values(availabilityByDate);
    if (!all.length) return [];
    const availability = all[0];
    return oneDoctor
      ? [{ service_id: selectedService, service_name: selectedServiceData.name, doctors: availability.common_doctors || [] }]
      : availability.services || [];
  };

  const serviceForDate = (availability, serviceId) => oneDoctor
    ? { service_id: selectedService, service_name: selectedServiceData.name, doctors: availability?.common_doctors || [] }
    : availability?.services?.find(service => service.service_id === serviceId);

  // Эффективная дата слота: если юзер выбрал явно — она; иначе автоматически
    // ближайший рабочий день выставленного врача (решает случай «врач стоит по умолчанию,
    // а у него сегодня выходной» — дата должна сама перескочить без ручной смены).
    const effectiveDateFor = (svc) => {
      const today = new Date().toISOString().slice(0, 10);
      if (selDates[svc.service_id]) return selDates[svc.service_id];
      // данные услуги (список врачей) из любой загруженной доступности
      const anyDate = Object.values(availabilityByDate).find(a => oneDoctor || (a?.services || []).some(s => s.service_id === svc.service_id));
      const liveSvc = serviceForDate(anyDate, svc.service_id) || svc;
      const doctorId = selDoctors[svc.service_id] ?? liveSvc.doctors?.[0]?.doctor_id ?? '';
      const doctor = (liveSvc.doctors || []).find(x => x.doctor_id === doctorId);
      return nextWorkDate(doctor, today);
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
  useEffect(() => {
    if (selectedServiceData?.service_type !== 'complex') return;
    const rows = availabilityServices();
    const dates = new Set(rows.map(svc => effectiveDateFor(svc)));
    dates.forEach(date => {
      if (!availabilityByDate[date]) ensureAvailability(date);
    });
    setSelSlots(previous => {
      let updated = previous;
      rows.forEach(svc => {
        const date = effectiveDateFor(svc);
        const doctorId = selDoctors[svc.service_id] ?? svc.doctors?.[0]?.doctor_id ?? '';
        const doctor = serviceForDate(availabilityByDate[date], svc.service_id)?.doctors?.find(doc => doc.doctor_id === doctorId);
        if (!doctor) return;
        const slot = autofillSlot(previous[svc.service_id], doctor, date, freeTimesFor(doctor), defaultEndTime);
        if (slot !== previous[svc.service_id]) updated = { ...updated, [svc.service_id]: slot };
      });
      return updated;
    });
  }, [selectedService, availabilityByDate, selDoctors, selDates, oneDoctor]);
  const isToothService = selectedServiceData?.unit === 'зуб';
  const finalQuantity = isToothService ? selectedTeeth.length : quantity;
  
  // Безопасный расчет цены с проверками на undefined
  const basePrice = selectedServiceData?.price || 0;
  const safeQuantity = finalQuantity || 1;
  const safeDiscount = discount || 0;
  const totalPrice = basePrice * safeQuantity * (1 - safeDiscount / 100);

  const schedulingBlocked = selectedServiceData?.service_type === 'complex' && (() => {
    const rows = availabilityServices();
    if (!rows.length || (oneDoctor && !rows[0].doctors.length)) return true;
    if (!oneDoctor && selectedServiceData.components.some(component => !rows.some(row => row.service_id === component.service_id))) return true;
    return rows.some(svc => {
      if (!svc.doctors?.length) return true;
      const doctorId = selDoctors[svc.service_id] ?? svc.doctors?.[0]?.doctor_id ?? '';
      if (!doctorId) return false;
      const date = effectiveDateFor(svc);
      const doc = serviceForDate(availabilityByDate[date], svc.service_id)?.doctors?.find(doctor => doctor.doctor_id === doctorId);
      if (!hasScheduleWindow(doc)) return true;
      const slot = selSlots[svc.service_id];
      return !!slot?.start && (slot.date !== date || !isBookableSlot(doc, slot, freeTimesFor(doc), defaultEndTime));
    });
  })();

  const handleAddService = () => {
    if (!selectedService || schedulingBlocked) return;
    
    const service = services.find(s => s.id === selectedService);
    if (!service) return;

    // Проверка на выбор зубов для услуг по зубам
    if (isToothService && selectedTeeth.length === 0) {
      alert('Выберите зубы для данной услуги');
      return;
    }

    // Для комплекса собираем выбранные слоты специалистов (у каждого своя дата и время)
    let scheduling = null;
    if (service.service_type === 'complex') {
      const slots = Object.entries(selSlots)
        .filter(([key, sl]) => sl && sl.start && availabilityServices().some(svc => svc.service_id === key))
        .map(([k, sl]) => {
          const svcId = k; // ключ = service_id
                    const svcMeta = availabilityServices().find(svc => svc.service_id === svcId);
                    const did = selDoctors[svcId] ?? svcMeta?.doctors?.[0]?.doctor_id ?? '';
                    const date = effectiveDateFor(svcMeta); // ТОЧНАЯ выбранная/авто-рабочая дата
                    const svc = serviceForDate(availabilityByDate[date], svcId);
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
        }).filter(slot => slot.doctor_id);
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
              const key = oneDoctor ? service.id : c.service_id;
              const did = selDoctors[key] ?? availabilityServices().find(svc => svc.service_id === key)?.doctors?.[0]?.doctor_id;
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
    setSelSlots({});
    setSelDates({});
    setSelDoctors({});
  };

  return (
    <div className="space-y-4">
      <div className={`${onlyComplex ? '' : 'grid grid-cols-2 gap-4'}`}>
        {!onlyComplex && (
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
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{onlyComplex ? 'Комплексная услуга' : 'Услуга'}</label>
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={onlyComplex ? false : !selectedCategory}
          >
            <option value="">{onlyComplex ? 'Выберите комплексную услугу' : 'Выберите услугу'}</option>
            {services.map(service => (
              <option key={service.id} value={service.id}>
                {service.name} - {service.price} ₸
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tooth chart for dental services */}
      {!onlyComplex && isToothService && (
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
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="font-medium text-sm text-gray-800">📅 Расписание специалистов комплекса — по каждой услуге своя дата и время</div>
              <label className="flex items-center gap-2 text-sm mt-2">
                <input type="checkbox" checked={oneDoctor} onChange={(event) => {
                  setOneDoctor(event.target.checked);
                  setSelSlots({});
                  setSelDoctors({});
                  setSelDates({});
                }} />
                Весь комплекс одним специалистом
              </label>
              {(() => {
                const today = new Date().toISOString().slice(0, 10);
                const rows = availabilityServices();
                if (rows.length === 0) return <p className="text-xs text-gray-500 mt-1">Загрузка доступности…</p>;
                if (oneDoctor && !rows[0].doctors.length) return <p className="text-xs text-amber-600 mt-1">Нет врача, который делает весь комплекс целиком.</p>;
                return (
                  <div className="space-y-2 mt-1">
                    {rows.map((svc) => {
                                          const doctorId = selDoctors[svc.service_id] ?? svc.doctors?.[0]?.doctor_id ?? '';
                                          const key = svc.service_id; // ключ = service_id (дата НЕ зависит от врача)
                                          const selectedDate = effectiveDateFor(svc); // авто-рабочий день, если не выбрана явно
                                          const sl = selSlots[key] || {};
                                          const date = selectedDate;
                      const dateAvail = availabilityByDate[date];
                      const svcForDate = serviceForDate(dateAvail, svc.service_id);
                      const doc = svcForDate?.doctors?.find(d => d.doctor_id === doctorId) || null;
                      const times = doc ? freeTimesFor(doc) : [];
                      return (
                        <div key={svc.service_id} className="bg-white border border-gray-200 rounded p-2">
                          <div className="text-sm font-medium">{svc.service_name}{svc.quantity && svc.quantity > 1 ? ` ×${svc.quantity}` : ''}</div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <label className="text-[10px] text-gray-500">Врач</label>
                            <select
                                                          value={doctorId}
                                                          onChange={(e) => { const d = e.target.value; setSelDoctors(prev => ({ ...prev, [svc.service_id]: d }));
                                                            setSelSlots(prev => ({ ...prev, [svc.service_id]: { start: '', end: '' } }));
                                                            // Авто: если у выбранного врача сегодня нет приёма — подставляем его ближайший рабочий день
                                                            const today = new Date().toISOString().slice(0, 10);
                                                            if (d) {
                                                              const docInfo = (svc.doctors || []).find(x => x.doctor_id === d);
                                                              const nd = nextWorkDate(docInfo, today);
                                                              setSelDates(prev => ({ ...prev, [svc.service_id]: nd }));
                                                              setSelSlots(prev => ({ ...prev, [svc.service_id]: { date: nd, start: '', end: '' } }));
                                                              ensureAvailability(nd);
                                                            }
                                                          }}
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
                              onChange={(e) => { const dd = e.target.value; setSelDates(prev => ({ ...prev, [svc.service_id]: dd })); setSelSlots(prev => ({ ...prev, [svc.service_id]: { date: dd, start: '', end: '' } })); ensureAvailability(dd); }}
                              className="w-full px-1.5 py-1 border border-gray-300 rounded text-sm"
                            />
                            {doc && doc.has_schedule ? (
                              <select
                                value={sl.start || ''}
                                onChange={(e) => setSelSlots(prev => ({ ...prev, [svc.service_id]: { ...(prev[svc.service_id] || {}), start: e.target.value, end: defaultEndTime(e.target.value) } }))}
                                className="w-full px-1.5 py-1 border border-gray-300 rounded text-sm"
                              >
                                <option value="">—</option>
                                {times.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            ) : (
                              <input
                                type="time"
                                disabled
                                value={sl.start || ''}
                                onChange={(e) => setSelSlots(prev => ({ ...prev, [svc.service_id]: { ...(prev[svc.service_id] || {}), start: e.target.value, end: defaultEndTime(e.target.value) } }))}
                                className="w-full px-1.5 py-1 border border-gray-300 rounded text-sm"
                              />
                            )}
                            <input
                              type="time"
                              disabled
                              value={sl.end || defaultEndTime(sl.start) || ''}
                              onChange={(e) => setSelSlots(prev => ({ ...prev, [svc.service_id]: { ...(prev[svc.service_id] || {}), end: e.target.value } }))}
                              className="w-full px-1.5 py-1 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          {!dateAvail ? (
                            <div className="text-[10px] text-amber-600 mt-0.5">Загрузка доступности… Время пока недоступно.</div>
                          ) : !doc ? (
                            <div className="text-[10px] text-amber-600 mt-0.5">Выбранный врач недоступен на {date}.</div>
                          ) : doc.has_schedule ? (
                            <div className="text-[10px] text-green-600 mt-0.5">окно {doc.schedule_start}-{doc.schedule_end}, занято: {doc.booked?.length || 0}</div>
                          ) : (
                            <div className="text-[10px] text-amber-600 mt-0.5">у врача нет расписания на {date} — выберите другого врача или дату</div>
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
          
          <div className={`${onlyComplex ? 'grid grid-cols-1' : 'grid grid-cols-3 gap-4'}`}>
                      {!onlyComplex && (
                      <>
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
                      </>
                      )}
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
            disabled={schedulingBlocked}
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
