import React from 'react';
import TimeSlot from './TimeSlot';

/**
 * Колонка кабинета с временными слотами
 */
const RoomColumn = ({
  room,
  timeSlots,
  appointments,
  patients,
  doctors,
  currentDate,
  canEdit,
  // Drag & Drop
  draggedAppointment,
  hoveredSlot,
  onDragStart,
  onDragEnd,
  onSlotHover,
  onSlotLeave,
  onSlotDrop,
  // Обработчики
  onSlotClick,
  onEditAppointment,
  onNewAppointment
}) => {
  return (
    <div className="room-column flex-1 border-r border-gray-200 last:border-r-0">
      {/* Заголовок кабинета */}
      <div className="room-header bg-blue-50 px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-blue-900">{room.name}</h3>
        <p className="text-sm text-blue-600">{room.description || 'Кабинет'}</p>
      </div>
      
      {/* Временные слоты */}
      <div className="time-slots">
        {timeSlots.map((time) => {
          const appointment = appointments.find(apt => 
            apt.appointment_time === time && 
            apt.appointment_date === currentDate
          );

          const isHovered = hoveredSlot?.roomId === room.id && hoveredSlot?.time === time;

          return (
            <TimeSlot
              key={`${room.id}-${time}`}
              roomId={room.id}
              time={time}
              appointment={appointment}
              patients={patients}
              doctors={doctors}
              canEdit={canEdit}
              isHovered={isHovered}
              isDraggedOver={draggedAppointment && isHovered}
              // Drag & Drop
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onSlotHover={onSlotHover}
              onSlotLeave={onSlotLeave}
              onSlotDrop={onSlotDrop}
              // Обработчики
              onSlotClick={onSlotClick}
              onEditAppointment={onEditAppointment}
            />
          );
        })}
      </div>
    </div>
  );
};

export default RoomColumn;