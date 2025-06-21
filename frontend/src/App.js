import React, { useState, useEffect, useContext, createContext } from 'react';
import axios from 'axios';
import Header from './components/layout/Header';
import Navigation from './components/layout/Navigation';
import ErrorMessage from './components/layout/ErrorMessage';
import AppointmentModal from './components/modals/AppointmentModal';
import MedicalRecordModal from './components/modals/MedicalRecordModal';
import PatientModal from './components/modals/PatientModal';
import DoctorModal from './components/modals/DoctorModal';
import DiagnosisModal from './components/modals/DiagnosisModal';
import MedicationModal from './components/modals/MedicationModal';
import MedicalEntryModal from './components/modals/MedicalEntryModal';
import ScheduleView from './components/schedule/ScheduleView';
import CalendarView from './components/schedule/CalendarView';
import MedicalView from './components/medical/MedicalView';
import PatientsView from './components/patients/PatientsView';
import DoctorsView from './components/doctors/DoctorsView';
import { useApi } from './hooks/useApi';
import { useMedical } from './hooks/useMedical';
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
            <label htmlFor="email" className="sr-only">Email</label>
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
            <label htmlFor="password" className="sr-only">Пароль</label>
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
            <label htmlFor="fullName" className="sr-only">ФИО</label>
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
            <label htmlFor="email" className="sr-only">Email</label>
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
            <label htmlFor="password" className="sr-only">Пароль</label>
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
            <label htmlFor="role" className="block text-sm font-medium text-gray-700">Роль</label>
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

