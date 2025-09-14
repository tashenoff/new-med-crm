import React from 'react';
import TimeHeader from './TimeHeader';
import RoomColumn from './RoomColumn';

/**
 * Основной контейнер календаря
 */
const CalendarContainer = ({
  rooms,
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
    <div className="calendar-grid">
      {/* Заголовок с временными метками */}
      <TimeHeader timeSlots={timeSlots} />
      
      {/* Контейнер для кабинетов */}
      <div className="rooms-container flex">
        {rooms.map((room) => (
          <RoomColumn
            key={room.id}
            room={room}
            timeSlots={timeSlots}
            appointments={appointments.filter(apt => apt.room_id === room.id)}
            patients={patients}
            doctors={doctors}
            currentDate={currentDate}
            canEdit={canEdit}
            // Drag & Drop
            draggedAppointment={draggedAppointment}
            hoveredSlot={hoveredSlot}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onSlotHover={onSlotHover}
            onSlotLeave={onSlotLeave}
            onSlotDrop={onSlotDrop}
            // Обработчики
            onSlotClick={onSlotClick}
            onEditAppointment={onEditAppointment}
            onNewAppointment={onNewAppointment}
          />
        ))}
      </div>
    </div>
  );
};

export default CalendarContainer;