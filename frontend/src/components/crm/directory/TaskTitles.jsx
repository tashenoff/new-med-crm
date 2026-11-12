import React, { useEffect, useRef, useState } from 'react';
import PagePanel from '../../common/PagePanel';
import PanelHeader from '../../common/PanelHeader';
import Modal from '../../modals/Modal';
import { inputClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses } from '../../modals/modalUtils';
import { apiClient, handleApiError } from '../../../api/config';
import { hasPermission } from '../../../utils/permissions';

export default function TaskTitles({ user }) {
  const [titles, setTitles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const canEdit = hasPermission(user, 'directory_edit');
  const load = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/crm/task-titles', { params: { include_inactive: true } });
      setTitles(data.titles || []);
    } catch (err) { setError(handleApiError(err)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const save = async event => {
    event.preventDefault();
    if (busy.current || !canEdit || !draft.name.trim()) return;
    busy.current = true; setSaving(true); setError('');
    try {
      const payload = { name: draft.name.trim(), is_active: draft.is_active };
      if (draft.id) await apiClient.put(`/crm/task-titles/${draft.id}`, payload);
      else await apiClient.post('/crm/task-titles', payload);
      setDraft(null);
      await load();
    } catch (err) { setError(handleApiError(err)); }
    finally { busy.current = false; setSaving(false); }
  };
  return <section className="w-full max-w-5xl min-w-0">
    <PagePanel>
      <PanelHeader title="Названия задач" subtitle="Справочник для задач в чатах и CRM"
        actionLabel="Добавить название" actionClass="shrink-0"
        onAction={canEdit ? () => { setError(''); setDraft({ name: '', is_active: true }); } : undefined} />
      <div className="curai-page-panel-body">
        {error && !draft && <p role="alert" className="curai-page-panel-message text-curai-negative">{error}</p>}
        <div className="curai-page-panel-toolbar flex flex-wrap items-center justify-between gap-2 text-sm text-curai-muted">
          <span>В архиве: недоступно для новых задач. Старые задачи сохраняются.</span>
          <span className="shrink-0">Всего: {titles.length}</span>
        </div>
        {loading ? <p role="status" className="p-6 text-curai-muted">Загрузка справочника...</p>
          : titles.length === 0 ? <p className="p-6 text-curai-muted">Названий пока нет.</p>
          : <div className="overflow-x-auto curai-page-panel-table">
            <table className="w-full table-fixed text-sm text-left">
              <colgroup><col /><col className="w-28 sm:w-36" />{canEdit && <col className="w-28 sm:w-36" />}</colgroup>
              <thead className="bg-curai-subtle text-curai-muted">
                <tr><th scope="col" className="px-4 sm:px-6 py-3 font-medium">Название</th>
                  <th scope="col" className="px-3 py-3 font-medium">Статус</th>
                  {canEdit && <th scope="col" className="px-4 sm:px-6 py-3 font-medium text-right">Действия</th>}</tr>
              </thead>
              <tbody>{titles.map(item => <tr key={item.id} className="border-t border-curai-border hover:bg-curai-subtle">
                <td className="px-4 sm:px-6 py-4 text-curai-ink font-medium break-words">{item.name}</td>
                <td className="px-3 py-4"><span className={`inline-flex items-center gap-2 text-xs ${item.is_active ? 'text-curai-positive' : 'text-curai-muted'}`}>
                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />{item.is_active ? 'Активно' : 'В архиве'}
                </span></td>
                {canEdit && <td className="px-4 sm:px-6 py-3 text-right"><button type="button" className={`${buttonSecondaryClasses} whitespace-nowrap`}
                  aria-label={`Изменить название «${item.name}»`}
                  onClick={() => { setError(''); setDraft({ ...item }); }}>Изменить</button></td>}
              </tr>)}</tbody>
            </table>
          </div>}
      </div>
    </PagePanel>
    <Modal show={Boolean(draft)} onClose={() => { if (!busy.current) setDraft(null); }} title={draft?.id ? 'Изменить название' : 'Новое название'} size="max-w-md">
      {draft && <form onSubmit={save} className="space-y-5">
        <div><label htmlFor="task-title-name" className={labelClasses}>Название</label>
          <input id="task-title-name" autoFocus required maxLength={120} className={`${inputClasses} h-11`} value={draft.name} disabled={saving}
            placeholder="Например, связаться с клиентом"
            onChange={event => setDraft({ ...draft, name: event.target.value })} />
        </div>
        <div className="rounded-md border border-curai-border p-4">
          <label className="flex gap-3 items-start text-sm text-curai-ink">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={draft.is_active} disabled={saving}
              onChange={event => setDraft({ ...draft, is_active: event.target.checked })} />
            <span><span className="block font-medium">Доступно для новых задач</span>
              <span className="block text-curai-muted mt-1">Снимите отметку, чтобы перенести название в архив. Существующие задачи не изменятся.</span></span>
          </label>
        </div>
        {error && <p role="alert" className="text-sm text-curai-negative">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-curai-border pt-4">
          <button type="button" className={buttonSecondaryClasses} disabled={saving} onClick={() => setDraft(null)}>Отмена</button>
          <button type="submit" disabled={saving || !draft.name.trim()} className={buttonPrimaryClasses}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </form>}
    </Modal>
  </section>;
}
