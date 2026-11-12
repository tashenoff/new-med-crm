import React, { useEffect, useRef, useState } from 'react';
import { apiClient, handleApiError } from '../../../api/config';
import TaskContactPicker from './TaskContactPicker';
import CuraiButton from '../../common/CuraiButton';
import { hasPermission } from '../../../utils/permissions';

export const ENTRY_KINDS = { task: 'Задача', note: 'Заметка', comment: 'Примечание' };
export const localDateTime = value => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const control = 'h-10 w-full min-w-0 rounded-md border border-curai-control bg-curai-surface px-3 text-sm text-curai-ink';
const fieldLabel = 'mb-1.5 block text-xs font-medium text-curai-muted';

// Shared by the inbox and task page. Internal records never use the WhatsApp send endpoint.
export default function TaskComposer({ initialTask, chat, leadId, user, onSaved, onCancel, initialKind = 'task' }) {
  const [draft, setDraft] = useState(() => ({ kind: initialTask?.kind || initialKind, title_id: initialTask?.title_id || '', title: initialTask?.title || '', description: initialTask?.description || '', assigned_to: initialTask?.assigned_to || '', due_date: localDateTime(initialTask?.due_date), priority: initialTask?.priority || 'medium' }));
  const [titles, setTitles] = useState([]), [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const standalone = !chat && !leadId;
  const [contact, setContact] = useState(() => {
    const id = initialTask?.contact_id || (initialTask?.client_id ? `patient:${initialTask.client_id}` : initialTask?.lead_id ? `lead:${initialTask.lead_id}` : null);
    return id || initialTask?.chat_phone ? { id, name: initialTask?.contact_name || initialTask?.client_name || initialTask?.lead_name || initialTask?.chat_name || 'Связанный контакт', phone: initialTask?.chat_phone } : null;
  });
  const [contactChanged, setContactChanged] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const locked = useRef(false), alive = useRef(true);
  const allowed = hasPermission(user, initialTask?.id ? 'crm_tasks_edit' : 'crm_tasks_create');
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    Promise.all([apiClient.get('/crm/task-titles'), apiClient.get('/crm/tasks/assignees')]).then(([names, managers]) => {
      if (cancelled) return;
      setTitles(names.data.titles || []); setAssignees(managers.data.assignees || []); setLoading(false);
    }).catch(e => { if (!cancelled) { setError(handleApiError(e)); setLoading(false); } });
    return () => { cancelled = true; alive.current = false; };
  }, []);
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const save = async event => {
    event.preventDefault();
    if (!allowed || locked.current || loading) return;
    if (!draft.title.trim()) { setError('Укажите название'); return; }
    if (draft.kind === 'task' && (!draft.due_date || !draft.assigned_to)) { setError('Выберите срок и ответственного'); return; }
    const date = draft.kind === 'task' ? new Date(draft.due_date) : null;
    if (date && Number.isNaN(date.getTime())) { setError('Проверьте дату и время'); return; }
    locked.current = true; setSaving(true); setError('');
    try {
      const payload = { ...draft, title: draft.title.trim(), title_id: draft.title_id || null, assigned_to: draft.assigned_to || null, due_date: date?.toISOString() || null, type: initialTask?.type || (draft.kind === 'task' ? 'custom' : 'note') };
      if (standalone && contactChanged) payload.contact_id = contact?.id || null;
      if (chat?.phone) payload.chat_phone = chat.phone;
      if (leadId) payload.lead_id = leadId;
      const result = initialTask?.id ? await apiClient.put(`/crm/tasks/${initialTask.id}`, payload) : await apiClient.post('/crm/tasks', payload);
      if (alive.current) onSaved?.(result.data);
    } catch (e) { if (alive.current) setError(handleApiError(e)); }
    finally { locked.current = false; if (alive.current) setSaving(false); }
  };
  return <form onSubmit={save} className="p-3 space-y-3 border-t border-curai-border bg-curai-surface text-curai-ink" aria-label="Создание записи CRM">
    {standalone && <TaskContactPicker value={contact} disabled={saving} allowed={allowed && (hasPermission(user, 'patients_view') || hasPermission(user, 'crm_view'))}
      onChange={next => { setContact(next); setContactChanged(true); }} />}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="min-w-0"><span className={fieldLabel}>Вид записи</span><select aria-label="Вид записи" className={control} value={draft.kind} disabled={saving} onChange={e => update('kind', e.target.value)}>{Object.entries(ENTRY_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {draft.kind === 'task' && <div className="min-w-0"><span className={fieldLabel}>Срок выполнения</span><CuraiButton className="!h-10 w-full !justify-start" disabled={saving} aria-expanded={dateOpen} onClick={() => setDateOpen(value => !value)}>{draft.due_date?.slice(0, 10) === localDateTime().slice(0, 10) ? 'Сегодня' : draft.due_date?.slice(0, 10) || 'Выбрать дату'} {draft.due_date?.slice(11)}</CuraiButton></div>}

      <label className="min-w-0"><span className={fieldLabel}>Ответственный сотрудник</span><select aria-label="Ответственный сотрудник" className={control} value={draft.assigned_to} disabled={loading || saving} onChange={e => update('assigned_to', e.target.value)} required={draft.kind === 'task'}><option value="">Выберите сотрудника</option>{initialTask?.assigned_to && !assignees.some(m => m.id === initialTask.assigned_to) && <option value={initialTask.assigned_to}>{initialTask.assigned_to_name || 'Текущий ответственный'}</option>}{assignees.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label className="min-w-0"><span className={fieldLabel}>Название из справочника</span><select aria-label="Название из справочника" className={control} value={draft.title_id} disabled={loading || saving} onChange={e => { const title = titles.find(t => t.id === e.target.value); setDraft(current => ({ ...current, title_id: title?.id || '', title: title?.name || current.title })); }}><option value="">Название из справочника</option>{titles.filter(t => t.is_active !== false || t.id === draft.title_id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    </div>
    {draft.kind === 'task' && dateOpen && <div className="flex flex-wrap items-center gap-2 p-2 bg-curai-subtle rounded-md"><label className="text-sm">Дата и время <input aria-label="Дата и время" type="datetime-local" className={control} value={draft.due_date} disabled={saving} onChange={e => update('due_date', e.target.value)} /></label>{[[15, 'Через 15 минут'], [60, 'Через час'], [1440, 'Завтра']].map(([minutes, label]) => <CuraiButton key={minutes} disabled={saving} onClick={() => update('due_date', localDateTime(new Date(Date.now() + minutes * 60000)))}>{label}</CuraiButton>)}</div>}
    <label className="block"><span className={fieldLabel}>Название записи</span><input aria-label="Название записи" className={`${control} w-full`} placeholder="Название" value={draft.title} maxLength={250} required disabled={saving} onChange={e => setDraft(current => ({ ...current, title: e.target.value, title_id: '' }))} /></label>
    <label className="block"><span className={fieldLabel}>Текст записи</span><textarea aria-label="Текст записи" className={`${control} !h-auto min-h-20 py-2 resize-y`} rows={3} placeholder="Текст задачи или внутренней заметки…" value={draft.description} disabled={saving} onChange={e => update('description', e.target.value)} /></label>
    <p className="text-xs text-curai-muted">Внутренняя запись CRM. Клиенту в WhatsApp не отправляется.</p>
    {error && <p role="alert" className="text-sm text-curai-negative">{error}</p>}
    <div className="flex justify-end gap-2"><CuraiButton onClick={onCancel} disabled={saving}>Отмена</CuraiButton><CuraiButton type="submit" variant="primary" disabled={!allowed || saving || loading}>{saving ? 'Сохранение…' : loading ? 'Загрузка…' : 'Сохранить'}</CuraiButton></div>
  </form>;
}
