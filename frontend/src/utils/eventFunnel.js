export const percent = value => value === null || value === undefined ? '—' : `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;

export function reportPeriod(from, to) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
  if (!valid(from) || !valid(to) || from > to) throw new Error('Укажите корректный период: дата «С» не позже даты «По».');
  const start = new Date(`${from}T00:00:00`), end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function initialPeriod() {
  const now = new Date(), start = new Date(now);
  start.setDate(start.getDate() - 29);
  const key = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { from: key(start), to: key(now) };
}

export async function funnelRequest(path, signal) {
  const api = import.meta.env.VITE_BACKEND_URL || 'https://medicodebase.preview.emergentagent.com';
  const token = localStorage.getItem('token');
  const response = await fetch(`${api}/api/crm/funnel/${path}`, { signal, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Не удалось загрузить отчёт');
  return result;
}

export function readReportPreference(key) {
  try {
    const saved = key && JSON.parse(localStorage.getItem(key));
    return saved?.version === 1 ? {
      steps: Array.isArray(saved.steps) ? [...new Set(saved.steps.filter(id => typeof id === 'string'))].slice(0, 30) : [],
      hidden: Array.isArray(saved.hidden) ? saved.hidden.filter(id => typeof id === 'string') : []
    } : { steps: [], hidden: [] };
  } catch { return { steps: [], hidden: [] }; }
}
