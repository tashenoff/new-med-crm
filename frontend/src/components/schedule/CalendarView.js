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

  const API = process.env.REACT_APP_BACKEND_URL;

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
      case 'confirmed': return 'bg-blue-500 text-white';
      case 'completed': return 'bg-green-500 text-white';
      case 'cancelled': return 'bg-red-500 text-white';
      case 'in_progress': return 'bg-orange-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const handleDrop = (e, doctorId, date, time) => {
    e.preventDefault();
    const appointmentId = e.dataTransfer.getData('appointmentId');
    onMoveAppointment(appointmentId, doctorId, date, time);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDragStart = (e, appointmentId) => {
    e.dataTransfer.setData('appointmentId', appointmentId);
  };

  const dates = generateCalendarDates();
  const timeSlots = generateTimeSlots();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Календарь приемов</h2>
        <div className="flex items-center space-x-4">
          {/* Навигация по неделям */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => navigateDay(-1)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
              title="Предыдущий день"
            >
              ←
            </button>
            
            <button
              onClick={goToToday}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              title="Сегодня"
            >
              Сегодня
            </button>
            
            <button
              onClick={() => navigateDay(1)}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
              title="Следующий день"
            >
              →
            </button>
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
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <div 
            className="grid gap-1 p-4" 
            style={{ gridTemplateColumns: `120px repeat(${doctors.length}, 1fr)` }}
          >
            {/* Header */}
            <div className="font-medium text-gray-600 p-2">Время</div>
            {doctors.map(doctor => (
              <div key={doctor.id} className="font-medium text-gray-600 p-2 text-center border-b">
                <div>{doctor.full_name}</div>
                <div className="text-sm text-gray-500">{doctor.specialty}</div>
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
                    
                    {doctors.map(doctor => {
                      const appointment = getAppointmentForSlot(doctor.id, date, time);
                      
                      return (
                        <div
                          key={`${doctor.id}-${date}-${time}`}
                          className="border border-gray-200 min-h-[50px] p-1 relative hover:bg-gray-50 cursor-pointer"
                          onClick={() => !appointment && canEdit && onSlotClick(doctor.id, date, time)}
                          onDrop={(e) => canEdit && handleDrop(e, doctor.id, date, time)}
                          onDragOver={handleDragOver}
                        >
                          {appointment ? (
                            <div
                              className={`p-2 rounded text-xs ${getStatusColor(appointment.status)} cursor-move`}
                              draggable={canEdit}
                              onDragStart={(e) => handleDragStart(e, appointment.id)}
                            >
                              <div className="font-medium">{appointment.patient_name}</div>
                              <div className="truncate">{appointment.reason}</div>
                              
                              {canEdit && (
                                <div className="flex space-x-1 mt-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEditAppointment(appointment);
                                    }}
                                    className="text-white hover:text-gray-200"
                                    title="Редактировать"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteAppointment(appointment.id);
                                    }}
                                    className="text-white hover:text-gray-200"
                                    title="Удалить"
                                  >
                                    🗑️
                                  </button>
                                  <select
                                    value={appointment.status}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      onStatusChange(appointment.id, e.target.value);
                                    }}
                                    className="text-xs bg-transparent border-0 text-white"
                                    title="Изменить статус"
                                  >
                                    <option value="pending">⏳</option>
                                    <option value="confirmed">✅</option>
                                    <option value="in_progress">🔄</option>
                                    <option value="completed">✔️</option>
                                    <option value="cancelled">❌</option>
                                  </select>
                                </div>
                              )}
                            </div>
                          ) : (
                            canEdit && (
                              <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                                +
                              </div>
                            )
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
      </div>
    </div>
  );
};

export default CalendarView;