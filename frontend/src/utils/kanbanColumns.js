export const SYSTEM_COLUMN_NAMES = {
  new: 'Неразобранные',
  contacted: 'Записан на прием',
  in_progress: 'Запись подтверждена',
  converted: 'Пациент пришел',
  closed: 'Оплачено'
};

export function configuredColumns(columns) {
  return columns.filter(column => !column.is_system || Object.hasOwn(SYSTEM_COLUMN_NAMES, column.id))
    .map(column => ({ ...column, name: SYSTEM_COLUMN_NAMES[column.id] || column.name }));
}

export function cardColumnId(lead) {
  return lead.status === 'new' ? lead.kanban_column_id || 'new' : lead.status;
}

export function manualColumn(column) {
  return Boolean(column?.manual_move_allowed && (!column.is_system || column.id === 'new'));
}

export function canMoveCard(lead, destination, columns) {
  const source = columns.find(column => column.id === cardColumnId(lead));
  return lead.status === 'new' && manualColumn(source) && manualColumn(destination)
    && source.id !== destination.id;
}

export async function kanbanRequest(path = '/kanban/columns', method = 'GET', body) {
  const API = import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com';
  const token = localStorage.getItem('token');
  const response = await fetch(`${API}/api/crm${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Не удалось обновить колонки. Попробуйте снова.');
  return data;
}
