import React, { useCallback, useEffect, useState } from 'react';
import { canAction } from '../../../utils/permissions';
import { sourceRequest } from '../../../utils/crmSources';
import SourceEditor from './SourceEditor';
import SourceDimensionManager from './SourceDimensionManager';
import { pricingSchemes } from './SourcePricing';

const action = 'rounded-md border border-curai-control px-3 py-2 text-sm disabled:opacity-50';
export default function ContactsView({ user }) {
  const [sources, setSources] = useState([]);
  const [tab, setTab] = useState('sources');
  const [editor, setEditor] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const canEdit = canAction(user, 'crm_view', 'crm_edit');
  const refresh = useCallback(async () => {
    try { setSources(await sourceRequest('/sources/configuration/catalog')); setError(''); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const archive = async source => {
    if (!canEdit) return;
    try { await sourceRequest(`/sources/${encodeURIComponent(source.id)}`, 'PUT', { status: source.status === 'active' ? 'inactive' : 'active' }); await refresh(); }
    catch (failure) { setError(failure.message); }
  };
  return <div className="space-y-5 min-w-0">
    <div><h1 className="text-2xl font-semibold text-curai-ink">Источники обращений</h1><p className="mt-1 text-sm text-curai-muted">Справочники привлечения и связи. Статистика — в разделе «Привлечение» рядом с воронкой.</p></div>
    <div role="tablist" aria-label="Настройки источников" className="flex flex-wrap gap-2">{[['sources', 'Источники'], ['channels', 'Способы обращения'], ['campaigns', 'Кампании']].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`${action} ${tab === key ? 'bg-curai-selected text-curai-blue' : ''}`} onClick={() => setTab(key)}>{label}</button>)}</div>
    {error && <p role="alert" className="text-curai-negative">{error} <button className="underline" onClick={refresh}>Повторить</button></p>}
    {loading ? <p role="status">Загрузка справочников…</p> : tab === 'sources' ? <section aria-label="Список источников" className="space-y-4">
      <button type="button" className={action} disabled={!canEdit} onClick={() => setEditor({})}>Новый источник</button>
      {!sources.length && <p>Источников пока нет. Создайте источник, затем при необходимости добавьте способы обращения и кампании на соседних вкладках.</p>}
      <div className="grid gap-3 lg:grid-cols-2">{sources.map(source => {
        const now = Date.now();
        const current = [...(source.pricing_history || [])].filter(row => new Date(row.effective_at).getTime() <= now).sort((a, b) => new Date(b.effective_at) - new Date(a.effective_at))[0];
        return <article key={source.id} data-source-id={source.id} className="rounded-md border border-curai-border bg-curai-surface p-4 space-y-3 min-w-0">
          <h2 className="font-medium break-words">{source.name}</h2><p className="text-xs text-curai-muted">{source.status === 'active' ? 'Активен' : 'Отключён'} · Способов: {source.channels?.length || 0} · Кампаний: {source.campaigns?.length || 0}</p>
          <p className="text-sm">{current ? `${pricingSchemes[current.scheme]}${current.amount == null ? '' : ` · ${current.amount} ₸`}` : 'Схема оплаты не задана'}</p>
          {source.description && <p className="text-sm text-curai-muted break-words">{source.description}</p>}
          <div className="flex flex-wrap gap-2"><button type="button" disabled={!canEdit} className={action} onClick={() => setEditor(source)}>Редактировать</button><button type="button" disabled={!canEdit} className={action} onClick={() => archive(source)}>{source.status === 'active' ? 'Отключить' : 'Включить'}</button></div>
        </article>;
      })}</div>
    </section> : <SourceDimensionManager key={tab} kind={tab} sources={sources} user={user} onSaved={refresh} />}
    {editor && <SourceEditor source={editor.id ? editor : null} canEdit={canEdit} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await refresh(); }} />}
  </div>;
}
