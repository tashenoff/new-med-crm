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
  // Получаем список врачей для текущего дня из расписания кабинета
  // Каждый врач отображается с временем работы (Василий 9:00-15:00, Николай 15:00-19:00)
  const getDoctorsForRoom = () => {
    if (!room?.schedule || !doctors || !currentDate) return [];
    const dayOfWeek = new Date(currentDate).getDay();
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
    <div className="room-column flex-1 border-r border-gray-200 last:border-r-0">
      {/* Заголовок кабинета */}
      <div className="room-header bg-blue-50 px-3 py-2 border-b border-gray-200" style={{ minHeight: '48px' }}>
        <h3 className="font-semibold text-blue-900 text-sm leading-tight">{room.name}</h3>
        {doctorsInRoom.length > 0 ? (
          doctorsInRoom.map((doc, idx) => (
            <p key={idx} className="text-xs text-blue-600 font-medium leading-tight mt-0.5">
              {doc.label}
            </p>
          ))
        ) : (
          <p className="text-xs text-gray-400 font-medium leading-tight mt-0.5">—</p>
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