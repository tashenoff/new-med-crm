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
  onDragOver,
  onDrop,
  onDragStart,
  onDragEnd
}) => {
  const dateString = currentDate.toISOString().split('T')[0];

  return (
    <div className={`min-w-0 flex-1 border-r ${themeClasses.border.light} last:border-r-0`}>
      {/* Заголовок кабинета */}
      <div className={`h-12 border-b border-l ${themeClasses.border.default} ${themeClasses.bg.secondary} flex items-center justify-center font-semibold ${themeClasses.text.primary}`}>
        {room.name}
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
