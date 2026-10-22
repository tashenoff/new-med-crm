import '../crmReports.css';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { sourceRequest } from '../../../utils/crmSources';
import SourceDimensions from './SourceDimensions';
import SourcePricing from './SourcePricing';
import SourceExpenses from './SourceExpenses';

const sourceTypes = { website: 'Сайт', social: 'Соц. сети', referral: 'Рекомендации',
  advertising: 'Реклама', phone: 'Телефон', email: 'Email', other: 'Другое' };
const control = 'w-full border border-curai-control rounded-md px-3 py-2 text-sm';

export default function SourceEditor({ source, onClose, onSaved, canManageNumbers, canEdit = false, canDeleteNumbers = false, showDimensionSettings = false, showLegacyNumbers = false, showExpenses = false }) {
  const [form, setForm] = useState({ name: source?.name || '', type: source?.type || 'other',
    description: source?.description || '', url: source?.url || '',
    cost_per_lead: source?.cost_per_lead || 0, monthly_budget: source?.monthly_budget ?? '' });
  const [savedSource, setSavedSource] = useState(source);
  const [channels, setChannels] = useState(() => (source?.channels || []).map(row => ({ ...row, persisted: true })));
  const [campaigns, setCampaigns] = useState(() => (source?.campaigns || []).map(row => ({ ...row, persisted: true })));
  const [tariff, setTariff] = useState({ scheme: '', amount: '', effective_at: '' });
  const [mappingChannel, setMappingChannel] = useState('');
  const [mappingCampaign, setMappingCampaign] = useState('');
  const [mappings, setMappings] = useState([]);
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const primary = mappings[0];
  const hasPhoneChannels = channels.some(row => row.active && row.adapter === 'phone');

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = event => { if (event.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', close); };
  }, [busy, onClose]);

  useEffect(() => {
    let active = true;
    sourceRequest('/inbound-source-mappings').then(rows => {
      if (!active) return;
      const related = rows.filter(row => row.source_id === source?.id);
      setMappings(related);
      setNumber(source?.channels?.some(row => row.active && row.adapter === 'phone') ? '' : related[0]?.phone_number || '');
      setMappingChannel(related[0]?.channel_id || '');
      setMappingCampaign(related[0]?.campaign_id || '');
    }).catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [source?.id, source?.channels]);

  const removeNumber = async phone => {
    if (!canDeleteNumbers) return;
    setBusy(true); setError('');
    try {
      await sourceRequest(`/inbound-source-mappings/${encodeURIComponent(phone)}`, 'DELETE');
      const remaining = mappings.filter(mapping => mapping.phone_number !== phone);
      setMappings(remaining); setNumber(remaining[0]?.phone_number || '');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  const save = async event => {
    event.preventDefault();
    if (!canEdit) return;
    if (busy || loading) return;
    setBusy(true); setError('');
    let saved = savedSource;
    try {
      let validated;
      if (canManageNumbers && (form.type === 'phone' || hasPhoneChannels) && number.trim() && (!primary || hasPhoneChannels)) {
        validated = await sourceRequest('/inbound-source-mappings/validate', 'POST', {
          phone_number: number.trim(), source_id: saved?.id || 'new-source'
        });
      }
      const payload = { ...form, name: form.name.trim(), cost_per_lead: Number(form.cost_per_lead) || 0,
        channels: channels.map(({ persisted, ...row }) => row), campaigns: campaigns.map(({ persisted, ...row }) => row),
        ...(saved ? { dimensions_revision: saved.dimensions_revision || 0 } : {}),
        ...(tariff.scheme ? { tariff: { scheme: tariff.scheme, amount: tariff.scheme === 'free' ? 0 : tariff.scheme === 'actual' ? null : Number(tariff.amount), effective_at: new Date(tariff.effective_at).toISOString() } } : {}),
        monthly_budget: form.monthly_budget === '' ? null : Number(form.monthly_budget) };
      saved = await sourceRequest(saved ? `/sources/${encodeURIComponent(saved.id)}` : '/sources/', saved ? 'PUT' : 'POST', payload);
      setSavedSource(saved);
      setChannels((saved.channels || []).map(row => ({ ...row, persisted: true })));
      setCampaigns((saved.campaigns || []).map(row => ({ ...row, persisted: true })));
      setTariff({ scheme: '', amount: '', effective_at: '' });
      if (validated) {
        const mapping = await sourceRequest('/inbound-source-mappings', 'POST', {
          phone_number: validated.phone_number, source_id: saved.id,
          ...(mappingChannel ? { channel_id: mappingChannel } : {}), ...(mappingCampaign ? { campaign_id: mappingCampaign } : {})
        });
        setMappings(current => [...current, mapping]);
      }
      onSaved(saved);
    } catch (failure) {
      // A racing reservation can fail after source creation. Retain its ID and
      // edit it on retry instead of creating a duplicate source.
      setError(`${saved && !source ? 'Источник уже сохранён. ' : ''}${failure.message}`);
    } finally { setBusy(false); }
  };

  const field = (key, label, type = 'text') => <label className="block text-sm text-curai-ink">
    {label}
    <input className={`${control} mt-1`} type={type} value={form[key]} required={key === 'name'}
      min={type === 'number' ? '0' : undefined} step={type === 'number' ? '0.01' : undefined}
      onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} />
  </label>;

  return createPortal(<div data-source-overlay className="modal-wrapper curai-surface-root !pointer-events-auto bg-black/50" onClick={() => !busy && onClose()}>
    <form role="dialog" aria-modal="true" aria-labelledby="source-editor-title" onSubmit={save}
      onClick={event => event.stopPropagation()} className="curai-crm-source-dialog bg-curai-surface rounded-md w-full max-w-md max-h-[90vh]">
      <div className="curai-crm-source-header">
        <h2 id="source-editor-title" className="text-xl font-semibold text-curai-ink">{savedSource ? 'Редактировать источник' : 'Новый источник'}</h2>
        <button type="button" aria-label="Закрыть форму источника" disabled={busy} onClick={onClose}>×</button>
      </div>
      <div className="curai-crm-source-body"><fieldset disabled={busy} className="space-y-4">
        {field('name', 'Название *')}
        <details><summary className="cursor-pointer text-sm text-curai-blue">Дополнительные настройки источника</summary><label className="block mt-3 text-sm text-curai-ink">Тип (прежняя категория)
          <select className={`${control} mt-1`} value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value }))}>
            {Object.entries(sourceTypes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <p className="mt-2 text-xs text-curai-muted">Прежняя категория сохранена. Способы обращения на соседней вкладке не ограничены этой категорией.</p></details>
        {showDimensionSettings && <SourceDimensions channels={channels} campaigns={campaigns} onChange={(field, rows) => field === 'channels' ? setChannels(rows) : setCampaigns(rows)} />}
        {showLegacyNumbers && (form.type === 'phone' || channels.some(row => row.adapter === 'phone')) && <div className="space-y-2">
          <label className="block text-sm text-curai-ink">Входящий номер клиники
            <input type="tel" className={`${control} mt-1`} value={number} maxLength={50} placeholder="+ код страны и номер"
              readOnly={(Boolean(primary) && !hasPhoneChannels) || !canManageNumbers || loading} onChange={event => setNumber(event.target.value)} />
          </label>
          <p className="text-xs text-curai-muted">Международный формат с + и кодом страны. Без номера автоматическая привязка не настроена.</p>
          {(!primary || hasPhoneChannels) && <>
            <label className="block text-sm">Канал входящего номера<select className={control} value={mappingChannel} onChange={e => { setMappingChannel(e.target.value); setMappingCampaign(''); }}><option value="">Не определён (старый формат)</option>{channels.filter(row => row.active && row.adapter === 'phone').map(row => <option key={row.id} value={row.id}>{row.name || 'Без названия'}</option>)}</select></label>
            <label className="block text-sm">Кампания номера (необязательно)<select className={control} value={mappingCampaign} onChange={e => setMappingCampaign(e.target.value)}><option value="">Не указана</option>{campaigns.filter(row => row.active && (!row.channel_id || row.channel_id === mappingChannel)).map(row => <option key={row.id} value={row.id}>{row.name || 'Без названия'}</option>)}</select></label>
          </>}
          {loading && <p role="status">Загрузка привязок…</p>}
        </div>}
        {showLegacyNumbers && mappings.length > 0 && <div className="space-y-2 text-sm">
          <p className="text-curai-muted">Привязанные номера: {form.type !== 'phone' && 'сохраняются при смене типа источника.'}</p>
          {mappings.map(mapping => <div key={mapping.phone_number} className="flex items-center justify-between gap-2">
            <span>{mapping.phone_number}</span>
            {canManageNumbers && canDeleteNumbers && <button type="button" className="text-curai-negative underline"
              onClick={() => removeNumber(mapping.phone_number)} aria-label={`Снять привязку ${mapping.phone_number}`}>Снять привязку</button>}
          </div>)}
          <p className="text-xs text-curai-muted">Чтобы заменить номер, снимите его привязку и укажите новый. История обращений не меняется.</p>
        </div>}
        {showLegacyNumbers && !canManageNumbers && <p className="text-xs text-curai-muted">Привязки номеров меняет администратор.</p>}
        <label className="block text-sm text-curai-ink">Описание
          <textarea className={`${control} mt-1`} rows={3} value={form.description}
            onChange={event => setForm(current => ({ ...current, description: event.target.value }))} />
        </label>
        {field('url', 'URL', 'url')}
        <SourcePricing value={tariff} onChange={setTariff} history={savedSource?.pricing_history || []} />
        {source?.cost_per_lead > 0 && <p className="text-xs text-curai-muted">Прежняя договорная цена заявки: {source.cost_per_lead} ₸. Не подтверждает расходы; сохранена без переоценки истории.</p>}
        {field('monthly_budget', 'Месячный бюджет — план (₸)', 'number')}
      </fieldset>
      {showExpenses && savedSource?.id && <SourceExpenses source={savedSource} campaigns={campaigns.filter(row => row.persisted)} canEdit={canEdit} />}
      {error && <p role="alert" className="mt-4 text-sm text-curai-negative">{error}</p>}
      </div><div className="curai-crm-modal-actions">
        <button type="button" disabled={busy} onClick={onClose} className="curai-button curai-button-secondary">Отмена</button>
        <button type="submit" disabled={!canEdit || busy || loading || !form.name.trim()} className="curai-button curai-button-primary disabled:opacity-50">
          {busy ? 'Сохранение…' : savedSource ? 'Сохранить' : 'Создать'}
        </button>
      </div>
    </form>
  </div>, document.body);
}
