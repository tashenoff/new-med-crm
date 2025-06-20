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

// Auth Context
const AuthContext = React.createContext();

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchCurrentUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchCurrentUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch current user:', error);
      logout();
    }
    setLoading(false);
  };

  const login = async (email, password) => {
    try {
      const response = await axios.post(`${API}/auth/login`, { email, password });
      const { access_token, user: userData } = response.data;
      
      setToken(access_token);
      setUser(userData);
      localStorage.setItem('token', access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Ошибка входа' 
      };
    }
  };

  const register = async (email, password, fullName, role = 'patient') => {
    try {
      const response = await axios.post(`${API}/auth/register`, {
        email,
        password,
        full_name: fullName,
        role
      });
      const { access_token, user: userData } = response.data;
      
      setToken(access_token);
      setUser(userData);
      localStorage.setItem('token', access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Ошибка регистрации' 
      };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// Login Component
function LoginForm({ onSwitchToRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = React.useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(email, password);
    if (!result.success) {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Вход в систему
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Система управления клиникой
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              placeholder="Email"
            />
          </div>
          <div>
            <label htmlFor="password" className="sr-only">
              Пароль
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              placeholder="Пароль"
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </div>
          <div className="text-center">
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="text-indigo-600 hover:text-indigo-500"
            >
              Нет аккаунта? Зарегистрироваться
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Register Component
function RegisterForm({ onSwitchToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('patient');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = React.useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await register(email, password, fullName, role);
    if (!result.success) {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Регистрация
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Создать аккаунт в системе
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="fullName" className="sr-only">
              ФИО
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              placeholder="ФИО"
            />
          </div>
          <div>
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              placeholder="Email"
            />
          </div>
          <div>
            <label htmlFor="password" className="sr-only">
              Пароль
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
              placeholder="Пароль"
            />
          </div>
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700">
              Роль
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              <option value="patient">Пациент</option>
              <option value="doctor">Врач</option>
              <option value="admin">Администратор</option>
            </select>
          </div>
          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Регистрация...' : 'Зарегистрироваться'}
            </button>
          </div>
          <div className="text-center">
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="text-indigo-600 hover:text-indigo-500"
            >
              Уже есть аккаунт? Войти
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Main Clinic App (existing functionality)
function ClinicApp() {
  const { user, logout } = React.useContext(AuthContext);
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
      console.log('Setting timer to clear error after 5 seconds:', errorMessage);
      const timer = setTimeout(() => {
        console.log('Auto-clearing error message');
        setErrorMessage(null);
      }, 5000);
      return () => {
        console.log('Clearing error timer');
        clearTimeout(timer);
      };
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
      setErrorMessage('Ошибка при сохранении пациента');
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
        
        // Update patients state immediately
        setPatients(prevPatients => prevPatients.filter(patient => patient.id !== id));
        
        // Clear search term to ensure fresh data fetch
        setSearchTerm('');
        await fetchPatients('');
        console.log('Patients refreshed after deletion');
      } catch (error) {
        console.error('Error deleting patient:', error);
        setErrorMessage('Ошибка при удалении пациента');
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
      setErrorMessage('Ошибка при сохранении врача');
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
        
        // Update doctors state immediately (remove deactivated doctor)
        setDoctors(prevDoctors => prevDoctors.filter(doctor => doctor.id !== id));
        
        await fetchDoctors();
        console.log('Doctors refreshed after deactivation');
      } catch (error) {
        console.error('Error deleting doctor:', error);
        setErrorMessage('Ошибка при деактивации врача');
      }
    }
  };

  // Appointment functions
  const handleSaveAppointment = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      console.log('Saving appointment form data:', appointmentForm);
      
      // Validate form data
      if (!appointmentForm.patient_id || !appointmentForm.doctor_id || !appointmentForm.appointment_date || !appointmentForm.appointment_time) {
        console.log('Form validation failed - missing required fields');
        setErrorMessage('Пожалуйста, заполните все обязательные поля');
        setLoading(false);
        return;
      }
      
      console.log('Form validation passed, submitting...');
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
      if (error.response?.status === 400) {
        // Handle time conflict specifically
        const errorMessage = error.response?.data?.detail || 'Время уже занято';
        console.log('Time conflict detected:', errorMessage);
        setErrorMessage(errorMessage);
      } else {
        const errorMessage = error.response?.data?.detail || error.message || 'Ошибка при сохранении записи';
        setErrorMessage(errorMessage);
      }
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
        
        // Update the appointment in the current state immediately
        setAppointments(prevAppointments => 
          prevAppointments.map(apt => 
            apt.id === id ? { ...apt, status: 'cancelled' } : apt
          )
        );
        
        // Also fetch fresh data from server
        await fetchAppointments();
        console.log('Appointments refreshed after archiving');
      } catch (error) {
        console.error('Error archiving appointment:', error);
        setErrorMessage('Ошибка при архивировании записи');
      }
    }
  };

  const handleStatusChange = async (appointmentId, newStatus) => {
    try {
      await axios.put(`${API}/appointments/${appointmentId}`, { status: newStatus });
      fetchAppointments();
    } catch (error) {
      console.error('Error updating status:', error);
      setErrorMessage('Ошибка при обновлении статуса');
    }
  };

  // Medical records state
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [medicalSummary, setMedicalSummary] = useState(null);
  const [showMedicalEntryModal, setShowMedicalEntryModal] = useState(false);
  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false);
  const [showMedicationModal, setShowMedicationModal] = useState(false);
  const [showAllergyModal, setShowAllergyModal] = useState(false);

  // Medical forms
  const [medicalEntryForm, setMedicalEntryForm] = useState({
    entry_type: 'visit', title: '', description: '', severity: 'medium'
  });
  const [diagnosisForm, setDiagnosisForm] = useState({
    diagnosis_code: '', diagnosis_name: '', description: ''
  });
  const [medicationForm, setMedicationForm] = useState({
    medication_name: '', dosage: '', frequency: '', instructions: '', end_date: ''
  });
  const [allergyForm, setAllergyForm] = useState({
    allergen: '', reaction: '', severity: 'medium'
  });

  // Medical records functions
  const fetchMedicalSummary = async (patientId) => {
    try {
      const response = await axios.get(`${API}/patients/${patientId}/medical-summary`);
      setMedicalSummary(response.data);
    } catch (error) {
      console.error('Error fetching medical summary:', error);
      setErrorMessage('Ошибка при загрузке медицинской карты');
    }
  };

  const handleSaveMedicalEntry = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API}/medical-entries`, {
        ...medicalEntryForm,
        patient_id: selectedPatient.id
      });
      setShowMedicalEntryModal(false);
      setMedicalEntryForm({ entry_type: 'visit', title: '', description: '', severity: 'medium' });
      fetchMedicalSummary(selectedPatient.id);
    } catch (error) {
      console.error('Error saving medical entry:', error);
      setErrorMessage('Ошибка при сохранении записи');
    }
    setLoading(false);
  };

  const handleSaveDiagnosis = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API}/diagnoses`, {
        ...diagnosisForm,
        patient_id: selectedPatient.id
      });
      setShowDiagnosisModal(false);
      setDiagnosisForm({ diagnosis_code: '', diagnosis_name: '', description: '' });
      fetchMedicalSummary(selectedPatient.id);
    } catch (error) {
      console.error('Error saving diagnosis:', error);
      setErrorMessage('Ошибка при сохранении диагноза');
    }
    setLoading(false);
  };

  const handleSaveMedication = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API}/medications`, {
        ...medicationForm,
        patient_id: selectedPatient.id,
        end_date: medicationForm.end_date || null
      });
      setShowMedicationModal(false);
      setMedicationForm({ medication_name: '', dosage: '', frequency: '', instructions: '', end_date: '' });
      fetchMedicalSummary(selectedPatient.id);
    } catch (error) {
      console.error('Error saving medication:', error);
      setErrorMessage('Ошибка при сохранении лекарства');
    }
    setLoading(false);
  };

  const handleSaveAllergy = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API}/allergies`, {
        ...allergyForm,
        patient_id: selectedPatient.id
      });
      setShowAllergyModal(false);
      setAllergyForm({ allergen: '', reaction: '', severity: 'medium' });
      fetchMedicalSummary(selectedPatient.id);
    } catch (error) {
      console.error('Error saving allergy:', error);
      setErrorMessage('Ошибка при сохранении аллергии');
    }
    setLoading(false);
  };
  
  // Generate time slots (8:00 - 20:00, 30 min intervals)
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 8; hour < 20; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
      slots.push(`${hour.toString().padStart(2, '0')}:30`);
    }
    return slots;
  };

  // Generate calendar dates (today + 6 days)
  const generateCalendarDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    return dates;
  };

  const timeSlots = generateTimeSlots();
  const calendarDates = generateCalendarDates();

  // Drag and drop handlers
  const handleDragStart = (e, appointment) => {
    console.log('Drag started:', appointment);
    setDraggedAppointment(appointment);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.outerHTML);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, doctorId, date, time) => {
    e.preventDefault();
    console.log('Drop event:', { doctorId, date, time, draggedAppointment });
    
    if (!draggedAppointment) {
      console.log('No dragged appointment');
      return;
    }

    // Don't drop on the same slot
    if (
      draggedAppointment.doctor_id === doctorId &&
      draggedAppointment.appointment_date === date &&
      draggedAppointment.appointment_time === time
    ) {
      console.log('Dropping on same slot, ignoring');
      setDraggedAppointment(null);
      return;
    }

    // Check if target slot is occupied
    const targetAppointment = getAppointmentForSlot(doctorId, date, time);
    if (targetAppointment) {
      console.log('Target slot occupied');
      setErrorMessage('Время уже занято другой записью');
      setDraggedAppointment(null);
      return;
    }

    try {
      console.log('Moving appointment to new slot');
      // Update appointment with new date/time/doctor
      await axios.put(`${API}/appointments/${draggedAppointment.id}`, {
        doctor_id: doctorId,
        appointment_date: date,
        appointment_time: time
      });

      // Refresh appointments
      await fetchAppointments();
      setDraggedAppointment(null);
      console.log('Appointment moved successfully');
    } catch (error) {
      console.error('Error moving appointment:', error);
      setErrorMessage(error.response?.data?.detail || 'Ошибка при перемещении записи');
      setDraggedAppointment(null);
    }
  };

  const handleSlotClick = (doctorId, date, time) => {
    // Quick create appointment
    console.log('Slot clicked:', { doctorId, date, time });
    setAppointmentForm({
      patient_id: '',
      doctor_id: doctorId,
      appointment_date: date,
      appointment_time: time,
      reason: '',
      notes: ''
    });
    setErrorMessage(null);
    setShowAppointmentModal(true);
  };

  // Get appointment for specific slot
  const getAppointmentForSlot = (doctorId, date, time) => {
    return appointments.find(
      apt => apt.doctor_id === doctorId && 
             apt.appointment_date === date && 
             apt.appointment_time === time &&
             apt.status !== 'cancelled'
    );
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
  const renderCalendar = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Календарь записей</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => {
              setErrorMessage(null);
              setShowAppointmentModal(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Новая запись
          </button>
        </div>
      </div>

      {doctors.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">Сначала добавьте врачей для отображения календаря</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Calendar Header */}
          <div className="grid" style={{ gridTemplateColumns: `120px repeat(${doctors.length}, 1fr)` }}>
            {/* Time column header */}
            <div className="p-3 bg-gray-50 border-b border-r font-medium text-gray-700">
              Время
            </div>
            {/* Doctor columns headers */}
            {doctors.map(doctor => (
              <div
                key={doctor.id}
                className="p-3 bg-gray-50 border-b border-r last:border-r-0 text-center"
              >
                <div className="flex items-center justify-center space-x-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: doctor.calendar_color }}
                  ></span>
                  <div>
                    <div className="font-medium text-gray-900">{doctor.full_name}</div>
                    <div className="text-xs text-gray-500">{doctor.specialty}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Calendar Body */}
          <div className="max-h-96 overflow-y-auto">
            {calendarDates.map(date => (
              <div key={date}>
                {/* Date separator */}
                <div className="grid border-b bg-blue-50" style={{ gridTemplateColumns: `120px repeat(${doctors.length}, 1fr)` }}>
                  <div className="p-2 font-medium text-blue-700 border-r">
                    {new Date(date).toLocaleDateString('ru-RU', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </div>
                  {doctors.map(doctor => (
                    <div key={doctor.id} className="p-2 border-r last:border-r-0"></div>
                  ))}
                </div>

                {/* Time slots for this date */}
                {timeSlots.map(time => (
                  <div
                    key={`${date}-${time}`}
                    className="grid border-b last:border-b-0 hover:bg-gray-50"
                    style={{ gridTemplateColumns: `120px repeat(${doctors.length}, 1fr)` }}
                  >
                    {/* Time label */}
                    <div className="p-3 bg-gray-50 border-r font-mono text-sm text-gray-600">
                      {time}
                    </div>

                    {/* Doctor slots */}
                    {doctors.map(doctor => {
                      const appointment = getAppointmentForSlot(doctor.id, date, time);
                      
                      return (
                        <div
                          key={doctor.id}
                          className={`p-1 border-r last:border-r-0 min-h-[60px] relative cursor-pointer transition-colors ${
                            draggedAppointment ? 'hover:bg-green-100 border-2 border-dashed border-green-300' : 'hover:bg-blue-50'
                          }`}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, doctor.id, date, time)}
                          onClick={() => !appointment && canCreateAppointments && handleSlotClick(doctor.id, date, time)}
                        >
                          {appointment ? (
                            <div
                              draggable={canCreateAppointments}
                              onDragStart={(e) => handleDragStart(e, appointment)}
                              className={`p-2 rounded text-xs cursor-move transition-all hover:shadow-md ${statusConfig[appointment.status].color}`}
                              style={{
                                borderLeft: `3px solid ${doctor.calendar_color}`,
                                opacity: draggedAppointment?.id === appointment.id ? 0.5 : 1
                              }}
                              title="Перетащите для изменения времени или врача"
                            >
                              <div className="font-medium truncate">{appointment.patient_name}</div>
                              <div className="text-xs opacity-75 truncate">
                                {appointment.reason || 'Прием'}
                              </div>
                              <div className="text-xs mt-1">
                                <span className={`px-1 py-0.5 rounded ${statusConfig[appointment.status].color}`}>
                                  {statusConfig[appointment.status].label}
                                </span>
                              </div>
                            </div>
                          ) : (
                            canCreateAppointments && (
                              <div className="h-full flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors">
                                <span className="text-lg" title="Кликните для создания записи">+</span>
                              </div>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-white rounded-lg p-4 shadow">
        <h3 className="font-medium text-gray-900 mb-3">Легенда статусов:</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(statusConfig).map(([status, config]) => (
            <div key={status} className="flex items-center space-x-2">
              <span className={`px-2 py-1 rounded text-xs ${config.color}`}>
                {config.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Check user permissions
  const canManagePatients = user?.role === 'admin' || user?.role === 'doctor';
  const canManageDoctors = user?.role === 'admin';
  const canCreateAppointments = true; // All users can create appointments

  const renderSchedule = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Расписание (±7 дней)</h2>
        {canCreateAppointments && (
          <button
            onClick={() => {
              setErrorMessage(null);
              setShowAppointmentModal(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Новая запись
          </button>
        )}
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
        {canManagePatients && (
          <button
            onClick={() => setShowPatientModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Новый пациент
          </button>
        )}
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
              {canManagePatients && (
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
              )}
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
        {canManageDoctors && (
          <button
            onClick={() => setShowDoctorModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Новый врач
          </button>
        )}
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
              {canManageDoctors && (
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
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Get available tabs based on user role
  const getAvailableTabs = () => {
    const tabs = [
      { key: 'schedule', label: 'Расписание' },
      { key: 'calendar', label: 'Календарь' }
    ];
    
    if (user?.role === 'admin' || user?.role === 'doctor') {
      tabs.push({ key: 'patients', label: 'Пациенты' });
      tabs.push({ key: 'medical', label: 'Медкарты' });
    }
    
    if (user?.role === 'patient') {
      tabs.push({ key: 'medical', label: 'Моя медкарта' });
    }
    
    if (user?.role === 'admin') {
      tabs.push({ key: 'doctors', label: 'Врачи' });
    }
    
    return tabs;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">Система управления клиникой</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">
                {user?.full_name} ({user?.role === 'admin' ? 'Администратор' : user?.role === 'doctor' ? 'Врач' : 'Пациент'})
              </span>
              <button
                onClick={logout}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                Выйти
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Error Message */}
      {errorMessage && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
            <strong className="font-bold">Ошибка: </strong>
            <span className="block sm:inline">{errorMessage}</span>
            <button
              className="absolute top-0 bottom-0 right-0 px-4 py-3 cursor-pointer"
              onClick={() => {
                console.log('Manually closing error message');
                setErrorMessage(null);
              }}
            >
              <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <title>Закрыть</title>
                <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 py-4">
            {getAvailableTabs().map(tab => (
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
        {activeTab === 'calendar' && renderCalendar()}
        {activeTab === 'patients' && renderPatients()}
        {activeTab === 'doctors' && renderDoctors()}
      </main>

      {/* Patient Modal */}
      {showPatientModal && canManagePatients && (
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
      {showDoctorModal && canManageDoctors && (
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
      {showAppointmentModal && canCreateAppointments && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {editingItem ? 'Редактировать запись' : 'Новая запись'}
            </h3>
            
            {/* Error display in modal */}
            {errorMessage && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                <span className="block">{errorMessage}</span>
              </div>
            )}
            
            <form onSubmit={handleSaveAppointment} className="space-y-4">
              <select
                value={appointmentForm.patient_id}
                onChange={(e) => setAppointmentForm({...appointmentForm, patient_id: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
              />
              <input
                type="time"
                value={appointmentForm.appointment_time}
                onChange={(e) => setAppointmentForm({...appointmentForm, appointment_time: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                    setErrorMessage(null);
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

// Main App Component
function App() {
  const [isLogin, setIsLogin] = useState(true);
  
  return (
    <AuthProvider>
      <AuthContext.Consumer>
        {({ user, loading }) => {
          if (loading) {
            return (
              <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Загрузка...</p>
                </div>
              </div>
            );
          }
          
          if (!user) {
            return isLogin ? (
              <LoginForm onSwitchToRegister={() => setIsLogin(false)} />
            ) : (
              <RegisterForm onSwitchToLogin={() => setIsLogin(true)} />
            );
          }
          
          return <ClinicApp />;
        }}
      </AuthContext.Consumer>
    </AuthProvider>
  );
}

export default App;