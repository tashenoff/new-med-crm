import { firstTouchDateRange, localDateKey } from './firstTouchDateFilter.js';

export const percent = value => value === null || value === undefined ? '—' : `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;

export function reportPeriod(from, to) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
  if (!valid(from) || !valid(to) || from > to) throw new Error('Укажите корректный период: дата «С» не позже даты «По».');
  const start = new Date(`${from}T00:00:00`), end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export const funnelPeriodPresets = [
  { value: 'today', label: 'Сегодня' },
  { value: 'yesterday', label: 'Вчера' },
  { value: '7days', label: 'Последние 7 дней' },
  { value: '30days', label: 'Последние 30 дней' },
  { value: 'month', label: 'Этот месяц' },
  { value: 'custom', label: 'Свой диапазон' }
];

// Calendar keys use the same browser-local date contract as CRM date filters.
// UTC serialization belongs only to reportPeriod, after local bounds are built.
export function funnelPresetRange(preset, now = new Date()) {
  if (preset === 'month') {
    const start = new Date(now);
    start.setDate(1);
    return { from: localDateKey(start), to: localDateKey(now) };
  }
  if (['today', 'yesterday', '7days', '30days'].includes(preset)) {
    return firstTouchDateRange(preset, {}, now);
  }
  return null;
}

export function initialPeriod(now = new Date()) {
  return funnelPresetRange('30days', now);
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
      steps: Array.isArray(saved.steps) ? [...new Set(saved.steps.filter(id => typeof id === 'string' && id.trim().length > 0 && id.length <= 120))].slice(0, 30) : [],
      hidden: Array.isArray(saved.hidden) ? saved.hidden.filter(id => typeof id === 'string') : []
    } : { steps: [], hidden: [] };
  } catch { return { steps: [], hidden: [] }; }
}

// Canonical system columns describe the app-managed inquiry lifecycle. Custom
// columns have no required/optional/outcome metadata: never make every custom
// detour a mandatory conversion step merely because it is on the kanban.
export function initialHistorySteps(columns = []) {
  const ids = columns.filter(column => column.is_system === true && !column.archived && column.active !== false)
    .map(column => column.id).filter(id => typeof id === 'string' && id.length > 0);
  const steps = [...new Set(ids)];
  return steps.length >= 2 && steps.length <= 30 ? steps : [];
}

export function stagePreferenceKey(user) {
  const id = user?.id || user?._id;
  return id ? `medcrm:funnel-hidden-stages:v1:${encodeURIComponent(JSON.stringify([id, user.clinic_id || user.clinic?.id || 'installation']))}` : null;
}
