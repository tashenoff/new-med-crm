import { LoadingSpinner } from '../common/LoadingIndicator';
import { canAction, permissionProps } from '../../utils/permissions.js';
import React, { useState, useEffect } from 'react';
import Modal from '../modals/Modal';
import PanelHeader from '../common/PanelHeader';
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
    <div className="curai-directory-page curai-rooms space-y-6">
      <div className={`calendar-container calendar-view-panel rounded-md`}>
        <PanelHeader
          title="Кабинеты"
          subtitle="Управление медицинскими кабинетами и их расписанием"
          onAction={canAction(user, "calendar_view", "calendar_edit") ? (user?.role === 'admin' || user?.role === 'super_admin' ? handleCreateRoom : undefined) : undefined}
          actionLabel="+ Добавить кабинет"
        />

        <div className="bg-curai-surface rounded-b-md border border-t-0 border-curai-border p-4 space-y-4 shadow-none">

      {error && (
        <div className="mb-4 p-4 bg-curai-negativeBg border border-curai-negative text-curai-negative rounded ">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-4">
          <LoadingSpinner />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className={tableClasses}>
          <thead>
            <tr className={tableHeaderClasses}>
              <th className="px-6 py-3 text-left">Название</th>
              <th className="px-6 py-3 text-left">Номер</th>
              <th className="px-6 py-3 text-left">Описание</th>
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
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleManageSchedule(room)}
                      className="text-curai-blue hover:text-curai-blue "
                      title="Управление расписанием"
                    >
                      График
                    </button>
                    {(user?.role === 'admin' || user?.role === 'super_admin') && (
                      <>
                        <button
                          onClick={() => handleEditRoom(room)}
                          className="text-curai-warning hover:text-curai-warning "
                          title="Редактировать"
                         {...permissionProps(user, "calendar_view", "calendar_edit")}>
                          Правка
                        </button>
                        <button
                          onClick={() => handleDeleteRoom(room.id)}
                          className="text-curai-negative hover:text-curai-negative "
                          title="Удалить"
                         {...permissionProps(user, "calendar_view", "calendar_delete")}>
                          Удалить
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rooms.length === 0 && !loading && (
              <tr>
                <td colSpan="4" className="px-6 py-4 text-center text-curai-muted">
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
        size="max-w-[600px]" className="curai-directory-dialog curai-room-dialog"
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
                        className={`${buttonSecondaryClasses} h-10 inline-flex items-center justify-center gap-2 px-5`}
                      >
                        Отмена
                      </button>
                      <button
                        onClick={handleSaveRoom}
                        className={`${buttonPrimaryClasses} h-10 inline-flex items-center justify-center gap-2 px-5`}
                        disabled={!roomForm.name || loading}
                       {...permissionProps(user, "calendar_view", "calendar_edit")}>
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
        size="max-w-[1000px]" className="curai-directory-dialog curai-room-schedule-dialog"
      >
        <div className="space-y-6">
          {/* Add Schedule Form */}
          <div className="bg-curai-subtle p-4 rounded-md">
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
                              className={`${buttonPrimaryClasses} h-10 inline-flex items-center justify-center gap-2 px-5`}
                              disabled={!scheduleForm.doctor_id || !scheduleForm.start_time || !scheduleForm.end_time || loading}
                             {...permissionProps(user, "calendar_view", "calendar_edit")}>
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
                            className="text-curai-negative hover:text-curai-negative "
                            title="Удалить"
                           {...permissionProps(user, "calendar_view", "calendar_delete")}>
                            Удалить
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-curai-muted">Расписание не настроено</p>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <button
                          onClick={() => setShowScheduleModal(false)}
                          className={`${buttonSecondaryClasses} h-10 inline-flex items-center justify-center gap-2 px-5`}
                        >
                          Закрыть
                        </button>
          </div>
        </div>
      </Modal>
        </div>
      </div>
    </div>
  );
};

export default Rooms;
