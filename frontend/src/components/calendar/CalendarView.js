import React, { useEffect, useMemo, useState } from 'react';
import TimeGrid from './ux/TimeGrid';
import { DragDropManager } from './functions/DragDropManager';
import { themeClasses } from '../../hooks/useTheme';
import {
  generateTimeSlots,
  canAppointmentFitInSchedule
} from './utils/timeUtils';
import {
  isSlotOccupied,
  checkTimeConflicts,
  getStatusColor
} from './utils/appointmentUtils';
import {
  SLOT_INTERVAL_MINUTES,
  SLOT_HEIGHT_PX,
  CALENDAR_START_TIME,
  CALENDAR_END_TIME
} from '../../config/calendarConfig';
import './CalendarView.css';
import CalendarHeader from './ux/CalendarHeader';

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
  onStatusChange,
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
  
  // Состояние для полноэкранного режима
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const toggleFullscreen = () => {
      setIsFullscreen(!isFullscreen);
    };

    // ==================== Мобильная адаптация ====================
    // Определяем мобильный режим (< 1024px) и слушаем resize
    const detectMobile = () => window.innerWidth < 1024;
    const [isMobile, setIsMobile] = useState(detectMobile);
    useEffect(() => {
      const onResize = () => setIsMobile(detectMobile());
      let resizeTimer;
      const debounced = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(onResize, 150);
      };
      window.addEventListener('resize', debounced);
      return () => {
        window.removeEventListener('resize', debounced);
        clearTimeout(resizeTimer);
      };
    }, []);

    // Выбранный кабинет в мобильном режиме (по умолчанию первый)
    const [selectedRoomId, setSelectedRoomId] = useState(null);
    useEffect(() => {
      if (selectedRoomId === null && rooms.length > 0) {
        setSelectedRoomId(rooms[0].id);
      }
      if (selectedRoomId !== null && rooms.length > 0 && !rooms.some(r => r.id === selectedRoomId)) {
        setSelectedRoomId(rooms[0].id);
      }
    }, [rooms, selectedRoomId]);

    // Отображаемые кабинеты: на мобильном — только выбранный, на десктопе — все
    const displayRooms = isMobile && selectedRoomId
      ? rooms.filter(r => r.id === selectedRoomId)
      : rooms;

    // Все кабинеты для выпадающего списка (без повторов по id)
    const roomOptions = useMemo(() => {
      const seen = new Set();
      return rooms.filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
    }, [rooms]);

    // Текущее имя кабинета для селектора
    const selectedRoomName = useMemo(() => {
      const room = rooms.find(r => r.id === selectedRoomId);
      return room?.name || '—';
    }, [rooms, selectedRoomId]);
  
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



  // Рендер grid календаря (переиспользуемый)
  const renderCalendarGrid = () => (
      <div className={`calendar-grid flex ${themeClasses.border.default} border-b`} style={{ '--curai-calendar-slot-height': `${SLOT_HEIGHT_PX}px` }}>
        {/* Колонка времени — фиксированная (sticky left) */}
        <div className={`calendar-time-column-sticky w-20 flex-shrink-0 border-r ${themeClasses.border.light} calendar-time-column`}>
<div className={`h-16 border-b border-l ${themeClasses.border.default} ${themeClasses.bg.secondary} flex items-center justify-center font-semibold ${themeClasses.text.primary} calendar-time-header`}>
          Время
        </div>
        <div className="calendar-time-scale">
        {timeSlots.map((time) => (
          <div key={time} className={`h-16 border-b border-l ${themeClasses.border.light} flex items-center justify-center text-sm font-medium ${themeClasses.text.secondary} calendar-time-label`}>
            <span className="calendar-time-mark">{time}</span>
          </div>
        ))}
        <div className="calendar-time-label calendar-time-end"><span className="calendar-time-mark">{CALENDAR_END_TIME}</span></div>
        </div>
      </div>

      {/* Кабинеты */}
            <div className="flex calendar-rooms-wrapper">
              {displayRooms.length === 0 ? (
                <div className={`flex-1 flex items-center justify-center p-8 ${themeClasses.text.muted} calendar-no-rooms`}>
                  Нет доступных кабинетов
                </div>
              ) : (
                displayRooms.map((room) => (
                  <TimeGrid
              key={room.id}
              room={room}
              timeSlots={timeSlots}
              currentDate={safeCurrentDate}
              appointments={appointments}
              patients={patients}
              doctors={doctors}
              getAvailableDoctorForSlot={getAvailableDoctorForSlot}
              getStatusColor={getStatusColor}
              isSlotOccupied={isSlotOccupiedWrapper}
              canEdit={canEdit}
              onSlotClick={onSlotClick}
              onEditAppointment={onEditAppointment}
              onStatusChange={onStatusChange}
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
  );

  // Полноэкранный режим
  if (isFullscreen) {
    return (
      <div className="curai-calendar-fullscreen fixed inset-0 z-50 flex flex-col">
        <CalendarHeader fullscreen currentDate={safeCurrentDate} onDateChange={onDateChange}
          onNewAppointment={canEdit ? onNewAppointment : null} onToggleFullscreen={toggleFullscreen} />
        <div className="calendar-main-scroll flex-1 overflow-y-auto overflow-x-auto p-4">
          {renderCalendarGrid()}
        </div>
      </div>
    );
  }

  return (
      <div className="flex gap-4">
        {/* Основной календарь */}
        <div className="flex-1 min-w-0">
          <div className={`calendar-container calendar-view-panel rounded-2xl ${themeClasses.shadow.default}`}>
            <CalendarHeader currentDate={safeCurrentDate} onDateChange={onDateChange}
              onNewAppointment={canEdit ? onNewAppointment : null}
              onToggleFullscreen={isMobile ? null : toggleFullscreen} />

            <div className="curai-calendar-body">
              {/* Мобильный тулбар: выбор кабинета */}
                                        {isMobile && (
                                                                                    <div className="relative flex items-center justify-between calendar-mobile-toolbar">
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Кабинет:</label>
                                  <select
                                    value={selectedRoomId || ''}
                                    onChange={(e) => setSelectedRoomId(e.target.value)}
                                    className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800"
                                  >
                                    {roomOptions.map(r => (
                                      <option key={r.id} value={r.id}>{r.name}</option>
                                    ))}
                                  </select>
                                </div>

                              </div>
                            )}

              {/* Grid календаря */}
              <div className="calendar-main-scroll calendar-normal-scroll overflow-y-auto overflow-x-auto">
                {renderCalendarGrid()}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

export default CalendarView;
