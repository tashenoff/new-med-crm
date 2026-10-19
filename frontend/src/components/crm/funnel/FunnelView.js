import React, { useState, useMemo, useEffect } from 'react';
import { useCrm } from '../../../hooks/useCrm';
import PanelHeader from '../../common/PanelHeader';

const FUNNEL_STAGES = [
  { status: 'new',          label: 'Новые заявки',      color: "bg-curai-blue",    light: "bg-curai-selected",    text: "text-curai-blue",    border: "border-curai-control" },
  { status: 'in_progress',  label: 'В работе',           color: "bg-curai-blue",  light: "bg-curai-selected",  text: "text-curai-blue",  border: "border-curai-control" },
  { status: 'contacted',    label: 'Контакт установлен', color: "bg-curai-blue",  light: "bg-curai-selected",  text: "text-curai-blue",  border: "border-curai-control" },
  { status: 'qualified',    label: 'Квалифицированы',    color: "bg-curai-blue",  light: "bg-curai-selected",  text: "text-curai-blue",  border: "border-curai-control" },
  { status: 'converted',    label: 'Конвертированы',     color: "bg-curai-positive",   light: "bg-curai-positiveBg",   text: "text-curai-positive",   border: "border-curai-positive" },
];

const DROPPED_STAGES = [
  { status: 'rejected', label: 'Отказ',   color: "bg-curai-warning", light: "bg-curai-warningBg", text: "text-curai-warning", border: "border-curai-warning" },
  { status: 'lost',     label: 'Потеряны', color: "bg-curai-negative",    light: "bg-curai-negativeBg",    text: "text-curai-negative",    border: "border-curai-negative" },
];

const ALL_STAGES = [...FUNNEL_STAGES, ...DROPPED_STAGES];

// Статический фолбэк для каналов (используется если источники не загружены)
const STATIC_CHANNELS = [
  { value: 'all',         label: 'Все каналы' },
  { value: 'website',     label: 'Сайт' },
  { value: 'phone',       label: 'Телефон' },
  { value: 'referral',    label: 'Рекомендация' },
  { value: 'social',      label: 'Соцсети' },
  { value: 'advertising', label: 'Реклама' },
  { value: 'walk_in',     label: 'Прямое обращение' },
  { value: 'email',       label: 'Email' },
  { value: 'other',       label: 'Другое' },
];

const CHANNEL_ICONS = {
  website:     '🌐',
  phone:       '📞',
  referral:    '🤝',
  social:      '📱',
  advertising: '📣',
  walk_in:     '🚶',
  email:       '✉️',
  other:       '•',
};

const priorityConfig = {
  urgent: { label: 'Срочный', color: "bg-curai-negativeBg text-curai-negative" },
  high:   { label: 'Высокий', color: "bg-curai-warningBg text-curai-warning" },
  medium: { label: 'Средний', color: "bg-curai-warningBg text-curai-warning" },
  low:    { label: 'Низкий',  color: "bg-curai-subtle text-curai-muted" },
};

