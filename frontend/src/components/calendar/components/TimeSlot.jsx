import React from 'react';
import AppointmentCard from './AppointmentCard';
import { getAppointmentHeight } from '../utils/timeUtils';

/**
 * Временной слот в кабинете
 */
const TimeSlot = ({
  roomId,
  time,
  appointment,
  availableDoctor,
  patients,
  doctors,
  currentDate,
  canEdit,
  isHovered,
  isDraggedOver,
  // Drag & Drop
  onDragStart,
  onDragEnd,
  onSlotHover,
  onSlotLeave,
  onSlotDrop,
  // Обработчики
  onSlotClick,
  onEditAppointment
}) => {
  // Обработчик клика по пустому слоту
  const handleSlotClick = () => {
    if (!appointment && availableDoctor && onSlotClick) {
      // Используем правильный формат как в старом календаре: (date, time, roomId)
      onSlotClick(currentDate, time, roomId);
    }
  };

  // Drag & Drop обработчики
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    
    if (onSlotHover) {
      onSlotHover(roomId, time);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    
    if (onSlotLeave) {
      onSlotLeave();
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    console.log('📥 SLOT DROP:', { roomId, time, hasDoctor: !!availableDoctor });
    
    if (onSlotDrop && availableDoctor) {
      onSlotDrop(roomId, time);
    } else if (!availableDoctor) {
      alert('В это время в данном кабинете нет доступного врача');
    }
  };

  return (
    <div
      className={`
        time-slot relative h-16 border-b border-gray-200 transition-all duration-200
        ${availableDoctor ? 'bg-white hover:bg-blue-50 cursor-pointer' : 'bg-gray-100'}
        ${isDraggedOver && availableDoctor ? 'bg-green-200 border-green-400 border-2 shadow-lg' : ''}
        ${isDraggedOver && !availableDoctor ? 'bg-red-200 border-red-400 border-2' : ''}
      `}
      onClick={handleSlotClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Карточка записи если есть */}
      {appointment && (
        <AppointmentCard
          appointment={appointment}
          patient={patients.find(p => p.id === appointment.patient_id)}
          doctor={doctors.find(d => d.id === appointment.doctor_id)}
          height={getAppointmentHeight(appointment)}
          canEdit={canEdit}
          onEdit={onEditAppointment}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      )}
      
      {/* Информация о враче в расписании */}
      {!appointment && availableDoctor && (
        <div className="p-2 text-xs">
          <div className="text-green-700 font-medium">
            {availableDoctor.name}
          </div>
          <div className="text-gray-500">
            Доступен
          </div>
        </div>
      )}
      
      {/* Сообщение об отсутствии врача */}
      {!appointment && !availableDoctor && (
        <div className="p-2 text-xs text-gray-400">
          Врач недоступен
        </div>
      )}
    </div>
  );
};

export default TimeSlot;