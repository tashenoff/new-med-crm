import { isTimeInAppointmentRange } from './timeUtils';

/**
 * Утилиты для работы с записями
 */

/**
 * Проверяет, есть ли запись в данном слоте (для блокировки)
 * @param {Array} appointments - Массив всех записей
 * @param {Array} rooms - Массив кабинетов
 * @param {Function} getAvailableDoctorForSlot - Функция получения доступного врача
 * @param {string} roomId - ID кабинета
 * @param {string} date - Дата (YYYY-MM-DD)
 * @param {string} time - Время (HH:MM)
 * @returns {Object|null} Запись в слоте или null
 */
export const isSlotOccupied = (appointments, rooms, getAvailableDoctorForSlot, roomId, date, time) => {
  // Сначала ищем записи с правильным room_id (новые записи)
  let appointment = appointments.find(apt => 
    !['cancelled', 'no_show'].includes(apt.status) &&
    apt.room_id === roomId && 
    apt.appointment_date === date && 
    isTimeInAppointmentRange(apt.appointment_time, apt.end_time, time)
  );
  
  if (appointment) {
    console.log('🔍 isSlotOccupied: найдена запись с room_id', appointment._id || appointment.id);
  }
  
  // Если не нашли записи с room_id, ищем старые записи без room_id
  if (!appointment) {
    const oldAppointment = appointments.find(apt => 
      !['cancelled', 'no_show'].includes(apt.status) &&
      (!apt.room_id || apt.room_id === null || apt.room_id === '') && 
      apt.appointment_date === date && 
      isTimeInAppointmentRange(apt.appointment_time, apt.end_time, time)
    );
    
    if (oldAppointment) {
      const currentRoom = rooms.find(r => r.id === roomId);
      if (currentRoom) {
        const doctorInRoom = getAvailableDoctorForSlot(currentRoom, date, time);
        if (doctorInRoom && doctorInRoom.id === oldAppointment.doctor_id) {
          appointment = oldAppointment;
        }
      }
    }
  }
  
  return appointment;
};

/**
 * Получает запись для отображения в конкретном слоте
 * @param {Array} appointments - Массив всех записей
 * @param {Array} rooms - Массив кабинетов
 * @param {Function} getAvailableDoctorForSlot - Функция получения доступного врача
 * @param {string} roomId - ID кабинета
 * @param {string} date - Дата (YYYY-MM-DD)
 * @param {string} time - Время (HH:MM)
 * @returns {Object|null} Запись для отображения или null
 */
export const getAppointmentForSlot = (appointments, rooms, getAvailableDoctorForSlot, roomId, date, time) => {
  const appointment = isSlotOccupied(appointments, rooms, getAvailableDoctorForSlot, roomId, date, time);
  
  // Логирование для отладки пропадающих записей
  if (appointment) {
    console.log('🎯 getAppointmentForSlot: найдена запись', {
      appointmentId: appointment._id || appointment.id,
      roomId,
      date,
      time,
      appointmentTime: appointment.appointment_time,
      isFirstSlot: appointment.appointment_time === time
    });
  }
  
  // Показываем карточку только если это первый слот записи
  if (appointment) {
    console.log('🔍 СРАВНЕНИЕ ВРЕМЕНИ:', {
      appointmentTime: appointment.appointment_time,
      slotTime: time,
      isEqual: appointment.appointment_time === time,
      typeof_appointmentTime: typeof appointment.appointment_time,
      typeof_slotTime: typeof time
    });
    
    if (appointment.appointment_time === time) {
      return appointment;
    }
  }
  
  return null;
};

/**
 * Проверяет конфликты времени для новой записи
 * @param {Array} appointments - Массив всех записей
 * @param {Array} rooms - Массив кабинетов
 * @param {Function} getAvailableDoctorForSlot - Функция получения доступного врача
 * @param {string} roomId - ID кабинета
 * @param {string} date - Дата (YYYY-MM-DD)
 * @param {string} startTime - Время начала (HH:MM)
 * @param {string} endTime - Время окончания (HH:MM)
 * @param {string} excludeAppointmentId - ID записи для исключения из проверки
 * @returns {Array} Массив конфликтующих записей
 */
export const checkTimeConflicts = (
  appointments, 
  rooms, 
  getAvailableDoctorForSlot, 
  roomId, 
  date, 
  startTime, 
  endTime, 
  excludeAppointmentId = null
) => {
  if (!endTime) return [];
  
  const conflictingAppointments = appointments.filter(apt => {
    if (['cancelled', 'no_show'].includes(apt.status)) return false;
    // Исключаем саму перемещаемую запись
    if (excludeAppointmentId && (apt._id === excludeAppointmentId || apt.id === excludeAppointmentId)) {
      return false;
    }
    
    // Проверяем только записи на ту же дату
    if (apt.appointment_date !== date) {
      return false;
    }
    
    // Проверяем пересечение времени
    if (apt.appointment_time && apt.end_time) {
      const aptStart = apt.appointment_time;
      const aptEnd = apt.end_time;
      
      // Пересечение если один из интервалов начинается до окончания другого
      const hasTimeOverlap = (
        (startTime >= aptStart && startTime < aptEnd) ||
        (endTime > aptStart && endTime <= aptEnd) ||
        (startTime <= aptStart && endTime >= aptEnd)
      );
      
      if (hasTimeOverlap) {
        // Проверяем записи в том же кабинете
        if (apt.room_id === roomId) {
          return true; // Есть пересечение времени в том же кабинете
        }
        // Проверяем старые записи без room_id
        if (!apt.room_id) {
          const currentRoom = rooms.find(r => r.id === roomId);
          if (currentRoom) {
            const doctorInRoom = getAvailableDoctorForSlot(currentRoom, date, startTime);
            if (doctorInRoom && doctorInRoom.id === apt.doctor_id) {
              return true; // Есть пересечение времени с тем же врачом
            }
          }
        }
      }
    }
    return false;
  });
  
  console.log('🔥 Конфликтующие записи:', conflictingAppointments);
  
  return conflictingAppointments;
};

/**
 * Получает цвет статуса записи
 * @param {string} status - Статус записи
 * @returns {string} CSS класс цвета
 */
export const getStatusColor = (status) => {
  switch (status) {
    case 'scheduled':
      return 'bg-blue-100 text-blue-800';
    case 'confirmed':
      return 'bg-green-100 text-green-800';
    case 'in_progress':
      return 'bg-yellow-100 text-yellow-800';
    case 'completed':
      return 'bg-gray-100 text-gray-800';
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    case 'no_show':
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-blue-100 text-blue-800';
  }
};
