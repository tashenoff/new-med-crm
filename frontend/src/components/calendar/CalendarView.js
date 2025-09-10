import React, { useState, useEffect } from 'react';

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
  canEdit 
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  const API = import.meta.env.VITE_BACKEND_URL;

  // Функция для загрузки врачей, работающих в выбранную дату
  const fetchAvailableDoctors = async (date) => {
    setLoadingDoctors(true);
    
    try {
      const token = localStorage.getItem('token');
      const dateString = date.toISOString().split('T')[0];
      
      const response = await fetch(`${API}/api/doctors/available/${dateString}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const availableDocs = await response.json();
        setAvailableDoctors(availableDocs);
      } else {
        console.error('Error fetching available doctors');
        setAvailableDoctors([]);
      }
    } catch (error) {
      console.error('Error fetching available doctors:', error);
      setAvailableDoctors([]);
    } finally {
      setLoadingDoctors(false);
    }
  };

  // Загрузка доступных врачей при изменении даты
  useEffect(() => {
    fetchAvailableDoctors(currentDate);
  }, [currentDate]);

  // Загрузка при первом рендере
  useEffect(() => {
    fetchAvailableDoctors(currentDate);
  }, []);

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

  const getAppointmentForSlot = (doctorId, date, time) => {
    return appointments.find(apt => 
      apt.doctor_id === doctorId && 
      apt.appointment_date === date && 
      apt.appointment_time === time
    );
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

  const handleDrop = (e, doctorId, date, time) => {
    e.preventDefault();
    const appointmentId = e.dataTransfer.getData('appointmentId');
    if (appointmentId && onMoveAppointment) {
      onMoveAppointment(appointmentId, doctorId, date, time);
    }
  };

  const dates = generateCalendarDates();
  const timeSlots = generateTimeSlots();

  return (
    <div className="h-full">
      {/* Navigation Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold">Календарь врачей</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => navigateDay(-1)}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50"
              title="Предыдущий день"
            >
              ←
            </button>
            
            <button
              onClick={goToToday}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              Сегодня
            </button>
            
            <button
              onClick={() => navigateDay(1)}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50"
              title="Следующий день"
            >
              →
            </button>
          </div>
        </div>

        {canEdit && (
          <button
            onClick={onNewAppointment}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Новая запись
          </button>
        )}
      </div>

      {/* Current Date Display */}
      <div className="mb-4 text-center">
        <h3 className="text-xl font-semibold text-gray-800">
          {currentDate.toLocaleDateString('ru-RU', { 
            weekday: 'long', 
            year: 'numeric',
            month: 'long', 
            day: 'numeric' 
          })}
        </h3>
        {availableDoctors.length > 0 && (
          <p className="text-sm text-gray-600 mt-1">
            Работает {availableDoctors.length} {availableDoctors.length === 1 ? 'врач' : 'врачей'}
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loadingDoctors ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-gray-500">Загружаем врачей на выбранную дату...</div>
          </div>
        ) : availableDoctors.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-center text-gray-500">
              <div className="text-4xl mb-2">👨‍⚕️</div>
              <p>На выбранную дату нет работающих врачей</p>
              <p className="text-sm mt-1">Выберите другую дату или настройте расписание</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div 
              className="grid gap-1 p-4" 
              style={{ gridTemplateColumns: `120px repeat(${availableDoctors.length}, 1fr)` }}
            >
              {/* Header */}
              <div className="font-medium text-gray-600 p-2">Время</div>
              {availableDoctors.map(doctor => (
                <div key={doctor.id} className="font-medium text-gray-600 p-2 text-center border-b">
                  <div>{doctor.full_name}</div>
                  <div className="text-sm text-gray-500">{doctor.specialty}</div>
                  {/* Показываем рабочие часы врача */}
                  {doctor.schedule && doctor.schedule.length > 0 && (
                    <div className="text-xs text-blue-600 mt-1">
                      🕒 {doctor.schedule[0].start_time}-{doctor.schedule[0].end_time}
                    </div>
                  )}
                </div>
              ))}

              {/* Calendar Grid */}
              {dates.map(date => (
                <React.Fragment key={date}>
                  {/* Date Header with Today Highlight */}
                  <div className={`col-span-full p-3 font-medium text-center border-t border-b ${
                    isToday(date) 
                      ? 'bg-blue-100 text-blue-800 border-blue-300' 
                      : 'bg-gray-50'
                  }`}>
                    <div className="flex items-center justify-center space-x-2">
                      {isToday(date) && <span className="text-blue-600">●</span>}
                      <span>
                        {new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', { 
                          weekday: 'long', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </span>
                      {isToday(date) && <span className="text-sm text-blue-600">(Сегодня)</span>}
                    </div>
                  </div>

                  {/* Time Slots for this date */}
                  {timeSlots.map(time => (
                    <React.Fragment key={`${date}-${time}`}>
                      <div className="p-2 text-sm text-gray-600 bg-gray-50">
                        {time}
                      </div>
                      
                      {availableDoctors.map(doctor => {
                        const appointment = getAppointmentForSlot(doctor.id, date, time);
                        
                        // Проверяем, находится ли время в рабочих часах врача
                        const isInWorkingHours = doctor.schedule && doctor.schedule.some(schedule => {
                          const timeObj = new Date(`1970-01-01T${time}:00`);
                          const startObj = new Date(`1970-01-01T${schedule.start_time}:00`);
                          const endObj = new Date(`1970-01-01T${schedule.end_time}:00`);
                          return timeObj >= startObj && timeObj <= endObj;
                        });
                        
                        return (
                          <div
                            key={`${doctor.id}-${date}-${time}`}
                            className={`border border-gray-200 min-h-[50px] p-1 relative cursor-pointer ${
                              isInWorkingHours ? 'hover:bg-blue-50' : 'bg-gray-100'
                            } ${!isInWorkingHours ? 'opacity-50' : ''}`}
                            onClick={() => !appointment && canEdit && isInWorkingHours && onSlotClick(doctor.id, date, time)}
                            onDrop={(e) => canEdit && isInWorkingHours && handleDrop(e, doctor.id, date, time)}
                            onDragOver={isInWorkingHours ? handleDragOver : undefined}
                            title={!isInWorkingHours ? 'Врач не работает в это время' : ''}
                          >
                            {appointment ? (
                              <div
                                className={`p-2 rounded text-xs ${getStatusColor(appointment.status)} cursor-move`}
                                draggable={canEdit}
                                onDragStart={(e) => handleDragStart(e, appointment.id)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditAppointment(appointment);
                                }}
                              >
                                <div className="font-semibold truncate">
                                  {appointment.patient_name}
                                </div>
                                <div className="truncate">
                                  {appointment.reason}
                                </div>
                                <div className="flex justify-between items-center mt-1">
                                  <span className="text-xs opacity-75">
                                    {appointment.appointment_time}
                                  </span>
                                  {canEdit && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteAppointment(appointment.id);
                                      }}
                                      className="text-red-600 hover:text-red-800 opacity-60 hover:opacity-100"
                                      title="Удалить"
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : isInWorkingHours ? (
                              <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                                +
                              </div>
                            ) : (
                              <div className="h-full flex items-center justify-center text-gray-300 text-xs">
                                —
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CalendarView;