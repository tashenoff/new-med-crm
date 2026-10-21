import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PanelHeader from '../../common/PanelHeader';
import FunnelSettings from './FunnelSettings';
import FunnelRules from './FunnelRules';
import FunnelReportBody from './FunnelReportBody';
import { stagePreferenceKey, funnelRequest, initialPeriod, readReportPreference, reportPeriod } from '../../../utils/eventFunnel';

const control = 'min-w-0 rounded-md border border-curai-control bg-curai-surface px-3 py-2 text-sm';
const action = 'rounded-md border border-curai-control px-3 py-2 text-sm';
export default function FunnelView({ user }) {
  const batch = useMemo(() => new URLSearchParams(window.location.search).get('funnel_batch') || '', []);
  const scope = stagePreferenceKey(user);
  const preferenceKey = scope ? `${scope}:observed-v1:${batch}` : null;
  const saved = useMemo(() => readReportPreference(preferenceKey), [preferenceKey]);
  const [preference, setPreference] = useState(() => ({ key: preferenceKey, ...saved }));
  const currentPreference = preference.key === preferenceKey ? preference : saved;
  const [metadata, setMetadata] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [mode, setMode] = useState('snapshot');
  const [view, setView] = useState('stages');
  const [period, setPeriod] = useState(initialPeriod);
  const [windowDays, setWindowDays] = useState(30);
  const [source, setSource] = useState('all');
  const [comparisonSources, setComparisonSources] = useState(null);
  const [panel, setPanel] = useState(null);

  const batchQuery = batch ? `?synthetic_batch=${encodeURIComponent(batch)}` : '';
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    window.addEventListener('crm-kanban-changed', reload);
    window.addEventListener('crm-appointments-changed', reload);
    return () => {
      window.removeEventListener('crm-kanban-changed', reload);
      window.removeEventListener('crm-appointments-changed', reload);
    };
  }, [reload]);
  useEffect(() => {
    const controller = new AbortController();
    funnelRequest(`options${batchQuery}`, controller.signal).then(data => { if (!controller.signal.aborted) setMetadata(data); }).catch(failure => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [batchQuery, revision]);
  const steps = currentPreference.steps;
  const hidden = currentPreference.hidden;
  const query = useMemo(() => {
    if (!metadata) return null;
    try {
      const bounds = reportPeriod(period.from, period.to);
      if (mode === 'history' && (steps.length < 2 || steps.length > 30)) return null;
      const params = new URLSearchParams({ ...bounds, mode, window_days: String(windowDays) });
      if (batch) params.set('synthetic_batch', batch);
      for (const id of steps) params.append('steps', id);
      const selected = view === 'sources' ? comparisonSources : source === 'all' ? null : [source];
      params.set('source_selection', selected === null ? 'all' : 'selected');
      for (const key of selected || []) params.append('source_ids', key);
      return { key: params.toString() };
    } catch (failure) { return { error: failure.message }; }
  }, [metadata, period.from, period.to, mode, windowDays, batch, steps, view, comparisonSources, source]);
  useEffect(() => {
    if (!query?.key) return;
    const controller = new AbortController();
    setError('');
    funnelRequest(`report?${query.key}`, controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ key: query.key, data });
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [query?.key, revision]);
  const report = result?.key === query?.key ? result?.data : null;
  const stageOptions = report?.stage_options || metadata?.columns || [];
  const sourceOptions = report?.source_options || metadata?.sources || [];
  const selectedSourceKeys = comparisonSources || sourceOptions.map(item => item.key);
  const savePreference = next => {
    const value = { ...currentPreference, ...next };
    setPreference({ key: preferenceKey, ...value });
    if (preferenceKey) try { localStorage.setItem(preferenceKey, JSON.stringify({ version: 1, steps: value.steps, hidden: value.hidden })); } catch { /* Storage may be unavailable. */ }
  };
  const label = id => stageOptions.find(stage => stage.id === id)?.name || `Архивный этап (${id})`;
  const completePanel = draft => {
    if (panel === 'steps') savePreference({ steps: draft });
    if (panel === 'visibility') savePreference({ hidden: draft });
    if (panel === 'sources') setComparisonSources(draft);
    setPanel(null);
  };
  const panelStages = mode === 'history' && panel === 'visibility' ? steps.map(id => ({ id, name: label(id) })) : stageOptions;
  return <div className="space-y-6">
    <div className="calendar-container calendar-view-panel rounded-md"><PanelHeader title="Воронка продаж" subtitle={mode === 'history' ? 'Прохождение выбранных шагов одной когортой обращений' : 'Распределение обращений по текущим этапам'} /></div>
    <div className="px-4 sm:px-6 space-y-5 min-w-0">
      {batch && <p role="status" className="rounded-md border border-curai-warning bg-curai-warningBg p-3 text-sm break-words">Тестовый набор: {batch}. Это синтетические данные, не реальные показатели клиники.</p>}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Тип отчёта">
        {[['history', 'Прохождение'], ['snapshot', 'Текущий снимок']].map(([value, name]) => <button key={value} type="button" aria-pressed={mode === value} className={`${action} ${mode === value ? 'bg-curai-selected text-curai-blue' : ''}`} onClick={() => setMode(value)}>{name}</button>)}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Представление отчёта">
        {[['stages', 'По этапам'], ['sources', 'Сравнение источников']].map(([value, name]) => <button key={value} type="button" aria-pressed={view === value} className={`${action} ${view === value ? 'bg-curai-selected text-curai-blue' : ''}`} onClick={() => setView(value)}>{name}</button>)}
      </div>
      <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        <fieldset className="min-w-0"><legend className="mb-2 text-sm">{mode === 'history' ? 'Первый вход в первый шаг' : 'Дата создания обращения'}</legend>
          <div className="grid grid-cols-2 gap-2"><label className="min-w-0 text-xs">С<input className={`${control} mt-1 w-full`} type="date" aria-label="Начало периода" value={period.from} onChange={event => setPeriod({ ...period, from: event.target.value })} /></label>
            <label className="min-w-0 text-xs">По<input className={`${control} mt-1 w-full`} type="date" aria-label="Конец периода" value={period.to} onChange={event => setPeriod({ ...period, to: event.target.value })} /></label></div>
        </fieldset>
        {mode === 'history' && <label className="min-w-0 text-sm">Окно конверсии, дней<input type="number" min="1" max="365" aria-label="Окно конверсии, дней" className={`${control} mt-1 block w-full sm:w-28`} value={windowDays} onChange={event => setWindowDays(event.target.value)} /></label>}
        {view === 'stages' ? <label className="min-w-0 text-sm">Источник<select id="funnel-source" aria-label="Источник" className={`${control} mt-1 block w-full sm:max-w-xs`} value={source} onChange={event => setSource(event.target.value)}><option value="all">Все источники</option>{sourceOptions.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
          : <button type="button" className={action} onClick={() => setPanel('sources')}>Источники ({selectedSourceKeys.length})</button>}
      </div>
      <div className="flex flex-wrap gap-2">
        {mode === 'history' && <button type="button" className={action} onClick={() => setPanel('steps')}>Шаги воронки ({steps.length})</button>}
        <button type="button" className={action} onClick={() => setPanel('visibility')}>Отображение этапов</button>
        {mode === 'history' && <button type="button" className={action} onClick={() => setPanel('rules')}>Как считается</button>}
        <button type="button" className={action} onClick={reload}>Обновить</button>
      </div>
      {mode === 'history' ? <div className="space-y-1 text-sm text-curai-muted">
        {steps.length > 0 && <p className="break-words">Путь: {steps.map(label).join(' → ')}.</p>}
        <p>Когорта — первый наблюдаемый вход в начало пути. Окно: {windowDays} суток. Источник на момент входа.</p>
        {view === 'sources' && <p>Сравниваются только выбранные источники с одинаковыми периодом, шагами и окном. Фильтр режима «По этапам» здесь не применяется.</p>}
      </div> : <p className="text-sm text-curai-muted">Это текущие состояния обращений, не история прохождения. Проценты — доля от всех обращений выбранного периода создания. Разные обращения одного пациента считаются отдельно.</p>}
      {(error || query?.error) && <div role="alert" className="text-curai-negative">{error || query.error} <button className="underline" onClick={reload}>Повторить</button></div>}
      {mode === 'history' && steps.length < 2 && <p role="status">Выберите хотя бы два шага кнопкой «Шаги воронки». Готового пути по умолчанию нет.</p>}
      {!report && !error && !query?.error && (mode !== 'history' || steps.length >= 2) && <p role="status">Загрузка отчёта…</p>}
      {report && <FunnelReportBody report={report} mode={mode} view={view} hidden={hidden} />}
    </div>
    {panel === 'rules' && <FunnelRules windowDays={windowDays} onClose={() => setPanel(null)} />}
    {panel && panel !== 'rules' && <FunnelSettings key={panel} panel={panel} stages={panelStages} sources={sourceOptions} initial={panel === 'steps' ? [...steps] : panel === 'sources' ? [...selectedSourceKeys] : [...hidden]} onClose={() => setPanel(null)} onDone={completePanel} />}
  </div>;
}
