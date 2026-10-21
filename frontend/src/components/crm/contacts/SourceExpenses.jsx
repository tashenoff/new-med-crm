import React, { useEffect, useState } from 'react';
import { sourceRequest } from '../../../utils/crmSources';

const control = 'w-full border border-curai-control rounded-md px-3 py-2 text-sm bg-curai-surface';
const empty = () => ({ id: crypto.randomUUID(), start: '', end: '', amount: '', currency: 'KZT', campaign_id: '', clicks: '', impressions: '' });
const metric = (value, currency) => value == null ? '—' : `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${currency}`;
export default function SourceExpenses({ source, campaigns, canEdit }) {
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    let active = true;
    sourceRequest(`/sources/${encodeURIComponent(source.id)}/expenses`).then(data => { if (active) setRows(data); }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [source.id, revision, expanded]);
  const patch = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const save = async () => {
    if (busy || !canEdit) return;
    setError('');
    if (!draft.start || !draft.end || draft.amount === '' || !Number.isFinite(Number(draft.amount)) || Number(draft.amount) < 0) {
      setError('Укажите период и неотрицательную сумму. Неизвестная сумма не равна нулю.'); return;
    }
    setBusy(true);
    try {
      await sourceRequest(`/sources/${encodeURIComponent(source.id)}/expenses`, 'POST', {
        ...draft, start: new Date(draft.start).toISOString(), end: new Date(draft.end).toISOString(), amount: Number(draft.amount),
        campaign_id: draft.campaign_id || null, clicks: draft.clicks === '' ? null : Number(draft.clicks), impressions: draft.impressions === '' ? null : Number(draft.impressions)
      });
      setDraft(empty()); setRevision(value => value + 1);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <section className="mt-5 space-y-3" aria-label="Фактические маркетинговые расходы">
    <button type="button" className="text-sm text-curai-blue underline" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Скрыть' : 'Открыть'} фактические расходы ({rows.length})</button>
    {expanded && <>
      <p className="text-xs text-curai-muted">Ручные подтверждённые суммы за период [начало, конец), отдельно от бюджета и тарифа. Без импорта Google Ads и бухгалтерских операций. Общие расходы источника нельзя дублировать детализацией кампаний за пересекающийся период.</p>
      <ul className="space-y-3 text-xs">{rows.map(row => <li key={row.id} className="border border-curai-control rounded-md p-3 break-words">
        {new Date(row.start).toLocaleString('ru-RU')} — {new Date(row.end).toLocaleString('ru-RU')} · {row.campaign_id ? campaigns.find(campaign => campaign.id === row.campaign_id)?.name || 'Недоступная кампания' : 'Весь источник'}
        <p>Расход: {metric(row.amount, row.currency)} · CPC: {metric(row.cpc, row.currency)} · CPL: {metric(row.cpl, row.currency)}</p>
        <p>CPL: расход / {row.inquiries} обращений, созданных за этот же период{row.campaign_id && ' в этой кампании'}. Кликов: {row.clicks ?? '—'}; показов: {row.impressions ?? '—'}.</p>
      </li>)}</ul>
      {canEdit && <fieldset disabled={busy} className="space-y-2 border border-curai-control rounded-md p-3">
        <legend className="text-sm">Новая запись расхода</legend>
        {['start', 'end'].map(key => <label key={key} className="block text-sm">{key === 'start' ? 'Начало периода' : 'Конец периода (не включительно)'}<input type="datetime-local" className={control} value={draft[key]} onChange={e => patch(key, e.target.value)} /></label>)}
        <label className="block text-sm">Сумма<input className={control} type="number" min="0" step="0.01" value={draft.amount} onChange={e => patch('amount', e.target.value)} /></label>
        <label className="block text-sm">Валюта (ISO 4217)<input className={control} maxLength={3} value={draft.currency} onChange={e => patch('currency', e.target.value.toUpperCase())} /></label>
        <label className="block text-sm">Кампания<select className={control} value={draft.campaign_id} onChange={e => patch('campaign_id', e.target.value)}><option value="">Весь источник</option>{campaigns.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        {['clicks', 'impressions'].map(key => <label key={key} className="block text-sm">{key === 'clicks' ? 'Клики (необязательно)' : 'Показы (необязательно)'}<input className={control} type="number" min="0" step="1" value={draft[key]} onChange={e => patch(key, e.target.value)} /></label>)}
        <button type="button" className="text-sm text-curai-blue underline" onClick={save}>Записать фактический расход</button>
      </fieldset>}
    </>}
    {error && <p role="alert" className="text-sm text-curai-negative">{error}</p>}
  </section>;
}
