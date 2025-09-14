import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { inputClasses, selectClasses, textareaClasses, buttonPrimaryClasses, buttonSecondaryClasses, buttonSuccessClasses, cardHeaderClasses, tabClasses } from './modalUtils';
import ServiceSelector from '../treatment/ServiceSelector';

const AppointmentModal = ({ 
  show, 
  onClose, 
  onSave, 
  appointmentForm = {}, 
  setAppointmentForm = () => {}, 
  patients = [], 
  doctors = [], 
  editingItem = null, 
  loading = false, 
  errorMessage = null,
  onCreatePatient = () => {},
  appointments = [] // Добавляем пропс для существующих записей
}) => {
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [activeTab, setActiveTab] = useState('appointment');
  const [documents, setDocuments] = useState([]);
  const [treatmentPlans, setTreatmentPlans] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentDescription, setDocumentDescription] = useState('');
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [timeConflictMessage, setTimeConflictMessage] = useState('');
  const [planForm, setPlanForm] = useState({
    title: '',
    description: '',
    services: [],
    total_cost: 0,
    status: 'draft',
    notes: '',
    payment_status: 'unpaid',
    paid_amount: 0,
    execution_status: 'pending',
    appointment_ids: []
  });
  const [editingPlan, setEditingPlan] = useState(null);
  const [newPatientForm, setNewPatientForm] = useState({
    full_name: '',
    phone: '',
    iin: '',
    birth_date: '',
    gender: '',
    source: 'walk_in',
    referrer: '',
    notes: ''
  });

  const API = import.meta.env.VITE_BACKEND_URL;
  const selectedPatient = patients?.find(p => p.id === appointmentForm.patient_id);

  // Простая функция проверки пересечения времени
  const doTimesOverlap = (start1, end1, start2, end2) => {
    const timeToMinutes = (timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(n => parseInt(n));
      return hours * 60 + minutes;
    };
    
    const start1Minutes = timeToMinutes(start1);
    const end1Minutes = end1 ? timeToMinutes(end1) : start1Minutes + 30;
    const start2Minutes = timeToMinutes(start2);
    const end2Minutes = end2 ? timeToMinutes(end2) : start2Minutes + 30;
    
    return start1Minutes < end2Minutes && start2Minutes < end1Minutes;
  };

  // Проверяет конфликт времени и устанавливает сообщение
  const checkTimeConflict = (roomId, date, time) => {
    setTimeConflictMessage('');
    
    if (!editingItem) { // Только для новых записей
      const conflictingAppointments = appointments?.filter(apt => {
        return apt.appointment_date === date && 
               apt.room_id === roomId &&
               doTimesOverlap(time, appointmentForm.end_time, apt.appointment_time, apt.end_time);
      });
      
      if (conflictingAppointments.length > 0) {
        const conflictNames = conflictingAppointments.map(apt => {
          const patient = patients.find(p => p.id === apt.patient_id);
          return patient ? patient.full_name : 'Неизвестный пациент';
        }).join(', ');
        
        setTimeConflictMessage(`⚠️ КОНФЛИКТ: На это время уже записан ${conflictNames}`);
      }
    }
  };

  // Функция для получения врачей, работающих в выбранном кабинете
  const fetchAvailableDoctors = async (date, time = null, roomId = null) => {
    setAvailableDoctors([]);
    setScheduleMessage('');
    
    if (!date) {
      return;
    }

    // Если кабинет не выбран, показываем всех врачей
    if (!roomId) {
      setAvailableDoctors(doctors);
      setScheduleMessage('Выберите кабинет для фильтрации врачей');
      return;
    }

    setLoadingDoctors(true);
    
    try {
      const token = localStorage.getItem('token');
      
      // Получаем расписание для выбранного кабинета
      const response = await fetch(`${API}/api/rooms/${roomId}/schedule`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const schedules = await response.json();
        
        // Определяем день недели (0 = Понедельник)
        const dayOfWeek = new Date(date).getDay();
        const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        
        // Фильтруем расписания по дню недели
        const daySchedules = schedules.filter(s => s.day_of_week === adjustedDayOfWeek && s.is_active);
        
        if (time) {
          // Если время указано, находим врача для этого времени
          const timeSchedule = daySchedules.find(s => 
            s.start_time <= time && s.end_time > time
          );
          
          if (timeSchedule) {
            const doctor = doctors.find(d => d.id === timeSchedule.doctor_id);
            if (doctor) {
              setAvailableDoctors([{
                ...doctor,
                schedule: [timeSchedule]
              }]);
              setScheduleMessage(`Врач на ${time}: ${doctor.full_name}`);
            } else {
              setScheduleMessage('Врач не найден');
            }
          } else {
            setScheduleMessage('В это время кабинет свободен');
          }
        } else {
          // Если время не указано, показываем всех врачей, работающих в этом кабинете в этот день
          const doctorsInRoom = daySchedules.map(schedule => {
            const doctor = doctors.find(d => d.id === schedule.doctor_id);
            return doctor ? {
              ...doctor,
              schedule: [schedule]
            } : null;
          }).filter(Boolean);
          
          // Убираем дубликаты врачей
          const uniqueDoctors = doctorsInRoom.reduce((acc, doctor) => {
            const existing = acc.find(d => d.id === doctor.id);
            if (existing) {
              existing.schedule.push(...doctor.schedule);
            } else {
              acc.push(doctor);
            }
            return acc;
          }, []);
          
          setAvailableDoctors(uniqueDoctors);
          
          if (uniqueDoctors.length === 0) {
            setScheduleMessage('В этот день в кабинете никто не работает');
          } else {
            setScheduleMessage(`Врачи в кабинете: ${uniqueDoctors.length}`);
          }
        }
      } else {
        console.error('Error fetching room schedule');
        setScheduleMessage('Ошибка при получении расписания кабинета');
      }
    } catch (error) {
      console.error('Error fetching room schedule:', error);
      setScheduleMessage('Ошибка подключения к серверу');
    } finally {
      setLoadingDoctors(false);
    }
  };

  // Обработчик изменения даты
  const handleDateChange = (date) => {
    setAppointmentForm({...appointmentForm, appointment_date: date, doctor_id: ''});
    fetchAvailableDoctors(date, appointmentForm.appointment_time, appointmentForm.room_id);
  };

  // Обработчик изменения времени
  const handleTimeChange = (time) => {
    console.log('🔥 handleTimeChange:', time);
    const newForm = {...appointmentForm, appointment_time: time, doctor_id: ''};
    console.log('🔥 Новая форма после изменения времени:', newForm);
    setAppointmentForm(newForm);
    
    // Проверяем конфликты времени
    if (appointmentForm.appointment_date && appointmentForm.room_id && time) {
      checkTimeConflict(appointmentForm.room_id, appointmentForm.appointment_date, time);
    }
    
    if (appointmentForm.appointment_date) {
      fetchAvailableDoctors(appointmentForm.appointment_date, time, appointmentForm.room_id);
    }
  };

  // Обработчик изменения кабинета
  const handleRoomChange = (roomId) => {
    console.log('🔥 handleRoomChange:', roomId);
    const newForm = {...appointmentForm, room_id: roomId, doctor_id: ''};
    console.log('🔥 Новая форма после изменения кабинета:', newForm);
    setAppointmentForm(newForm);
    if (appointmentForm.appointment_date) {
      fetchAvailableDoctors(appointmentForm.appointment_date, appointmentForm.appointment_time, roomId);
    }
  };

  // Загрузка доступных врачей при загрузке компонента если дата уже выбрана
  // Функция для загрузки кабинетов
  const fetchRooms = async () => {
    try {
      setLoadingRooms(true);
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API}/api/rooms`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const roomsData = await response.json();
        setRooms(roomsData);
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (show) {
      fetchRooms();
      if (appointmentForm.appointment_date) {
        fetchAvailableDoctors(appointmentForm.appointment_date, appointmentForm.appointment_time, appointmentForm.room_id);
      }
    }
  }, [show]); // Перезагружаем при открытии модала

  // Поиск пациентов
  const handlePatientSearch = (searchTerm) => {
    setPatientSearch(searchTerm);
    
    if (searchTerm.length === 0) {
      setFilteredPatients([]);
      setShowPatientDropdown(false);
      return;
    }
    
    const filtered = patients.filter(patient => 
      patient.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (patient.phone && patient.phone.includes(searchTerm)) ||
      (patient.iin && patient.iin.includes(searchTerm))
    );
    
    setFilteredPatients(filtered);
    setShowPatientDropdown(filtered.length > 0);
  };

  // Выбор пациента из результатов поиска
  const handlePatientSelect = (patient) => {
    setAppointmentForm({...appointmentForm, patient_id: patient.id});
    setPatientSearch(patient.full_name);
    setShowPatientDropdown(false);
    setFilteredPatients([]);
  };

  // Очистка выбора пациента
  const handleClearPatient = () => {
    setAppointmentForm({...appointmentForm, patient_id: ''});
    setPatientSearch('');
    setShowPatientDropdown(false);
    setFilteredPatients([]);
  };

  // Инициализация поискового поля при открытии модала
  useEffect(() => {
    if (show && appointmentForm.patient_id) {
      const patient = patients.find(p => p.id === appointmentForm.patient_id);
      if (patient) {
        setPatientSearch(patient.full_name);
      }
    } else if (show) {
      setPatientSearch('');
    }
  }, [show, appointmentForm?.patient_id, patients]);

  // Сброс всех состояний при закрытии модала
  useEffect(() => {
    if (!show) {
      // Сбрасываем все внутренние состояния модала
      setActiveTab('appointment');
      setShowNewPatientForm(false);
      setDocuments([]);
      setTreatmentPlans([]);
      setUploading(false);
      setSelectedFile(null);
      setDocumentDescription('');
      setAvailableDoctors([]);
      setLoadingDoctors(false);
      setScheduleMessage('');
      setPatientSearch('');
      setShowPatientDropdown(false);
      setFilteredPatients([]);
      setEditingPlan(null);
      setNewPatientForm({
        full_name: '',
        phone: '',
        iin: '',
        birth_date: '',
        gender: '',
        source: 'walk_in',
        referrer: '',
        notes: ''
      });
      setPlanForm({
        title: '',
        description: '',
        services: [],
        total_cost: 0,
        status: 'draft',
        notes: '',
        payment_status: 'unpaid',
        paid_amount: 0,
        execution_status: 'pending',
        appointment_ids: []
      });
    }
  }, [show]);

  // Закрытие выпадающего списка при клике вне его
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.patient-search-container')) {
        setShowPatientDropdown(false);
      }
    };

    if (showPatientDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPatientDropdown]);

  useEffect(() => {
    if (selectedPatient && activeTab === 'documents') {
      fetchDocuments();
    }
    if (selectedPatient && activeTab === 'plans') {
      fetchTreatmentPlans();
    }
  }, [selectedPatient, activeTab]);

  const fetchDocuments = async () => {
    if (!selectedPatient) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/patients/${selectedPatient.id}/documents`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const docs = await response.json();
        setDocuments(docs);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const fetchTreatmentPlans = async () => {
    if (!selectedPatient) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/patients/${selectedPatient.id}/treatment-plans`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const plans = await response.json();
        setTreatmentPlans(plans);
      }
    } catch (error) {
      console.error('Error fetching treatment plans:', error);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile || !selectedPatient) return;

    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (documentDescription) {
        formData.append('description', documentDescription);
      }

      console.log('Uploading file for patient:', selectedPatient.id);
      console.log('API endpoint:', `${API}/api/patients/${selectedPatient.id}/documents`);
      console.log('File:', selectedFile);

      const response = await fetch(`${API}/api/patients/${selectedPatient.id}/documents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
          // Don't set Content-Type - let browser set it automatically for FormData
        },
        body: formData
      });

      console.log('Upload response status:', response.status);
      
      if (response.ok) {
        setSelectedFile(null);
        setDocumentDescription('');
        fetchDocuments(); // Refresh documents list
        document.getElementById('appointment-file-input').value = ''; // Clear file input
        console.log('File uploaded successfully');
      } else {
        const errorText = await response.text();
        console.error('Error uploading file:', response.status, errorText);
        alert(`Ошибка загрузки файла: ${response.status} ${errorText}`);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert(`Ошибка загрузки файла: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (documentId) => {
    if (!window.confirm('Удалить этот документ?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        fetchDocuments(); // Refresh documents list
      }
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  };

  const handleAddServiceToTreatmentPlan = (serviceItem) => {
    const updatedServices = [...planForm.services, serviceItem];
    const totalCost = updatedServices.reduce((sum, service) => sum + service.total_price, 0);
    
    setPlanForm(prev => ({
      ...prev,
      services: updatedServices,
      total_cost: totalCost
    }));
  };

  const handleRemoveServiceFromTreatmentPlan = (index) => {
    const updatedServices = planForm.services.filter((_, i) => i !== index);
    const totalCost = updatedServices.reduce((sum, service) => sum + service.total_price, 0);
    
    setPlanForm(prev => ({
      ...prev,
      services: updatedServices,
      total_cost: totalCost
    }));
  };

  const handleSaveTreatmentPlan = async (e) => {
    e.preventDefault();
    if (!selectedPatient) return;

    try {
      const token = localStorage.getItem('token');
      const url = editingPlan 
        ? `${API}/api/treatment-plans/${editingPlan.id}`
        : `${API}/api/patients/${selectedPatient.id}/treatment-plans`;
      
      const response = await fetch(url, {
        method: editingPlan ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(planForm)
      });

      if (response.ok) {
        setPlanForm({
          title: '',
          description: '',
          services: [],
          total_cost: 0,
          status: 'draft',
          notes: '',
          payment_status: 'unpaid',
          paid_amount: 0,
          execution_status: 'pending',
          appointment_ids: []
        });
        setEditingPlan(null);
        fetchTreatmentPlans(); // Refresh plans list
      } else {
        console.error('Error saving treatment plan');
      }
    } catch (error) {
      console.error('Error saving treatment plan:', error);
    }
  };

  const handleEditTreatmentPlan = (plan) => {
    setEditingPlan(plan);
    setPlanForm({
      title: plan.title,
      description: plan.description || '',
      services: plan.services || [],
      total_cost: plan.total_cost || 0,
      status: plan.status,
      notes: plan.notes || '',
      payment_status: plan.payment_status || 'unpaid',
      paid_amount: plan.paid_amount || 0,
      execution_status: plan.execution_status || 'pending',
      appointment_ids: plan.appointment_ids || []
    });
  };

  const handleDeleteTreatmentPlan = async (planId) => {
    if (!window.confirm('Удалить этот план лечения?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/api/treatment-plans/${planId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        fetchTreatmentPlans(); // Refresh plans list
      }
    } catch (error) {
      console.error('Error deleting treatment plan:', error);
    }
  };

  const handleCreateNewPatient = async (e) => {
    e.preventDefault();
    try {
      const newPatient = await onCreatePatient(newPatientForm);
      // Reset form and hide the new patient section
      setShowNewPatientForm(false);
      setNewPatientForm({
        full_name: '',
        phone: '',
        iin: '',
        birth_date: '',
        gender: '',
        source: 'walk_in',
        referrer: '',
        notes: ''
      });
    } catch (error) {
      console.error('Error creating patient:', error);
    }
  };

  if (!show) return null;

  return (
    <Modal 
      show={show} 
      onClose={onClose}
      title={editingItem ? 'Редактировать запись' : 'Новая запись на прием'}
      errorMessage={errorMessage}
    >

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-4">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('appointment')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'appointment'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Запись на прием
            </button>
            {selectedPatient && (
              <>
                <button
                  onClick={() => setActiveTab('documents')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'documents'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Документы пациента
                </button>
                <button
                  onClick={() => setActiveTab('plans')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'plans'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  План лечения
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Appointment Tab Content */}
        {activeTab === 'appointment' && (
          <form onSubmit={onSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Пациент *</label>
              <div className="flex gap-2">
                <div className="flex-1 relative patient-search-container">
                  {/* Поисковое поле */}
                  <div className="relative">
                    <input
                      type="text"
                      value={patientSearch}
                      onChange={(e) => handlePatientSearch(e.target.value)}
                      onFocus={() => {
                        if (filteredPatients.length > 0) {
                          setShowPatientDropdown(true);
                        }
                      }}
                      placeholder="Начните вводить имя, телефон или ИИН пациента..."
                      className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required={!appointmentForm.patient_id}
                      disabled={showNewPatientForm}
                    />
                    
                    {/* Иконка поиска или очистки */}
                    {patientSearch ? (
                      <button
                        type="button"
                        onClick={handleClearPatient}
                        className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </button>
                    ) : (
                      <div className="absolute right-2 top-2 text-gray-400">
                        🔍
                      </div>
                    )}
                  </div>
                  
                  {/* Выпадающий список результатов */}
                  {showPatientDropdown && filteredPatients.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredPatients.map(patient => (
                        <div
                          key={patient.id}
                          onClick={() => handlePatientSelect(patient)}
                          className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                        >
                          <div className="font-medium text-gray-900">{patient.full_name}</div>
                          <div className="text-sm text-gray-600">
                            {patient.phone && `📞 ${patient.phone}`}
                            {patient.phone && patient.birth_date && ' • '}
                            {patient.birth_date && `🎂 ${patient.birth_date}`}
                          </div>
                          {patient.iin && (
                            <div className="text-xs text-gray-500">ИИН: {patient.iin}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Показать сообщение если ничего не найдено */}
                  {patientSearch && filteredPatients.length === 0 && patientSearch.length >= 2 && !appointmentForm.patient_id && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
                      <div className="text-sm">Пациенты не найдены</div>
                      <div className="text-xs mt-1">Попробуйте изменить поисковый запрос</div>
                    </div>
                  )}
                </div>
                
                <button
                  type="button"
                  onClick={() => setShowNewPatientForm(!showNewPatientForm)}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                >
                  {showNewPatientForm ? 'Отмена' : '+ Новый'}
                </button>
              </div>
              
              {/* Выбранный пациент */}
              {appointmentForm.patient_id && selectedPatient && (
                <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-green-800">✓ Выбран: {selectedPatient.full_name}</div>
                      <div className="text-sm text-green-600">
                        {selectedPatient.phone && `📞 ${selectedPatient.phone}`}
                        {selectedPatient.phone && selectedPatient.birth_date && ' • '}
                        {selectedPatient.birth_date && `🎂 ${selectedPatient.birth_date}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearPatient}
                      className="text-green-600 hover:text-green-800 text-sm"
                    >
                      Изменить
                    </button>
                  </div>
                </div>
              )}
            </div>

            {showNewPatientForm && (
              <div className={cardHeaderClasses}>
                <h4 className="font-medium mb-3">Создать нового пациента</h4>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="ФИО *"
                    value={newPatientForm.full_name}
                    onChange={(e) => setNewPatientForm({...newPatientForm, full_name: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="tel"
                    placeholder="Телефон *"
                    value={newPatientForm.phone}
                    onChange={(e) => setNewPatientForm({...newPatientForm, phone: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    placeholder="ИИН"
                    value={newPatientForm.iin}
                    onChange={(e) => setNewPatientForm({...newPatientForm, iin: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="date"
                    placeholder="Дата рождения"
                    value={newPatientForm.birth_date}
                    onChange={(e) => setNewPatientForm({...newPatientForm, birth_date: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <select
                    value={newPatientForm.gender}
                    onChange={(e) => setNewPatientForm({...newPatientForm, gender: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Пол</option>
                    <option value="male">Мужской</option>
                    <option value="female">Женский</option>
                  </select>
                  <select
                    value={newPatientForm.source}
                    onChange={(e) => setNewPatientForm({...newPatientForm, source: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="walk_in">Обращение в клинику</option>
                    <option value="phone">Телефонный звонок</option>
                    <option value="referral">Направление врача</option>
                    <option value="website">Веб-сайт</option>
                    <option value="social_media">Социальные сети</option>
                    <option value="other">Другое</option>
                  </select>
                </div>
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder="Кто направил"
                    value={newPatientForm.referrer}
                    onChange={(e) => setNewPatientForm({...newPatientForm, referrer: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateNewPatient}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  Создать пациента
                </button>
              </div>
            )}
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Дата приема *</label>
                <input
                  type="date"
                  value={appointmentForm.appointment_date}
                  onChange={(e) => handleDateChange(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className={inputClasses}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Время начала *</label>
                <input
                  type="time"
                  value={appointmentForm.appointment_time}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  className={inputClasses}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Время окончания</label>
                <input
                  type="time"
                  value={appointmentForm.end_time || ''}
                  onChange={(e) => {
                    setAppointmentForm({...appointmentForm, end_time: e.target.value});
                    // Перепроверяем конфликт при изменении конечного времени
                    if (appointmentForm.appointment_date && appointmentForm.room_id && appointmentForm.appointment_time) {
                      checkTimeConflict(appointmentForm.room_id, appointmentForm.appointment_date, appointmentForm.appointment_time);
                    }
                  }}
                  className={inputClasses}
                />
              </div>
            </div>

            {/* Предупреждение о конфликте времени */}
            {timeConflictMessage && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-red-800 text-sm">
                {timeConflictMessage}
              </div>
            )}

            {/* Выбор кабинета */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Кабинет
              </label>
              <select
                value={appointmentForm.room_id || ''}
                onChange={(e) => handleRoomChange(e.target.value)}
                className={inputClasses}
              >
                <option value="">Выберите кабинет</option>
                {rooms.map(room => (
                  <option key={room.id} value={room.id}>
                    {room.name} {room.number ? `(№${room.number})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Выбор врача с учетом расписания */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Врач *
                {loadingDoctors && <span className="text-blue-500 ml-2">Загружаем доступных врачей...</span>}
              </label>
              
              {scheduleMessage && (
                <div className={`mb-2 p-2 rounded text-sm ${
                  availableDoctors.length === 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                }`}>
                  {scheduleMessage}
                </div>
              )}
              
              <select
                value={appointmentForm.doctor_id}
                onChange={(e) => setAppointmentForm({...appointmentForm, doctor_id: e.target.value})}
                className={inputClasses}
                required
                disabled={!appointmentForm.appointment_date || loadingDoctors}
              >
                <option value="">
                  {!appointmentForm.appointment_date 
                    ? 'Сначала выберите дату' 
                    : loadingDoctors 
                      ? 'Загружаем врачей...'
                      : availableDoctors.length === 0
                        ? 'Нет доступных врачей'
                        : 'Выберите врача'
                  }
                </option>
                {availableDoctors.map(doctor => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.full_name} - {doctor.specialty}
                    {doctor.schedule && doctor.schedule.length > 0 && 
                      ` (${doctor.schedule[0].start_time}-${doctor.schedule[0].end_time})`
                    }
                  </option>
                ))}
              </select>
              
              {/* Показываем расписание выбранного врача */}
              {appointmentForm.doctor_id && availableDoctors.length > 0 && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-700">
                    <strong>Расписание врача:</strong>
                    {availableDoctors.find(d => d.id === appointmentForm.doctor_id)?.schedule?.map(schedule => (
                      <div key={schedule.id} className="ml-2">
                        📅 {['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'][schedule.day_of_week]}: 
                        🕒 {schedule.start_time} - {schedule.end_time}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Цена (₸)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={appointmentForm.price || ''}
                  onChange={(e) => setAppointmentForm({...appointmentForm, price: e.target.value})}
                  className={inputClasses}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Статус записи</label>
                <select
                  value={appointmentForm.status || 'unconfirmed'}
                  onChange={(e) => setAppointmentForm({...appointmentForm, status: e.target.value})}
                  className={selectClasses}
                >
                  <option value="unconfirmed">🟡 Не подтверждено</option>
                  <option value="confirmed">🟢 Подтверждено</option>
                  <option value="arrived">🔵 Пациент пришел</option>
                  <option value="in_progress">🟠 На приеме</option>
                  <option value="completed">🟢 Завершен</option>
                  <option value="cancelled">🔴 Отменено</option>
                  <option value="no_show">⚪ Не явился</option>
                </select>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Причина обращения</label>
              <input
                type="text"
                placeholder="Причина визита"
                value={appointmentForm.reason}
                onChange={(e) => setAppointmentForm({...appointmentForm, reason: e.target.value})}
                className={inputClasses}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Заметки о записи</label>
                <textarea
                  placeholder="Заметки о записи"
                  value={appointmentForm.notes}
                  onChange={(e) => setAppointmentForm({...appointmentForm, notes: e.target.value})}
                  className={inputClasses}
                  rows="3"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Заметки о пациенте</label>
                <textarea
                  placeholder="Заметки о пациенте"
                  value={appointmentForm.patient_notes || ''}
                  onChange={(e) => setAppointmentForm({...appointmentForm, patient_notes: e.target.value})}
                  className={inputClasses}
                  rows="3"
                />
              </div>
            </div>
            
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Сохранение...' : (editingItem ? 'Обновить' : 'Создать')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
              >
                Отмена
              </button>
            </div>
          </form>
        )}

        {/* Documents Tab Content */}
        {activeTab === 'documents' && selectedPatient && (
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <h4 className="font-medium text-blue-800">
                Документы для пациента: {selectedPatient.full_name}
              </h4>
            </div>

            {/* Upload Section */}
            <div className={cardHeaderClasses}>
              <h4 className="font-medium mb-3">Загрузить новый документ</h4>
              <div className="space-y-3">
                <div>
                  <input
                    id="appointment-file-input"
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                    className={inputClasses}
                    accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Поддерживаются файлы: PDF, Word, текст, изображения
                  </p>
                </div>
                <input
                  type="text"
                  placeholder="Описание документа (опционально)"
                  value={documentDescription}
                  onChange={(e) => setDocumentDescription(e.target.value)}
                  className={inputClasses}
                />
                <button
                  type="button"
                  onClick={handleFileUpload}
                  disabled={!selectedFile || uploading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploading ? 'Загрузка...' : 'Загрузить документ'}
                </button>
              </div>
            </div>

            {/* Documents List */}
            <div>
              <h4 className="font-medium mb-3">Загруженные документы</h4>
              {documents.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  Документы не найдены
                </p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{doc.original_filename}</div>
                        <div className="text-sm text-gray-500">
                          Загружен {new Date(doc.created_at).toLocaleDateString('ru-RU')} 
                          {' '}пользователем {doc.uploaded_by_name}
                        </div>
                        {doc.description && (
                          <div className="text-sm text-gray-600">{doc.description}</div>
                        )}
                        <div className="text-xs text-gray-400">
                          Размер: {(doc.file_size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <a
                          href={`${API}/api/uploads/${doc.filename}`}
                          download={doc.original_filename}
                          className="px-3 py-1 text-blue-600 border border-blue-600 rounded hover:bg-blue-50 text-sm"
                        >
                          Скачать
                        </a>
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="px-3 py-1 text-red-600 border border-red-600 rounded hover:bg-red-50 text-sm"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Закрыть
              </button>
            </div>
          </div>
        )}

        {/* Treatment Plans Tab Content */}
        {activeTab === 'plans' && selectedPatient && (
          <div className="space-y-4">
            <div className="bg-green-50 p-3 rounded-lg">
              <h4 className="font-medium text-green-800">
                План лечения для пациента: {selectedPatient.full_name}
              </h4>
            </div>

            {/* Add/Edit Plan Form */}
            <div className={cardHeaderClasses}>
              <h4 className="font-medium mb-3">
                {editingPlan ? 'Редактировать план лечения' : 'Добавить план лечения'}
              </h4>
              
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Название плана лечения *"
                  value={planForm.title}
                  onChange={(e) => setPlanForm({...planForm, title: e.target.value})}
                  className={inputClasses}
                  required
                />
                
                <textarea
                  placeholder="Описание плана"
                  value={planForm.description}
                  onChange={(e) => setPlanForm({...planForm, description: e.target.value})}
                  className={inputClasses}
                  rows="2"
                />

                {/* Service Selector */}
                <ServiceSelector 
                  onServiceAdd={(serviceItem) => {
                    const updatedServices = [...planForm.services, serviceItem];
                    const totalCost = updatedServices.reduce((sum, service) => sum + (service.total_price || 0), 0);
                    setPlanForm(prev => ({
                      ...prev,
                      services: updatedServices,
                      total_cost: totalCost
                    }));
                  }}
                  selectedPatient={selectedPatient}
                />

                {/* Services Table */}
                {planForm.services.length > 0 && (
                  <div className="bg-white p-4 rounded-lg border">
                    <h5 className="font-medium mb-3">Выбранные услуги</h5>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">Услуга</th>
                            <th className="text-left py-2">Зуб</th>
                            <th className="text-right py-2">Цена за ед.</th>
                            <th className="text-right py-2">Кол-во</th>
                            <th className="text-right py-2">Скидка</th>
                            <th className="text-right py-2">Итого</th>
                            <th className="text-right py-2">Действия</th>
                          </tr>
                        </thead>
                        <tbody>
                          {planForm.services.map((service, index) => (
                            <tr key={index} className="border-b last:border-b-0">
                              <td className="py-2">{service.service_name}</td>
                              <td className="py-2">{service.tooth_number || '-'}</td>
                              <td className="py-2 text-right">{service.unit_price} ₸</td>
                              <td className="py-2 text-right">{service.quantity}</td>
                              <td className="py-2 text-right">{service.discount_percent}%</td>
                              <td className="py-2 text-right font-medium">{(service.total_price || 0).toFixed(0)} ₸</td>
                              <td className="py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updatedServices = planForm.services.filter((_, i) => i !== index);
                                    const totalCost = updatedServices.reduce((sum, svc) => sum + (svc.total_price || 0), 0);
                                    setPlanForm(prev => ({ ...prev, services: updatedServices, total_cost: totalCost }));
                                  }}
                                  className="text-red-600 hover:text-red-800 text-xs"
                                >
                                  Удалить
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t font-medium">
                            <td colSpan="5" className="py-2 text-right">Общая стоимость:</td>
                            <td className="py-2 text-right text-lg text-green-600">
                              {(planForm.total_cost || 0).toFixed(0)} ₸
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Статус плана</label>
                    <select
                      value={planForm.status}
                      onChange={(e) => setPlanForm({...planForm, status: e.target.value})}
                      className={inputClasses}
                    >
                      <option value="draft">Черновик</option>
                      <option value="approved">Утвержден</option>
                      <option value="in_progress">В процессе</option>
                      <option value="completed">Завершен</option>
                      <option value="cancelled">Отменен</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Статус выполнения</label>
                    <select
                      value={planForm.execution_status}
                      onChange={(e) => setPlanForm({...planForm, execution_status: e.target.value})}
                      className={inputClasses}
                    >
                      <option value="pending">Ожидание</option>
                      <option value="in_progress">В процессе</option>
                      <option value="completed">Выполнено</option>
                      <option value="cancelled">Отменено</option>
                      <option value="no_show">Не пришел</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Статус оплаты</label>
                    <select
                      value={planForm.payment_status}
                      onChange={(e) => setPlanForm({...planForm, payment_status: e.target.value})}
                      className={inputClasses}
                    >
                      <option value="unpaid">Не оплачено</option>
                      <option value="partially_paid">Частично</option>
                      <option value="paid">Оплачено</option>
                      <option value="overdue">Просрочено</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Сумма к оплате</label>
                    <div className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg font-medium">
                      {(planForm.total_cost || 0).toFixed(0)} ₸
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Оплачено</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={planForm.total_cost}
                      value={planForm.paid_amount}
                      onChange={(e) => setPlanForm({...planForm, paid_amount: parseFloat(e.target.value) || 0})}
                      className={inputClasses}
                      placeholder="0"
                    />
                  </div>
                </div>
                
                <textarea
                  placeholder="Дополнительные заметки"
                  value={planForm.notes}
                  onChange={(e) => setPlanForm({...planForm, notes: e.target.value})}
                  className={inputClasses}
                  rows="2"
                />
                
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveTreatmentPlan}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    {editingPlan ? 'Обновить план' : 'Создать план'}
                  </button>
                  {editingPlan && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPlan(null);
                        setPlanForm({
                          title: '',
                          description: '',
                          services: [],
                          total_cost: 0,
                          status: 'draft',
                          notes: '',
                          payment_status: 'unpaid',
                          paid_amount: 0,
                          execution_status: 'pending',
                          appointment_ids: []
                        });
                      }}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                    >
                      Отмена
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Treatment Plans List */}
            <div>
              <h4 className="font-medium mb-3">Планы лечения</h4>
              {treatmentPlans.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  Планы лечения не найдены
                </p>
              ) : (
                <div className="space-y-2">
                  {treatmentPlans.map((plan) => (
                    <div key={plan.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-lg">{plan.title}</div>
                          {plan.description && (
                            <div className="text-gray-600 mt-1">{plan.description}</div>
                          )}
                          <div className="text-sm text-gray-500 mt-2">
                            Создан {new Date(plan.created_at).toLocaleDateString('ru-RU')} 
                            {' '}пользователем {plan.created_by_name}
                          </div>
                          <div className="flex items-center gap-4 mt-2">
                            <span className={`px-2 py-1 text-xs rounded font-medium ${
                              plan.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                              plan.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                              plan.status === 'completed' ? 'bg-green-100 text-green-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {plan.status === 'draft' ? 'Черновик' :
                               plan.status === 'approved' ? 'Утвержден' :
                               plan.status === 'completed' ? 'Завершен' :
                               'Отменен'}
                            </span>
                            {plan.total_cost > 0 && (
                              <span className="text-green-600 font-medium">
                                💰 {plan.total_cost} ₸
                              </span>
                            )}
                          </div>
                          {plan.notes && (
                            <div className="text-sm text-gray-600 mt-2">
                              Заметки: {plan.notes}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col space-y-2">
                          <button
                            onClick={() => handleEditTreatmentPlan(plan)}
                            className="px-3 py-1 text-blue-600 border border-blue-600 rounded hover:bg-blue-50 text-sm"
                          >
                            Редактировать
                          </button>
                          <button
                            onClick={() => handleDeleteTreatmentPlan(plan.id)}
                            className="px-3 py-1 text-red-600 border border-red-600 rounded hover:bg-red-50 text-sm"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Закрыть
              </button>
            </div>
        </div>
      )}
    </Modal>
  );
};

export default AppointmentModal;