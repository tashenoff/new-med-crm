import React from 'react';
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
  // Получение доступного врача для слота
  const getAvailableDoctorForSlot = (room, date, time) => {
    if (!room || !room.schedule || room.schedule.length === 0) {
      return null;
    }

    const dayOfWeek = new Date(date).getDay();
    const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    // Находим активное расписание для этого дня и времени
    const activeSchedule = room.schedule.find(schedule => 
      schedule.day_of_week === adjustedDayOfWeek &&
      schedule.is_active &&
      time >= schedule.start_time &&
      time < schedule.end_time
    );

    if (!activeSchedule) {
      return null;
    }

    // Возвращаем врача из расписания
    return doctors.find(doctor => doctor.id === activeSchedule.doctor_id);
  };

  return (
    <div className="calendar-grid flex">
      {/* Временная шкала слева */}
      <div className="time-column w-20 bg-gray-50 border-r border-gray-200">
        <div className="h-12 border-b border-gray-200"></div> {/* Пустое место для заголовка */}
        {timeSlots.map((time) => (
          <div 
            key={time}
            className="h-16 border-b border-gray-200 flex items-center justify-center text-sm text-gray-600"
          >
            {time}
          </div>
        ))}
      </div>
      
      {/* Кабинеты */}
      <div className="rooms-container flex flex-1">
        {rooms.map((room) => (
          <RoomColumn
            key={room.id}
            room={room}
            timeSlots={timeSlots}
            appointments={appointments}
            patients={patients}
            doctors={doctors}
            currentDate={currentDate}
            canEdit={canEdit}
            getAvailableDoctorForSlot={getAvailableDoctorForSlot}
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