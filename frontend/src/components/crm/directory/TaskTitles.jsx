import React, { useEffect, useRef, useState } from 'react';
import PanelHeader from '../../common/PanelHeader';
import Modal from '../../modals/Modal';
import { inputClasses, labelClasses } from '../../modals/modalUtils';
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
  return <section className="bg-curai-surface border border-curai-border rounded-md">
    <PanelHeader title="Названия задач" subtitle="Названия для выбора при создании задачи в чате и в списке задач"
      actionLabel="+ Добавить название" onAction={canEdit ? () => { setError(''); setDraft({ name: '', is_active: true }); } : undefined} />
    {error && <p role="alert" className="m-4 text-curai-negative">{error}</p>}
    <div className="p-4 space-y-2">
      <p className="text-sm text-curai-muted mb-4">Неактивные названия не предлагаются для новых задач. Уже созданные задачи сохраняются.</p>
      {loading ? <p role="status">Загрузка названий...</p> : titles.length === 0 ? <p>Названий пока нет.</p> : titles.map(item =>
        <div key={item.id} className="flex items-center justify-between gap-4 border-b border-curai-border py-3">
          <span className="break-words">{item.name} {!item.is_active && <span className="text-curai-muted text-sm">(неактивно)</span>}</span>
          {canEdit && <button type="button" className="text-curai-blue" onClick={() => { setError(''); setDraft({ ...item }); }}>Изменить</button>}
        </div>)}
    </div>
    <Modal show={Boolean(draft)} onClose={() => { if (!busy.current) setDraft(null); }} title={draft?.id ? 'Изменить название' : 'Новое название'} size="max-w-md">
      {draft && <form onSubmit={save} className="space-y-4">
        <label className={labelClasses}>Название
          <input autoFocus required maxLength={120} className={inputClasses} value={draft.name} disabled={saving}
            onChange={event => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={draft.is_active} disabled={saving}
          onChange={event => setDraft({ ...draft, is_active: event.target.checked })} />Доступно при создании задач</label>
        {error && <p role="alert" className="text-curai-negative">{error}</p>}
        <div className="flex justify-end gap-3"><button type="button" disabled={saving} onClick={() => setDraft(null)}>Отмена</button>
          <button type="submit" disabled={saving || !draft.name.trim()} className="px-4 py-2 bg-curai-blue text-white rounded-md disabled:opacity-50">{saving ? 'Сохранение...' : 'Сохранить'}</button></div>
      </form>}
    </Modal>
  </section>;
}
