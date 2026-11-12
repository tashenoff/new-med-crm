import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, Edit, RefreshCw } from 'lucide-react';
import { LoadingSpinner } from '../../common/LoadingIndicator';
import PanelHeader from '../../common/PanelHeader';
import Modal from '../../modals/Modal';
import TaskComposer from './TaskComposer';
import { apiClient, handleApiError } from '../../../api/config';
import { hasTaskPermission } from '../../../utils/permissions';

const PAGE_SIZE = 50;
const statuses = { new: 'Новая', in_progress: 'В работе', completed: 'Выполнена', cancelled: 'Отменена', overdue: 'Просрочена' };
const kinds = { task: 'Задача', note: 'Заметка', comment: 'Примечание' };
const control = 'h-10 w-full min-w-0 rounded-md border border-curai-border bg-curai-surface text-curai-ink px-3 py-2 text-sm disabled:opacity-50';
export const taskIsOverdue = (task, now = Date.now()) =>
  (task.kind || (task.type === 'note' ? 'note' : 'task')) === 'task' &&
  !['completed', 'cancelled'].includes(task.status) && Boolean(task.due_date) && new Date(task.due_date).getTime() < now;

const TasksView = ({ user }) => {
  const canView = hasTaskPermission(user, 'crm_tasks_view');
  const canCreate = hasTaskPermission(user, 'crm_tasks_create');
  const canEdit = hasTaskPermission(user, 'crm_tasks_edit');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [assignee, setAssignee] = useState('');
  const [assignees, setAssignees] = useState([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const generation = useRef(0);
  const actionLock = useRef(false);

  useEffect(() => {
    // Only a changed search resets pagination, never the initial mount timer.
    if (search.trim() === query) return;
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [search, query]);

  const fetchTasks = useCallback(async () => {
    const request = ++generation.current;
    if (!canView) { setTasks([]); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get('/crm/tasks', { params: {
        skip: page * PAGE_SIZE, limit: PAGE_SIZE + 1, search: query || undefined,
        status: status === 'overdue' ? undefined : status || undefined,
        show_overdue: status === 'overdue' ? true : undefined,
        kind: kind || undefined, assigned_to: assignee || undefined,
      } });
      if (request !== generation.current) return;
      const rows = Array.isArray(data) ? data : data.tasks || [];
      setHasNext(rows.length > PAGE_SIZE);
      setTasks(rows.slice(0, PAGE_SIZE));
    } catch (err) {
      if (request === generation.current) { setTasks([]); setHasNext(false); setError(handleApiError(err)); }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [canView, page, query, status, kind, assignee]);

  useEffect(() => { fetchTasks(); return () => { generation.current++; }; }, [fetchTasks]);
  useEffect(() => {
    let current = true;
    if (canView) apiClient.get('/crm/tasks/assignees').then(({ data }) => {
      if (current) setAssignees(data.assignees || []);
    }).catch(() => { if (current) setAssignees([]); });
    return () => { current = false; };
  }, [canView]);

  const changeStatus = async (task) => {
    if (!canEdit || actionLock.current) return;
    actionLock.current = true;
    setBusyId(task.id);
    try {
      await apiClient.put('/crm/tasks/' + encodeURIComponent(task.id), { status: task.status === 'completed' ? 'new' : 'completed' });
      await fetchTasks();
    } catch (err) { setError(handleApiError(err)); }
    finally { actionLock.current = false; setBusyId(null); }
  };
  const closeEditor = () => { setShowEditor(false); setEditingTask(null); };
  const filter = setter => event => { setter(event.target.value); setPage(0); };
  if (!canView) return <p role="alert" className="p-6 text-curai-muted">Нет доступа к списку задач.</p>;

  return (
    <div className="calendar-container calendar-view-panel rounded-md min-w-0">
      <PanelHeader title="Задачи" subtitle="Задачи, заметки и примечания по клиентам"
        onAction={canCreate ? () => { setEditingTask(null); setShowEditor(true); } : undefined}
        actionLabel="+ Создать задачу" className="px-5 py-4 border-b border-curai-border" />
      <div className="bg-curai-surface rounded-b-md border border-t-0 border-curai-border p-4 space-y-4 shadow-none">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(200px,2fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(160px,1fr)_40px] gap-3 items-end">
          <input aria-label="Поиск задач" placeholder="Поиск по названию и тексту…" value={search} onChange={event => setSearch(event.target.value)} className={control} />
          <select aria-label="Статус задач" value={status} onChange={filter(setStatus)} className={control}>
            <option value="">Все статусы</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Вид записи" value={kind} onChange={filter(setKind)} className={control}>
            <option value="">Все записи</option>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Ответственный" value={assignee} onChange={filter(setAssignee)} className={control}>
            <option value="">Все ответственные</option>{assignees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
          <button type="button" aria-label="Обновить задачи" onClick={fetchTasks} disabled={loading} className={control + ' flex items-center justify-center'}><RefreshCw size={16} /></button>
        </div>
        {error && <div role="alert" className="p-3 rounded-md bg-curai-negativeBg text-curai-negative">{error}</div>}
        {loading ? <div className="py-12 text-center"><LoadingSpinner /><p className="mt-3 text-curai-muted">Загрузка задач…</p></div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm text-left border-collapse text-curai-ink [&_td]:align-top">
              <thead className="text-xs text-curai-muted bg-curai-subtle">
                <tr>{['Дата исполнения', 'Ответственный', 'Клиент', 'Название / вид', 'Текст', 'Результат / статус', 'Действия'].map(label => <th key={label} scope="col" className="px-3 py-3 border-b border-curai-border font-medium">{label}</th>)}</tr>
              </thead>
              <tbody>{tasks.map(task => {
                const overdue = taskIsOverdue(task);
                const recordKind = task.kind || (task.type === 'note' ? 'note' : 'task');
                return <tr key={task.id} className="border-b border-curai-border hover:bg-curai-subtle">
                  <td className={'px-3 py-3 whitespace-nowrap ' + (overdue ? 'text-curai-negative' : '')}>
                    {task.due_date ? new Date(task.due_date).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : 'Без срока'}
                    {overdue && <span className="block text-xs">Просрочена</span>}
                  </td>
                  <td className="px-3 py-3">{task.assigned_to_name || (task.assigned_to ? 'Менеджер недоступен' : 'Не назначен')}</td>
                  <td className="px-3 py-3">{task.contact_name || task.chat_name || task.client_name || task.lead_name || task.chat_phone || (task.client_id || task.lead_id ? 'Связанный клиент' : '—')}</td>
                  <td className="px-3 py-3"><div className="font-medium">{task.title}</div><div className="text-xs text-curai-muted">{kinds[recordKind] || recordKind}</div></td>
                  <td className="px-3 py-3 max-w-xs whitespace-pre-wrap break-words">{task.description || '—'}</td>
                  <td className="px-3 py-3 max-w-xs"><div className={task.status === 'completed' ? 'text-curai-positive' : 'text-curai-muted'}>{recordKind === 'task' ? (statuses[task.status] || task.status) : 'Сохранено'}</div>{task.comment && <div className="mt-1 whitespace-pre-wrap break-words">{task.comment}</div>}</td>
                  <td className="px-3 py-3"><div className="flex gap-2">
                    {canEdit && recordKind === 'task' && task.status !== 'cancelled' && <button type="button" disabled={busyId !== null} aria-label={(task.status === 'completed' ? 'Вернуть в работу: ' : 'Выполнить: ') + task.title} title={task.status === 'completed' ? 'Вернуть в работу' : 'Отметить выполненной'} onClick={() => changeStatus(task)} className="p-2 rounded text-curai-positive hover:bg-curai-positiveBg disabled:opacity-50"><CheckCircle size={18} /></button>}
                    {canEdit && <button type="button" aria-label={'Редактировать: ' + task.title} onClick={() => { setEditingTask(task); setShowEditor(true); }} className="p-2 rounded text-curai-blue hover:bg-curai-selected"><Edit size={18} /></button>}
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
            {tasks.length === 0 && <p className="py-12 text-center text-curai-muted">{error ? 'Не удалось загрузить список.' : 'Записей по выбранным условиям нет.'}</p>}
          </div>
        )}
        <div className="flex justify-between items-center text-sm text-curai-muted">
          <span>Страница {page + 1}</span>
          <div className="flex gap-2"><button className={control} disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>Назад</button><button className={control} disabled={loading || !hasNext} onClick={() => setPage(value => value + 1)}>Далее</button></div>
        </div>
      </div>
      <Modal show={showEditor} onClose={closeEditor} title={editingTask ? 'Редактировать запись' : 'Новая запись'} size="max-w-2xl">
        {showEditor && <TaskComposer initialTask={editingTask} user={user} onCancel={closeEditor} onSaved={() => { closeEditor(); fetchTasks(); }} />}
      </Modal>
    </div>
  );
};
export default TasksView;
