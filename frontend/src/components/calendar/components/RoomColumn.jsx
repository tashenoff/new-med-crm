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
          // Сначала получаем врача по расписанию
          const availableDoctor = getAvailableDoctorForSlot(room, currentDate, time);
          
          // Ищем запись для этого слота
          let appointment = null;
          
          // 1. Сначала ищем записи с room_id (новые записи)
          appointment = appointments.find(apt => 
            apt.room_id === room.id &&
            apt.appointment_time === time && 
            apt.appointment_date === currentDate
          );

          // 2. Если не нашли, ищем по врачу (старые записи без room_id)
          if (!appointment && availableDoctor) {
            appointment = appointments.find(apt => 
              apt.doctor_id === availableDoctor.id &&
              apt.appointment_time === time && 
              apt.appointment_date === currentDate &&
              (!apt.room_id || apt.room_id === "")
            );
          }
          
          // Отладка для времени 10:30
          if (time === "10:30") {
            console.log(`🔍 DEBUG ${room.name} ${time}:`, {
              roomId: room.id,
              availableDoctor: availableDoctor?.name,
              appointmentFound: !!appointment,
              appointmentId: appointment?.id,
              allAppointments: appointments.map(a => ({
                id: a.id, 
                time: a.appointment_time, 
                doctor_id: a.doctor_id,
                room_id: a.room_id
              }))
            });
          }
          
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
              currentDate={currentDate}
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