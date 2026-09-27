import React, { useState, useEffect, useMemo, useRef, memo } from 'react';

const PAGE_SIZE = 40;

// Селектор лабораторных анализов — по дизайну и логике как ServiceCheckboxSelector из конс-листа:
// поиск, скроллируемый список с ленивой подгрузкой (IntersectionObserver по 40), группировка
// по лаборатории, и блок «Выбранные анализы» + Итого + «Добавить».
const LabAnalysisPicker = memo(({ onAdd, disabled = false }) => {
  const API = import.meta.env.VITE_BACKEND_URL;
  const [analyzes, setAnalyzes] = useState([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState({});
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const mountedRef = useRef(true);
  const sentinelRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    const fetchAll = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const [labsRes, svcRes] = await Promise.all([
          fetch(`${API}/api/laboratories`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            signal: controller.signal
          }),
          fetch(`${API}/api/service-prices?active_only=true`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            signal: controller.signal
          })
        ]);
        const labs = labsRes.ok ? await labsRes.json() : [];
        const all = svcRes.ok ? await svcRes.json() : [];
        if (!mountedRef.current) return;
        const labIds = new Set(labs.filter(l => l.is_active ?? true).map(l => l.id));
        const list = (all || []).filter(s => s.laboratory_id && labIds.has(s.laboratory_id));
        const sorted = [...list].sort(
          (a, b) => (a.laboratory_name || '').localeCompare(b.laboratory_name || '')
            || (a.service_name || '').localeCompare(b.service_name || '')
        );
        setAnalyzes(sorted);
      } catch (e) {
        if (e.name === 'AbortError') return;
        console.error('Error fetching lab analyzes:', e);
        if (mountedRef.current) setError('Ошибка подключения к серверу');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };
    fetchAll();
    return () => { mountedRef.current = false; controller.abort(); };
  }, [API]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedQuery]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return analyzes;
    return analyzes.filter(a => (a.service_name || '').toLowerCase().includes(q));
  }, [analyzes, debouncedQuery]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = listRef.current;
    if (!sentinel || !root || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filtered.length));
        }
      },
      { root, rootMargin: '80px', threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, filtered.length, visible.length]);

  const grouped = useMemo(() => {
    const groups = {};
    for (const s of visible) {
      const key = s.laboratory_name || 'Без лаборатории';
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    return groups;
  }, [visible]);

  const selectedList = useMemo(() => Object.values(selected), [selected]);
  const selectedCount = selectedList.length;
  const totalPrice = selectedList.reduce((s, c) => s + (c.price || 0), 0);

  const toggleService = (service) => {
    setSelected(prev => {
      const next = { ...prev };
      if (next[service.id]) delete next[service.id];
      else next[service.id] = service;
      return next;
    });
  };

  const removeSelected = (id) => {
    setSelected(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleAdd = () => {
    if (selectedCount === 0) return;
    onAdd(selectedList);
    setSelected({});
    setQuery('');
    setDebouncedQuery('');
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <div className="space-y-3">
      {/* Поиск */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
          placeholder="Поиск по названию анализа..."
          disabled={disabled}
        />
        {loading && (
          <div className="absolute right-3 top-3">
            <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Список анализов с ленивой подгрузкой */}
      <div ref={listRef} className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
        {!loading && Object.keys(grouped).length === 0 && (
          <div className="px-4 py-3 text-sm text-gray-500">Анализы не найдены.</div>
        )}
        {Object.entries(grouped).map(([labName, services]) => (
          <div key={labName} className="border-b border-gray-100 last:border-b-0">
            <div className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wide sticky top-0">
              🧪 {labName}
            </div>
            {services.map((service) => {
              const isChecked = !!selected[service.id];
              return (
                <label
                  key={service.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-blue-50 transition-colors cursor-pointer border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={disabled}
                      onChange={() => toggleService(service)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm truncate">{service.service_name}</div>
                      {service.unit && (
                        <div className="text-xs text-gray-500">за {service.unit}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <div className="font-semibold text-blue-600 text-sm">
                      {service.price ? `${service.price.toLocaleString()} ₸` : 'Цена не указана'}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        ))}
        {hasMore && (
          <div ref={sentinelRef} className="px-3 py-2 text-xs text-gray-500 text-center">
            Загрузка… {visible.length} из {filtered.length}
          </div>
        )}
        {!hasMore && filtered.length > PAGE_SIZE && (
          <div className="px-3 py-2 text-xs text-gray-400 text-center">
            Все анализы загружены ({filtered.length})
          </div>
        )}
      </div>

      {/* Выбранные анализы + Итого */}
      {selectedCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <div className="font-medium text-gray-900">Выбранные анализы ({selectedCount})</div>
          {selectedList.map((a) => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="font-medium text-gray-900 text-sm">{a.service_name}</div>
                  <div className="text-xs text-gray-500">
                    {(a.price || 0).toLocaleString()} ₸{a.laboratory_name ? ` · ${a.laboratory_name}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeSelected(a.id)}
                  className="text-gray-400 hover:text-red-600 text-sm shrink-0"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
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
          Отметьте галочками нужные анализы из прайса лаборатории — их можно добавить все сразу.
        </p>
      )}
      {loading && selectedCount === 0 && (
        <p className="text-xs text-gray-500">Загрузка анализов из лабораторий...</p>
      )}
    </div>
  );
});

export default LabAnalysisPicker;
