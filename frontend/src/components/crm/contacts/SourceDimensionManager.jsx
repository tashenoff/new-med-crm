import React, { useEffect, useState } from 'react';
import Modal from '../../modals/Modal';
import { sourceRequest } from '../../../utils/crmSources';
import { canAction } from '../../../utils/permissions';

const control = 'w-full rounded-md border border-curai-control bg-curai-surface px-3 py-2 text-sm';
const action = 'rounded-md border border-curai-control px-3 py-2 text-sm disabled:opacity-50';
const adapters = { manual: 'Ручной выбор', phone: 'Телефон', form: 'Форма', whatsapp: 'WhatsApp', email: 'Email', social: 'Соц. сеть' };
const signals = { form_id: 'ID формы', utm_source: 'UTM source', utm_medium: 'UTM medium', utm_campaign: 'UTM campaign', referral: 'Referral / метка ссылки', ad_id: 'ID объявления' };
export default function SourceDimensionManager({ kind, sources, user, onSaved }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canEdit = canAction(user, 'crm_view', 'crm_edit');
  const canMap = canEdit && ['admin', 'super_admin'].includes(user?.role);
  const isChannel = kind === 'channels';
  useEffect(() => {
    let active = true;
    Promise.all([sourceRequest('/sources/detection/status'), sourceRequest('/inbound-source-mappings')]).then(([status, numbers]) => { if (active) { setStatuses(status); setMappings(numbers); } }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [sources]);
  const rows = sources.flatMap(source => (source[kind] || []).map(row => ({ ...row, source_id: source.id, source_name: source.name, source_status: source.status })));
  const visible = rows.filter(row => (filter === 'all' || filter === row.source_id) && `${row.name} ${(row.tags || []).join(' ')}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const patch = fields => setEditor(current => ({ ...current, ...fields }));
  const open = row => setEditor({ id: row?.id || crypto.randomUUID(), name: row?.name || '', adapter: row?.adapter || 'manual', active: row?.active ?? true,
    source_id: row?.source_id || (filter === 'all' ? '' : filter), channel_id: row?.channel_id || null, signals: row?.signals || {},
    start_date: row?.start_date || '', end_date: row?.end_date || '', tagsText: (row?.tags || []).join(', '), persisted: Boolean(row),
    phone_number: mappings.find(item => item.source_id === row?.source_id && item.channel_id === row?.id)?.phone_number || '' });
  const save = async event => {
    event.preventDefault();
    if (!canEdit || busy) return;
    setBusy(true); setError('');
    try {
      const source = editor.baseSource || sources.find(row => row.id === editor.source_id);
      if (!source) throw new Error('Выберите существующий источник');
      const number = editor.phone_number.trim();
      const mapping = mappings.find(row => row.phone_number === number);
      if (isChannel && editor.adapter === 'phone' && number && canMap && !mapping) await sourceRequest('/inbound-source-mappings/validate', 'POST', { source_id: source.id, phone_number: number });
      if (mapping && (mapping.source_id !== source.id || (mapping.channel_id && mapping.channel_id !== editor.id))) throw new Error('Номер уже принадлежит другому источнику или способу обращения');
      const row = { id: editor.id, name: editor.name.trim(), active: editor.active, signals: editor.signals,
        ...(isChannel ? { adapter: editor.adapter } : { channel_id: editor.channel_id || null, start_date: editor.start_date || null, end_date: editor.end_date || null, tags: editor.tagsText.split(',').map(tag => tag.trim()).filter(Boolean) }) };
      const updated = await sourceRequest(`/sources/${encodeURIComponent(source.id)}`, 'PUT', { dimensions_revision: source.dimensions_revision || 0,
        [kind]: editor.persisted ? source[kind].map(item => item.id === editor.id ? row : item) : [...(source[kind] || []), row] });
      setEditor(current => ({ ...current, persisted: true, baseSource: updated }));
      // Keep the saved ID/revision if reservation fails, so retry cannot duplicate it.
      if (isChannel && editor.adapter === 'phone' && number && canMap) {
        await sourceRequest(mapping ? `/inbound-source-mappings/${encodeURIComponent(number)}` : '/inbound-source-mappings', mapping ? 'PUT' : 'POST', {
          ...(!mapping ? { phone_number: number } : {}), source_id: source.id, channel_id: editor.id, campaign_id: mapping?.campaign_id || null
        });
      }
      await onSaved(); setEditor(null);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const selectedSource = editor && sources.find(source => source.id === editor.source_id);
  return <section className="space-y-4" aria-label={isChannel ? 'Список способов обращения' : 'Список кампаний'}>
    <div className="flex flex-wrap items-end gap-3"><label className="text-sm min-w-0">Источник<select aria-label="Фильтр источника справочника" className={control} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Все источники</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label><label className="text-sm min-w-0">{isChannel ? 'Поиск' : 'Название или метка'}<input className={control} value={search} onChange={e => setSearch(e.target.value)} /></label><button type="button" className={action} disabled={!canEdit || !sources.length} onClick={() => open()}>{isChannel ? 'Добавить способ' : 'Добавить кампанию'}</button></div>
    {!visible.length && <p>Записей пока нет. Добавление не требует открытия карточки источника.</p>}
    <div className="grid gap-3 lg:grid-cols-2">{visible.map(row => {
      const status = statuses.find(item => item.source_id === row.source_id && item.id === row.id && item.dimension === kind);
      return <article key={JSON.stringify([row.source_id, row.id])} className="rounded-md border border-curai-border p-4 bg-curai-surface min-w-0 space-y-2"><h3 className="font-medium break-words">{row.name}</h3><p className="text-sm break-words">{row.source_name}{isChannel && ` · ${adapters[row.adapter] || 'Неизвестный адаптер'}`}</p><p className="text-xs text-curai-muted">{row.active && row.source_status === 'active' ? 'Активен' : 'Отключён'} · {status?.status || 'Состояние детектора не получено'}</p>{Boolean(status?.conflicts?.length) && <p role="status" className="text-xs text-curai-negative">Конфликтующих правил: {status.conflicts.length}. Совпадение не выбирается наугад.</p>}{!isChannel && <p className="text-xs text-curai-muted break-words">Период: {row.start_date || 'не задан'} — {row.end_date || 'не задан'} · {(row.tags || []).join(', ')}</p>}<button type="button" className={action} disabled={!canEdit} onClick={() => open(row)}>Редактировать</button></article>;
    })}</div>
    {error && !editor && <p role="alert" className="text-curai-negative">{error}</p>}
    {editor && <Modal show title={isChannel ? 'Способ обращения' : 'Кампания'} size="max-w-lg" onClose={() => !busy && setEditor(null)}>
      <form onSubmit={save} className="p-4 space-y-4"><fieldset disabled={busy} className="space-y-3">
        <label className="block text-sm">Источник<select required aria-label="Источник записи справочника" className={control} disabled={editor.persisted} value={editor.source_id} onChange={e => patch({ source_id: e.target.value, channel_id: null })}><option value="">Выберите источник</option>{sources.filter(source => source.status === 'active' || source.id === editor.source_id).map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
        <label className="block text-sm">Название<input required className={control} maxLength={100} value={editor.name} onChange={e => patch({ name: e.target.value })} /></label>
        {isChannel ? <><label className="block text-sm">Тип адаптера<select className={control} value={editor.adapter} disabled={editor.persisted} onChange={e => patch({ adapter: e.target.value })}>{Object.entries(adapters).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><p className="text-xs text-curai-muted">Название не подключает интеграцию. Для нового адаптера создаётся новый способ; сохранённый ID не меняет смысл.</p>
          {editor.adapter === 'phone' && <label className="block text-sm">Входящий номер клиники<input type="tel" className={control} value={editor.phone_number} readOnly={!canMap} placeholder="+ код страны и номер" onChange={e => patch({ phone_number: e.target.value })} /><span className="text-xs text-curai-muted">Номер назначения called_did. Привязку настраивает администратор; прежние обращения не меняются.</span></label>}
        </> : <>
          <label className="block text-sm">Способ обращения (необязательно)<select className={control} value={editor.channel_id || ''} onChange={e => patch({ channel_id: e.target.value || null })}><option value="">Не ограничивать способом</option>{(selectedSource?.channels || []).map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-2">{['start_date', 'end_date'].map(key => <label key={key} className="text-sm min-w-0">{key === 'start_date' ? 'Дата начала' : 'Дата окончания'}<input type="date" className={control} value={editor[key]} onChange={e => patch({ [key]: e.target.value })} /></label>)}</div>
          <label className="block text-sm">Метки через запятую<input className={control} value={editor.tagsText} onChange={e => patch({ tagsText: e.target.value })} /></label>
        </>}
        <details><summary className="cursor-pointer text-sm text-curai-blue">Правила сопоставления (необязательно)</summary><p className="text-xs text-curai-muted mt-2">Все признаки должны точно совпасть. Без поддержанного входящего адаптера эти правила не выполняются автоматически. Общий WhatsApp без метки остаётся без угаданного источника.</p><div className="mt-2 space-y-2">{Object.entries(signals).map(([key, label]) => <label key={key} className="block text-xs">{label}<input className={control} value={editor.signals[key] || ''} maxLength={key === 'referral' ? 500 : 200} onChange={e => patch({ signals: { ...editor.signals, [key]: e.target.value || null } })} /></label>)}</div></details>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={editor.active} onChange={e => patch({ active: e.target.checked })} />Активен</label><p className="text-xs text-curai-muted">Отключение сохраняет историю. Кампания не является обязательным шагом или подтипом способа связи.</p>
      </fieldset>{error && <p role="alert" className="text-sm text-curai-negative">{error}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={busy} className={action} onClick={() => setEditor(null)}>Закрыть</button><button type="submit" disabled={busy || !canEdit} className={action}>Сохранить</button></div></form>
    </Modal>}
  </section>;
}
