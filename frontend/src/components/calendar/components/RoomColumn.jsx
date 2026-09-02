import React from 'react';
import TimeSlot from './TimeSlot';
import { getAppointmentHeight } from '../utils/timeUtils';

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
  // Получаем имя врача для текущего дня из расписания кабинета
  const getDoctorNameForRoom = () => {
    if (!room?.schedule || !doctors || !currentDate) return null;
    const dayOfWeek = new Date(currentDate).getDay();
    const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const daySchedule = room.schedule.find(s => 
      s.day_of_week === adjustedDayOfWeek && s.is_active !== false
    );
    if (!daySchedule) return null;
    const doctor = doctors.find(d => d.id === daySchedule.doctor_id);
    return doctor ? doctor.full_name || doctor.name : null;
  };

  const doctorName = getDoctorNameForRoom();

  return (
    <div className="room-column flex-1 border-r border-gray-200 last:border-r-0">
      {/* Заголовок кабинета */}
      <div className="room-header bg-blue-50 px-3 py-2 border-b border-gray-200 h-12">
        <h3 className="font-semibold text-blue-900 text-sm leading-tight">{room.name}</h3>
        {doctorName && (
          <p className="text-xs text-blue-600 font-medium leading-tight mt-0.5">{doctorName}</p>
        )}
      </div>
      
      {/* Временные слоты */}
      <div className="time-slots">
        {timeSlots.map((time) => {
          // Получаем врача по расписанию
          const availableDoctor = getAvailableDoctorForSlot(room, currentDate, time);
          
          // УПРОЩЕННЫЙ поиск записи - только по времени и дате (как в старом календаре)
          const appointment = appointments.find(apt => 
            apt.appointment_time === time && 
            apt.appointment_date === currentDate &&
            (apt.room_id === room.id || 
             (availableDoctor && apt.doctor_id === availableDoctor.id && (!apt.room_id || apt.room_id === "")))
          );
          
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