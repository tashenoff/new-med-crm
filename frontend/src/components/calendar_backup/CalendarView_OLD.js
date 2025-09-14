import React, { useEffect, useMemo } from 'react';
import TimeGrid from './ux/TimeGrid';
import { DragDropManager } from './functions/DragDropManager';
import { 
  generateTimeSlots, 
  getAppointmentHeight, 
  canAppointmentFitInSchedule 
} from './utils/timeUtils';
import { 
  isSlotOccupied, 
  getAppointmentForSlot, 
  checkTimeConflicts, 
  getStatusColor 
} from './utils/appointmentUtils';

/**
 * Основной компонент календаря
 */
const CalendarView = ({
  appointments = [],
  rooms = [],
  patients = [],
  doctors = [],
  currentDate,
  user,
  onSlotClick,
  onEditAppointment,
  onMoveAppointment
}) => {
  const canEdit = user?.role === 'admin' || user?.role === 'doctor';

  // Генерируем временные слоты
  const timeSlots = useMemo(() => 
    generateTimeSlots("08:00", "20:00", 30), 
    []
  );

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

    // Находим врача по ID
    return doctors.find(doctor => doctor.id === activeSchedule.doctor_id);
  };

  // Создаем менеджер drag & drop
  const dragDropManager = useMemo(() => 
    new DragDropManager({
      appointments,
      rooms,
      patients,
      doctors,
      onMoveAppointment,
      checkTimeConflicts: (roomId, date, time, endTime, excludeId) => 
        checkTimeConflicts(appointments, rooms, getAvailableDoctorForSlot, roomId, date, time, endTime, excludeId),
      canAppointmentFitInSchedule,
      getAvailableDoctorForSlot
    }), 
    [appointments, rooms, patients, doctors, onMoveAppointment]
  );

  // Обертки для утилит с предзаполненными параметрами
  const isSlotOccupiedWrapper = (roomId, date, time) => 
    isSlotOccupied(appointments, rooms, getAvailableDoctorForSlot, roomId, date, time);

  const getAppointmentForSlotWrapper = (roomId, date, time) => 
    getAppointmentForSlot(appointments, rooms, getAvailableDoctorForSlot, roomId, date, time);

  // Логирование для отладки
  useEffect(() => {
    console.log('Appointments в календаре:', appointments);
    console.log('Rooms в календаре:', rooms);
    console.log('Текущая дата календаря:', currentDate.toISOString().split('T')[0]);
    console.log('canEdit в календаре:', canEdit);
    console.log('user в календаре:', user);
  }, [appointments, rooms, currentDate, canEdit, user]);

  return (
    <div className="calendar-container bg-white rounded-lg shadow">
      {/* Заголовок с временными метками */}
      <div className="flex border-b border-gray-300">
        {/* Колонка времени */}
        <div className="w-20 flex-shrink-0">
          <div className="h-12 border-b border-gray-300 bg-gray-100 flex items-center justify-center font-semibold">
            Время
          </div>
          {timeSlots.map((time) => (
            <div key={time} className="h-16 border-b border-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
              {time}
            </div>
          ))}
        </div>

        {/* Кабинеты */}
        <div className="flex flex-1 min-w-0">
          {rooms.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8 text-gray-500">
              Нет доступных кабинетов
            </div>
          ) : (
            rooms.map((room) => (
              <TimeGrid
                key={room.id}
                room={room}
                timeSlots={timeSlots}
                currentDate={currentDate}
                appointments={appointments}
                patients={patients}
                doctors={doctors}
                getAvailableDoctorForSlot={getAvailableDoctorForSlot}
                getAppointmentForSlot={getAppointmentForSlotWrapper}
                getAppointmentHeight={getAppointmentHeight}
                getStatusColor={getStatusColor}
                isSlotOccupied={isSlotOccupiedWrapper}
                canEdit={canEdit}
                onSlotClick={onSlotClick}
                onEditAppointment={onEditAppointment}
                onDragOver={dragDropManager.handleDragOver}
                onDrop={dragDropManager.handleDrop}
                onDragStart={dragDropManager.handleDragStart}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default CalendarView;