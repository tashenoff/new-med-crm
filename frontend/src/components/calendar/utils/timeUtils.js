/**
 * Утилиты для работы со временем в календаре
 */

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
  if (!appointment.end_time) return 60; // Высота одного слота
  
  const start = appointment.appointment_time.split(':').map(n => parseInt(n));
  const end = appointment.end_time.split(':').map(n => parseInt(n));
  
  const startMinutes = start[0] * 60 + start[1];
  const endMinutes = end[0] * 60 + end[1];
  const durationMinutes = endMinutes - startMinutes;
  
  // 60px на каждые 30 минут
  return Math.max(60, (durationMinutes / 30) * 60);
};

/**
 * Генерирует массив временных слотов
 * @param {string} startTime - Время начала (HH:MM)
 * @param {string} endTime - Время окончания (HH:MM)
 * @param {number} intervalMinutes - Интервал в минутах
 * @returns {Array<string>} Массив временных слотов
 */
export const generateTimeSlots = (startTime = "08:00", endTime = "20:00", intervalMinutes = 30) => {
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

