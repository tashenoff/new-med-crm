import { historySources } from './leadHistory.js';

export const matchesSource = (lead, sourceId) => sourceId === 'all' || lead.source_id === sourceId;
export const sourceLabel = (lead, sources = []) => lead.source_id
  ? sources.find(source => source.id === lead.source_id)?.name || lead.source_name || historySources[lead.source] || 'Источник недоступен'
  : historySources[lead.source] || 'Источник не указан';

export async function sourceRequest(path, method = 'GET', body) {
  const api = import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com';
  const token = localStorage.getItem('token');
  const response = await fetch(`${api}/api/crm${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map(error => error.msg).join('; ') : 'Не удалось сохранить источник');
  }
  return data;
}
