import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient, handleApiError } from '../../../api/config';

// Медиа/записи приходят относительным путём (/uploads/...) — на фронте это другой домен,
// поэтому превращаем в абсолютный адрес бэкенда.
const absMedia = (u) => (u && u.startsWith('/') ? `${import.meta.env.VITE_BACKEND_URL}${u}` : u);

const TelephonySection = () => {
  const [activeTab, setActiveTab] = useState('calls');
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all | inbound | outbound | missed
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContactKey, setSelectedContactKey] = useState(null);

  // Загрузка журнала звонков.
  const fetchCalls = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await apiClient.get('/telephony/calls', { params: { limit: 200 } });
      setCalls(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(handleApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  // Фильтрация по типу звонка.
  const filteredCalls = useMemo(() => {
    if (filter === 'all') return calls;
    if (filter === 'missed') {
      return calls.filter(c => c.status === 'missed' || c.disposition === 'missed' || c.disposition === 'no answer');
    }
    return calls.filter(c => c.direction === filter);
  }, [calls, filter]);

  // Группировка по нормализованному номеру.
  const contactGroups = useMemo(() => {
    const groups = new Map();
    filteredCalls.forEach((call) => {
      const key = normalizePhone(call.normalized_phone || call.phone_number) || '__empty';
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          phone: call.phone_number || call.normalized_phone || '',
          normalizedPhone: key === '__empty' ? '' : key,
          contactName: call.contact_name || '',
          calls: []
        });
      }
      const group = groups.get(key);
      group.calls.push(call);
      if (call.contact_name && !group.contactName) {
        group.contactName = call.contact_name;
      }
    });

    return Array.from(groups.values())
      .map((group) => {
        const sorted = [...group.calls].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const lastCall = sorted[0];
        const missedCount = group.calls.filter(c =>
          c.status === 'missed' || c.disposition === 'missed' || c.disposition === 'no answer'
        ).length;
        return {
          ...group,
          calls: sorted,
          lastCall,
          missedCount
        };
      })
      .sort((a, b) => new Date(b.lastCall?.created_at || 0) - new Date(a.lastCall?.created_at || 0));
  }, [filteredCalls]);

  // Поиск по контактам.
  const visibleGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return contactGroups;
    return contactGroups.filter(g =>
      (g.contactName || '').toLowerCase().includes(q) ||
      (g.phone || '').toLowerCase().includes(q) ||
      (g.normalizedPhone || '').toLowerCase().includes(q)
    );
  }, [contactGroups, searchQuery]);

  // Детальный вид контакта.
  const selectedGroup = useMemo(() =>
    contactGroups.find(g => g.key === selectedContactKey) || null,
  [contactGroups, selectedContactKey]);

  // Статистика из загруженных данных.
  const stats = useMemo(() => {
    const total = calls.length;
    const missed = calls.filter(c => c.status === 'missed' || c.disposition === 'missed' || c.disposition === 'no answer').length;
    const answered = calls.filter(c => c.status === 'answered' || c.disposition === 'answered').length;
    const totalDuration = calls.reduce((sum, c) => sum + (Number(c.duration) || 0), 0);
    const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;
    const conversionRate = total > 0 ? Math.round((answered / total) * 100) : 0;

    return {
      totalCalls: total,
      missedCalls: missed,
      averageDuration: formatDuration(avgDuration),
      conversionRate: `${conversionRate}%`
    };
  }, [calls]);

  // Экспорт в CSV ("Excel").
  const exportToCsv = useCallback(() => {
    const source = selectedGroup ? selectedGroup.calls : filteredCalls;
    const rows = source.map(c => ({
      Дата: formatDateTime(c.created_at),
      Номер: c.phone_number || c.normalized_phone || '',
      Направление: directionLabel(c.direction),
      Статус: statusLabel(c.status, c.disposition),
      Длительность: formatDuration(Number(c.duration) || 0),
      Запись: absMedia(c.recording_url) || ''
    }));

    if (rows.length === 0) return;

    const headers = Object.keys(rows[0]);
    const escape = (val) => {
      const str = String(val ?? '');
      if (str.includes(';') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const csv = [
      headers.join(';'),
      ...rows.map(row => headers.map(h => escape(row[h])).join(';'))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const suffix = selectedGroup
      ? (selectedGroup.contactName || selectedGroup.phone || selectedGroup.normalizedPhone || 'contact')
      : 'all';
    link.download = `telephony_calls_${suffix}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filteredCalls, selectedGroup]);

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              📞 API Телефонии
            </h2>
            <p className="text-gray-600 mt-1">Интеграция с телефонией для отслеживания звонков</p>
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
            <span>⚙️</span>
            Настройки API
          </button>
        </div>
      </div>
      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Всего звонков</p>
              <p className="text-3xl font-bold mt-1">{stats.totalCalls}</p>
            </div>
            <div className="text-4xl">📞</div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm">Пропущенных</p>
              <p className="text-3xl font-bold mt-1">{stats.missedCalls}</p>
            </div>
            <div className="text-4xl">📵</div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Средняя длительность</p>
              <p className="text-3xl font-bold mt-1">{stats.averageDuration}</p>
            </div>
            <div className="text-4xl">⏱️</div>
          </div>
        </div>
      </div>

      {/* Вкладки */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => { setActiveTab('calls'); setSelectedContactKey(null); }}
              className={`py-4 px-6 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'calls'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              📋 История звонков
            </button>
            <button
              onClick={() => { setActiveTab('settings'); setSelectedContactKey(null); }}
              className={`py-4 px-6 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'settings'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              ⚙️ Настройки
            </button>
            <button
              onClick={() => { setActiveTab('widgets'); setSelectedContactKey(null); }}
              className={`py-4 px-6 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'widgets'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              🧩 Виджеты
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'calls' && (
            <div className="space-y-4">
              {selectedGroup ? (
                <>
                  {/* Детальный вид контакта */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <button
                        onClick={() => setSelectedContactKey(null)}
                        className="text-blue-600 hover:text-blue-800 text-sm mb-1"
                      >
                        ← Назад к контактам
                      </button>
                      <h3 className="text-xl font-bold text-gray-900">
                        {selectedGroup.contactName || selectedGroup.phone || selectedGroup.normalizedPhone || 'Без номера'}
                      </h3>
                      {selectedGroup.contactName && (selectedGroup.phone || selectedGroup.normalizedPhone) && (
                        <p className="text-gray-600 text-sm">{selectedGroup.phone || selectedGroup.normalizedPhone}</p>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {selectedGroup.calls.length} {declineCalls(selectedGroup.calls.length)}
                    </div>
                  </div>

                  {selectedGroup.calls.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Время</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Номер</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Направление</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Длительность</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Запись</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {selectedGroup.calls.map((call) => (
                            <tr key={call.id || `${call.created_at}-${call.phone_number}`} className="hover:bg-gray-50">
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatDateTime(call.created_at)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                <div className="flex flex-col">
                                  <span className="font-medium">{call.contact_name || call.phone_number || call.normalized_phone || '—'}</span>
                                  {(call.contact_name && (call.phone_number || call.normalized_phone)) && (
                                    <span className="text-gray-500 text-xs">{call.phone_number || call.normalized_phone}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{directionLabel(call.direction)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{statusLabel(call.status, call.disposition)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatDuration(Number(call.duration) || 0)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {call.recording_url ? (
                                  <audio controls className="h-8 w-48" src={absMedia(call.recording_url)}>
                                    Ваш браузер не поддерживает аудио.
                                  </audio>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <p className="text-lg">Нет данных о звонках</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Панель фильтров и поиска */}
                  <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                    <div className="flex gap-2">
                      <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="all">Все звонки</option>
                        <option value="inbound">Входящие</option>
                        <option value="outbound">Исходящие</option>
                        <option value="missed">Пропущенные</option>
                      </select>
                      <button
                        onClick={exportToCsv}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                      >
                        <span>📊</span>
                        Экспорт в Excel
                      </button>
                    </div>
                    <div className="relative w-full sm:w-72">
                      <input
                        type="text"
                        placeholder="Поиск по номеру или имени..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 pl-10 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
                    </div>
                  </div>

                  {loading ? (
                    <div className="text-center py-12">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <p className="mt-2 text-gray-500">Загрузка журнала звонков...</p>
                    </div>
                  ) : error ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                      <p className="font-semibold">Ошибка загрузки</p>
                      <p>{error}</p>
                    </div>
                  ) : visibleGroups.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Контакт</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Звонков</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Последний</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Пропущенных</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {visibleGroups.map((group) => (
                            <tr
                              key={group.key}
                              onClick={() => setSelectedContactKey(group.key)}
                              className="hover:bg-blue-50 cursor-pointer"
                            >
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                <div className="flex flex-col">
                                  {group.contactName ? (
                                    <>
                                      <span className="font-medium">{group.contactName}</span>
                                      <span className="text-gray-500 text-xs">{group.phone || group.normalizedPhone || 'Без номера'}</span>
                                    </>
                                  ) : (
                                    <span className="font-medium">{group.phone || group.normalizedPhone || 'Без номера'}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {group.calls.length} {declineCalls(group.calls.length)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatDateTime(group.lastCall?.created_at)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {group.missedCount > 0 ? (
                                  <span className="text-red-600 font-semibold">{group.missedCount}</span>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <p className="text-lg">Нет данных о звонках</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Настройки телефонии</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">API интеграция</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">API ключ</label>
                      <input
                        type="text"
                        placeholder="Введите API ключ"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Секретный ключ</label>
                      <input
                        type="password"
                        placeholder="Введите секретный ключ"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="auto-record" className="rounded text-blue-600 focus:ring-blue-500" />
                      <label htmlFor="auto-record" className="text-sm text-gray-700">Автоматически записывать звонки</label>
                    </div>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Маршрутизация</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Номер для переадресации</label>
                      <input
                        type="text"
                        placeholder="+7 (999) 999-99-99"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="missed-notify" className="rounded text-blue-600 focus:ring-blue-500" />
                      <label htmlFor="missed-notify" className="text-sm text-gray-700">Уведомлять о пропущенных</label>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                  Сохранить настройки
                </button>
                <button className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors">
                  Проверить подключение
                </button>
              </div>
            </div>
          )}

          {activeTab === 'widgets' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Виджет цифровой клавиатуры */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span>📱</span>
                  Набор номера
                </h3>
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="bg-gray-100 rounded-lg p-3 mb-3 text-center text-xl font-mono tracking-widest">
                    +7 (9__) ___-__-__
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((num) => (
                      <button
                        key={num}
                        className="bg-gray-100 hover:bg-gray-200 rounded-lg py-3 font-semibold text-lg"
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                  <button className="w-full bg-green-600 text-white py-3 rounded-lg mt-3 font-semibold hover:bg-green-700">
                    📞 Позвонить
                  </button>
                </div>
              </div>

              {/* Виджет активных звонков */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span>🔊</span>
                  Активные звонки
                </h3>
                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
                    <span className="text-3xl">📵</span>
                    <p className="text-sm mt-2">Нет активных звонков</p>
                  </div>
                </div>
              </div>

              {/* Виджет быстрых контактов */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span>⚡</span>
                  Быстрые контакты
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
                  <span className="text-3xl">👥</span>
                  <p className="text-sm mt-2">Нет быстрых контактов</p>
                </div>
              </div>

              {/* Виджет статистики оператора */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span>📊</span>
                  Моя статистика (сегодня)
                </h3>
                <div className="space-y-3">
                  <div className="bg-white rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Обработано звонков</span>
                      <span className="font-bold text-lg text-gray-900">0</span>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Среднее время</span>
                      <span className="font-bold text-lg text-gray-900">0:00</span>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Пропущено</span>
                      <span className="font-bold text-lg text-gray-900">0</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Нормализация телефона: только цифры, 11 цифр и начинается с 8 -> 7.
const normalizePhone = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('8')) {
    return '7' + digits.slice(1);
  }
  return digits;
};

// Склонение слова "звонок".
const declineCalls = (n) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'звонок';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'звонка';
  return 'звонков';
};

// Форматирование даты и времени.
const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d)) return '—';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Форматирование длительности в мм:сс.
const formatDuration = (seconds) => {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
};

// Отображение направления.
const directionLabel = (direction) => {
  if (direction === 'inbound') return '📥 Входящий';
  if (direction === 'outbound') return '📤 Исходящий';
  return '—';
};

// Отображение статуса с учётом disposition.
const statusLabel = (status, disposition) => {
  const s = disposition || status || '';
  const map = {
    answered: '✅ Отвечен',
    missed: '❌ Пропущен',
    rejected: '❌ Отклонён',
    busy: '⏳ Занят',
    failed: '⚠️ Ошибка',
    'no answer': '❌ Нет ответа',
    cancel: '❌ Отменён'
  };
  return map[s] || s || '—';
};

export default TelephonySection;
