import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Status configurations
const statusConfig = {
  unconfirmed: { label: 'Не подтверждено', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  confirmed: { label: 'Подтверждено', color: 'bg-green-100 text-green-800 border-green-300' },
  arrived: { label: 'Пациент пришел', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  in_progress: { label: 'На приеме', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  completed: { label: 'Завершен', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  cancelled: { label: 'Отменено', color: 'bg-red-100 text-red-800 border-red-300' },
  no_show: { label: 'Не явился', color: 'bg-gray-100 text-gray-800 border-gray-300' }
};

const sourceConfig = {
  website: 'Сайт',
  phone: 'Телефон',
  referral: 'Рекомендация',
  walk_in: 'Самообращение',
  social_media: 'Соц. сети',
  other: 'Другое'
};

function App() {
  const [activeTab, setActiveTab] = useState('schedule');
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);

  // Modal states
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Form data
  const [patientForm, setPatientForm] = useState({
    full_name: '', phone: '', iin: '', source: 'other', notes: ''
  });
  const [doctorForm, setDoctorForm] = useState({
    full_name: '', specialty: '', phone: '', calendar_color: '#3B82F6'
  });
  const [appointmentForm, setAppointmentForm] = useState({
    patient_id: '', doctor_id: '', appointment_date: '', appointment_time: '', reason: '', notes: ''
  });

  // Clear error after some time
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  useEffect(() => {
    fetchPatients();
    fetchDoctors();
    fetchAppointments();
  }, []);

  const fetchPatients = async (search = searchTerm) => {
    try {
      const response = await axios.get(`${API}/patients${search ? `?search=${search}` : ''}`);
      setPatients(response.data);
    } catch (error) {
      console.error('Error fetching patients:', error);
    }
  };

  const fetchDoctors = async () => {
    try {
      const response = await axios.get(`${API}/doctors`);
      setDoctors(response.data);
    } catch (error) {
      console.error('Error fetching doctors:', error);
    }
  };

  const fetchAppointments = async () => {
    try {
      const response = await axios.get(`${API}/appointments`);
      setAppointments(response.data);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    }
  };

  // Patient functions
  const handleSavePatient = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingItem) {
        await axios.put(`${API}/patients/${editingItem.id}`, patientForm);
      } else {
        await axios.post(`${API}/patients`, patientForm);
      }
      setShowPatientModal(false);
      setEditingItem(null);
      setPatientForm({ full_name: '', phone: '', iin: '', source: 'other', notes: '' });
      fetchPatients();
    } catch (error) {
      console.error('Error saving patient:', error);
      alert('Ошибка при сохранении пациента');
    }
    setLoading(false);
  };

  const handleEditPatient = (patient) => {
    setEditingItem(patient);
    setPatientForm({
      full_name: patient.full_name,
      phone: patient.phone,
      iin: patient.iin || '',
      source: patient.source,
      notes: patient.notes || ''
    });
    setShowPatientModal(true);
  };

  const handleDeletePatient = async (id) => {
    if (window.confirm('Вы уверены, что хотите удалить этого пациента?')) {
      try {
        console.log('Deleting patient:', id);
        const response = await axios.delete(`${API}/patients/${id}`);
        console.log('Delete patient response:', response.data);
        
        // Clear search term to ensure fresh data fetch
        setSearchTerm('');
        await fetchPatients('');
        console.log('Patients refreshed after deletion');
      } catch (error) {
        console.error('Error deleting patient:', error);
        alert('Ошибка при удалении пациента');
      }
    }
  };

  // Doctor functions
  const handleSaveDoctor = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingItem) {
        await axios.put(`${API}/doctors/${editingItem.id}`, doctorForm);
      } else {
        await axios.post(`${API}/doctors`, doctorForm);
      }
      setShowDoctorModal(false);
      setEditingItem(null);
      setDoctorForm({ full_name: '', specialty: '', phone: '', calendar_color: '#3B82F6' });
      fetchDoctors();
    } catch (error) {
      console.error('Error saving doctor:', error);
      alert('Ошибка при сохранении врача');
    }
    setLoading(false);
  };

  const handleEditDoctor = (doctor) => {
    setEditingItem(doctor);
    setDoctorForm({
      full_name: doctor.full_name,
      specialty: doctor.specialty,
      phone: doctor.phone || '',
      calendar_color: doctor.calendar_color
    });
    setShowDoctorModal(true);
  };

  const handleDeleteDoctor = async (id) => {
    if (window.confirm('Вы уверены, что хотите деактивировать этого врача?')) {
      try {
        console.log('Deactivating doctor:', id);
        const response = await axios.delete(`${API}/doctors/${id}`);
        console.log('Deactivate doctor response:', response.data);
        await fetchDoctors();
        console.log('Doctors refreshed after deactivation');
      } catch (error) {
        console.error('Error deleting doctor:', error);
        alert('Ошибка при деактивации врача');
      }
    }
  };

  // Appointment functions
  const handleSaveAppointment = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      console.log('Saving appointment:', appointmentForm);
      
      // Validate form data
      if (!appointmentForm.patient_id || !appointmentForm.doctor_id || !appointmentForm.appointment_date || !appointmentForm.appointment_time) {
        setErrorMessage('Пожалуйста, заполните все обязательные поля');
        setLoading(false);
        return;
      }
      
      if (editingItem) {
        const response = await axios.put(`${API}/appointments/${editingItem.id}`, appointmentForm);
        console.log('Appointment updated:', response.data);
      } else {
        const response = await axios.post(`${API}/appointments`, appointmentForm);
        console.log('Appointment created:', response.data);
      }
      setShowAppointmentModal(false);
      setEditingItem(null);
      setAppointmentForm({ patient_id: '', doctor_id: '', appointment_date: '', appointment_time: '', reason: '', notes: '' });
      await fetchAppointments();
      console.log('Appointments refreshed after save');
    } catch (error) {
      console.error('Error saving appointment:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Ошибка при сохранении записи';
      setError(errorMessage);
    }
    setLoading(false);
  };

  const handleEditAppointment = (appointment) => {
    setEditingItem(appointment);
    setAppointmentForm({
      patient_id: appointment.patient_id,
      doctor_id: appointment.doctor_id,
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time,
      reason: appointment.reason || '',
      notes: appointment.notes || ''
    });
    setShowAppointmentModal(true);
  };

  const handleDeleteAppointment = async (id) => {
    if (window.confirm('Вы уверены, что хотите переместить эту запись в архив?')) {
      try {
        console.log('Archiving appointment:', id);
        const response = await axios.put(`${API}/appointments/${id}`, { status: 'cancelled' });
        console.log('Archive response:', response.data);
        
        // Force refresh of appointments
        await fetchAppointments();
        console.log('Appointments refreshed after archiving');
      } catch (error) {
        console.error('Error archiving appointment:', error);
        alert('Ошибка при архивировании записи');
      }
    }
  };

  const handleStatusChange = async (appointmentId, newStatus) => {
    try {
      await axios.put(`${API}/appointments/${appointmentId}`, { status: newStatus });
      fetchAppointments();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Ошибка при обновлении статуса');
    }
  };

  // Get appointments for schedule view (show last 7 days and next 7 days)
  const getScheduleAppointments = () => {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 7);
    
    const fromDate = sevenDaysAgo.toISOString().split('T')[0];
    const toDate = sevenDaysFromNow.toISOString().split('T')[0];
    
    return appointments.filter(apt => 
      apt.appointment_date >= fromDate && apt.appointment_date <= toDate
    ).sort((a, b) => {
      // Sort by date first, then by time
      if (a.appointment_date !== b.appointment_date) {
        return a.appointment_date.localeCompare(b.appointment_date);
      }
      return a.appointment_time.localeCompare(b.appointment_time);
    });
  };

  const scheduleAppointments = getScheduleAppointments();

  const renderSchedule = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Расписание (±7 дней)</h2>
        <button
          onClick={() => {
            setError(null);
            setShowAppointmentModal(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Новая запись
        </button>
      </div>

      {scheduleAppointments.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">Записей нет</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {scheduleAppointments.map(appointment => (
            <div key={appointment.id} className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="text-sm font-medium text-gray-500">
                      {new Date(appointment.appointment_date).toLocaleDateString('ru-RU')}
                    </span>
                    <span className="text-lg font-semibold">{appointment.appointment_time}</span>
                    <span 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: appointment.doctor_color }}
                    ></span>
                    <span className="font-medium">{appointment.doctor_name}</span>
                    <span className="text-sm text-gray-500">({appointment.doctor_specialty})</span>
                  </div>
                  <p className="text-lg font-medium mb-1">{appointment.patient_name}</p>
                  {appointment.reason && (
                    <p className="text-gray-600 mb-2">Причина: {appointment.reason}</p>
                  )}
                  {appointment.notes && (
                    <p className="text-sm text-gray-500">Заметки: {appointment.notes}</p>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <select
                    value={appointment.status}
                    onChange={(e) => handleStatusChange(appointment.id, e.target.value)}
                    className={`px-3 py-1 rounded-full text-sm border font-medium ${statusConfig[appointment.status].color}`}
                  >
                    {Object.entries(statusConfig).map(([value, config]) => (
                      <option key={value} value={value}>{config.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleEditAppointment(appointment)}
                    className="text-blue-600 hover:text-blue-800 p-1"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteAppointment(appointment.id)}
                    className="text-orange-600 hover:text-orange-800 p-1"
                    title="Архивировать запись"
                  >
                    📥
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPatients = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Пациенты</h2>
        <button
          onClick={() => setShowPatientModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Новый пациент
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Поиск по имени, телефону или ИИН..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && fetchPatients()}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={fetchPatients}
          className="mt-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
        >
          Найти
        </button>
      </div>

      <div className="grid gap-4">
        {patients.map(patient => (
          <div key={patient.id} className="bg-white border rounded-lg p-4 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold">{patient.full_name}</h3>
                <p className="text-gray-600">Телефон: {patient.phone}</p>
                {patient.iin && <p className="text-gray-600">ИИН: {patient.iin}</p>}
                <p className="text-sm text-gray-500">Источник: {sourceConfig[patient.source]}</p>
                {patient.notes && <p className="text-sm text-gray-500 mt-2">Заметки: {patient.notes}</p>}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEditPatient(patient)}
                  className="text-blue-600 hover:text-blue-800 p-1"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDeletePatient(patient.id)}
                  className="text-red-600 hover:text-red-800 p-1"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderDoctors = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Врачи</h2>
        <button
          onClick={() => setShowDoctorModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Новый врач
        </button>
      </div>

      <div className="grid gap-4">
        {doctors.map(doctor => (
          <div key={doctor.id} className="bg-white border rounded-lg p-4 shadow-sm">
            <div className="flex justify-between items-start">
              <div className="flex items-center space-x-3">
                <span 
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: doctor.calendar_color }}
                ></span>
                <div>
                  <h3 className="text-lg font-semibold">{doctor.full_name}</h3>
                  <p className="text-gray-600">Специальность: {doctor.specialty}</p>
                  {doctor.phone && <p className="text-gray-600">Телефон: {doctor.phone}</p>}
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEditDoctor(doctor)}
                  className="text-blue-600 hover:text-blue-800 p-1"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDeleteDoctor(doctor.id)}
                  className="text-red-600 hover:text-red-800 p-1"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">Система управления клиникой</h1>
          </div>
        </div>
      </header>

      {/* Error Message */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
            <strong className="font-bold">Ошибка: </strong>
            <span className="block sm:inline">{error}</span>
            <span
              className="absolute top-0 bottom-0 right-0 px-4 py-3 cursor-pointer"
              onClick={() => setError(null)}
            >
              <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <title>Закрыть</title>
                <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/>
              </svg>
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 py-4">
            {[
              { key: 'schedule', label: 'Расписание' },
              { key: 'patients', label: 'Пациенты' },
              { key: 'doctors', label: 'Врачи' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'schedule' && renderSchedule()}
        {activeTab === 'patients' && renderPatients()}
        {activeTab === 'doctors' && renderDoctors()}
      </main>

      {/* Patient Modal */}
      {showPatientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {editingItem ? 'Редактировать пациента' : 'Новый пациент'}
            </h3>
            <form onSubmit={handleSavePatient} className="space-y-4">
              <input
                type="text"
                placeholder="ФИО"
                value={patientForm.full_name}
                onChange={(e) => setPatientForm({...patientForm, full_name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                type="tel"
                placeholder="Телефон"
                value={patientForm.phone}
                onChange={(e) => setPatientForm({...patientForm, phone: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                type="text"
                placeholder="ИИН (опционально)"
                value={patientForm.iin}
                onChange={(e) => setPatientForm({...patientForm, iin: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={patientForm.source}
                onChange={(e) => setPatientForm({...patientForm, source: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(sourceConfig).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <textarea
                placeholder="Заметки"
                value={patientForm.notes}
                onChange={(e) => setPatientForm({...patientForm, notes: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows="3"
              />
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Сохранение...' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPatientModal(false);
                    setEditingItem(null);
                    setPatientForm({ full_name: '', phone: '', iin: '', source: 'other', notes: '' });
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Doctor Modal */}
      {showDoctorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {editingItem ? 'Редактировать врача' : 'Новый врач'}
            </h3>
            <form onSubmit={handleSaveDoctor} className="space-y-4">
              <input
                type="text"
                placeholder="ФИО"
                value={doctorForm.full_name}
                onChange={(e) => setDoctorForm({...doctorForm, full_name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                type="text"
                placeholder="Специальность"
                value={doctorForm.specialty}
                onChange={(e) => setDoctorForm({...doctorForm, specialty: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                type="tel"
                placeholder="Телефон (опционально)"
                value={doctorForm.phone}
                onChange={(e) => setDoctorForm({...doctorForm, phone: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Цвет календаря</label>
                <input
                  type="color"
                  value={doctorForm.calendar_color}
                  onChange={(e) => setDoctorForm({...doctorForm, calendar_color: e.target.value})}
                  className="w-full h-10 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Сохранение...' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDoctorModal(false);
                    setEditingItem(null);
                    setDoctorForm({ full_name: '', specialty: '', phone: '', calendar_color: '#3B82F6' });
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Appointment Modal */}
      {showAppointmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {editingItem ? 'Редактировать запись' : 'Новая запись'}
            </h3>
            
            {/* Error display in modal */}
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                <span className="block">{error}</span>
              </div>
            )}
            
            <form onSubmit={handleSaveAppointment} className="space-y-4">
              <select
                value={appointmentForm.patient_id}
                onChange={(e) => setAppointmentForm({...appointmentForm, patient_id: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Выберите пациента</option>
                {patients.map(patient => (
                  <option key={patient.id} value={patient.id}>{patient.full_name}</option>
                ))}
              </select>
              <select
                value={appointmentForm.doctor_id}
                onChange={(e) => setAppointmentForm({...appointmentForm, doctor_id: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Выберите врача</option>
                {doctors.map(doctor => (
                  <option key={doctor.id} value={doctor.id}>{doctor.full_name} - {doctor.specialty}</option>
                ))}
              </select>
              <input
                type="date"
                value={appointmentForm.appointment_date}
                onChange={(e) => setAppointmentForm({...appointmentForm, appointment_date: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                type="time"
                value={appointmentForm.appointment_time}
                onChange={(e) => setAppointmentForm({...appointmentForm, appointment_time: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
              <input
                type="text"
                placeholder="Причина обращения"
                value={appointmentForm.reason}
                onChange={(e) => setAppointmentForm({...appointmentForm, reason: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                placeholder="Заметки"
                value={appointmentForm.notes}
                onChange={(e) => setAppointmentForm({...appointmentForm, notes: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows="3"
              />
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Сохранение...' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAppointmentModal(false);
                    setEditingItem(null);
                    setError(null);
                    setAppointmentForm({ patient_id: '', doctor_id: '', appointment_date: '', appointment_time: '', reason: '', notes: '' });
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;