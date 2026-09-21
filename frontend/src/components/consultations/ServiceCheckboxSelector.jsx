import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
import { inputClasses } from '../modals/modalUtils';

const PAGE_SIZE = 40;

const ServiceCheckboxSelector = ({ onAddServices, alreadyAddedIds = [], disabled = false }) => {
  const [allServices, setAllServices] = useState([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState({});
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const mountedRef = useRef(true);
  const sentinelRef = useRef(null);
  const listRef = useRef(null);

  const API = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    const fetchAllServices = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const response = await fetch(`${API}/api/service-prices?active_only=true`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });
        if (!response.ok) {
          if (mountedRef.current) setError('Ошибка при получении списка услуг');
          return;
        }
        const data = await response.json();
        if (!mountedRef.current) return;
        const sorted = [...data].sort(
          (a, b) =>
            (a.category || '').localeCompare(b.category || '') ||
            (a.service_name || '').localeCompare(b.service_name || '')
        );
        setAllServices(sorted);
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.error('Error fetching services:', e);
        if (mountedRef.current) setError('Ошибка подключения к серверу');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    fetchAllServices();
    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [API]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedQuery]);

  const filteredServices = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return allServices;
    return allServices.filter((s) => (s.service_name || '').toLowerCase().includes(q));
  }, [allServices, debouncedQuery]);

  const visibleServices = useMemo(
    () => filteredServices.slice(0, visibleCount),
    [filteredServices, visibleCount]
  );

  const hasMore = visibleCount < filteredServices.length;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = listRef.current;
    if (!sentinel || !root || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredServices.length));
        }
      },
      { root, rootMargin: '80px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, filteredServices.length, visibleServices.length]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const s of visibleServices) {
      const cat = s.category || 'Без категории';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    }
    return groups;
  }, [visibleServices]);

  const selectedList = useMemo(() => Object.values(selected), [selected]);
  const selectedCount = selectedList.length;
  const [selDate, setSelDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [availMap, setAvailMap] = useState({});       // complexId -> availability
  const [selTimes, setSelTimes] = useState({});       // "complexId:doctorId" -> chosen time
  const alreadyAddedKey = Array.isArray(alreadyAddedIds) ? alreadyAddedIds.join(',') : '';
  const alreadyAddedSet = useMemo(
    () => new Set(alreadyAddedKey ? alreadyAddedKey.split(',') : []),
    [alreadyAddedKey]
  );

  const toggleService = (service) => {
    if (alreadyAddedSet.has(service.id)) return;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[service.id]) {
        delete next[service.id];
      } else {
        next[service.id] = {
          service,
          quantity: 1,
          isCourse: false,
          durationDays: 7,
          frequencyPerDay: 2,
          paymentType: 'single'
        };
      }
      return next;
    });
  };

  const updateSetting = (id, key, value) => {
    setSelected((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };

  const removeSelected = (id) => {
    setSelected((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const getEffectiveCount = (cfg) => {
    if (cfg.isCourse) return (cfg.durationDays || 1) * (cfg.frequencyPerDay || 1);
    return cfg.quantity || 1;
  };

  const getLineTotal = (cfg) => (cfg.service.price || 0) * getEffectiveCount(cfg);
  const totalPrice = selectedList.reduce((sum, cfg) => sum + getLineTotal(cfg), 0);

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

  const fetchComplexAvailability = async (complexId) => {
    if (!complexId || !selDate) return;
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`${API}/api/service-prices/${complexId}/specialists-availability?date=${selDate}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (r.ok) {
        const data = await r.json();
        setAvailMap(prev => ({ ...prev, [complexId]: data }));
      }
    } catch (e) {
      console.error('Error fetching availability:', e);
    }
  };

  const selectedComplexes = useMemo(() => selectedList.filter(cfg => cfg.service.service_type === 'complex'), [selectedList, selectedCount]);

  useEffect(() => {
    selectedComplexes.forEach(cfg => fetchComplexAvailability(cfg.service.id));
  }, [selDate, selectedComplexes.map(c => c.service.id).join(',')]);

  const handleAdd = () => {
    if (selectedCount === 0) return;
    const servicesToAdd = selectedList.map((cfg) => {
      const base = {
        service_id: cfg.service.id,
        service_name: cfg.service.service_name,
        category: cfg.service.category || '',
        price_per_unit: cfg.service.price || 0,
        ...(cfg.service.service_type === 'complex'
          ? { is_complex: true, components: cfg.service.components || [] }
          : {})
      };
      if (cfg.isCourse) {
        const totalProcedures = (cfg.durationDays || 1) * (cfg.frequencyPerDay || 1);
        return {
          ...base,
          quantity: totalProcedures,
          total_price: (cfg.service.price || 0) * totalProcedures,
          is_course: true,
          quantity_total: totalProcedures,
          quantity_completed: 0,
          course_duration_days: cfg.durationDays || 1,
          course_frequency_per_day: cfg.frequencyPerDay || 1,
          sessions: [],
          payment_type: cfg.paymentType
        };
      }
      // Для комплексной услуги — выбранные слоты специалистов
      let scheduling = null;
      if (cfg.service.service_type === 'complex') {
        const avail = availMap[cfg.service.id];
        const slots = Object.entries(selTimes)
          .filter(([k, t]) => t && k.startsWith(cfg.service.id + ':'))
          .map(([k, time]) => {
            const doctorId = k.split(':')[1];
            const spec = avail?.specialists?.find(sp => sp.doctor_id === doctorId);
            return {
              doctor_id: doctorId,
              doctor_name: spec?.doctor_name || '',
              service_id: spec?.service_id || cfg.service.id,
              service_name: spec?.service_name || cfg.service.service_name,
              time
            };
          });
        scheduling = { date: selDate, slots };
      }
      return {
        ...base,
        quantity: cfg.quantity || 1,
        total_price: (cfg.service.price || 0) * (cfg.quantity || 1),
        is_course: false,
        ...(scheduling ? { scheduling } : {})
      };
    });
    onAddServices(servicesToAdd);
    setSelected({});
    setQuery('');
  };
  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={inputClasses}
          placeholder="Поиск по названию услуги..."
          disabled={disabled}
        />
        {loading && (
          <div className="absolute right-3 top-3">
            <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div ref={listRef} className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
        {!loading && Object.keys(grouped).length === 0 && (
          <div className="px-4 py-3 text-sm text-gray-500">Услуги не найдены.</div>
        )}
        {Object.entries(grouped).map(([category, services]) => (
          <div key={category} className="border-b border-gray-100 last:border-b-0">
            <div className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wide sticky top-0">
              {category}
            </div>
            {services.map((service) => {
              const isAdded = alreadyAddedSet.has(service.id);
              const isChecked = !!selected[service.id];
              return (
                <label
                  key={service.id}
                  className={`flex items-center justify-between px-3 py-2 hover:bg-blue-50 transition-colors cursor-pointer border-b border-gray-100 last:border-b-0 ${
                    isAdded ? 'bg-gray-50 cursor-not-allowed' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isAdded || disabled}
                      onChange={() => toggleService(service)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-gray-900 text-sm truncate ${isAdded ? 'line-through text-gray-400' : ''}`}>
                        {service.service_name}
                      </div>
                      {service.service_type === 'complex' && (
                        <div className="text-xs text-purple-600">
                          <div>🧩 Комплекс:</div>
                          <ul className="list-disc pl-3 mt-0.5 space-y-0.5">
                            {service.components && service.components.length
                              ? service.components.map(c => (
                                  <li key={c.service_id || c.service_name}>
                                    {c.service_name}{c.quantity && c.quantity > 1 ? ` ×${c.quantity}` : ''}{c.price ? ` — ${c.price.toLocaleString()} ₸` : ''}
                                  </li>
                                ))
                              : <li>состав пуст</li>}
                          </ul>
                        </div>
                      )}
                      {service.unit && (
                        <div className="text-xs text-gray-500">{formatUnit(service.unit)}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <div className="font-semibold text-blue-600 text-sm">
                      {service.price ? `${service.price.toLocaleString()} ₸` : 'Цена не указана'}
                    </div>
                    {isAdded && <div className="text-xs text-green-600 font-medium">добавлена</div>}
                  </div>
                </label>
              );
            })}
          </div>
        ))}
        {hasMore && (
          <div ref={sentinelRef} className="px-3 py-2 text-xs text-gray-500 text-center">
            Загрузка… {visibleServices.length} из {filteredServices.length}
          </div>
        )}
        {!hasMore && filteredServices.length > PAGE_SIZE && (
          <div className="px-3 py-2 text-xs text-gray-400 text-center">
            Все услуги загружены ({filteredServices.length})
          </div>
        )}
      </div>
      {selectedCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <div className="font-medium text-gray-900">Выбранные услуги ({selectedCount})</div>
          {selectedList.map((cfg) => {
            const count = getEffectiveCount(cfg);
            return (
              <div key={cfg.service.id} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="font-medium text-gray-900 text-sm">{cfg.service.service_name}</div>
                    <div className="text-xs text-gray-500">
                      {cfg.service.price
                        ? `${cfg.service.price.toLocaleString()} ₸ × ${count} = ${getLineTotal(cfg).toLocaleString()} ₸`
                        : 'Цена не указана'}
                    </div>
                    {cfg.service.service_type === 'complex' && (
                      <div className="text-xs text-purple-600">
                        <div>🧩 Что входит:</div>
                        <ul className="list-disc pl-3 mt-0.5 space-y-0.5">
                          {cfg.service.components && cfg.service.components.length
                            ? cfg.service.components.map(c => (
                                <li key={c.service_id || c.service_name}>
                                  {c.service_name}{c.quantity && c.quantity > 1 ? ` ×${c.quantity}` : ''}{c.price ? ` — ${c.price.toLocaleString()} ₸` : ''}
                                </li>
                              ))
                            : <li>—</li>}
                        </ul>
                      </div>
                    )}
                    {cfg.service.service_type === 'complex' && (
                      <div className="mt-1 bg-blue-50 border border-blue-200 rounded p-2 text-xs">
                        <div className="font-medium text-gray-800">📅 Расписание специалистов</div>
                        <input
                          type="date"
                          value={selDate}
                          onChange={(e) => setSelDate(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm mt-1"
                        />
                        {(() => {
                          const avail = availMap[cfg.service.id];
                          if (!avail) return <div className="text-gray-500 mt-1">Загрузка доступности…</div>;
                          if (!avail.specialists || avail.specialists.length === 0)
                            return <div className="text-amber-600 mt-1">У специалистов состава нет данных — укажите врача вручную при записи.</div>;
                          return (
                            <div className="space-y-1.5 mt-1">
                              {avail.specialists.map((spec) => {
                                const key = `${cfg.service.id}:${spec.doctor_id}`;
                                const times = freeTimesFor(spec);
                                return (
                                  <div key={key} className="bg-white border border-gray-200 rounded p-1.5">
                                    <div className="flex items-center justify-between">
                                      <div className="font-medium">{spec.doctor_name || 'Без имени'}</div>
                                      {spec.has_schedule
                                        ? <span className="text-green-600">{spec.schedule_start}-{spec.schedule_end}</span>
                                        : <span className="text-amber-600">нет расписания — вручную</span>}
                                    </div>
                                    <div className="text-gray-500">{spec.service_name}{spec.quantity && spec.quantity > 1 ? ` ×${spec.quantity}` : ''}</div>
                                    {spec.has_schedule ? (
                                      <select
                                        value={selTimes[key] || ''}
                                        onChange={(e) => setSelTimes(prev => ({ ...prev, [key]: e.target.value }))}
                                        className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                      >
                                        <option value="">Выберите время</option>
                                        {times.map(t => <option key={t} value={t}>{t}</option>)}
                                      </select>
                                    ) : (
                                      <input
                                        type="time"
                                        value={selTimes[key] || ''}
                                        onChange={(e) => setSelTimes(prev => ({ ...prev, [key]: e.target.value }))}
                                        className="w-full mt-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSelected(cfg.service.id)}
                    className="text-gray-400 hover:text-red-600 text-sm shrink-0"
                  >
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Количество</label>
                    <input
                      type="number"
                      min="1"
                      value={cfg.quantity}
                      disabled={cfg.isCourse}
                      onChange={(e) => updateSetting(cfg.service.id, 'quantity', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Итого</label>
                    <div className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium">
                      {getLineTotal(cfg).toLocaleString()} ₸
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`isCourse-${cfg.service.id}`}
                    checked={cfg.isCourse}
                    onChange={(e) => updateSetting(cfg.service.id, 'isCourse', e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                  />
                  <label htmlFor={`isCourse-${cfg.service.id}`} className="text-sm font-medium text-gray-700 cursor-pointer">
                    Это курс (несколько процедур)
                  </label>
                </div>

                {cfg.isCourse && (
                  <div className="space-y-3 pl-2 border-l-2 border-blue-300">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Длительность (дней)</label>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={cfg.durationDays}
                          onChange={(e) => updateSetting(cfg.service.id, 'durationDays', parseInt(e.target.value) || 1)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Раз в день</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={cfg.frequencyPerDay}
                          onChange={(e) => updateSetting(cfg.service.id, 'frequencyPerDay', parseInt(e.target.value) || 1)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Тип оплаты</label>
                      <select
                        value={cfg.paymentType}
                        onChange={(e) => updateSetting(cfg.service.id, 'paymentType', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="single">Оплата сразу за весь курс</option>
                        <option value="per_session">Оплата за каждую процедуру</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-2 border-t border-blue-200">
            <div className="text-gray-700">
              Итого: <span className="font-semibold text-blue-600">{totalPrice.toLocaleString()} ₸</span>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={disabled}
              className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50"
            >
              Добавить {selectedCount}
            </button>
          </div>
        </div>
      )}
      {!loading && selectedCount === 0 && (
        <p className="text-xs text-gray-500">
          Отметьте галочками нужные услуги из прайса — их можно добавить все сразу.
        </p>
      )}
      {loading && selectedCount === 0 && (
        <p className="text-xs text-gray-500">Загрузка услуг из прайса...</p>
      )}
    </div>
  );
};

const UNIT_PREPOSITIONAL = {
  процедура: 'процедуру',
  час: 'час',
  зуб: 'зуб',
  сеанс: 'сеанс',
  услуга: 'услугу',
  консультация: 'консультацию'
};

function formatUnit(unit) {
  if (!unit) return '';
  const key = String(unit).trim().toLowerCase();
  const declined = UNIT_PREPOSITIONAL[key] || unit;
  return `за ${declined}`;
}

export default memo(ServiceCheckboxSelector);


