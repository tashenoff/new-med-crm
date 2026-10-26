import LoadingIndicator from '../../common/LoadingIndicator';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PanelHeader from '../../common/PanelHeader';
import FunnelSettings from './FunnelSettings';
import FunnelRules from './FunnelRules';
import FunnelReportBody from './FunnelReportBody';
import useFunnelMethods from './useFunnelMethods';
import '../crmReports.css';
import { stagePreferenceKey, funnelRequest, initialPeriod, initialHistorySteps, funnelPeriodPresets, funnelPresetRange, readReportPreference, reportPeriod } from '../../../utils/eventFunnel';

const control = 'curai-crm-control';
const action = 'curai-button curai-button-ghost';
export default function FunnelView({ user }) {
  const batch = useMemo(() => new URLSearchParams(window.location.search).get('funnel_batch') || '', []);
  const scope = stagePreferenceKey(user);
  const preferenceKey = scope ? `${scope}:observed-v1:${batch}` : null;
  const saved = useMemo(() => readReportPreference(preferenceKey), [preferenceKey]);
  const [preference, setPreference] = useState(() => ({ key: preferenceKey, ...saved }));
  const currentPreference = preference.key === preferenceKey ? preference : saved;
  const [metadata, setMetadata] = useState(null);
  const [catalog, setCatalog] = useState({ loading: true, error: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [mode, setMode] = useState('snapshot');
  const [view, setView] = useState('stages');
  const [period, setPeriod] = useState(() => ({ ...initialPeriod(), preset: '30days' }));
  const [windowDays, setWindowDays] = useState(30);
  const [{ source, channel }, setAttribution] = useState({ source: 'all', channel: '' });
  const [comparisonSources, setComparisonSources] = useState(null);
  const [panel, setPanel] = useState(null);
  const closePanel = useCallback(() => setPanel(null), []);
  const methods = useFunnelMethods(view === 'stages' ? source : 'all', batch, revision);
  const methodPlaceholder = methods.status === 'unselected' ? 'Выберите источник'
    : methods.status === 'loading' ? 'Загрузка способов…'
      : methods.status === 'error' ? 'Способы недоступны' : 'Все способы';

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
    setCatalog({ loading: true, error: '' });
    funnelRequest(`options${batchQuery}`, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(data.columns) || !Array.isArray(data.sources) || data.columns.some(column => !column?.id || !column?.name)) {
        throw new Error('Сервер не вернул корректный список этапов CRM');
      }
      setMetadata(data); setCatalog({ loading: false, error: '' });
    }).catch(failure => {
      if (!controller.signal.aborted) setCatalog({ loading: false, error: failure.message });
    });
    return () => controller.abort();
  }, [batchQuery, revision]);
  const hasSavedPath = currentPreference.steps.length >= 2;
  const steps = useMemo(() => hasSavedPath ? currentPreference.steps : initialHistorySteps(metadata?.columns), [hasSavedPath, currentPreference.steps, metadata]);
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
      if (view === 'stages' && source.startsWith('source:') && channel) params.set('channel_id', channel);
      return { key: params.toString() };
    } catch (failure) { return { error: failure.message }; }
  }, [metadata, period.from, period.to, mode, windowDays, batch, steps, view, comparisonSources, source, channel]);
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
  const missingSteps = metadata ? steps.filter(id => !metadata.columns.some(column => column.id === id)) : [];
  const selectedSourceKeys = comparisonSources || sourceOptions.map(item => item.key);
  const savePreference = next => {
    const value = { ...currentPreference, ...next };
    setPreference({ key: preferenceKey, ...value });
    if (preferenceKey) try { localStorage.setItem(preferenceKey, JSON.stringify({ version: 1, steps: value.steps, hidden: value.hidden })); } catch { /* Storage may be unavailable. */ }
  };
  const label = id => stageOptions.find(stage => stage.id === id)?.name || `Недоступный этап (${id})`;
  const completePanel = draft => {
    if (panel === 'steps') savePreference({ steps: draft });
    if (panel === 'visibility') savePreference({ hidden: draft });
    if (panel === 'sources') setComparisonSources(draft);
    setPanel(null);
  };
  const panelStages = mode === 'history' && panel === 'visibility' ? steps.map(id => ({ id, name: label(id) })) : stageOptions;
  return <div className="curai-crm-page">
    <PanelHeader title="Воронка продаж" subtitle={mode === 'history' ? 'Прохождение выбранных шагов одной когортой обращений' : 'Распределение обращений по текущим этапам'}
      actions={<button type="button" className="curai-button curai-button-secondary" aria-haspopup="dialog" aria-expanded={panel === 'help'} onClick={() => setPanel('help')}>Как это работает</button>} />
    {batch && <p role="status" className="rounded-md border border-curai-warning bg-curai-warningBg p-3 text-sm break-words">Тестовый набор: {batch}. Это синтетические данные, не реальные показатели клиники.</p>}
    <div className="curai-crm-tabs-row">
      <div className="curai-patient-tabs" role="tablist" aria-label="Представление отчёта">
        {[['stages', 'По этапам'], ['sources', 'Сравнение источников']].map(([value, name]) => <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}>{name}</button>)}
      </div>
      <div className="curai-crm-actions">
        {mode === 'history' && <button type="button" className={action} onClick={() => setPanel('steps')}>Шаги воронки ({steps.length})</button>}
        <button type="button" className={action} onClick={() => setPanel('visibility')}>Отображение этапов</button>
        {mode === 'history' && <button type="button" className={action} onClick={() => setPanel('rules')}>Как считается</button>}
      </div>
    </div>
    <div className="curai-crm-toolbar">
      <div className="curai-crm-mode"><span>Данные</span><div className="curai-selection-tabs" role="group" aria-label="Тип отчёта">
        {[['history', 'Прохождение'], ['snapshot', 'Текущий снимок']].map(([value, name]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{name}</button>)}
      </div></div>
      <fieldset className="curai-crm-period"><legend>{mode === 'history' ? 'Первый вход в первый шаг' : 'Дата создания обращения'}</legend>
        <div><label className="curai-crm-period-preset">Период<select aria-label="Быстрый период" className={control} value={period.preset} onChange={event => {
          const preset = event.target.value;
          const range = funnelPresetRange(preset);
          setPeriod(current => ({ ...current, ...range, preset }));
        }}>{funnelPeriodPresets.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>С<input className={control} type="date" aria-label="Начало периода" value={period.from} onChange={event => setPeriod(current => ({ ...current, from: event.target.value, preset: 'custom' }))} /></label>
          <label>По<input className={control} type="date" aria-label="Конец периода" value={period.to} onChange={event => setPeriod(current => ({ ...current, to: event.target.value, preset: 'custom' }))} /></label></div>
      </fieldset>
      {mode === 'history' && <label className="curai-crm-field curai-crm-window"><span>Окно, дней</span><input type="number" min="1" max="365" aria-label="Окно конверсии, дней" className={control} value={windowDays} onChange={event => setWindowDays(event.target.value)} /></label>}
      {view === 'stages' ? <>
        <label className="curai-crm-field curai-crm-field-source"><span>Источник</span><select id="funnel-source" aria-label="Источник" className={control} value={source} onChange={event => setAttribution({ source: event.target.value, channel: '' })}><option value="all">Все источники</option>{sourceOptions.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
        <label className="curai-crm-field curai-crm-field-source"><span>Способ обращения</span><select aria-label="Способ обращения" className={control}
          aria-describedby="funnel-method-status" disabled={methods.status !== 'ready'} title={methodPlaceholder}
          value={channel} onChange={event => setAttribution(current => ({ ...current, channel: event.target.value }))}>
          <option value="">{methodPlaceholder}</option>
          {channel && !methods.methods.some(item => item.id === channel) && <option value={channel}>{methods.status === 'loading' ? 'Выбранный способ: загрузка…' : methods.status === 'error' ? 'Выбранный способ: справочник недоступен' : 'Выбранный способ недоступен'}</option>}
          {methods.methods.map(item => <option key={item.id} value={item.id}>{item.name}{item.active === false ? ' (архивный)' : ''}</option>)}
        </select></label>
      </>
        : <div className="curai-crm-field"><span>Выбор для сравнения</span><button type="button" className="curai-button curai-button-secondary" onClick={() => setPanel('sources')}>Источники ({selectedSourceKeys.length})</button></div>}
      <button type="button" className={action} onClick={reload}>Обновить</button>
    </div>
    {view === 'stages' && <p id="funnel-method-status" role={methods.status === 'error' ? 'alert' : 'status'} className="curai-crm-caption">
      {methods.status === 'unselected' ? 'Выберите источник, чтобы отфильтровать по способу обращения.'
        : methods.status === 'loading' ? 'Загрузка способов обращения…'
          : methods.status === 'error' ? <>Не удалось загрузить способы: {methods.error}. <button className="underline" onClick={reload}>Повторить</button></>
            : channel && !methods.methods.some(item => item.id === channel) ? 'Выбранный способ больше недоступен. Сбросьте фильтр на «Все способы»; другой способ автоматически не подставляется.'
              : !methods.methods.length ? 'У источника нет настроенных способов. Показаны все обращения источника, включая неизвестные способы.'
              : channel ? 'Фильтр применяется ко всему отчёту. Архивные способы доступны для истории.'
                : 'Все способы включают обращения с неизвестным или неуказанным способом.'}
    </p>}
    {mode === 'history' ? <div className="curai-crm-caption">
      {!hasSavedPath && steps.length >= 2 && <p>Исходный путь — системные этапы в порядке CRM. Дополнительные колонки можно включить кнопкой «Шаги воронки»; они не становятся обязательными автоматически.</p>}
      {steps.length > 0 && <p className="break-words">Путь: {steps.map(label).join(' → ')}.</p>}
      {missingSteps.length > 0 && <p role="status">В текущем канбане нет этапов выбранного пути: {missingSteps.map(label).join(', ')}. Сохранённые ID и история остаются в расчёте; проверьте путь кнопкой «Шаги воронки».</p>}
      <p>Первый наблюдаемый вход · окно {windowDays} суток · источник и способ обращения на момент входа.</p>
      {view === 'sources' && <p>Выбранные источники сравниваются по одному периоду, пути и окну. Фильтр «По этапам» здесь не применяется.</p>}
    </div> : <details className="curai-crm-caption"><summary>Как читать текущий снимок</summary><p>Это текущие состояния обращений, не история прохождения. Проценты — доля от всех обращений выбранного периода создания. Разные обращения одного пациента считаются отдельно.</p></details>}
      {(error || query?.error || catalog.error) && <div role="alert" className="text-curai-negative">{error || query?.error || catalog.error} <button className="underline" onClick={reload}>Повторить</button></div>}
      {mode === 'history' && metadata && steps.length < 2 && <p role="status">Выберите хотя бы два шага кнопкой «Шаги воронки». В конфигурации CRM нет полного системного пути для автоматического выбора.</p>}
      {!report && !error && !query?.error && !catalog.error && (catalog.loading || mode !== 'history' || steps.length >= 2) && <LoadingIndicator label="Загрузка отчёта…" />}
      {report && <FunnelReportBody report={report} mode={mode} view={view} hidden={hidden} />}
    {(panel === 'rules' || panel === 'help') && <FunnelRules windowDays={windowDays} overview={panel === 'help'} onClose={closePanel} />}
    {panel && panel !== 'rules' && panel !== 'help' && <FunnelSettings key={panel} panel={panel} stages={panelStages} sources={sourceOptions} initial={panel === 'steps' ? [...steps] : panel === 'sources' ? [...selectedSourceKeys] : [...hidden]}
      loading={catalog.loading} error={catalog.error} onRetry={reload} needsSteps={panel === 'visibility' && mode === 'history' && steps.length < 2}
      onConfigureSteps={() => setPanel('steps')} onClose={closePanel} onDone={completePanel} />}
  </div>;
}