function fmtDate(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const FunnelView = ({ user }) => {
  const { leads, sources, fetchSources, loading, isInitialized } = useCrm();

  const [selectedChannel, setSelectedChannel] = useState('all');
  const [selectedStage, setSelectedStage] = useState(null);

  // Загрузка источников при монтировании
  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // Формируем динамический список каналов из загруженных источников
  const CHANNELS = useMemo(() => {
    if (sources && sources.length > 0) {
      return [
        { value: 'all', label: 'Все каналы' },
        ...sources.map(source => ({
          value: source.id,
          label: source.name,
          type: source.type
        }))
      ];
    }
    return STATIC_CHANNELS;
  }, [sources]);

  // Обновляем CHANNEL_ICONS для поддержки динамических источников
  const getChannelIcon = (sourceValue) => {
    // Если это source_id, пытаемся найти тип источника
    if (sources && sources.length > 0) {
      const source = sources.find(s => s.id === sourceValue);
      if (source) {
        return CHANNEL_ICONS[source.type] || '📍';
      }
    }
    return CHANNEL_ICONS[sourceValue] || '•';
  };

  // Функция получения названия канала
  const getChannelLabel = (sourceValue) => {
    const channel = CHANNELS.find(c => c.value === sourceValue);
    if (channel) return channel.label;
    // Пробуем найти по source_id в sources
    if (sources && sources.length > 0) {
      const source = sources.find(s => s.id === sourceValue);
      if (source) return source.name;
    }
    return STATIC_CHANNELS.find(c => c.value === sourceValue)?.label || sourceValue;
  };

  // Фильтрация по каналу
  const filteredLeads = useMemo(() => {
    if (selectedChannel === 'all') return leads;
    return leads.filter(l => l.source === selectedChannel);
  }, [leads, selectedChannel]);

  // Количество лидов по стадиям
  const stageCounts = useMemo(() => {
    const counts = {};
    ALL_STAGES.forEach(s => { counts[s.status] = 0; });
    filteredLeads.forEach(l => {
      if (counts[l.status] !== undefined) counts[l.status]++;
    });
    return counts;
  }, [filteredLeads]);

  // Максимум по основным стадиям (для масштабирования)
  const maxCount = useMemo(() => {
    const counts = FUNNEL_STAGES.map(s => stageCounts[s.status] || 0);
    return Math.max(...counts, 1);
  }, [stageCounts]);

  // Leads for selected stage panel
  const panelLeads = useMemo(() => {
    if (!selectedStage) return [];
    return filteredLeads.filter(l => l.status === selectedStage);
  }, [filteredLeads, selectedStage]);

  const selectedStageInfo = useMemo(
    () => ALL_STAGES.find(s => s.status === selectedStage),
    [selectedStage]
  );

  if (!isInitialized || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-curai-control" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="calendar-container calendar-view-panel rounded-md shadow-none">
        <PanelHeader
          title="Воронка продаж"
          subtitle={`${filteredLeads.length} заявок${selectedChannel !== 'all' ? ` · канал: ${CHANNELS.find(c => c.value === selectedChannel)?.label}` : ''}`}
        />
      </div>

      <div className="px-6 space-y-6">
      {/* Channel filter */}
      <div className="flex flex-wrap gap-2">
        {CHANNELS.map(ch => (
          <button
            key={ch.value}
            onClick={() => { setSelectedChannel(ch.value); setSelectedStage(null); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedChannel === ch.value
                ? "bg-curai-blue text-white shadow-none"
                : "bg-curai-surface border border-curai-border text-curai-muted hover:border-curai-control hover:text-curai-blue"
            }`}
          >
            {ch.value !== 'all' && <span className="mr-1">{CHANNEL_ICONS[ch.value]}</span>}
            {ch.label}
            {ch.value !== 'all' && (
              <span className={`ml-1.5 text-xs ${selectedChannel === ch.value ? "text-curai-blue" : "text-curai-muted"}`}>
                {leads.filter(l => l.source === ch.value).length}
              </span>
            )}
          </button>
        ))}
        
        {/* Дополнительные кнопки */}
        <button
          onClick={() => window.location.href = '/broadcast'}
          className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors bg-curai-positiveBg border border-curai-positive text-curai-positive hover:bg-curai-positiveBg hover:border-curai-positive"
        >
          <span className="mr-1">📤</span>
          Рассылка WhatsApp
        </button>
        
        <button
          onClick={() => window.location.href = '/broadcast'}
          className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors bg-curai-selected border border-curai-control text-curai-blue hover:bg-curai-selected hover:border-curai-control"
        >
          <span className="mr-1">🔄</span>
          Повторные посещения
        </button>
      </div>

      <div className="flex gap-6">
        {/* Funnel */}
        <div className="flex-1 min-w-0">
          <div className="bg-curai-surface rounded-md border border-curai-border overflow-hidden">
            {/* Main funnel stages */}
            {FUNNEL_STAGES.map((stage, idx) => {
              const count = stageCounts[stage.status] || 0;
              const prevCount = idx > 0 ? (stageCounts[FUNNEL_STAGES[idx - 1].status] || 0) : null;
              const convRate = prevCount > 0 ? Math.round((count / prevCount) * 100) : null;
              // width as % of max, minimum 15% for visual
              const barPct = Math.max(15, Math.round((count / maxCount) * 100));
              const isActive = selectedStage === stage.status;

              return (
                <div key={stage.status}>
                  {/* Conversion rate indicator */}
                  {idx > 0 && (
                    <div className="flex items-center px-5 py-1 bg-curai-subtle border-t border-dashed border-curai-border">
                      <div className="flex-1 h-px bg-curai-border" />
                      <span className={`mx-3 text-xs font-medium px-2 py-0.5 rounded-full ${
                        convRate === null ? "text-curai-muted" :
                        convRate >= 70 ? "bg-curai-positiveBg text-curai-positive" :
                        convRate >= 40 ? "bg-curai-warningBg text-curai-warning" :
                        "bg-curai-negativeBg text-curai-negative"
                      }`}>
                        {convRate !== null ? `↓ ${convRate}%` : '—'}
                      </span>
                      <div className="flex-1 h-px bg-curai-border" />
                    </div>
                  )}

                  {/* Stage row */}
                  <button
                    onClick={() => setSelectedStage(isActive ? null : stage.status)}
                    className={`w-full text-left px-5 py-4 transition-colors ${
                      isActive ? stage.light : "hover:bg-curai-subtle"
                    } ${idx === 0 ? '' : ''}`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Stage label */}
                      <div className="w-44 shrink-0">
                        <div className={`font-medium text-sm ${isActive ? stage.text : "text-curai-ink"}`}>
                          {stage.label}
                        </div>
                        <div className="text-xs text-curai-muted mt-0.5">шаг {idx + 1}</div>
                      </div>

                      {/* Bar */}
                      <div className="flex-1 relative h-8 bg-curai-subtle rounded-md overflow-hidden">
                        <div
                          className={`h-full rounded-md transition-all duration-500 ${stage.color} opacity-80`}
                          style={{ width: `${barPct}%` }}
                        />
                        <span className="absolute inset-0 flex items-center px-3 text-sm font-semibold text-curai-ink">
                          {count}
                        </span>
                      </div>

                      {/* % of total */}
                      <div className="w-16 text-right shrink-0">
                        <span className="text-sm font-medium text-curai-muted">
                          {filteredLeads.length > 0
                            ? `${Math.round((count / filteredLeads.length) * 100)}%`
                            : '0%'}
                        </span>
                      </div>

                      {/* Chevron */}
                      <div className="w-4 shrink-0 text-curai-muted text-sm">
                        {isActive ? '▲' : '▼'}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}

            {/* Dropped off */}
            <div className="border-t border-curai-border bg-curai-subtle px-5 py-3">
              <div className="flex items-center gap-6">
                <span className="text-xs font-medium text-curai-muted uppercase tracking-wide">Выбыли</span>
                {DROPPED_STAGES.map(stage => {
                  const count = stageCounts[stage.status] || 0;
                  const isActive = selectedStage === stage.status;
                  return (
                    <button
                      key={stage.status}
                      onClick={() => setSelectedStage(isActive ? null : stage.status)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                        isActive
                          ? `${stage.light} ${stage.border} ${stage.text}`
                          : "border-curai-border text-curai-muted hover:border-curai-control bg-curai-surface"
                      }`}
                    >
                      <span className={`inline-block w-2 h-2 rounded-full ${stage.color}`} />
                      {stage.label}
                      <span className={`font-semibold ${isActive ? stage.text : "text-curai-ink"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Summary stats */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="bg-curai-surface rounded-md border border-curai-border p-4 text-center">
              <div className="text-2xl font-semibold text-curai-ink">
                {stageCounts['converted'] || 0}
              </div>
              <div className="text-xs text-curai-muted mt-1">Конвертированы</div>
              <div className="text-sm font-medium text-curai-positive mt-0.5">
                {filteredLeads.length > 0
                  ? `${Math.round(((stageCounts['converted'] || 0) / filteredLeads.length) * 100)}% конверсия`
                  : '—'}
              </div>
            </div>
            <div className="bg-curai-surface rounded-md border border-curai-border p-4 text-center">
              <div className="text-2xl font-semibold text-curai-ink">
                {(stageCounts['rejected'] || 0) + (stageCounts['lost'] || 0)}
              </div>
              <div className="text-xs text-curai-muted mt-1">Потеряно</div>
              <div className="text-sm font-medium text-curai-negative mt-0.5">
                {filteredLeads.length > 0
                  ? `${Math.round((((stageCounts['rejected'] || 0) + (stageCounts['lost'] || 0)) / filteredLeads.length) * 100)}% отток`
                  : '—'}
              </div>
            </div>
            <div className="bg-curai-surface rounded-md border border-curai-border p-4 text-center">
              <div className="text-2xl font-semibold text-curai-ink">
                {(stageCounts['new'] || 0) + (stageCounts['in_progress'] || 0) + (stageCounts['contacted'] || 0) + (stageCounts['qualified'] || 0)}
              </div>
              <div className="text-xs text-curai-muted mt-1">В обработке</div>
              <div className="text-sm font-medium text-curai-blue mt-0.5">активные</div>
            </div>
          </div>
        </div>

        {/* Channel breakdown sidebar */}
        <div className="w-56 shrink-0">
          <div className="bg-curai-surface rounded-md border border-curai-border p-4">
            <h3 className="text-sm font-semibold text-curai-ink mb-3">По каналам</h3>
            <div className="space-y-2">
              {CHANNELS.filter(c => c.value !== 'all').map(ch => {
                const chLeads = leads.filter(l => l.source === ch.value);
                if (chLeads.length === 0) return null;
                return (
                  <div key={ch.value}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-curai-muted">
                        <span className="mr-1">{CHANNEL_ICONS[ch.value]}</span>
                        {ch.label}
                      </span>
                      <span className="text-xs font-medium text-curai-ink">{chLeads.length}</span>
                    </div>
                    <div className="h-1.5 bg-curai-subtle rounded-full overflow-hidden">
                      <div
                        className="h-full bg-curai-blue rounded-full"
                        style={{ width: `${leads.length > 0 ? Math.round((chLeads.length / leads.length) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Leads panel for selected stage */}
      {selectedStage && selectedStageInfo && (
        <div className={`rounded-md border ${selectedStageInfo.border} ${selectedStageInfo.light}`}>
          <div className={`flex items-center justify-between px-5 py-3 border-b ${selectedStageInfo.border}`}>
            <h3 className={`font-semibold ${selectedStageInfo.text}`}>
              {selectedStageInfo.label}
              <span className="ml-2 text-sm font-normal">— {panelLeads.length} заявок</span>
            </h3>
            <button
              onClick={() => setSelectedStage(null)}
              className="text-curai-muted hover:text-curai-muted text-lg leading-none"
            >
              ✕
            </button>
          </div>

          {panelLeads.length === 0 ? (
            <div className="px-5 py-8 text-center text-curai-muted text-sm">
              Нет заявок на этом этапе
              {selectedChannel !== 'all' && ' для выбранного канала'}
            </div>
          ) : (
            <div className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {panelLeads.map(lead => {
                const pri = priorityConfig[lead.priority] || priorityConfig.medium;
                return (
                  <div key={lead.id} className="bg-curai-surface rounded-md border border-curai-border p-3 shadow-none">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-curai-ink text-sm leading-snug">
                        {lead.last_name} {lead.first_name}
                        {lead.middle_name ? ` ${lead.middle_name}` : ''}
                      </div>
                      <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${pri.color}`}>
                        {pri.label}
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-0.5">
                      <div className="text-xs text-curai-muted">
                        {CHANNEL_ICONS[lead.source] || '•'}{' '}
                        {CHANNELS.find(c => c.value === lead.source)?.label || lead.source}
                      </div>
                      {lead.phone && (
                        <div className="text-xs text-curai-muted">📞 {lead.phone}</div>
                      )}
                      {lead.services_interested?.length > 0 && (
                        <div className="text-xs text-curai-muted truncate" title={lead.services_interested.join(', ')}>
                          🩺 {lead.services_interested.join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-curai-muted">{fmtDate(lead.created_at)}</span>
                      {lead.contact_attempts > 0 && (
                        <span className="text-xs text-curai-muted">
                          📋 {lead.contact_attempts} контакт{lead.contact_attempts > 1 ? 'а' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
};

export default FunnelView;
