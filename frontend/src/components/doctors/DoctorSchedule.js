import React, { useState, useEffect, useMemo } from 'react';
import PanelHeader from '../common/PanelHeader';
import Modal from '../modals/Modal';
import { inputClasses, selectClasses, buttonPrimaryClasses, buttonSecondaryClasses, tableClasses, tableHeaderClasses, tableRowClasses } from '../modals/modalUtils';

const DoctorSchedule = ({ doctors, user, canEdit, rooms = [] }) => {
  const [schedules, setSchedules] = useState([]);
  const [allRooms, setAllRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Filters
  const [selectedScheduleType, setSelectedScheduleType] = useState('all');
  const [selectedShift, setSelectedShift] = useState('all');
  const [selectedDoctor, setSelectedDoctor] = useState('all');
  const [selectedRoom, setSelectedRoom] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFixedModal, setShowFixedModal] = useState(false);
  const [formData, setFormData] = useState({
    doctor_id: '',
    day_of_week: 0,
    start_time: '09:00',
    end_time: '18:00',
    room_id: '',
    schedule_type: 'fixed', // fixed, shift
    replacement_doctor_id: ''
  });

  const API = import.meta.env.VITE_BACKEND_URL;
  
  const months = [
    { value: 0, label: 'Январь' },
    { value: 1, label: 'Февраль' },
    { value: 2, label: 'Март' },
    { value: 3, label: 'Апрель' },
    { value: 4, label: 'Май' },
    { value: 5, label: 'Июнь' },
    { value: 6, label: 'Июль' },
    { value: 7, label: 'Август' },
    { value: 8, label: 'Сентябрь' },
    { value: 9, label: 'Октябрь' },
    { value: 10, label: 'Ноябрь' },
    { value: 11, label: 'Декабрь' }
  ];
  
  const daysOfWeek = [
    { id: 0, name: 'Понедельник' },
    { id: 1, name: 'Вторник' },
    { id: 2, name: 'Среда' },
    { id: 3, name: 'Четверг' },
    { id: 4, name: 'Пятница' },
    { id: 5, name: 'Суббота' },
    { id: 6, name: 'Воскресенье' }
  ];

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  }, []);

  // Fetch all schedules when doctors list changes
  useEffect(() => {
    if (doctors && doctors.length > 0) {
      fetchAllSchedules();
    }
  }, [doctors]);

  // Fetch rooms on mount
  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/rooms`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAllRooms(data);
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
    }
  };

  const fetchAllSchedules = async () => {
    setLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('token');
      const allSchedules = [];
      
      // Fetch schedules for all active doctors
      for (const doctor of doctors.filter(d => d.is_active)) {
        try {
          const response = await fetch(`${API}/api/doctors/${doctor.id}/schedule`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const scheduleData = await response.json();
            // Add doctor info to each schedule
            scheduleData.forEach(schedule => {
              allSchedules.push({
                ...schedule,
                doctor_name: doctor.full_name,
                doctor_specialty: doctor.specialty,
                doctor_id: doctor.id
              });
            });
          }
        } catch (err) {
          console.error(`Error fetching schedule for doctor ${doctor.id}:`, err);
        }
      }
      
      // Also fetch room schedules to get room assignments
      try {
        const roomsResponse = await fetch(`${API}/api/rooms-with-schedule`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (roomsResponse.ok) {
          const roomsData = await roomsResponse.json();
          
          // Map room info to schedules
          roomsData.forEach(room => {
            room.schedule?.forEach(roomSchedule => {
              const existingScheduleIdx = allSchedules.findIndex(
                s => s.doctor_id === roomSchedule.doctor_id && s.day_of_week === roomSchedule.day_of_week
              );
              
              if (existingScheduleIdx !== -1) {
                allSchedules[existingScheduleIdx].room_name = room.name;
                allSchedules[existingScheduleIdx].room_id = room.id;
              }
            });
          });
        }
      } catch (err) {
        console.error('Error fetching rooms with schedule:', err);
      }
      
      setSchedules(allSchedules);
    } catch (error) {
      setError('Ошибка при загрузке расписания');
      console.error('Error fetching schedules:', error);
    } finally {
      setLoading(false);
    }
  };

  // Group schedules by doctor for display
  const groupedSchedules = useMemo(() => {
    const grouped = {};
    
    schedules.forEach(schedule => {
      const key = schedule.doctor_id;
      if (!grouped[key]) {
        grouped[key] = {
          doctor_id: schedule.doctor_id,
          doctor_name: schedule.doctor_name,
          doctor_specialty: schedule.doctor_specialty,
          schedules: [],
          room_name: schedule.room_name || '-',
          schedule_type: 'fixed'
        };
      }
      grouped[key].schedules.push(schedule);
      if (schedule.room_name) {
        grouped[key].room_name = schedule.room_name;
      }
    });
    
    return Object.values(grouped);
  }, [schedules]);

  // Filter schedules
  const filteredSchedules = useMemo(() => {
    return groupedSchedules.filter(item => {
      // Filter by doctor
      if (selectedDoctor !== 'all' && item.doctor_id !== selectedDoctor) {
        return false;
      }
      
      // Filter by room
      if (selectedRoom !== 'all' && item.room_name !== selectedRoom && item.room_name !== allRooms.find(r => r.id === selectedRoom)?.name) {
        return false;
      }
      
      // Filter by schedule type
      if (selectedScheduleType !== 'all' && item.schedule_type !== selectedScheduleType) {
        return false;
      }
      
      return true;
    });
  }, [groupedSchedules, selectedDoctor, selectedRoom, selectedScheduleType]);

  // Pagination
  const totalPages = Math.ceil(filteredSchedules.length / itemsPerPage);
  const paginatedSchedules = filteredSchedules.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Check room availability before creating schedule
  const checkRoomAvailability = async (roomId, dayOfWeek, startTime, endTime) => {
    if (!roomId) return { is_available: true, conflicts: [] };
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API}/api/doctors/schedule/check-room-availability/${roomId}?day_of_week=${dayOfWeek}&start_time=${startTime}&end_time=${endTime}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.ok) {
        return await response.json();
      }
      return { is_available: true, conflicts: [] };
    } catch (error) {
      console.error('Error checking room availability:', error);
      return { is_available: true, conflicts: [] };
    }
  };

  const handleCreateSchedule = async () => {
    if (!formData.doctor_id || !formData.start_time || !formData.end_time) {
      setError('Заполните все обязательные поля');
      return;
    }

    // Check room availability if room is selected
    if (formData.room_id) {
      const availability = await checkRoomAvailability(
        formData.room_id,
        formData.day_of_week,
        formData.start_time,
        formData.end_time
      );
      
      if (!availability.is_available) {
        const conflictInfo = availability.conflicts.map(c => 
          `${c.doctor_name} (${c.start_time}-${c.end_time})`
        ).join(', ');
        setError(`Кабинет занят в это время: ${conflictInfo}`);
        setTimeout(() => setError(''), 7000);
        return;
      }
    }

    try {
      const token = localStorage.getItem('token');
      
      // Use new endpoint that creates both doctor and room schedule
      const response = await fetch(`${API}/api/doctors/schedule/with-room`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          doctor_id: formData.doctor_id,
          day_of_week: parseInt(formData.day_of_week),
          start_time: formData.start_time,
          end_time: formData.end_time,
          room_id: formData.room_id || null
        })
      });

      if (response.ok) {
        const result = await response.json();
        const successMsg = formData.room_id 
          ? 'График добавлен успешно (врач + кабинет)' 
          : 'График добавлен успешно';
        setSuccess(successMsg);
        fetchAllSchedules();
        setShowAddModal(false);
        setShowFixedModal(false);
        resetForm();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при создании графика');
        setTimeout(() => setError(''), 5000);
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error creating schedule:', error);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleDeleteSchedule = async (doctorId, scheduleId) => {
    if (!window.confirm('Удалить этот график?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/doctors/${doctorId}/schedule/${scheduleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setSuccess('График удален успешно');
        fetchAllSchedules();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при удалении графика');
        setTimeout(() => setError(''), 5000);
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error deleting schedule:', error);
      setTimeout(() => setError(''), 5000);
    }
  };

  const resetForm = () => {
    setFormData({
      doctor_id: '',
      day_of_week: 0,
      start_time: '09:00',
      end_time: '18:00',
      room_id: '',
      schedule_type: 'fixed',
      replacement_doctor_id: ''
    });
  };

  const getMonthYearLabel = () => {
    return `${months[selectedMonth].label} ${selectedYear}`;
  };

  const formatScheduleInfo = (schedules) => {
    if (!schedules || schedules.length === 0) {
      return '-';
    }
    
    // Show schedule summary
    const days = schedules.map(s => daysOfWeek[s.day_of_week]?.name?.slice(0, 2)).join(', ');
    const times = schedules.length > 0 ? `${schedules[0].start_time}-${schedules[0].end_time}` : '';
    
    return `${times} (${days})`;
  };

  return (
    <div className="space-y-6">
      <div className={`calendar-container calendar-view-panel rounded-2xl`}>
        <PanelHeader
          title="Расписание врачей"
          subtitle="Управление рабочим временем и графиком врачей"
        />

        <div className="bg-white dark:bg-gray-800 rounded-b-2xl border border-t-0 border-gray-200 dark:border-gray-700 p-4 space-y-4 shadow-sm">
          {/* Статистика врачей */}
          <div className="flex justify-end">
            <div className="text-sm text-gray-500">
              Врачей: {doctors.length} (активных: {doctors.filter(doctor => doctor.is_active).length})
            </div>
          </div>

          {/* Фильтры */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap gap-4 items-center">
              {/* Тип графика */}
              <select
                value={selectedScheduleType}
                onChange={(e) => setSelectedScheduleType(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white"
              >
                <option value="all">Все графики</option>
                <option value="fixed">Фиксированный график</option>
                <option value="shift">Сменный график</option>
              </select>

              {/* Смены */}
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white"
              >
                <option value="all">Все смены</option>
                <option value="morning">Утренняя</option>
                <option value="evening">Вечерняя</option>
                <option value="night">Ночная</option>
              </select>

              {/* Врач */}
              <select
                value={selectedDoctor}
                onChange={(e) => setSelectedDoctor(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white min-w-[200px]"
              >
                <option value="all">Любой врач</option>
                {doctors.filter(d => d.is_active).map(doctor => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.full_name}
                  </option>
                ))}
              </select>

              {/* Кресло/Кабинет */}
              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white min-w-[150px]"
              >
                <option value="all">Любое кресло</option>
                {allRooms.map(room => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>

              {/* Месяц */}
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white"
              >
                {months.map(month => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>

              {/* Год */}
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white"
              >
                {years.map(year => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Сообщения */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg dark:bg-red-900/50 dark:border-red-800 dark:text-red-300">
              {error}
            </div>
          )}
          
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg dark:bg-green-900/50 dark:border-green-800 dark:text-green-300">
              {success}
            </div>
          )}

          {/* Таблица расписания */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <div className="text-gray-500 mt-2">Загружаем расписание...</div>
              </div>
            ) : (
              <table className={tableClasses}>
                <thead>
                  <tr className={tableHeaderClasses}>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Врач
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Дата
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Сменный график работы
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Кресло
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                      Заменяемый врач
                    </th>
                    {canEdit && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                        Действия
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedSchedules.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 6 : 5} className="px-6 py-8 text-center text-gray-500">
                        <div className="text-4xl mb-2">📅</div>
                        <p>Расписание не найдено</p>
                        <p className="text-sm">Добавьте график врача</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedSchedules.map((item, index) => (
                      <tr key={item.doctor_id} className={tableRowClasses}>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {item.doctor_name}
                          </div>
                          {item.doctor_specialty && (
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {item.doctor_specialty}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                          {getMonthYearLabel()}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-orange-600 dark:text-orange-400 underline cursor-pointer hover:text-orange-800">
                            Фиксированный график на месяц
                          </span>
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {formatScheduleInfo(item.schedules)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                          {item.room_name || '-'}
                        </td>
                        <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                          -
                        </td>
                        {canEdit && (
                          <td className="px-6 py-4">
                            <button
                              onClick={() => {
                                if (item.schedules.length > 0) {
                                  handleDeleteSchedule(item.doctor_id, item.schedules[0].id);
                                }
                              }}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                              title="Удалить"
                            >
                              🗑️
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Пагинация и кнопки */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Всего {filteredSchedules.length} записей
            </div>
            
            <div className="flex items-center gap-4">
              {canEdit && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    Добавить график врача
                  </button>
                  <button
                    onClick={() => setShowFixedModal(true)}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
                  >
                    Добавить зафиксированный график
                  </button>
                </div>
              )}
              
              {/* Пагинация */}
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 rounded ${
                        currentPage === page
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Модальное окно добавления графика */}
      <Modal
        show={showAddModal || showFixedModal}
        onClose={() => {
          setShowAddModal(false);
          setShowFixedModal(false);
          resetForm();
        }}
        title={showFixedModal ? 'Добавить зафиксированный график' : 'Добавить график врача'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-200">Врач *</label>
            <select
              value={formData.doctor_id}
              onChange={(e) => setFormData({ ...formData, doctor_id: e.target.value })}
              className={selectClasses}
              required
            >
              <option value="">Выберите врача</option>
              {doctors.filter(d => d.is_active).map(doctor => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.full_name} - {doctor.specialty}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-200">День недели *</label>
            <select
              value={formData.day_of_week}
              onChange={(e) => setFormData({ ...formData, day_of_week: parseInt(e.target.value) })}
              className={selectClasses}
              required
            >
              {daysOfWeek.map(day => (
                <option key={day.id} value={day.id}>{day.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-200">Время начала *</label>
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className={inputClasses}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-200">Время окончания *</label>
              <input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className={inputClasses}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-gray-200">Кабинет/Кресло</label>
            <select
              value={formData.room_id}
              onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
              className={selectClasses}
            >
              <option value="">Выберите кабинет</option>
              {allRooms.map(room => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              onClick={() => {
                setShowAddModal(false);
                setShowFixedModal(false);
                resetForm();
              }}
              className={buttonSecondaryClasses}
            >
              Отмена
            </button>
            <button
              onClick={handleCreateSchedule}
              className={buttonPrimaryClasses}
              disabled={!formData.doctor_id}
            >
              Добавить
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DoctorSchedule;
