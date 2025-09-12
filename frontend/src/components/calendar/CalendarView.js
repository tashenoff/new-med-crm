import React, { useState, useEffect } from 'react';
import useApi from '../../hooks/useApi';

const CalendarView = ({ 
  appointments, 
  doctors, 
  patients, 
  user,
  onNewAppointment,
  onSlotClick,
  onEditAppointment,
  onDeleteAppointment,
  onStatusChange,
  onMoveAppointment,
  onCheckTimeConflicts, // Callback для проверки конфликтов времени
  canEdit 
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  
  const { fetchRoomsWithSchedule, getAvailableDoctorForRoom } = useApi();

  // Функция для загрузки кабинетов с расписанием
  const fetchRooms = async () => {
    setLoadingRooms(true);
    
    try {
      const roomsData = await fetchRoomsWithSchedule();
      setRooms(roomsData);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      setRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  };

  // Загрузка кабинетов при монтировании компонента
  useEffect(() => {
    fetchRooms();
  }, []);

  // Передаем функцию проверки конфликтов в родительский компонент
  useEffect(() => {
    if (onCheckTimeConflicts && rooms.length > 0) {
      onCheckTimeConflicts(checkTimeConflicts);
    }
  }, [rooms, appointments, onCheckTimeConflicts]);

  // Отладка: логируем appointments при изменении
  useEffect(() => {
    console.log('Appointments в календаре:', appointments);
    console.log('Rooms в календаре:', rooms);
    console.log('Текущая дата календаря:', currentDate.toISOString().split('T')[0]);
  }, [appointments, rooms, currentDate]);

  const generateCalendarDates = () => {
    // Показываем только выбранный день
    return [currentDate.toISOString().split('T')[0]];
  };

  const navigateDay = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + direction);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
  };

  const isToday = (dateString) => {
    const today = new Date().toISOString().split('T')[0];
    return dateString === today;
  };

  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 9; hour <= 17; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(timeString);
      }
    }
    return slots;
  };

  // Функция для проверки, попадает ли время в диапазон записи
  const isTimeInAppointmentRange = (appointmentStartTime, appointmentEndTime, currentTime) => {
    if (!appointmentEndTime) return appointmentStartTime === currentTime;
    
    const start = appointmentStartTime.split(':').map(n => parseInt(n));
    const end = appointmentEndTime.split(':').map(n => parseInt(n));
    const current = currentTime.split(':').map(n => parseInt(n));
    
    const startMinutes = start[0] * 60 + start[1];
    const endMinutes = end[0] * 60 + end[1];
    const currentMinutes = current[0] * 60 + current[1];
    
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  };

  // Проверяет, есть ли запись в данном слоте (для блокировки)
  const isSlotOccupied = (roomId, date, time) => {
    // Сначала ищем записи с правильным room_id (новые записи)
    let appointment = appointments.find(apt => 
      apt.room_id === roomId && 
      apt.appointment_date === date && 
      isTimeInAppointmentRange(apt.appointment_time, apt.end_time, time)
    );
    
    // Если не нашли записи с room_id, ищем старые записи без room_id
    if (!appointment) {
      const oldAppointment = appointments.find(apt => 
        (!apt.room_id || apt.room_id === null || apt.room_id === '') && 
        apt.appointment_date === date && 
        isTimeInAppointmentRange(apt.appointment_time, apt.end_time, time)
      );
      
      if (oldAppointment) {
        const currentRoom = rooms.find(r => r.id === roomId);
        if (currentRoom) {
          const doctorInRoom = getAvailableDoctorForSlot(currentRoom, date, time);
          if (doctorInRoom && doctorInRoom.id === oldAppointment.doctor_id) {
            appointment = oldAppointment;
          }
        }
      }
    }
    
    return appointment;
  };

  // Возвращает запись только для первого слота диапазона (для отображения карточки)
  const getAppointmentForSlot = (roomId, date, time) => {
    const appointment = isSlotOccupied(roomId, date, time);
    
    // Показываем карточку только если это первый слот записи
    if (appointment && appointment.appointment_time === time) {
      return appointment;
    }
    
    return null;
  };

  // Вычисляет высоту карточки записи в зависимости от продолжительности
  const getAppointmentHeight = (appointment) => {
    if (!appointment.end_time) return 60; // Высота одного слота
    
    const start = appointment.appointment_time.split(':').map(n => parseInt(n));
    const end = appointment.end_time.split(':').map(n => parseInt(n));
    
    const startMinutes = start[0] * 60 + start[1];
    const endMinutes = end[0] * 60 + end[1];
    const durationMinutes = endMinutes - startMinutes;
    
    // 60px на каждые 30 минут
    return (durationMinutes / 30) * 60;
  };

  // Проверяет, пересекаются ли два временных диапазона
  const doTimesOverlap = (start1, end1, start2, end2) => {
    const start1Minutes = timeToMinutes(start1);
    const end1Minutes = end1 ? timeToMinutes(end1) : start1Minutes + 30; // По умолчанию 30 минут
    const start2Minutes = timeToMinutes(start2);
    const end2Minutes = end2 ? timeToMinutes(end2) : start2Minutes + 30;
    
    return start1Minutes < end2Minutes && start2Minutes < end1Minutes;
  };

  // Конвертирует время "HH:MM" в минуты
  const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(n => parseInt(n));
    return hours * 60 + minutes;
  };

  // Проверяет, есть ли конфликты с существующими записями
  const checkTimeConflicts = (roomId, date, startTime, endTime, excludeAppointmentId = null) => {
    const conflictingAppointments = appointments.filter(apt => {
      // Исключаем саму перемещаемую запись
      if (excludeAppointmentId && apt.id === excludeAppointmentId) {
        return false;
      }
      
      // Проверяем записи в том же кабинете и дате
      if (apt.room_id === roomId && apt.appointment_date === date) {
        return doTimesOverlap(startTime, endTime, apt.appointment_time, apt.end_time);
      }
      
      // Проверяем старые записи без room_id
      if ((!apt.room_id || apt.room_id === null || apt.room_id === '') && apt.appointment_date === date) {
        const currentRoom = rooms.find(r => r.id === roomId);
        if (currentRoom) {
          // Проверяем, работает ли врач из старой записи в этом кабинете в указанное время
          const doctorInRoom = getAvailableDoctorForSlot(currentRoom, date, startTime);
          if (doctorInRoom && doctorInRoom.id === apt.doctor_id) {
            return doTimesOverlap(startTime, endTime, apt.appointment_time, apt.end_time);
          }
        }
      }
      
      return false;
    });
    
    return conflictingAppointments;
  };

  const getAvailableDoctorForSlot = (room, date, time) => {
    const dayOfWeek = new Date(date).getDay();
    const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Конвертируем в наш формат (0 = Понедельник)
    
    const schedule = room.schedule.find(s => 
      s.day_of_week === adjustedDayOfWeek &&
      s.start_time <= time &&
      s.end_time > time &&
      s.is_active
    );
    
    if (schedule) {
      const doctor = doctors.find(d => d.id === schedule.doctor_id);
      return doctor ? { ...doctor, schedule_id: schedule.id } : null;
    }
    
    return null;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'unconfirmed': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'confirmed': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'arrived': return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'in_progress': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'completed': return 'bg-green-100 text-green-800 border-green-300';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-300';
      case 'no_show': return 'bg-gray-100 text-gray-800 border-gray-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (e, appointmentId) => {
    e.dataTransfer.setData('appointmentId', appointmentId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, roomId, date, time) => {
    e.preventDefault();
    const appointmentId = e.dataTransfer.getData('appointmentId');
    if (appointmentId && onMoveAppointment) {
      // Находим перемещаемую запись
      const movingAppointment = appointments.find(apt => apt.id === appointmentId);
      if (!movingAppointment) {
        alert('Запись не найдена');
        return;
      }
      
      // Вычисляем конечное время для проверки конфликтов
      const endTime = movingAppointment.end_time || null;
      
      // Проверяем конфликты времени
      const conflicts = checkTimeConflicts(roomId, date, time, endTime, appointmentId);
      if (conflicts.length > 0) {
        const conflictNames = conflicts.map(apt => {
          const patient = patients.find(p => p.id === apt.patient_id);
          return patient ? patient.full_name : 'Неизвестный пациент';
        }).join(', ');
        
        const confirm = window.confirm(
          `Время пересекается с другими записями: ${conflictNames}.\n\n` +
          `Перемещаемая запись: ${time}${endTime ? ` - ${endTime}` : ''}\n` +
          `Конфликтующие записи: ${conflicts.map(apt => 
            `${apt.appointment_time}${apt.end_time ? ` - ${apt.end_time}` : ''}`
          ).join(', ')}\n\n` +
          `Продолжить перемещение?`
        );
        
        if (!confirm) {
          return;
        }
      }
      
      // Находим врача для этого времени в кабинете
      const room = rooms.find(r => r.id === roomId);
      const availableDoctor = getAvailableDoctorForSlot(room, date, time);
      
      if (availableDoctor) {
        onMoveAppointment(appointmentId, availableDoctor.id, date, time, roomId);
      } else {
        alert('В это время в данном кабинете нет доступного врача');
      }
    }
  };

  const handleSlotClickWithRoom = (roomId, date, time) => {
    // Проверяем, занят ли слот (любой записью в этом времени)
    const conflictingAppointments = appointments.filter(apt => {
      if (apt.appointment_date === date) {
        // Проверяем записи в том же кабинете
        if (apt.room_id === roomId) {
          return isTimeInAppointmentRange(apt.appointment_time, apt.end_time, time);
        }
        // Проверяем старые записи без room_id
        if (!apt.room_id) {
          const currentRoom = rooms.find(r => r.id === roomId);
          if (currentRoom) {
            const doctorInRoom = getAvailableDoctorForSlot(currentRoom, date, time);
            if (doctorInRoom && doctorInRoom.id === apt.doctor_id) {
              return isTimeInAppointmentRange(apt.appointment_time, apt.end_time, time);
            }
          }
        }
      }
      return false;
    });
    
    if (conflictingAppointments.length > 0) {
      // Если слот занят, открываем запись для редактирования
      onEditAppointment(conflictingAppointments[0]);
      return;
    }
    
    const room = rooms.find(r => r.id === roomId);
    const availableDoctor = getAvailableDoctorForSlot(room, date, time);
    
    if (availableDoctor) {
      onSlotClick(date, time, availableDoctor.id, roomId);
    } else {
      alert('В это время в данном кабинете нет доступного врача');
    }
  };

  const dates = generateCalendarDates();
  const timeSlots = generateTimeSlots();

  return (
    <div className="h-full dark:bg-gray-900 dark:text-white">
      {/* Navigation Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold dark:text-white">Календарь кабинетов</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => navigateDay(-1)}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
              title="Предыдущий день"
            >
              ←
            </button>
            
            <button
              onClick={goToToday}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
            >
              Сегодня
            </button>
            
            <button
              onClick={() => navigateDay(1)}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
              title="Следующий день"
            >
              →
            </button>
          </div>
        </div>

        {canEdit && (
          <button
            onClick={onNewAppointment}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors dark:bg-blue-700 dark:hover:bg-blue-600"
          >
            + Новая запись
          </button>
        )}
      </div>

      {/* Current Date Display */}
      <div className="mb-4 text-center">
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
          {currentDate.toLocaleDateString('ru-RU', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
          {isToday(dates[0]) && (
            <span className="ml-2 text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded dark:bg-blue-900 dark:text-blue-300">
              Сегодня
            </span>
          )}
        </h3>
      </div>

      {/* Loading State */}
      {loadingRooms && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Загрузка кабинетов...</p>
        </div>
      )}

      {/* No Rooms Message */}
      {!loadingRooms && rooms.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-600 dark:text-gray-400">
            Кабинеты не настроены. Перейдите в{' '}
            <span className="font-semibold">Справочники → Кабинеты</span>{' '}
            для настройки.
          </p>
        </div>
      )}

      {/* Calendar Grid */}
      {!loadingRooms && rooms.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg dark:border-gray-700">
          <div className="inline-block min-w-full">
            <div className="grid gap-0" 
                 style={{ 
                   gridTemplateColumns: `100px repeat(${rooms.length}, minmax(200px, 1fr))`,
                   minWidth: `${100 + rooms.length * 200}px`
                 }}>
              
              {/* Header Row */}
              <div className="bg-gray-50 border-b border-gray-200 p-3 text-center font-semibold dark:bg-gray-800 dark:border-gray-700">
                Время
              </div>
              
              {rooms.map((room) => (
                <div key={room.id} className="bg-gray-50 border-b border-gray-200 p-3 text-center dark:bg-gray-800 dark:border-gray-700">
                  <div className="font-semibold text-sm">{room.name}</div>
                  {room.number && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">№{room.number}</div>
                  )}
                </div>
              ))}

              {/* Time Slots */}
              {timeSlots.map((time) => (
                <React.Fragment key={time}>
                  {/* Time Column */}
                  <div className="border-b border-gray-200 p-2 text-center text-sm font-medium bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                    {time}
                  </div>
                  
                  {/* Room Slots */}
                  {rooms.map((room) => {
                    const appointment = getAppointmentForSlot(room.id, dates[0], time);
                    const isOccupied = isSlotOccupied(room.id, dates[0], time);
                    const availableDoctor = getAvailableDoctorForSlot(room, dates[0], time);
                    
                    return (
                      <div
                        key={`${room.id}-${time}`}
                        className={`border-b border-gray-200 p-1 min-h-[60px] relative dark:border-gray-700 ${
                          isOccupied ? 'bg-gray-50 dark:bg-gray-800' : 
                          availableDoctor ? 'bg-white hover:bg-gray-50 cursor-pointer dark:bg-gray-900 dark:hover:bg-gray-800' : 'bg-gray-100 dark:bg-gray-700'
                        }`}
                        onDragOver={availableDoctor && !isOccupied ? handleDragOver : null}
                        onDrop={availableDoctor && !isOccupied ? (e) => handleDrop(e, room.id, dates[0], time) : null}
                        onClick={canEdit ? () => handleSlotClickWithRoom(room.id, dates[0], time) : null}
                      >
                        {/* Available Doctor Info */}
                        {availableDoctor && !isOccupied && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            {availableDoctor.full_name}
                          </div>
                        )}
                        
                        {/* Appointment - только в первом слоте диапазона */}
                        {appointment && (
                          <div
                            draggable={canEdit}
                            onDragStart={canEdit ? (e) => handleDragStart(e, appointment.id) : null}
                            className={`absolute top-1 left-1 right-1 p-2 rounded text-xs border cursor-pointer z-10 ${getStatusColor(appointment.status)}`}
                            style={{ height: `${getAppointmentHeight(appointment) - 8}px` }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditAppointment(appointment);
                            }}
                          >
                            <div className="font-semibold">
                              {patients.find(p => p.id === appointment.patient_id)?.full_name || 'Неизвестный пациент'}
                            </div>
                            <div className="text-xs opacity-75">
                              {doctors.find(d => d.id === appointment.doctor_id)?.full_name || 'Неизвестный врач'}
                            </div>
                            {appointment.reason && (
                              <div className="text-xs opacity-75 mt-1">
                                {appointment.reason}
                              </div>
                            )}
                            
                            {/* Status Change Buttons */}
                            {canEdit && appointment.status !== 'completed' && appointment.status !== 'cancelled' && (
                              <div className="flex space-x-1 mt-1">
                                {appointment.status === 'unconfirmed' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onStatusChange(appointment.id, 'confirmed');
                                    }}
                                    className="px-1 py-0.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                                    title="Подтвердить"
                                  >
                                    ✓
                                  </button>
                                )}
                                
                                {['confirmed', 'arrived'].includes(appointment.status) && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onStatusChange(appointment.id, 'arrived');
                                      }}
                                      className="px-1 py-0.5 text-xs bg-purple-500 text-white rounded hover:bg-purple-600"
                                      title="Пациент пришел"
                                    >
                                      👤
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onStatusChange(appointment.id, 'in_progress');
                                      }}
                                      className="px-1 py-0.5 text-xs bg-orange-500 text-white rounded hover:bg-orange-600"
                                      title="Начать прием"
                                    >
                                      ⏯
                                    </button>
                                  </>
                                )}
                                
                                {appointment.status === 'in_progress' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onStatusChange(appointment.id, 'completed');
                                    }}
                                    className="px-1 py-0.5 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                                    title="Завершить"
                                  >
                                    ✓
                                  </button>
                                )}
                                
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm('Отменить запись?')) {
                                      onStatusChange(appointment.id, 'cancelled');
                                    }
                                  }}
                                  className="px-1 py-0.5 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                                  title="Отменить"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* No Doctor Available */}
                        {!availableDoctor && (
                          <div className="text-xs text-gray-400 text-center pt-4 dark:text-gray-500">
                            Нет врача
                          </div>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-4 text-xs">
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-yellow-100 border border-yellow-300 rounded"></div>
          <span>Не подтверждено</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded"></div>
          <span>Подтверждено</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-purple-100 border border-purple-300 rounded"></div>
          <span>Пациент пришел</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-orange-100 border border-orange-300 rounded"></div>
          <span>На приеме</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
          <span>Завершено</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-red-100 border border-red-300 rounded"></div>
          <span>Отменено</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded"></div>
          <span>Не явился</span>
        </div>
      </div>
    </div>
  );
};

export default CalendarView;