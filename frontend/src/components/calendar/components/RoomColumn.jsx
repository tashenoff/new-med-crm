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
  getAvailableDoctorForSlot,
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
      <div className="room-header bg-blue-50 px-3 py-2 border-b border-gray-200 h-12">
        <h3 className="font-semibold text-blue-900 text-sm">{room.name}</h3>
      </div>
      
      {/* Временные слоты */}
      <div className="time-slots">
        {timeSlots.map((time) => {
          // Ищем запись используя старую логику (как в оригинальном календаре)
          let appointment = appointments.find(apt => 
            apt.room_id === room.id &&
            apt.appointment_time === time && 
            apt.appointment_date === currentDate
          );

          // Если не нашли с room_id, ищем по врачу в расписании (старые записи)
          if (!appointment) {
            const availableDoctor = getAvailableDoctorForSlot(room, currentDate, time);
            if (availableDoctor) {
              appointment = appointments.find(apt => 
                apt.doctor_id === availableDoctor.id &&
                apt.appointment_time === time && 
                apt.appointment_date === currentDate &&
                (!apt.room_id || apt.room_id === "")
              );
            }
          }

          // Получаем врача по расписанию для этого слота
          const availableDoctor = getAvailableDoctorForSlot(room, currentDate, time);
          
          const isHovered = hoveredSlot?.roomId === room.id && hoveredSlot?.time === time;

          return (
            <TimeSlot
              key={`${room.id}-${time}`}
              roomId={room.id}
              time={time}
              appointment={appointment}
              availableDoctor={availableDoctor}
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