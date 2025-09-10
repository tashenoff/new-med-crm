import React, { useState, useEffect } from 'react';

const DoctorSchedule = ({ doctors, user, canEdit }) => {
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingSchedule, setEditingSchedule] = useState(null);

  const API = import.meta.env.VITE_BACKEND_URL;
  
  const daysOfWeek = [
    { id: 0, name: 'Понедельник' },
    { id: 1, name: 'Вторник' },
    { id: 2, name: 'Среда' },
    { id: 3, name: 'Четверг' },
    { id: 4, name: 'Пятница' },
    { id: 5, name: 'Суббота' },
    { id: 6, name: 'Воскресенье' }
  ];

  const fetchSchedule = async (doctorId) => {
    if (!doctorId) {
      setSchedule([]);
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/doctors/${doctorId}/schedule`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const scheduleData = await response.json();
        setSchedule(scheduleData);
      } else {
        setError('Ошибка при загрузке расписания');
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error fetching schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDoctorChange = (doctorId) => {
    setSelectedDoctor(doctorId);
    setEditingSchedule(null);
    fetchSchedule(doctorId);
  };

  const handleCreateSchedule = async (scheduleData) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/doctors/${selectedDoctor}/schedule`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(scheduleData)
      });

      if (response.ok) {
        setSuccess('Расписание создано успешно');
        fetchSchedule(selectedDoctor);
        setEditingSchedule(null);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Ошибка при создании расписания');
        setTimeout(() => setError(''), 5000);
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error creating schedule:', error);
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!window.confirm('Удалить этот день из расписания?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/doctors/${selectedDoctor}/schedule/${scheduleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        setSuccess('Расписание удалено успешно');
        fetchSchedule(selectedDoctor);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError('Ошибка при удалении расписания');
        setTimeout(() => setError(''), 5000);
      }
    } catch (error) {
      setError('Ошибка соединения');
      console.error('Error deleting schedule:', error);
      setTimeout(() => setError(''), 5000);
    }
  };

  const ScheduleForm = () => {
    const [formData, setFormData] = useState({
      day_of_week: '',
      start_time: '',
      end_time: ''
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      if (formData.day_of_week !== '' && formData.start_time && formData.end_time) {
        handleCreateSchedule({
          doctor_id: selectedDoctor,
          day_of_week: parseInt(formData.day_of_week),
          start_time: formData.start_time,
          end_time: formData.end_time
        });
        setFormData({ day_of_week: '', start_time: '', end_time: '' });
      }
    };

    // Получаем дни, для которых уже есть расписание
    const scheduledDays = schedule.map(s => s.day_of_week);
    const availableDays = daysOfWeek.filter(day => !scheduledDays.includes(day.id));

    return (
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md border">
        <h3 className="text-lg font-semibold mb-4">Добавить рабочий день</h3>
        
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">День недели</label>
            <select
              value={formData.day_of_week}
              onChange={(e) => setFormData({...formData, day_of_week: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Выберите день</option>
              {availableDays.map(day => (
                <option key={day.id} value={day.id}>{day.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Время начала</label>
            <input
              type="time"
              value={formData.start_time}
              onChange={(e) => setFormData({...formData, start_time: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Время окончания</label>
            <input
              type="time"
              value={formData.end_time}
              onChange={(e) => setFormData({...formData, end_time: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>
        
        <div className="flex gap-2 mt-4">
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            disabled={availableDays.length === 0}
          >
            {availableDays.length === 0 ? 'Все дни добавлены' : 'Добавить день'}
          </button>
        </div>
      </form>
    );
  };

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Расписание врачей</h2>
      </div>

      {/* Сообщения */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Выбор врача */}
      <div className="bg-white p-6 rounded-lg shadow-md border">
        <label className="block text-sm font-medium text-gray-700 mb-2">Выберите врача</label>
        <select
          value={selectedDoctor}
          onChange={(e) => handleDoctorChange(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Выберите врача</option>
          {doctors.filter(doctor => doctor.is_active).map(doctor => (
            <option key={doctor.id} value={doctor.id}>
              {doctor.full_name} - {doctor.specialty}
            </option>
          ))}
        </select>
      </div>

      {selectedDoctor && (
        <>
          {/* Текущее расписание */}
          <div className="bg-white p-6 rounded-lg shadow-md border">
            <h3 className="text-lg font-semibold mb-4">
              Текущее расписание врача: {doctors.find(d => d.id === selectedDoctor)?.full_name}
            </h3>
            
            {loading ? (
              <div className="text-center py-8">
                <div className="text-gray-500">Загружаем расписание...</div>
              </div>
            ) : schedule.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">📅</div>
                <p>Расписание не настроено</p>
                <p className="text-sm">Добавьте рабочие дни для этого врача</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {schedule.sort((a, b) => a.day_of_week - b.day_of_week).map(item => (
                  <div key={item.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-800">
                          {daysOfWeek[item.day_of_week]?.name}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">
                          🕒 {item.start_time} - {item.end_time}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          {((new Date(`1970-01-01T${item.end_time}:00`) - new Date(`1970-01-01T${item.start_time}:00`)) / (1000 * 60 * 60)).toFixed(1)} часов
                        </p>
                      </div>
                      
                      {canEdit && (
                        <button
                          onClick={() => handleDeleteSchedule(item.id)}
                          className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50"
                          title="Удалить день"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Форма добавления расписания */}
          {canEdit && <ScheduleForm />}
        </>
      )}
    </div>
  );
};

export default DoctorSchedule;