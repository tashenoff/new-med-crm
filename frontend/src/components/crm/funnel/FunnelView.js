import React, { useState, useMemo, useEffect } from 'react';
import { useCrm } from '../../../hooks/useCrm';
import { useKanbanColumns } from '../../../hooks/useKanbanColumns';
import { salesFunnel } from '../../../utils/salesFunnel';
import { matchesSource, sourceLabel } from '../../../utils/crmSources';
import PanelHeader from '../../common/PanelHeader';

const STAGE_STYLE = {
  color: 'bg-curai-blue', light: 'bg-curai-selected', text: 'text-curai-blue', border: 'border-curai-control'
};
const stageStyle = id => id === 'converted' || id === 'closed'
  ? { color: 'bg-curai-positive', light: 'bg-curai-positiveBg', text: 'text-curai-positive', border: 'border-curai-positive' }
  : id === 'rejected' || id === 'lost'
    ? { color: 'bg-curai-negative', light: 'bg-curai-negativeBg', text: 'text-curai-negative', border: 'border-curai-negative' }
    : STAGE_STYLE;

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

const FunnelView = () => {
  const { leads, sources, fetchSources, fetchLeads, loading, isInitialized } = useCrm({ kanban: true });
  const columnConfig = useKanbanColumns(fetchLeads);

  const [selectedChannel, setSelectedChannel] = useState('all');
  const [selectedStage, setSelectedStage] = useState(null);

  // Загрузка источников при монтировании
  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const CHANNELS = useMemo(() => [
    { value: 'all', label: 'Все' },
    ...sources.map(source => ({ value: source.id, label: source.name, type: source.type }))
  ], [sources]);

  // Фильтрация по каналу
  const filteredLeads = useMemo(() => {
    if (selectedChannel === 'all') return leads;
    return leads.filter(lead => matchesSource(lead, selectedChannel));
  }, [leads, selectedChannel]);

  const funnel = useMemo(() => salesFunnel(columnConfig.columns, filteredLeads), [columnConfig.columns, filteredLeads]);
  const funnelStages = funnel.stages.map(stage => ({ ...stage, ...stageStyle(stage.id) }));
  const historicalStages = funnel.historicalStages.map(stage => ({ ...stage, ...stageStyle(stage.id) }));
  const maxCount = Math.max(...funnelStages.map(stage => stage.leads.length), 1);
  const selectedStageInfo = [...funnelStages, ...historicalStages].find(stage => stage.id === selectedStage);
  const panelLeads = selectedStageInfo?.leads || [];

  if (!isInitialized || loading || columnConfig.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-curai-control" />
      </div>
    );
  }

  if (columnConfig.error) {
    return (
      <div role="alert" className="p-6 text-curai-negative">
        <p>{columnConfig.error}</p>
        <button type="button" onClick={columnConfig.reload} className="mt-2 underline">Повторить</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="calendar-container calendar-view-panel rounded-md shadow-none">
        <PanelHeader
          title="Воронка продаж"
          subtitle={`${filteredLeads.length} заявок${selectedChannel !== 'all' ? ` · источник: ${CHANNELS.find(c => c.value === selectedChannel)?.label}` : ''}`}
        />
      </div>

      <div className="px-6 space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <span className="px-3 py-1.5 rounded-md bg-curai-selected text-curai-blue font-medium">По этапам</span>
        <label className="flex items-center gap-2 text-sm text-curai-ink" htmlFor="funnel-source">Источник
          <select id="funnel-source" className="border border-curai-control rounded-md px-3 py-2 bg-curai-surface max-w-xs"
            value={selectedChannel} onChange={event => { setSelectedChannel(event.target.value); setSelectedStage(null); }}>
            {CHANNELS.map(source => <option key={source.value} value={source.value}>{source.label}</option>)}
          </select>
        </label>
      </div>

      <div className="flex gap-6">
        {/* Funnel */}
        <div className="flex-1 min-w-0">
          <div className="bg-curai-surface rounded-md border border-curai-border overflow-hidden">
            {/* Main funnel stages */}
            {funnelStages.map((stage, idx) => {
              const count = stage.leads.length;
              const prevCount = idx > 0 ? funnelStages[idx - 1].leads.length : null;
              const convRate = prevCount > 0 ? Math.round((count / prevCount) * 100) : null;
              // width as % of max, minimum 15% for visual
              const barPct = Math.max(15, Math.round((count / maxCount) * 100));
              const isActive = selectedStage === stage.id;

              return (
                <div key={stage.id}>
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
                    data-funnel-stage={stage.id}
                    onClick={() => setSelectedStage(isActive ? null : stage.id)}
                    className={`w-full text-left px-5 py-4 transition-colors ${
                      isActive ? stage.light : "hover:bg-curai-subtle"
                    } ${idx === 0 ? '' : ''}`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Stage label */}
                      <div className="w-44 shrink-0">
                        <div className={`break-words font-medium text-sm ${isActive ? stage.text : "text-curai-ink"}`}>
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
                        <span data-stage-count className="absolute inset-0 flex items-center px-3 text-sm font-semibold text-curai-ink">
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

            {/* Historical statuses/assignments are not current Kanban columns. */}
            {historicalStages.length > 0 && <div aria-label="Вне текущего канбана" className="border-t border-curai-border bg-curai-subtle px-5 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-curai-muted uppercase tracking-wide">Вне текущего канбана</span>
                {historicalStages.map(stage => {
                  const count = stage.leads.length;
                  const isActive = selectedStage === stage.id;
                  return (
                    <button
                      key={stage.id}
                      onClick={() => setSelectedStage(isActive ? null : stage.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                        isActive
                          ? `${stage.light} ${stage.border} ${stage.text}`
                          : "border-curai-border text-curai-muted hover:border-curai-control bg-curai-surface"
                      }`}
                    >
                      <span className={`inline-block w-2 h-2 rounded-full ${stage.color}`} />
                      {stage.label}
                      <span data-stage-count className={`font-semibold ${isActive ? stage.text : "text-curai-ink"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>}
          </div>

          {/* Summary stats */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div data-funnel-summary className="bg-curai-surface rounded-md border border-curai-border p-4 text-center">
              <div className="text-2xl font-semibold text-curai-ink">
                {funnel.converted}
              </div>
              <div className="text-xs text-curai-muted mt-1">Конвертированы</div>
              <div className="text-sm font-medium text-curai-positive mt-0.5">
                {filteredLeads.length > 0
                  ? `${Math.round((funnel.converted / filteredLeads.length) * 100)}% конверсия`
                  : '—'}
              </div>
            </div>
            <div data-funnel-summary className="bg-curai-surface rounded-md border border-curai-border p-4 text-center">
              <div className="text-2xl font-semibold text-curai-ink">
                {funnel.dropped}
              </div>
              <div className="text-xs text-curai-muted mt-1">Потеряно</div>
              <div className="text-sm font-medium text-curai-negative mt-0.5">
                {filteredLeads.length > 0
                  ? `${Math.round((funnel.dropped / filteredLeads.length) * 100)}% отток`
                  : '—'}
              </div>
            </div>
            <div data-funnel-summary className="bg-curai-surface rounded-md border border-curai-border p-4 text-center">
              <div className="text-2xl font-semibold text-curai-ink">
                {funnel.active}
              </div>
              <div className="text-xs text-curai-muted mt-1">В обработке</div>
              <div className="text-sm font-medium text-curai-blue mt-0.5">активные</div>
            </div>
          </div>
        </div>

        {/* Channel breakdown sidebar */}
        <div className="w-56 shrink-0">
          <div className="bg-curai-surface rounded-md border border-curai-border p-4">
            <h3 className="text-sm font-semibold text-curai-ink mb-3">По источникам</h3>
            <div className="space-y-2">
              {CHANNELS.filter(c => c.value !== 'all').map(ch => {
                const chLeads = leads.filter(lead => matchesSource(lead, ch.value));
                if (chLeads.length === 0) return null;
                return (
                  <div key={ch.value}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-curai-muted">
                        <span className="mr-1">{CHANNEL_ICONS[ch.type]}</span>
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
            <h3 className={`min-w-0 break-words font-semibold ${selectedStageInfo.text}`}>
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
              {selectedChannel !== 'all' && ' для выбранного источника'}
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
                        {sourceLabel(lead, sources)}
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
