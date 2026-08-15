/**
 * Единая конфигурация календаря и длительности приёмов
 *
 * Сетка календаря строится с шагом 30 минут.
 * При выборе «Произвольное время» можно указать любую длительность.
 */

// Шаг сетки календаря (минуты)
export const SLOT_INTERVAL_MINUTES = 30;

// Минимальная длительность приёма (минуты) — без ограничений
export const MIN_APPOINTMENT_DURATION = 1;

// Длительность приёма по умолчанию (минуты)
export const DEFAULT_APPOINTMENT_DURATION = 30;

// Рабочие часы календаря
export const CALENDAR_START_TIME = '08:00';
export const CALENDAR_END_TIME = '20:00';

// Высота одного 30-минутного слота в пикселях (соответствует классу h-16)
export const SLOT_HEIGHT_PX = 64;

// Быстрые варианты длительности для формы записи
export const DURATION_OPTIONS = [
  { value: 30, label: '30 минут' },
  { value: 60, label: '1 час' },
  { value: 90, label: '1 час 30 минут' },
  { value: 120, label: '2 часа' },
  { value: 'custom', label: 'Произвольное время' }
];

/**
 * Переводит "HH:MM" в минуты от начала суток
 */
export const timeToMinutes = (time) => {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

/**
 * Переводит минуты в строку "HH:MM"
 */
export const minutesToTime = (totalMinutes) => {
  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60) % 24;
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * Прибавляет минуты ко времени "HH:MM"
 */
export const addMinutes = (time, minutes = DEFAULT_APPOINTMENT_DURATION) => {
  const start = timeToMinutes(time);
  if (start === null) return '';
  return minutesToTime(start + minutes);
};

/**
 * Вычисляет длительность между двумя временами в минутах
 */
export const getDurationMinutes = (startTime, endTime) => {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null) return null;
  return end - start;
};

/**
 * Возвращает время окончания по умолчанию (start + 30 минут)
 */
export const getDefaultEndTime = (startTime) => addMinutes(startTime, DEFAULT_APPOINTMENT_DURATION);

/**
 * Возвращает минимально допустимое время окончания приёма
 */
export const getMinEndTime = (startTime) => addMinutes(startTime, MIN_APPOINTMENT_DURATION);

/**
 * Проверяет корректность длительности приёма
 * @returns {{ valid: boolean, duration: number|null, message: string }}
 */
export const validateAppointmentDuration = (startTime, endTime) => {
  if (!startTime) {
    return { valid: false, duration: null, message: 'Укажите время начала приёма' };
  }

  // Если время окончания не указано — считаем длительность по умолчанию
  if (!endTime) {
    return { valid: true, duration: DEFAULT_APPOINTMENT_DURATION, message: '' };
  }

  const duration = getDurationMinutes(startTime, endTime);

  if (duration === null) {
    return { valid: false, duration: null, message: 'Некорректное время приёма' };
  }

  if (duration <= 0) {
    return {
      valid: false,
      duration,
      message: 'Время окончания должно быть позже времени начала'
    };
  }

  return { valid: true, duration, message: '' };
};

/**
 * Форматирует длительность в человекочитаемый вид
 */
export const formatDuration = (minutes) => {
  if (!minutes || minutes <= 0) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} мин`;
  if (rest === 0) return `${hours} ч`;
  return `${hours} ч ${rest} мин`;
};
