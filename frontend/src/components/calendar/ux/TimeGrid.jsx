import React from 'react';
import RoomHeader from './RoomHeader';
import TimeSlot from './TimeSlot';
import AppointmentCard from './AppointmentCard';
import { themeClasses } from '../../../hooks/useTheme';
import { getAppointmentLayout } from '../utils/appointmentLayout';
import { SLOT_INTERVAL_MINUTES, timeToMinutes } from '../../../config/calendarConfig';

/**
 * Компонент временной сетки для одного кабинета
 * @param {Object} props
 * @param {Object} props.room - Данные кабинета
 * @param {Array} props.timeSlots - Массив временных слотов
 * @param {string} props.currentDate - Текущая дата
 * @param {Array} props.appointments - Массив записей
 * @param {Array} props.patients - Массив пациентов
 * @param {Array} props.doctors - Массив врачей
 * @param {Function} props.getAvailableDoctorForSlot - Функция получения доступного врача
 * @param {Function} props.getAppointmentForSlot - Функция получения записи для слота
 * @param {Function} props.getAppointmentHeight - Функция расчета высоты записи
 * @param {Function} props.getStatusColor - Функция получения цвета статуса
 * @param {Function} props.isSlotOccupied - Функция проверки занятости слота
 * @param {boolean} props.canEdit - Можно ли редактировать
 * @param {Function} props.onSlotClick - Обработчик клика по слоту
 * @param {Function} props.onEditAppointment - Обработчик редактирования записи
 * @param {Function} props.onDragOver - Обработчик drag over
 * @param {Function} props.onDrop - Обработчик drop
 * @param {Function} props.onDragStart - Обработчик начала перетаскивания
 * @param {Function} props.onDragEnd - Обработчик окончания перетаскивания
 * @param {string} props.dragOverSlot - ID слота который подсвечиваем при drag over
 */
const TimeGrid = ({
  room,
  timeSlots,
  currentDate,
  appointments,
  patients,
  doctors,
  getAvailableDoctorForSlot,
  getStatusColor,
  isSlotOccupied,
  canEdit,
  onSlotClick,
  onEditAppointment,
  onStatusChange,
  onDragOver,
  onDrop,
  onDragStart,
  onDragEnd,
  dragOverSlot
}) => {
  // Используем локальную дату вместо UTC (toISOString конвертирует в UTC и сдвигает дату)
  const dateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
  // Получаем список врачей для текущего дня из расписания кабинета
  // Каждый врач отображается с временем работы (Василий 9:00-15:00, Николай 15:00-19:00)
  const getDoctorsForRoom = () => {
    if (!room?.schedule || !doctors || !currentDate) return [];
    const dayOfWeek = currentDate.getDay();
    const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    // Находим ВСЕ активные расписания на сегодня (а не только первое)
    const daySchedules = room.schedule.filter(s => 
      s.day_of_week === adjustedDayOfWeek && s.is_active !== false
    );
    if (daySchedules.length === 0) return [];
    
    // Для каждой записи расписания находим врача и формируем строку с временем
    return daySchedules
      .map(s => {
        const doctor = doctors.find(d => d.id === s.doctor_id);
        if (!doctor) return null;
        const doctorName = doctor.full_name || doctor.name;
        return {
          name: doctorName,
          color: doctor.calendar_color,
          startTime: s.start_time,
          endTime: s.end_time,
          label: `${doctorName} ${s.start_time}-${s.end_time}`
        };
      })
      .filter(Boolean);
  };

  const doctorsInRoom = getDoctorsForRoom();
  const startMinutes = timeToMinutes(timeSlots[0]);
  const endMinutes = startMinutes + timeSlots.length * SLOT_INTERVAL_MINUTES;
  const roomAppointments = appointments.filter(appointment => {
    if (appointment.appointment_date !== dateString) return false;
    if (appointment.room_id) return appointment.room_id === room.id;
    // Preserve the legacy room inference for appointments without room_id.
    return getAvailableDoctorForSlot(room, dateString, appointment.appointment_time)?.id === appointment.doctor_id;
  });

  return (
    <div className={`flex-shrink-0 border-r ${themeClasses.border.light} last:border-r-0 calendar-room-column`} >
      <RoomHeader room={room} doctors={doctorsInRoom} />

      {/* Временные слоты */}
      <div className="calendar-room-slots"><div className="calendar-room-timeline">{timeSlots.map((time) => {
        const availableDoctor = getAvailableDoctorForSlot(room, dateString, time);
        const isOccupied = isSlotOccupied(room.id, dateString, time);
        
        return (
          <div key={time} className="relative">
            {/* Временной слот */}
            <TimeSlot
              time={time}
              roomId={room.id}
              date={dateString}
              appointment={isOccupied}
              availableDoctor={availableDoctor}
              isOccupied={isOccupied}
              canEdit={canEdit}
              onSlotClick={onSlotClick}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onEditAppointment={onEditAppointment}
              dragOverSlot={dragOverSlot}
              isDragOver={dragOverSlot === `${room.id}-${time}`}
            />
            
            {/* Карточка записи */}

          </div>
        );
      })}
      {roomAppointments.map(appointment => {
        const layout = getAppointmentLayout(appointment, startMinutes, endMinutes);
        if (!layout) return null;
        return <AppointmentCard
          key={appointment._id || appointment.id}
          appointment={appointment}
          patient={patients.find(p => p.id === appointment.patient_id)}
          doctor={doctors.find(d => d.id === appointment.doctor_id)}
          top={layout.top}
          height={layout.height}
          statusColor={getStatusColor(appointment.status)}
          canEdit={canEdit}
          onEdit={onEditAppointment}
          onStatusChange={onStatusChange}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />;
      })}</div></div>
    </div>
  );
};

export default TimeGrid;
