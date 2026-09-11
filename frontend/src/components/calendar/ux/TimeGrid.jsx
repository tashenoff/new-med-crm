import React from 'react';
import TimeSlot from './TimeSlot';
import AppointmentCard from './AppointmentCard';
import { themeClasses } from '../../../hooks/useTheme';

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
  getAppointmentForSlot,
  getAppointmentHeight,
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
          startTime: s.start_time,
          endTime: s.end_time,
          label: `${doctorName} ${s.start_time}-${s.end_time}`
        };
      })
      .filter(Boolean);
  };

  const doctorsInRoom = getDoctorsForRoom();

  return (
    <div className={`flex-shrink-0 border-r ${themeClasses.border.light} last:border-r-0 calendar-room-column`} style={{ width: '180px', minWidth: '180px' }}>
{/* Заголовок кабинета: отдельная строка для названия кабинета и отдельная — для врача */}
      <div className={`h-16 border-b border-l ${themeClasses.border.default} ${themeClasses.bg.secondary} font-semibold ${themeClasses.text.primary} calendar-room-header overflow-hidden`}>
        <div className={`h-8 flex items-center justify-center border-b ${themeClasses.border.default} calendar-room-name-row`}>
          <span className="text-sm leading-tight text-center w-full px-1.5 block break-words line-clamp-1" title={room.name}>{room.name}</span>
        </div>
        <div className="h-8 flex items-center justify-center calendar-room-doctor-row">
          {doctorsInRoom.length > 0 ? (
            <div className="text-center w-full px-1.5">
              {doctorsInRoom.map((doc, idx) => (
                <span
                  key={idx}
                  className="text-xs font-medium text-blue-600 leading-tight block break-words line-clamp-1"
                  title={doc.label}
                >
                  {doc.label}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500 leading-tight text-center w-full px-1.5 block break-words line-clamp-1">—</span>
          )}
        </div>
      </div>
      
      {/* Временные слоты */}
      {timeSlots.map((time) => {
        const availableDoctor = getAvailableDoctorForSlot(room, dateString, time);
        const appointment = getAppointmentForSlot(room.id, dateString, time);
        const isOccupied = isSlotOccupied(room.id, dateString, time);
        
        return (
          <div key={time} className="relative">
            {/* Временной слот */}
            <TimeSlot
              time={time}
              roomId={room.id}
              date={dateString}
              appointment={appointment}
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
            {appointment && (
              <AppointmentCard
                appointment={appointment}
                patient={patients.find(p => p.id === appointment.patient_id)}
                doctor={doctors.find(d => d.id === appointment.doctor_id)}
                height={getAppointmentHeight(appointment)}
                statusColor={getStatusColor(appointment.status)}
                canEdit={canEdit}
                onEdit={onEditAppointment}
                onStatusChange={onStatusChange}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default TimeGrid;
