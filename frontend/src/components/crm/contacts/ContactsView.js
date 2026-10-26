import LoadingIndicator from '../../common/LoadingIndicator';
import React, { useCallback, useEffect, useState } from 'react';
import { canAction } from '../../../utils/permissions';
import { sourceRequest } from '../../../utils/crmSources';
import SourceEditor from './SourceEditor';
import SourceDimensionManager from './SourceDimensionManager';
import { pricingSchemes } from './SourcePricing';
import PanelHeader from '../../common/PanelHeader';
import '../crmReports.css';

const action = 'curai-button curai-button-ghost disabled:opacity-50';
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
  return <div className="curai-crm-page">
    <PanelHeader title="Источники обращений" subtitle="Справочники привлечения и связи. Статистика — в разделе «Привлечение»." actions={tab === 'sources' && <button type="button" className="curai-button curai-button-primary" disabled={!canEdit} onClick={() => setEditor({})}>Новый источник</button>} />
    <div role="tablist" aria-label="Настройки источников" className="curai-patient-tabs">{[['sources', 'Источники'], ['channels', 'Способы обращения'], ['campaigns', 'Кампании']].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
    {error && <p role="alert" className="text-curai-negative">{error} <button className="underline" onClick={refresh}>Повторить</button></p>}
    {loading ? <LoadingIndicator label="Загрузка справочников…" /> : tab === 'sources' ? <section aria-label="Список источников" className="space-y-4">
      {!sources.length && <p>Источников пока нет. Создайте источник, затем при необходимости добавьте способы обращения и кампании на соседних вкладках.</p>}
      {sources.length > 0 && <div className="curai-crm-table-wrap"><table className="curai-crm-table"><thead><tr><th scope="col">Источник</th><th scope="col">Статус</th><th scope="col">Связи</th><th scope="col">Схема оплаты</th><th scope="col">Действия</th></tr></thead><tbody>{sources.map(source => {
        const now = Date.now();
        const current = [...(source.pricing_history || [])].filter(row => new Date(row.effective_at).getTime() <= now).sort((a, b) => new Date(b.effective_at) - new Date(a.effective_at))[0];
        return <tr key={source.id} data-source-id={source.id}>
          <td><h2>{source.name}</h2>{source.description && <small>{source.description}</small>}</td>
          <td data-label="Статус"><span className={`curai-crm-status ${source.status === 'active' ? 'is-active' : ''}`}>{source.status === 'active' ? 'Активен' : 'Отключён'}</span></td>
          <td data-label="Связи"><span>Способов: {source.channels?.length || 0} · Кампаний: {source.campaigns?.length || 0}</span></td>
          <td data-label="Схема оплаты">{current ? `${pricingSchemes[current.scheme]}${current.amount == null ? '' : ` · ${current.amount} ₸`}` : 'Не задана'}</td>
          <td><div className="curai-crm-row-actions"><button type="button" disabled={!canEdit} className={action} onClick={() => setEditor(source)}>Редактировать</button><button type="button" disabled={!canEdit} className="curai-crm-text-action disabled:opacity-50" onClick={() => archive(source)}>{source.status === 'active' ? 'Отключить' : 'Включить'}</button></div></td>
        </tr>;
      })}</tbody></table></div>}
    </section> : <SourceDimensionManager key={tab} kind={tab} sources={sources} user={user} onSaved={refresh} />}
    {editor && <SourceEditor source={editor.id ? editor : null} canEdit={canEdit} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await refresh(); }} />}
  </div>;
}
