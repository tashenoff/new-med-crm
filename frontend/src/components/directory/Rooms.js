import React, { useState, useEffect } from 'react';
import Modal from '../modals/Modal';
import { inputClasses, selectClasses, buttonPrimaryClasses, buttonSecondaryClasses, buttonDangerClasses, tableClasses, tableHeaderClasses, tableRowClasses } from '../modals/modalUtils';

const API = import.meta.env.VITE_BACKEND_URL;

const DAYS_OF_WEEK = [
  { value: 0, label: 'Понедельник' },
  { value: 1, label: 'Вторник' },
  { value: 2, label: 'Среда' },
  { value: 3, label: 'Четверг' },
  { value: 4, label: 'Пятница' },
  { value: 5, label: 'Суббота' },
  { value: 6, label: 'Воскресенье' }
];

const Rooms = ({ user }) => {
  const [rooms, setRooms] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Room modal states
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [roomForm, setRoomForm] = useState({
    name: '',
    number: '',
    description: '',
    equipment: []
  });
  
  // Schedule modal states
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    doctor_id: '',
    day_of_week: 0,
    start_time: '',
    end_time: ''
  });
  
  const [roomSchedules, setRoomSchedules] = useState([]);

  useEffect(() => {
    fetchRooms();
    fetchDoctors();
  }, []);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/rooms-with-schedule`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setRooms(data);
      } else {
        setError('Ошибка при получении списка кабинетов');
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
      setError('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  const fetchDoctors = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/doctors`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDoctors(data);
      }
    } catch (error) {
      console.error('Error fetching doctors:', error);
    }
  };

  const handleCreateRoom = () => {
    setEditingRoom(null);
    setRoomForm({
      name: '',
      number: '',
      description: '',
      equipment: []
    });
    setShowRoomModal(true);
  };

  const handleEditRoom = (room) => {
    setEditingRoom(room);
    setRoomForm({
      name: room.name,
      number: room.number || '',
      description: room.description || '',
      equipment: room.equipment || []
    });
    setShowRoomModal(true);
  };

  const handleSaveRoom = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const url = editingRoom 
        ? `${API}/api/rooms/${editingRoom.id}`
        : `${API}/api/rooms`;
      
      const method = editingRoom ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(roomForm)
      });

      if (response.ok) {
        await fetchRooms();
        setShowRoomModal(false);
        setError('');
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при сохранении кабинета');
      }
    } catch (error) {
      console.error('Error saving room:', error);
      setError('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm('Вы уверены, что хотите удалить этот кабинет?')) {
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API}/api/rooms/${roomId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        await fetchRooms();
        setError('');
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при удалении кабинета');
      }
    } catch (error) {
      console.error('Error deleting room:', error);
      setError('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  const handleManageSchedule = async (room) => {
    setSelectedRoom(room);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/rooms/${room.id}/schedule`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setRoomSchedules(data);
      }
    } catch (error) {
      console.error('Error fetching room schedule:', error);
    }
    
    setScheduleForm({
      doctor_id: '',
      day_of_week: 0,
      start_time: '',
      end_time: ''
    });
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = async () => {
    try {
      setLoading(true);
      
      // Валидация перед отправкой
      if (!scheduleForm.doctor_id || !scheduleForm.start_time || !scheduleForm.end_time) {
        setError('Заполните все обязательные поля');
        setLoading(false);
        return;
      }
      
      const token = localStorage.getItem('token');
      
      console.log('Отправляем данные расписания:', scheduleForm);
      
      const response = await fetch(`${API}/api/rooms/${selectedRoom.id}/schedule`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(scheduleForm)
      });

      if (response.ok) {
        // Refresh room schedules
        const updatedResponse = await fetch(`${API}/api/rooms/${selectedRoom.id}/schedule`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (updatedResponse.ok) {
          const data = await updatedResponse.json();
          setRoomSchedules(data);
        }
        
        setScheduleForm({
          doctor_id: '',
          day_of_week: 0,
          start_time: '',
          end_time: ''
        });
        setError('');
      } else {
        const errorData = await response.json();
        // Обрабатываем разные типы ошибок
        let errorMessage = 'Ошибка при сохранении расписания';
        if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map(err => err.msg || err).join(', ');
        }
        setError(errorMessage);
      }
    } catch (error) {
      console.error('Error saving schedule:', error);
      setError('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!window.confirm('Вы уверены, что хотите удалить это расписание?')) {
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API}/api/room-schedules/${scheduleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        // Refresh room schedules
        const updatedResponse = await fetch(`${API}/api/rooms/${selectedRoom.id}/schedule`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (updatedResponse.ok) {
          const data = await updatedResponse.json();
          setRoomSchedules(data);
        }
        setError('');
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при удалении расписания');
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
      setError('Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  const getDoctorName = (doctorId) => {
    const doctor = doctors.find(d => d.id === doctorId);
    return doctor ? doctor.full_name : 'Неизвестно';
  };

  const getDayName = (dayOfWeek) => {
    const day = DAYS_OF_WEEK.find(d => d.value === dayOfWeek);
    return day ? day.label : 'Неизвестно';
  };

  return (
    <div className="p-6 dark:bg-gray-900 dark:text-white">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold dark:text-white">Кабинеты</h1>
        {user?.role === 'admin' && (
          <button
            onClick={handleCreateRoom}
            className={buttonPrimaryClasses}
            disabled={loading}
          >
            + Добавить кабинет
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded dark:bg-red-900 dark:border-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className={tableClasses}>
          <thead>
            <tr className={tableHeaderClasses}>
              <th className="px-6 py-3 text-left">Название</th>
              <th className="px-6 py-3 text-left">Номер</th>
              <th className="px-6 py-3 text-left">Описание</th>
              <th className="px-6 py-3 text-left">Расписание</th>
              <th className="px-6 py-3 text-left">Действия</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id} className={tableRowClasses}>
                <td className="px-6 py-4 font-medium">{room.name}</td>
                <td className="px-6 py-4">{room.number || '-'}</td>
                <td className="px-6 py-4">{room.description || '-'}</td>
                <td className="px-6 py-4">
                  {room.schedule.length > 0 ? (
                    <div className="text-sm">
                      {room.schedule.map((s, index) => (
                        <div key={index}>
                          {getDayName(s.day_of_week)}: {s.start_time}-{s.end_time} ({getDoctorName(s.doctor_id)})
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-500">Не настроено</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleManageSchedule(room)}
                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      title="Управление расписанием"
                    >
                      📅
                    </button>
                    {user?.role === 'admin' && (
                      <>
                        <button
                          onClick={() => handleEditRoom(room)}
                          className="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300"
                          title="Редактировать"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteRoom(room.id)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          title="Удалить"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rooms.length === 0 && !loading && (
              <tr>
                <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                  Кабинеты не найдены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Room Modal */}
      <Modal
        show={showRoomModal}
        onClose={() => setShowRoomModal(false)}
        title={editingRoom ? 'Редактировать кабинет' : 'Новый кабинет'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Название *</label>
            <input
              type="text"
              value={roomForm.name}
              onChange={(e) => setRoomForm(prev => ({ ...prev, name: e.target.value }))}
              className={inputClasses}
              placeholder="Кабинет 1"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Номер</label>
            <input
              type="text"
              value={roomForm.number}
              onChange={(e) => setRoomForm(prev => ({ ...prev, number: e.target.value }))}
              className={inputClasses}
              placeholder="101"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Описание</label>
            <textarea
              value={roomForm.description}
              onChange={(e) => setRoomForm(prev => ({ ...prev, description: e.target.value }))}
              className={inputClasses}
              rows="3"
              placeholder="Описание кабинета"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              onClick={() => setShowRoomModal(false)}
              className={buttonSecondaryClasses}
            >
              Отмена
            </button>
            <button
              onClick={handleSaveRoom}
              className={buttonPrimaryClasses}
              disabled={!roomForm.name || loading}
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Schedule Modal */}
      <Modal
        show={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        title={`Расписание: ${selectedRoom?.name}`}
        size="lg"
      >
        <div className="space-y-6">
          {/* Add Schedule Form */}
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <h3 className="text-lg font-medium mb-4">Добавить расписание</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Врач *</label>
                <select
                  value={scheduleForm.doctor_id}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, doctor_id: e.target.value }))}
                  className={selectClasses}
                  required
                >
                  <option value="">Выберите врача</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.full_name} ({doctor.specialty})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">День недели *</label>
                <select
                  value={scheduleForm.day_of_week}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, day_of_week: parseInt(e.target.value) }))}
                  className={selectClasses}
                  required
                >
                  {DAYS_OF_WEEK.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Время начала *</label>
                <input
                  type="time"
                  value={scheduleForm.start_time}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, start_time: e.target.value }))}
                  className={inputClasses}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Время окончания *</label>
                <input
                  type="time"
                  value={scheduleForm.end_time}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, end_time: e.target.value }))}
                  className={inputClasses}
                  required
                />
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={handleSaveSchedule}
                className={buttonPrimaryClasses}
                disabled={!scheduleForm.doctor_id || !scheduleForm.start_time || !scheduleForm.end_time || loading}
              >
                {loading ? 'Добавление...' : 'Добавить'}
              </button>
            </div>
          </div>

          {/* Current Schedules */}
          <div>
            <h3 className="text-lg font-medium mb-4">Текущее расписание</h3>
            {roomSchedules.length > 0 ? (
              <div className="overflow-x-auto">
                <table className={tableClasses}>
                  <thead>
                    <tr className={tableHeaderClasses}>
                      <th className="px-4 py-2 text-left">День недели</th>
                      <th className="px-4 py-2 text-left">Время</th>
                      <th className="px-4 py-2 text-left">Врач</th>
                      <th className="px-4 py-2 text-left">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roomSchedules.map((schedule) => (
                      <tr key={schedule.id} className={tableRowClasses}>
                        <td className="px-4 py-2">{getDayName(schedule.day_of_week)}</td>
                        <td className="px-4 py-2">{schedule.start_time} - {schedule.end_time}</td>
                        <td className="px-4 py-2">{getDoctorName(schedule.doctor_id)}</td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => handleDeleteSchedule(schedule.id)}
                            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                            title="Удалить"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500">Расписание не настроено</p>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={() => setShowScheduleModal(false)}
              className={buttonSecondaryClasses}
            >
              Закрыть
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Rooms;
