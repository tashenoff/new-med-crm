import React, { useEffect, useState } from 'react';
import { sourceRequest } from '../../../utils/crmSources';

const sourceTypes = { website: 'Сайт', social: 'Соц. сети', referral: 'Рекомендации',
  advertising: 'Реклама', phone: 'Телефон', email: 'Email', other: 'Другое' };
const control = 'w-full border border-curai-control rounded-md px-3 py-2 text-sm';

export default function SourceEditor({ source, onClose, onSaved, canManageNumbers }) {
  const [form, setForm] = useState({ name: source?.name || '', type: source?.type || 'website',
    description: source?.description || '', url: source?.url || '',
    cost_per_lead: source?.cost_per_lead || 0, monthly_budget: source?.monthly_budget ?? '' });
  const [savedSource, setSavedSource] = useState(source);
  const [mappings, setMappings] = useState([]);
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const primary = mappings[0];

  useEffect(() => {
    let active = true;
    sourceRequest('/inbound-source-mappings').then(rows => {
      if (!active) return;
      const related = rows.filter(row => row.source_id === source?.id);
      setMappings(related);
      setNumber(related[0]?.phone_number || '');
    }).catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [source?.id]);

  const removeNumber = async phone => {
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
    if (busy || loading) return;
    setBusy(true); setError('');
    let saved = savedSource;
    try {
      let validated;
      if (canManageNumbers && form.type === 'phone' && number.trim() && !primary) {
        validated = await sourceRequest('/inbound-source-mappings/validate', 'POST', {
          phone_number: number.trim(), source_id: saved?.id || 'new-source'
        });
      }
      const payload = { ...form, name: form.name.trim(), cost_per_lead: Number(form.cost_per_lead) || 0,
        monthly_budget: form.monthly_budget === '' ? null : Number(form.monthly_budget) };
      saved = await sourceRequest(saved ? `/sources/${encodeURIComponent(saved.id)}` : '/sources/', saved ? 'PUT' : 'POST', payload);
      setSavedSource(saved);
      if (validated) {
        const mapping = await sourceRequest('/inbound-source-mappings', 'POST', {
          phone_number: validated.phone_number, source_id: saved.id
        });
        setMappings([mapping]);
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

  return <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
    <form role="dialog" aria-modal="true" aria-labelledby="source-editor-title" onSubmit={save}
      onClick={event => event.stopPropagation()} className="bg-curai-surface rounded-md p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 id="source-editor-title" className="text-xl font-semibold text-curai-ink">{savedSource ? 'Редактировать источник' : 'Новый источник'}</h2>
        <button type="button" aria-label="Закрыть форму источника" disabled={busy} onClick={onClose}>×</button>
      </div>
      <fieldset disabled={busy} className="space-y-4">
        {field('name', 'Название *')}
        <label className="block text-sm text-curai-ink">Тип *
          <select className={`${control} mt-1`} value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value }))}>
            {Object.entries(sourceTypes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        {form.type === 'phone' && <div className="space-y-2">
          <label className="block text-sm text-curai-ink">Входящий номер клиники
            <input type="tel" className={`${control} mt-1`} value={number} maxLength={50} placeholder="+ код страны и номер"
              readOnly={Boolean(primary) || !canManageNumbers || loading} onChange={event => setNumber(event.target.value)} />
          </label>
          <p className="text-xs text-curai-muted">Международный формат с + и кодом страны. Без номера автоматическая привязка не настроена.</p>
          {loading && <p role="status">Загрузка привязок…</p>}
        </div>}
        {mappings.length > 0 && <div className="space-y-2 text-sm">
          <p className="text-curai-muted">Привязанные номера: {form.type !== 'phone' && 'сохраняются при смене типа источника.'}</p>
          {mappings.map(mapping => <div key={mapping.phone_number} className="flex items-center justify-between gap-2">
            <span>{mapping.phone_number}</span>
            {canManageNumbers && <button type="button" className="text-curai-negative underline"
              onClick={() => removeNumber(mapping.phone_number)} aria-label={`Снять привязку ${mapping.phone_number}`}>Снять привязку</button>}
          </div>)}
          <p className="text-xs text-curai-muted">Чтобы заменить номер, снимите его привязку и укажите новый. История обращений не меняется.</p>
        </div>}
        {!canManageNumbers && <p className="text-xs text-curai-muted">Привязки номеров меняет администратор.</p>}
        <label className="block text-sm text-curai-ink">Описание
          <textarea className={`${control} mt-1`} rows={3} value={form.description}
            onChange={event => setForm(current => ({ ...current, description: event.target.value }))} />
        </label>
        {field('url', 'URL', 'url')}
        <div className="grid grid-cols-2 gap-4">{field('cost_per_lead', 'Стоимость заявки (₸)', 'number')}{field('monthly_budget', 'Месячный бюджет (₸)', 'number')}</div>
      </fieldset>
      {error && <p role="alert" className="mt-4 text-sm text-curai-negative">{error}</p>}
      <div className="flex justify-end gap-3 mt-6">
        <button type="button" disabled={busy} onClick={onClose} className="px-4 py-2 border border-curai-control rounded-md">Отмена</button>
        <button type="submit" disabled={busy || loading || !form.name.trim()} className="px-4 py-2 bg-curai-blue text-white rounded-md disabled:opacity-50">
          {busy ? 'Сохранение…' : savedSource ? 'Сохранить' : 'Создать'}
        </button>
      </div>
    </form>
  </div>;
}
