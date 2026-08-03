import React, { useEffect, useMemo, useState } from 'react';
import TimeGrid from './ux/TimeGrid';
import DateNavigation from './ux/DateNavigation';
import { DragDropManager } from './functions/DragDropManager';
import { themeClasses } from '../../hooks/useTheme';
import PanelHeader from '../common/PanelHeader';
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
import {
  SLOT_INTERVAL_MINUTES,
  CALENDAR_START_TIME,
  CALENDAR_END_TIME
} from '../../config/calendarConfig';
import './CalendarView.css';

/**
 * Основной компонент календаря
 */
const CalendarView = ({
  appointments = [],
  rooms = [],
  patients = [],
  doctors = [],
  currentDate,
  onDateChange,
  user,
  onSlotClick,
  onEditAppointment,
  onMoveAppointment,
  onNewAppointment,
  onRefreshCalendar,
  blockAppointmentUpdates,
  unblockAppointmentUpdates,
  canEdit = false
}) => {
  // 🔍 ОТЛАДКА: Логируем данные которые приходят в CalendarView
  console.log('📅 CalendarView RENDER:', {
    appointmentsCount: appointments.length,
    roomsCount: rooms.length,
    patientsCount: patients.length,
    doctorsCount: doctors.length,
    currentDate: currentDate?.toISOString?.(),
    canEdit
  });
  
  if (appointments.length > 0) {
    console.log('📋 Первая запись:', appointments[0]);
  }
  
  // Состояние для подсветки слота при drag over
  const [dragOverSlot, setDragOverSlot] = useState(null);
  
  // Устанавливаем текущую дату по умолчанию если не передана
  const safeCurrentDate = currentDate || new Date();

  // Генерируем временные слоты (шаг по умолчанию — 30 минут)
  const timeSlots = useMemo(() => 
    generateTimeSlots(CALENDAR_START_TIME, CALENDAR_END_TIME, SLOT_INTERVAL_MINUTES), 
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
      getAvailableDoctorForSlot,
      onRefreshCalendar,
      blockAppointmentUpdates,
      unblockAppointmentUpdates,
      setDragOverSlot
    }), 
    [appointments, rooms, patients, doctors, onMoveAppointment, onRefreshCalendar, setDragOverSlot]
  );

  // Обертки для утилит с предзаполненными параметрами
  const isSlotOccupiedWrapper = (roomId, date, time) => 
    isSlotOccupied(appointments, rooms, getAvailableDoctorForSlot, roomId, date, time);

  const getAppointmentForSlotWrapper = (roomId, date, time) => 
    getAppointmentForSlot(appointments, rooms, getAvailableDoctorForSlot, roomId, date, time);


  return (
    <div className="space-y-6">
      <div className={`calendar-container calendar-view-panel rounded-2xl ${themeClasses.shadow.default}`}>
        <PanelHeader
          title="Расписание врачей"
          subtitle={`Управление приемами и расписанием кабинетов • интервал ${SLOT_INTERVAL_MINUTES} мин`}
          onAction={canEdit ? onNewAppointment : undefined}
          actionLabel="+ Новая запись"
        />

        <div className="bg-white dark:bg-gray-800 rounded-b-2xl border border-t-0 border-gray-200 dark:border-gray-700 p-4 space-y-4 shadow-sm">
          {/* Навигация по датам */}
          <DateNavigation
            currentDate={safeCurrentDate}
            onDateChange={onDateChange}
            onNewAppointment={canEdit ? onNewAppointment : null}
          />

          {/* Заголовок с временными метками */}
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
            <div className={`calendar-grid flex ${themeClasses.border.default} border-b`}>
              {/* Колонка времени */}
              <div className={`w-20 flex-shrink-0 border-r ${themeClasses.border.light} calendar-time-column`}>
                <div className={`h-12 border-b border-l ${themeClasses.border.default} ${themeClasses.bg.secondary} flex items-center justify-center font-semibold ${themeClasses.text.primary} calendar-time-header`}>
                  Время
                </div>
                {timeSlots.map((time) => (
                  <div key={time} className={`h-16 border-b border-l ${themeClasses.border.light} flex items-center justify-center text-sm font-medium ${themeClasses.text.secondary} calendar-time-label`}>
                    {time}
                  </div>
                ))}
              </div>

              {/* Кабинеты */}
              <div className="flex flex-1 min-w-0 calendar-rooms-wrapper">
                {rooms.length === 0 ? (
                  <div className={`flex-1 flex items-center justify-center p-8 ${themeClasses.text.muted} calendar-no-rooms`}>
                    Нет доступных кабинетов
                  </div>
                ) : (
                  rooms.map((room) => (
                    <TimeGrid
                      key={room.id}
                      room={room}
                      timeSlots={timeSlots}
                      currentDate={safeCurrentDate}
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
                      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={dragDropManager.handleDrop}
                      onDragStart={dragDropManager.handleDragStart}
                      onDragEnd={dragDropManager.handleDragEnd}
                      dragOverSlot={dragOverSlot}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
