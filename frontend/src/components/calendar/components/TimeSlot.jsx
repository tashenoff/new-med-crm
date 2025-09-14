import React from 'react';
import AppointmentCard from './AppointmentCard';

/**
 * Временной слот в кабинете
 */
const TimeSlot = ({
  roomId,
  time,
  appointment,
  patients,
  doctors,
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
    if (!appointment && onSlotClick) {
      onSlotClick(roomId, time);
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
    console.log('📥 SLOT DROP:', { roomId, time });
    
    if (onSlotDrop) {
      onSlotDrop(roomId, time);
    }
  };

  return (
    <div
      className={`
        time-slot relative h-16 border-b border-gray-200 cursor-pointer transition-all duration-200
        ${appointment ? 'bg-white' : 'bg-gray-50 hover:bg-gray-100'}
        ${isDraggedOver ? 'bg-green-200 border-green-400 border-2 shadow-lg' : ''}
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
          canEdit={canEdit}
          onEdit={onEditAppointment}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      )}
      
      {/* Индикатор времени для пустых слотов */}
      {!appointment && (
        <div className="absolute top-1 left-2 text-xs text-gray-400">
          {time}
        </div>
      )}
    </div>
  );
};

export default TimeSlot;