/**
 * Утилиты для работы со временем в календаре
 */

import {
  SLOT_INTERVAL_MINUTES,
  SLOT_HEIGHT_PX,
  DEFAULT_APPOINTMENT_DURATION,
  CALENDAR_START_TIME,
  CALENDAR_END_TIME
} from '../../../config/calendarConfig';

/**
 * Проверяет, попадает ли время в диапазон записи
 * @param {string} appointmentStartTime - Время начала (HH:MM)
 * @param {string} appointmentEndTime - Время окончания (HH:MM)
 * @param {string} currentTime - Проверяемое время (HH:MM)
 * @returns {boolean}
 */
export const isTimeInAppointmentRange = (appointmentStartTime, appointmentEndTime, currentTime) => {
  if (!appointmentEndTime) return appointmentStartTime === currentTime;
  
  const start = appointmentStartTime.split(':').map(n => parseInt(n));
  const end = appointmentEndTime.split(':').map(n => parseInt(n));
  const current = currentTime.split(':').map(n => parseInt(n));
  
  const startMinutes = start[0] * 60 + start[1];
  const endMinutes = end[0] * 60 + end[1];
  const currentMinutes = current[0] * 60 + current[1];
  
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
};

/**
 * Вычисляет высоту карточки записи в зависимости от продолжительности
 * @param {Object} appointment - Объект записи
 * @returns {number} Высота в пикселях
 */
export const getAppointmentHeight = (appointment) => {
  // Без времени окончания считаем минимальную длительность (30 минут = 1 слот)
  if (!appointment.end_time) return SLOT_HEIGHT_PX;
  
  const start = appointment.appointment_time.split(':').map(n => parseInt(n));
  const end = appointment.end_time.split(':').map(n => parseInt(n));
  
  const startMinutes = start[0] * 60 + start[1];
  const endMinutes = end[0] * 60 + end[1];
  // Минимальная длительность сеанса — 30 минут
  const durationMinutes = Math.max(DEFAULT_APPOINTMENT_DURATION, endMinutes - startMinutes);
  
  // SLOT_HEIGHT_PX на каждые SLOT_INTERVAL_MINUTES минут
  return Math.max(SLOT_HEIGHT_PX, (durationMinutes / SLOT_INTERVAL_MINUTES) * SLOT_HEIGHT_PX);
};

/**
 * Возвращает длительность записи в минутах (минимум 30)
 * @param {Object} appointment - Объект записи
 * @returns {number}
 */
export const getAppointmentDuration = (appointment) => {
  if (!appointment?.appointment_time || !appointment?.end_time) {
    return DEFAULT_APPOINTMENT_DURATION;
  }
  
  const [startHour, startMin] = appointment.appointment_time.split(':').map(Number);
  const [endHour, endMin] = appointment.end_time.split(':').map(Number);
  const duration = (endHour * 60 + endMin) - (startHour * 60 + startMin);
  
  return duration > 0 ? duration : DEFAULT_APPOINTMENT_DURATION;
};

/**
 * Генерирует массив временных слотов
 * @param {string} startTime - Время начала (HH:MM)
 * @param {string} endTime - Время окончания (HH:MM)
 * @param {number} intervalMinutes - Интервал в минутах
 * @returns {Array<string>} Массив временных слотов
 */
export const generateTimeSlots = (
  startTime = CALENDAR_START_TIME,
  endTime = CALENDAR_END_TIME,
  intervalMinutes = SLOT_INTERVAL_MINUTES
) => {
  const slots = [];
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  while (currentMinutes < endMinutes) {
    const hours = Math.floor(currentMinutes / 60);
    const minutes = currentMinutes % 60;
    slots.push(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
    currentMinutes += intervalMinutes;
  }
  
  return slots;
};

/**
 * Проверяет может ли запись поместиться в расписании врача
 * @param {Object} room - Объект кабинета
 * @param {string} date - Дата (YYYY-MM-DD)
 * @param {string} startTime - Время начала (HH:MM)
 * @param {string} endTime - Время окончания (HH:MM)
 * @returns {boolean}
 */
export const canAppointmentFitInSchedule = (room, date, startTime, endTime) => {
  if (!endTime) {
    return true; // Если нет end_time, считаем что помещается
  }
  
  if (!room || !room.schedule || room.schedule.length === 0) {
    return false;
  }
  
  const dayOfWeek = new Date(date).getDay();
  const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  
  // Находим расписание врача для этого дня
  const schedule = room.schedule.find(s => 
    s.day_of_week === adjustedDayOfWeek &&
    s.start_time <= startTime &&
    s.is_active
  );
  
  if (!schedule) {
    return false;
  }
  
  // Проверяем, что запись полностью помещается в рабочее время врача
  return startTime >= schedule.start_time && endTime <= schedule.end_time;
};