// Main Clinic App
function ClinicApp() {
  // API hook
  const api = useApi();
  
  // Medical hook
  const medical = useMedical();
  
  // Состояния
  const { user, logout } = React.useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('schedule');
  const [errorMessage, setErrorMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);

  // Модальные окна
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showEditMedicalRecordModal, setShowEditMedicalRecordModal] = useState(false);
  const [showAddDiagnosisModal, setShowAddDiagnosisModal] = useState(false);
  const [showAddMedicationModal, setShowAddMedicationModal] = useState(false);
  const [showAddMedicalEntryModal, setShowAddMedicalEntryModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [pendingAppointment, setPendingAppointment] = useState(null);

  // Формы
  const [patientForm, setPatientForm] = useState({
    full_name: '', phone: '', iin: '', source: 'other', notes: ''
  });
  const [doctorForm, setDoctorForm] = useState({
    full_name: '', specialty: '', phone: '', calendar_color: '#3B82F6'
  });
  const [appointmentForm, setAppointmentForm] = useState({
    patient_id: '', doctor_id: '', appointment_date: '', appointment_time: '', reason: '', notes: ''
  });
  const [medicalRecordForm, setMedicalRecordForm] = useState({
    patient_id: '', blood_type: '', height: '', weight: '', emergency_contact: '', 
    emergency_phone: '', insurance_number: ''
  });
  const [diagnosisForm, setDiagnosisForm] = useState({
    patient_id: '', diagnosis_name: '', diagnosis_code: '', description: ''
  });
  const [medicationForm, setMedicationForm] = useState({
    patient_id: '', medication_name: '', dosage: '', frequency: '', instructions: '', end_date: ''
  });
  const [medicalEntryForm, setMedicalEntryForm] = useState({
    patient_id: '', entry_type: 'visit', title: '', description: '', severity: ''
  });

  // Calendar specific functions
  const [draggedAppointment, setDraggedAppointment] = useState(null);

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

  // Функции для диагнозов

  const handleAddDiagnosis = (patientId) => {
    setDiagnosisForm({ ...diagnosisForm, patient_id: patientId });
    setShowAddDiagnosisModal(true);
  };

  const handleSaveDiagnosis = async (e) => {
    e.preventDefault();
    if (!diagnosisForm.patient_id || !diagnosisForm.diagnosis_name) return;
    
    setLoading(true);
    setErrorMessage(null);
    
    try {
      await createDiagnosis(diagnosisForm);
      await medical.fetchMedicalSummary(diagnosisForm.patient_id);
      
      setShowAddDiagnosisModal(false);
      setDiagnosisForm({ patient_id: '', diagnosis_name: '', diagnosis_code: '', description: '' });
    } catch (error) {
      console.error('Error creating diagnosis:', error);
      const errorMsg = typeof error.response?.data?.detail === 'string' 
        ? error.response.data.detail 
        : 'Ошибка при добавлении диагноза';
      setErrorMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Функции для лекарств

  const handleAddMedication = (patientId) => {
    setMedicationForm({ ...medicationForm, patient_id: patientId });
    setShowAddMedicationModal(true);
  };

  const handleSaveMedication = async (e) => {
    e.preventDefault();
    if (!medicationForm.patient_id || !medicationForm.medication_name) return;
    
    setLoading(true);
    setErrorMessage(null);
    
    try {
      await createMedication(medicationForm);
      await medical.fetchMedicalSummary(medicationForm.patient_id);
      
      setShowAddMedicationModal(false);
      setMedicationForm({ patient_id: '', medication_name: '', dosage: '', frequency: '', instructions: '', end_date: '' });
    } catch (error) {
      console.error('Error creating medication:', error);
      const errorMsg = typeof error.response?.data?.detail === 'string' 
        ? error.response.data.detail 
        : 'Ошибка при добавлении лекарства';
      setErrorMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Функции для медицинских записей
  const handleAddMedicalEntry = (patientId) => {
    setMedicalEntryForm({ ...medicalEntryForm, patient_id: patientId });
    setShowAddMedicalEntryModal(true);
  };

  const handleSaveMedicalEntry = async (e) => {
    e.preventDefault();
    if (!medicalEntryForm.patient_id || !medicalEntryForm.title) return;
    
    setLoading(true);
    setErrorMessage(null);
    
    try {
      await createMedicalEntry(medicalEntryForm);
      await medical.fetchMedicalSummary(medicalEntryForm.patient_id);
      
      setShowAddMedicalEntryModal(false);
      setMedicalEntryForm({ patient_id: '', entry_type: 'visit', title: '', description: '', severity: '' });
    } catch (error) {
      console.error('Error creating medical entry:', error);
      const errorMsg = typeof error.response?.data?.detail === 'string' 
        ? error.response.data.detail 
        : 'Ошибка при добавлении записи';
      setErrorMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

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
        // Показываем уведомление о создании медкарты
        setErrorMessage(`✅ Пациент создан успешно! Медицинская карта создана автоматически.`);
        setTimeout(() => setErrorMessage(null), 3000); // Убираем через 3 секунды
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
        
        setPatients(prevPatients => prevPatients.filter(patient => patient.id !== id));
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
        
        setDoctors(prevDoctors => prevDoctors.filter(doctor => doctor.id !== id));
        
        await fetchDoctors();
        console.log('Doctors refreshed after deactivation');
      } catch (error) {
        console.error('Error deleting doctor:', error);
        setErrorMessage('Ошибка при деактивации врача');
      }
    }
  };

  // API функции из хука
  const { 
    loading, 
    setLoading, 
    checkMedicalRecord, 
    createMedicalRecord, 
    updateMedicalRecord,
    createAppointment, 
    updateAppointment,
    createDiagnosis,
    createMedication,
    createMedicalEntry,
    API 
  } = api;

  const handleEditMedicalRecord = (patientId, existingRecord) => {
    setMedicalRecordForm({
      patient_id: patientId,
      blood_type: existingRecord?.blood_type || '',
      height: existingRecord?.height || '',
      weight: existingRecord?.weight || '',
      emergency_contact: existingRecord?.emergency_contact || '',
      emergency_phone: existingRecord?.emergency_phone || '',
      insurance_number: existingRecord?.insurance_number || ''
    });
    setShowEditMedicalRecordModal(true);
  };

  const handleSaveEditMedicalRecord = async (e) => {
    e.preventDefault();
    if (!medicalRecordForm.patient_id) return;
    
    setLoading(true);
    setErrorMessage(null);
    
    try {
      await updateMedicalRecord(medicalRecordForm.patient_id, medicalRecordForm);
      
      // Refresh medical summary
      await medical.fetchMedicalSummary(medicalRecordForm.patient_id);
      
      setShowEditMedicalRecordModal(false);
      setMedicalRecordForm({
        patient_id: '', blood_type: '', height: '', weight: '', 
        emergency_contact: '', emergency_phone: '', insurance_number: ''
      });
    } catch (error) {
      setErrorMessage(error.response?.data?.detail || 'Ошибка при обновлении медкарты');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMedicalRecord = async (e) => {
    e.preventDefault();
    if (!medicalRecordForm.patient_id) return;
    
    setLoading(true);
    setErrorMessage(null);
    
    try {
      // Пытаемся обновить существующую медкарту (так как она создается автоматически)
      await updateMedicalRecord(medicalRecordForm.patient_id, medicalRecordForm);
      
      // После обновления медкарты, создаем запись на прием
      if (pendingAppointment) {
        await createAppointment(pendingAppointment);
        setPendingAppointment(null);
        fetchAppointments();
      }
      
      setMedicalRecordForm({
        patient_id: '', blood_type: '', height: '', weight: '', 
        emergency_contact: '', emergency_phone: '', insurance_number: ''
      });
    } catch (error) {
      setErrorMessage(error.response?.data?.detail || 'Ошибка при обновлении медкарты');
    } finally {
      setLoading(false);
    }
  };

  // Appointment functions



  const handleSaveAppointment = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    
    try {
      if (editingItem) {
        await updateAppointment(editingItem.id, appointmentForm);
      } else {
        await createAppointment(appointmentForm);
      }
      
      fetchAppointments();
      setShowAppointmentModal(false);
      setEditingItem(null);
      setAppointmentForm({ patient_id: '', doctor_id: '', appointment_date: '', appointment_time: '', reason: '', notes: '' });
    } catch (error) {
      setErrorMessage(error.response?.data?.detail || 'Ошибка при сохранении записи');
    } finally {
      setLoading(false);
    }
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

  const handleMoveAppointment = async (appointmentId, newDoctorId, newDate, newTime) => {
    try {
      setLoading(true);
      await updateAppointment(appointmentId, {
        doctor_id: newDoctorId,
        appointment_date: newDate,
        appointment_time: newTime
      });
      fetchAppointments();
    } catch (error) {
      console.error('Error moving appointment:', error);
      setErrorMessage(error.response?.data?.detail || 'Ошибка при перемещении записи');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAppointment = async (id) => {
    if (window.confirm('Вы уверены, что хотите переместить эту запись в архив?')) {
      try {
        console.log('Archiving appointment:', id);
        const response = await axios.put(`${API}/appointments/${id}`, { status: 'cancelled' });
        console.log('Archive response:', response.data);
        
        setAppointments(prevAppointments => 
          prevAppointments.map(apt => 
            apt.id === id ? { ...apt, status: 'cancelled' } : apt
          )
        );
        
        await fetchAppointments();
        console.log('Appointments refreshed after archiving');
      } catch (error) {
        console.error('Error archiving appointment:', error);
        setErrorMessage('Ошибка при архивировании записи');
      }
    }
  };

  // Функции для медицинских записей

  const handleStatusChange = async (appointmentId, newStatus) => {
    try {
      await axios.put(`${API}/appointments/${appointmentId}`, { status: newStatus });
      
      // Если прием завершен, автоматически создаем медицинскую запись
      if (newStatus === 'completed') {
        const appointment = appointments.find(apt => apt.id === appointmentId);
        if (appointment) {
          const entryData = {
            patient_id: appointment.patient_id,
            appointment_id: appointmentId,
            entry_type: 'visit',
            title: `Прием у врача ${appointment.doctor_name}`,
            description: `Прием завершен. Специальность: ${appointment.doctor_specialty}. ${appointment.reason ? `Причина: ${appointment.reason}.` : ''} ${appointment.notes ? `Заметки: ${appointment.notes}` : ''}`
          };
          
          try {
            await createMedicalEntry(entryData);
            console.log('✅ Автоматически создана медицинская запись для завершенного приема');
          } catch (error) {
            console.error('⚠️ Не удалось создать медицинскую запись:', error);
          }
        }
      }
      
      fetchAppointments();
    } catch (error) {
      console.error('Error updating status:', error);
      setErrorMessage('Ошибка при обновлении статуса');
    }
  };

  // Calendar functions
  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 8; hour < 20; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
      slots.push(`${hour.toString().padStart(2, '0')}:30`);
    }
    return slots;
  };

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

    if (
      draggedAppointment.doctor_id === doctorId &&
      draggedAppointment.appointment_date === date &&
      draggedAppointment.appointment_time === time
    ) {
      console.log('Dropping on same slot, ignoring');
      setDraggedAppointment(null);
      return;
    }

    const targetAppointment = getAppointmentForSlot(doctorId, date, time);
    if (targetAppointment) {
      console.log('Target slot occupied');
      setErrorMessage('Время уже занято другой записью');
      setDraggedAppointment(null);
      return;
    }

    try {
      console.log('Moving appointment to new slot');
      await axios.put(`${API}/appointments/${draggedAppointment.id}`, {
        doctor_id: doctorId,
        appointment_date: date,
        appointment_time: time
      });

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

  const handleNewAppointment = () => {
    const today = new Date().toISOString().split('T')[0];
    setAppointmentForm({
      patient_id: '',
      doctor_id: '',
      appointment_date: today,
      appointment_time: '',
      reason: '',
      notes: ''
    });
    setErrorMessage(null);
    setShowAppointmentModal(true);
  };

  const getAppointmentForSlot = (doctorId, date, time) => {
    return appointments.find(
      apt => apt.doctor_id === doctorId && 
             apt.appointment_date === date && 
             apt.appointment_time === time &&
             apt.status !== 'cancelled'
    );
  };

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
      if (a.appointment_date !== b.appointment_date) {
        return a.appointment_date.localeCompare(b.appointment_date);
      }
      return a.appointment_time.localeCompare(b.appointment_time);
    });
  };

  // Check user permissions
  const canManagePatients = user?.role === 'admin' || user?.role === 'doctor';
  const canManageDoctors = user?.role === 'admin';
  const canCreateAppointments = true;

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

  const renderSchedule = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Расписание (±7 дней)</h2>
        {canCreateAppointments && (
          <button
            onClick={handleNewAppointment}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Новая запись
          </button>
        )}
      </div>

      {getScheduleAppointments().length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">Записей нет</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {getScheduleAppointments().map(appointment => (
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

  const renderCalendar = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Календарь записей</h2>
        <div className="flex space-x-2">
          <button
            onClick={handleNewAppointment}
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
          <div className="grid" style={{ gridTemplateColumns: `120px repeat(${doctors.length}, 1fr)` }}>
            <div className="p-3 bg-gray-50 border-b border-r font-medium text-gray-700">Время</div>
            {doctors.map(doctor => (
              <div key={doctor.id} className="p-3 bg-gray-50 border-b border-r last:border-r-0 text-center">
                <div className="flex items-center justify-center space-x-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: doctor.calendar_color }}></span>
                  <div>
                    <div className="font-medium text-gray-900">{doctor.full_name}</div>
                    <div className="text-xs text-gray-500">{doctor.specialty}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {calendarDates.map(date => (
              <div key={date}>
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

                {timeSlots.map(time => (
                  <div key={`${date}-${time}`} className="grid border-b last:border-b-0 hover:bg-gray-50" style={{ gridTemplateColumns: `120px repeat(${doctors.length}, 1fr)` }}>
                    <div className="p-3 bg-gray-50 border-r font-mono text-sm text-gray-600">{time}</div>

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

  const renderMedical = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">
          {user?.role === 'patient' ? 'Моя медицинская карта' : 'Медицинские карты'}
        </h2>
      </div>

      {user?.role !== 'patient' && !medical.selectedPatient && (
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-lg font-semibold mb-4">Выберите пациента для просмотра медкарты</h3>
          <div className="grid gap-3">
            {patients.map(patient => (
              <button
                key={patient.id}
                onClick={() => {
                  medical.selectPatient(patient);
                  medical.fetchMedicalSummary(patient.id);
                }}
                className="text-left p-3 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium">{patient.full_name}</div>
                <div className="text-sm text-gray-500">{patient.phone}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {user?.role === 'patient' && user.patient_id && (
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-lg font-semibold mb-2">📋 Ваша медицинская карта</h3>
          <p className="text-gray-600">Здесь будет отображаться ваша медицинская информация</p>
          <button
            onClick={() => {
              medical.selectPatient({ id: user.patient_id, full_name: user.full_name });
              medical.fetchMedicalSummary(user.patient_id);
            }}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Просмотреть медкарту
          </button>
        </div>
      )}

      {medical.selectedPatient && medical.medicalSummary && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg p-6 shadow">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-semibold">{medical.selectedPatient.full_name}</h3>
                <div className="mt-2 text-sm text-gray-600 space-y-1">
                  <p>Телефон: {medical.medicalSummary.patient.phone}</p>
                  {medical.medicalSummary.medical_record?.blood_type && (
                    <p>Группа крови: {medical.medicalSummary.medical_record.blood_type}</p>
                  )}
                  {medical.medicalSummary.medical_record?.height && (
                    <p>Рост: {medical.medicalSummary.medical_record.height} см</p>
                  )}
                  {medical.medicalSummary.medical_record?.weight && (
                    <p>Вес: {medical.medicalSummary.medical_record.weight} кг</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {user?.role !== 'patient' && (
                  <>
                    <button
                      onClick={() => handleEditMedicalRecord(medical.selectedPatient.id, medical.medicalSummary.medical_record)}
                      className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      title="Редактировать медицинскую карту"
                    >
                      ✏️ Редактировать медкарту
                    </button>
                    <button
                      onClick={() => handleAddMedicalEntry(medical.selectedPatient.id)}
                      className="bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                      title="Добавить запись о приеме"
                    >
                      📝 Добавить запись
                    </button>
                    <button
                      onClick={() => handleAddDiagnosis(medical.selectedPatient.id)}
                      className="bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm"
                      title="Добавить диагноз"
                    >
                      🩺 Добавить диагноз
                    </button>
                    <button
                      onClick={() => handleAddMedication(medical.selectedPatient.id)}
                      className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
                      title="Назначить лекарство"
                    >
                      💊 Назначить лекарство
                    </button>
                  </>
                )}
                {user?.role !== 'patient' && (
                  <button
                    onClick={() => {
                      setSelectedPatient(null);
                      setMedicalSummary(null);
                    }}
                    className="text-gray-400 hover:text-gray-600 px-2"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* История приемов */}
          <div className="bg-white rounded-lg p-6 shadow">
            <h4 className="font-semibold mb-3">📅 История приемов</h4>
            {patientAppointments.length === 0 ? (
              <p className="text-gray-500">Записей на прием нет</p>
            ) : (
              <div className="space-y-3">
                {patientAppointments.map(appointment => (
                  <div key={appointment.id} className="border-l-4 border-indigo-500 pl-4 bg-indigo-50 p-3 rounded">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-indigo-900">
                          {appointment.doctor_name} ({appointment.doctor_specialty})
                        </div>
                        <div className="text-sm text-indigo-700">
                          📅 {appointment.appointment_date} в {appointment.appointment_time}
                        </div>
                        {appointment.reason && (
                          <div className="text-sm text-gray-600 mt-1">
                            Причина: {appointment.reason}
                          </div>
                        )}
                        {appointment.notes && (
                          <div className="text-sm text-gray-600">
                            Заметки: {appointment.notes}
                          </div>
                        )}
                      </div>
                      <span className={`px-2 py-1 text-xs rounded font-medium ${
                        appointment.status === 'completed' ? 'bg-green-100 text-green-800' :
                        appointment.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                        appointment.status === 'in_progress' ? 'bg-orange-100 text-orange-800' :
                        appointment.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {appointment.status === 'completed' ? 'Завершен' :
                         appointment.status === 'confirmed' ? 'Подтвержден' :
                         appointment.status === 'in_progress' ? 'В процессе' :
                         appointment.status === 'cancelled' ? 'Отменен' :
                         'Не подтвержден'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {medicalSummary.allergies.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-semibold text-red-800 mb-2">⚠️ Аллергии:</h4>
              <div className="space-y-2">
                {medicalSummary.allergies.map(allergy => (
                  <div key={allergy.id} className="text-red-700">
                    <span className="font-medium">{allergy.allergen}</span>: {allergy.reaction}
                    <span className={`ml-2 px-2 py-0.5 text-xs rounded ${
                      allergy.severity === 'critical' ? 'bg-red-200 text-red-800' :
                      allergy.severity === 'high' ? 'bg-orange-200 text-orange-800' :
                      'bg-yellow-200 text-yellow-800'
                    }`}>
                      {allergy.severity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg p-6 shadow">
            <h4 className="font-semibold mb-3">Текущие диагнозы</h4>
            {medicalSummary.active_diagnoses.length === 0 ? (
              <p className="text-gray-500">Диагнозы не установлены</p>
            ) : (
              <div className="space-y-3">
                {medicalSummary.active_diagnoses.map(diagnosis => (
                  <div key={diagnosis.id} className="border-l-4 border-blue-500 pl-4">
                    <div className="font-medium">{diagnosis.diagnosis_name}</div>
                    {diagnosis.diagnosis_code && (
                      <div className="text-sm text-gray-600">Код: {diagnosis.diagnosis_code}</div>
                    )}
                    {diagnosis.description && (
                      <div className="text-sm text-gray-600">{diagnosis.description}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      Врач: {diagnosis.doctor_name} • {new Date(diagnosis.diagnosed_date).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg p-6 shadow">
            <h4 className="font-semibold mb-3">Текущие лекарства</h4>
            {medicalSummary.active_medications.length === 0 ? (
              <p className="text-gray-500">Лекарства не назначены</p>
            ) : (
              <div className="space-y-3">
                {medicalSummary.active_medications.map(medication => (
                  <div key={medication.id} className="border-l-4 border-green-500 pl-4">
                    <div className="font-medium">{medication.medication_name}</div>
                    <div className="text-sm text-gray-600">
                      {medication.dosage} • {medication.frequency}
                    </div>
                    {medication.instructions && (
                      <div className="text-sm text-gray-600">{medication.instructions}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      Врач: {medication.doctor_name} • с {new Date(medication.start_date).toLocaleDateString('ru-RU')}
                      {medication.end_date && ` до ${new Date(medication.end_date).toLocaleDateString('ru-RU')}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg p-6 shadow">
            <h4 className="font-semibold mb-3">Последние записи</h4>
            {medicalSummary.recent_entries.length === 0 ? (
              <p className="text-gray-500">Записей нет</p>
            ) : (
              <div className="space-y-4">
                {medicalSummary.recent_entries.map(entry => (
                  <div key={entry.id} className="border-b border-gray-200 pb-3 last:border-b-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{entry.title}</div>
                        <div className="text-sm text-gray-600 mt-1">{entry.description}</div>
                        <div className="text-xs text-gray-500 mt-2">
                          {entry.entry_type} • Врач: {entry.doctor_name} • {new Date(entry.date).toLocaleDateString('ru-RU')}
                        </div>
                      </div>
                      {entry.severity && (
                        <span className={`px-2 py-1 text-xs rounded ${
                          entry.severity === 'critical' ? 'bg-red-100 text-red-800' :
                          entry.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                          entry.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {entry.severity}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );



  return (
    <div className="min-h-screen bg-gray-50">
      <Header user={user} logout={logout} />
      
      <Navigation 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        availableTabs={getAvailableTabs()}
      />

      <ErrorMessage 
        errorMessage={errorMessage} 
        setErrorMessage={setErrorMessage} 
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'schedule' && (
          <ScheduleView
            appointments={appointments}
            doctors={doctors}
            patients={patients}
            user={user}
            onNewAppointment={handleNewAppointment}
            onEditAppointment={handleEditAppointment}
            onDeleteAppointment={handleDeleteAppointment}
            onStatusChange={handleStatusChange}
            canEdit={user?.role === 'admin' || user?.role === 'doctor'}
          />
        )}
        
        {activeTab === 'calendar' && (
          <CalendarView
            appointments={appointments}
            doctors={doctors}
            patients={patients}
            user={user}
            onNewAppointment={handleNewAppointment}
            onSlotClick={handleSlotClick}
            onEditAppointment={handleEditAppointment}
            onDeleteAppointment={handleDeleteAppointment}
            onStatusChange={handleStatusChange}
            onMoveAppointment={handleMoveAppointment}
            canEdit={user?.role === 'admin' || user?.role === 'doctor'}
          />
        )}
        
        {activeTab === 'medical' && (
          <MedicalView
            patients={patients}
            selectedPatient={medical.selectedPatient}
            medicalSummary={medical.medicalSummary}
            patientAppointments={medical.patientAppointments}
            user={user}
            onSelectPatient={medical.selectPatient}
            onEditMedicalRecord={handleEditMedicalRecord}
            onAddMedicalEntry={handleAddMedicalEntry}
            onAddDiagnosis={handleAddDiagnosis}
            onAddMedication={handleAddMedication}
          />
        )}
        
        {activeTab === 'patients' && (
          <PatientsView
            patients={patients}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onAddPatient={() => {
              setEditingItem(null);
              setPatientForm({ full_name: '', phone: '', iin: '', source: 'other', notes: '' });
              setShowPatientModal(true);
            }}
            onEditPatient={handleEditPatient}
            onDeletePatient={handleDeletePatient}
            canManage={user?.role === 'admin' || user?.role === 'doctor'}
          />
        )}
        
        {activeTab === 'doctors' && (
          <DoctorsView
            doctors={doctors}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onAddDoctor={() => {
              setEditingItem(null);
              setDoctorForm({ full_name: '', specialty: '', phone: '', email: '' });
              setShowDoctorModal(true);
            }}
            onEditDoctor={handleEditDoctor}
            onDeleteDoctor={handleDeleteDoctor}
            canManage={user?.role === 'admin'}
          />
        )}
      </main>

      {/* Модальные окна */}
      <AppointmentModal
        show={showAppointmentModal}
        onClose={() => {
          setShowAppointmentModal(false);
          setEditingItem(null);
          setAppointmentForm({ patient_id: '', doctor_id: '', appointment_date: '', appointment_time: '', reason: '', notes: '' });
        }}
        onSave={handleSaveAppointment}
        appointmentForm={appointmentForm}
        setAppointmentForm={setAppointmentForm}
        patients={patients}
        doctors={doctors}
        editingItem={editingItem}
        loading={loading}
        errorMessage={errorMessage}
      />

      <PatientModal
        show={showPatientModal}
        onClose={() => {
          setShowPatientModal(false);
          setEditingItem(null);
          setPatientForm({ full_name: '', phone: '', iin: '', source: 'other', notes: '' });
        }}
        onSave={handleSavePatient}
        patientForm={patientForm}
        setPatientForm={setPatientForm}
        editingItem={editingItem}
        loading={loading}
        errorMessage={errorMessage}
      />

      <DoctorModal
        show={showDoctorModal}
        onClose={() => {
          setShowDoctorModal(false);
          setEditingItem(null);
          setDoctorForm({ full_name: '', specialty: '', phone: '', email: '' });
        }}
        onSave={handleSaveDoctor}
        doctorForm={doctorForm}
        setDoctorForm={setDoctorForm}
        editingItem={editingItem}
        loading={loading}
        errorMessage={errorMessage}
      />

      <MedicalRecordModal
        show={showEditMedicalRecordModal}
        onClose={() => {
          setShowEditMedicalRecordModal(false);
          setErrorMessage(null);
          setMedicalRecordForm({
            patient_id: '', blood_type: '', height: '', weight: '', 
            emergency_contact: '', emergency_phone: '', insurance_number: ''
          });
        }}
        onSave={handleSaveEditMedicalRecord}
        medicalRecordForm={medicalRecordForm}
        setMedicalRecordForm={setMedicalRecordForm}
        loading={loading}
        errorMessage={errorMessage}
      />

      <DiagnosisModal
        show={showAddDiagnosisModal}
        onClose={() => {
          setShowAddDiagnosisModal(false);
          setErrorMessage(null);
          setDiagnosisForm({ patient_id: '', diagnosis_name: '', diagnosis_code: '', description: '' });
        }}
        onSave={handleSaveDiagnosis}
        diagnosisForm={diagnosisForm}
        setDiagnosisForm={setDiagnosisForm}
        loading={loading}
        errorMessage={errorMessage}
      />

      <MedicationModal
        show={showAddMedicationModal}
        onClose={() => {
          setShowAddMedicationModal(false);
          setErrorMessage(null);
          setMedicationForm({ patient_id: '', medication_name: '', dosage: '', frequency: '', instructions: '', end_date: '' });
        }}
        onSave={handleSaveMedication}
        medicationForm={medicationForm}
        setMedicationForm={setMedicationForm}
        loading={loading}
        errorMessage={errorMessage}
      />

      <MedicalEntryModal
        show={showAddMedicalEntryModal}
        onClose={() => {
          setShowAddMedicalEntryModal(false);
          setErrorMessage(null);
          setMedicalEntryForm({ patient_id: '', entry_type: 'visit', title: '', description: '', severity: '' });
        }}
        onSave={handleSaveMedicalEntry}
        medicalEntryForm={medicalEntryForm}
        setMedicalEntryForm={setMedicalEntryForm}
        loading={loading}
        errorMessage={errorMessage}
      />

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
                min={new Date().toISOString().split('T')[0]}
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

      {/* Add Medical Entry Modal */}
      {showAddMedicalEntryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 text-indigo-700">
              📝 Добавить запись о приеме
            </h3>
            
            {errorMessage && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                <span className="block">{errorMessage}</span>
              </div>
            )}
            
            <form onSubmit={handleSaveMedicalEntry} className="space-y-4">
              <select
                value={medicalEntryForm.entry_type}
                onChange={(e) => setMedicalEntryForm({...medicalEntryForm, entry_type: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="visit">Визит/Осмотр</option>
                <option value="treatment">Лечение</option>
                <option value="note">Заметка врача</option>
              </select>
              
              <input
                type="text"
                placeholder="Заголовок записи *"
                value={medicalEntryForm.title}
                onChange={(e) => setMedicalEntryForm({...medicalEntryForm, title: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                required
              />
              
              <textarea
                placeholder="Описание приема, симптомы, проведенные процедуры..."
                value={medicalEntryForm.description}
                onChange={(e) => setMedicalEntryForm({...medicalEntryForm, description: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                rows="4"
                required
              />
              
              <select
                value={medicalEntryForm.severity}
                onChange={(e) => setMedicalEntryForm({...medicalEntryForm, severity: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Без указания важности</option>
                <option value="low">Низкая важность</option>
                <option value="medium">Средняя важность</option>
                <option value="high">Высокая важность</option>
                <option value="critical">Критическая важность</option>
              </select>
              
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading ? 'Добавление...' : 'Добавить запись'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMedicalEntryModal(false);
                    setErrorMessage(null);
                    setMedicalEntryForm({ patient_id: '', entry_type: 'visit', title: '', description: '', severity: '' });
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

      {/* Add Diagnosis Modal */}
      {showAddDiagnosisModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 text-purple-700">
              🩺 Добавить диагноз
            </h3>
            
            {errorMessage && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                <span className="block">{errorMessage}</span>
              </div>
            )}
            
            <form onSubmit={handleSaveDiagnosis} className="space-y-4">
              <input
                type="text"
                placeholder="Название диагноза *"
                value={diagnosisForm.diagnosis_name}
                onChange={(e) => setDiagnosisForm({...diagnosisForm, diagnosis_name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                required
              />
              
              <input
                type="text"
                placeholder="Код МКБ-10 (например: I10)"
                value={diagnosisForm.diagnosis_code}
                onChange={(e) => setDiagnosisForm({...diagnosisForm, diagnosis_code: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              />
              
              <textarea
                placeholder="Описание диагноза"
                value={diagnosisForm.description}
                onChange={(e) => setDiagnosisForm({...diagnosisForm, description: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                rows="3"
              />
              
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {loading ? 'Добавление...' : 'Добавить диагноз'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddDiagnosisModal(false);
                    setErrorMessage(null);
                    setDiagnosisForm({ patient_id: '', diagnosis_name: '', diagnosis_code: '', description: '' });
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

      {/* Add Medication Modal */}
      {showAddMedicationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 text-green-700">
              💊 Назначить лекарство
            </h3>
            
            {errorMessage && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                <span className="block">{errorMessage}</span>
              </div>
            )}
            
            <form onSubmit={handleSaveMedication} className="space-y-4">
              <input
                type="text"
                placeholder="Название лекарства *"
                value={medicationForm.medication_name}
                onChange={(e) => setMedicationForm({...medicationForm, medication_name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                required
              />
              
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Дозировка (например: 10 мг)"
                  value={medicationForm.dosage}
                  onChange={(e) => setMedicationForm({...medicationForm, dosage: e.target.value})}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
                <input
                  type="text"
                  placeholder="Частота (например: 2 раза в день)"
                  value={medicationForm.frequency}
                  onChange={(e) => setMedicationForm({...medicationForm, frequency: e.target.value})}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              
              <input
                type="date"
                placeholder="Окончание приема"
                value={medicationForm.end_date}
                onChange={(e) => setMedicationForm({...medicationForm, end_date: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              />
              
              <textarea
                placeholder="Инструкции по применению"
                value={medicationForm.instructions}
                onChange={(e) => setMedicationForm({...medicationForm, instructions: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                rows="3"
              />
              
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? 'Назначение...' : 'Назначить лекарство'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMedicationModal(false);
                    setErrorMessage(null);
                    setMedicationForm({ patient_id: '', medication_name: '', dosage: '', frequency: '', instructions: '', end_date: '' });
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

      {/* Edit Medical Record Modal */}
      {showEditMedicalRecordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 text-blue-700">
              ✏️ Редактирование медицинской карты
            </h3>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800">
                Обновите медицинские данные пациента. Все поля необязательны для заполнения.
              </p>
            </div>
            
            {errorMessage && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                <span className="block">{errorMessage}</span>
              </div>
            )}
            
            <form onSubmit={handleSaveEditMedicalRecord} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Группа крови (например: A+)"
                  value={medicalRecordForm.blood_type}
                  onChange={(e) => setMedicalRecordForm({...medicalRecordForm, blood_type: e.target.value})}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  placeholder="Рост (см)"
                  value={medicalRecordForm.height}
                  onChange={(e) => setMedicalRecordForm({...medicalRecordForm, height: e.target.value})}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="number"
                  placeholder="Вес (кг)"
                  value={medicalRecordForm.weight}
                  onChange={(e) => setMedicalRecordForm({...medicalRecordForm, weight: e.target.value})}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="Номер страховки"
                  value={medicalRecordForm.insurance_number}
                  onChange={(e) => setMedicalRecordForm({...medicalRecordForm, insurance_number: e.target.value})}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <input
                type="text"
                placeholder="Экстренный контакт (ФИО)"
                value={medicalRecordForm.emergency_contact}
                onChange={(e) => setMedicalRecordForm({...medicalRecordForm, emergency_contact: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              
              <input
                type="tel"
                placeholder="Телефон экстренного контакта"
                value={medicalRecordForm.emergency_phone}
                onChange={(e) => setMedicalRecordForm({...medicalRecordForm, emergency_phone: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditMedicalRecordModal(false);
                    setErrorMessage(null);
                    setMedicalRecordForm({
                      patient_id: '', blood_type: '', height: '', weight: '', 
                      emergency_contact: '', emergency_phone: '', insurance_number: ''
                    });
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