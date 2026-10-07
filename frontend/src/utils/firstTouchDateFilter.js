export const firstTouchDatePresets = [
  { value: 'all', label: 'Все даты' },
  { value: 'today', label: 'Сегодня' },
  { value: 'yesterday', label: 'Вчера' },
  { value: '7days', label: '7 дней' },
  { value: '30days', label: '30 дней' },
  { value: 'custom', label: 'Диапазон дат' }
];

export const localDateKey = (date) => {
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const isCalendarDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return localDateKey(date) === value;
};

export const firstTouchDateRange = (preset, custom = {}, now = new Date()) => {
  if (preset === 'all') return null;
  if (preset === 'custom') return { from: custom.from || '', to: custom.to || '' };
  const end = new Date(now);
  if (preset === 'yesterday') end.setDate(end.getDate() - 1);
  const start = new Date(end);
  if (preset === '7days') start.setDate(start.getDate() - 6);
  if (preset === '30days') start.setDate(start.getDate() - 29);
  return { from: localDateKey(start), to: localDateKey(end) };
};

export const matchesFirstTouchDate = (lead, range) => {
  if (!range || (!range.from && !range.to)) return true;
  if ((range.from && !isCalendarDate(range.from)) ||
      (range.to && !isCalendarDate(range.to)) ||
      (range.from && range.to && range.from > range.to)) return false;
  const value = lead.created_at;
  if (typeof value !== 'string' || !value.trim()) return false;
  const calendarPart = value.slice(0, 10);
  if (!isCalendarDate(calendarPart)) return false;
  const date = value.length === 10 ? calendarPart : localDateKey(new Date(value));
  if (!date) return false;
  return (!range.from || date >= range.from) && (!range.to || date <= range.to);
};
