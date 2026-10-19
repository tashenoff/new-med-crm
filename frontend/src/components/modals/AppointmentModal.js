import React, { useState, useEffect, useRef } from 'react';
import { formatPhoneChange } from '../../hooks/phoneFormatter';
import { appointmentPayment } from '../../utils/accountingLedger';
import SignatureCanvas from 'react-signature-canvas';
import Modal from './Modal';
import { inputClasses, selectClasses, textareaClasses, buttonPrimaryClasses, buttonSecondaryClasses, buttonSuccessClasses, cardHeaderClasses, tabClasses } from './modalUtils';
import ServiceSelector from '../treatment/ServiceSelector';
import PatientPaymentWorkspace from '../treatment/PatientPaymentWorkspace';
import PatientTreatmentWorkspace from '../treatment/PatientTreatmentWorkspace';
import { PlanEmptyState } from '../treatment/shared/PatientPlanWorkspace';
import AppointmentTimeFields from './appointment/AppointmentTimeFields';
import {
  MIN_APPOINTMENT_DURATION,
  DEFAULT_APPOINTMENT_DURATION,
  addMinutes,
  getDurationMinutes,
  validateAppointmentDuration
} from '../../config/calendarConfig';
import { CONSENT_DOCUMENTS, getRequiredConsents } from '../../config/consentDocuments';

// Сводка оплаты по всем планам лечения (вкладка «Оплата» в календаре — дубль из карточки пациента)


const AppointmentModal = ({
  show,
  onClose,
  onSave,
  appointmentForm: initialAppointmentForm = {},
  setAppointmentForm: externalSetAppointmentForm = () => { },
  patients = [],
  doctors = [],
  editingItem = null,
  loading = false,
  errorMessage = null,
  onCreatePatient = () => { },
  appointments = [], // Добавляем пропс для существующих записей
  hideAddPlanForm = false, // Скрыть форму добавления плана лечения (для календаря)
  hideCreatePatientButton = false // Скрыть кнопку создания пациента (для CRM - пациент создается автоматически)
}) => {
// Используем локальное состояние для формы, чтобы изменения работали корректно
  const [appointmentForm, setLocalAppointmentForm] = useState(initialAppointmentForm);
  
  // Ref для актуальной формы (избегаем устаревших данных в async-замыканиях)
  const appointmentFormRef = useRef(initialAppointmentForm);

  // Функция обновления формы - обновляет и локальное состояние и внешнее (если передано)
  const setAppointmentForm = (newForm) => {
    const updatedForm = typeof newForm === 'function' ? newForm(appointmentFormRef.current || {}) : newForm;
    appointmentFormRef.current = updatedForm;
    setLocalAppointmentForm(updatedForm);
    externalSetAppointmentForm(updatedForm);
  };
  
  // Синхронизируем локальное состояние с пропсами при открытии модала
  useEffect(() => {
    if (show && initialAppointmentForm && Object.keys(initialAppointmentForm).length > 0) {
      appointmentFormRef.current = initialAppointmentForm;
      setLocalAppointmentForm(initialAppointmentForm);
    }
  }, [show, initialAppointmentForm]);
  
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [activeTab, setActiveTab] = useState('appointment');
  const [documents, setDocuments] = useState([]);
  const [treatmentPlans, setTreatmentPlans] = useState([]);
  const [plansPatientId, setPlansPatientId] = useState(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState('');
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [procedureFilter, setProcedureFilter] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentDescription, setDocumentDescription] = useState('');
  const [availableDoctors, setAvailableDoctors] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState('');
  const doctorRequestRef = useRef(0);
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [loadingPaymentTypes, setLoadingPaymentTypes] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [timeConflictMessage, setTimeConflictMessage] = useState('');
  const [consentFile, setConsentFile] = useState(null);
  const [consentFileError, setConsentFileError] = useState('');
  const [consentDragOver, setConsentDragOver] = useState(false);
  const [uploadingConsent, setUploadingConsent] = useState(false);
const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);

  const [appointmentSourceError, setAppointmentSourceError] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(''); // Локальный прелоадер для защиты от двойного нажатия
  const signaturePadRef = useRef(null);
  const [acceptedConsents, setAcceptedConsents] = useState({});
  const [requiredConsents, setRequiredConsents] = useState([CONSENT_DOCUMENTS.base]);
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
  const prefilledLeadNameRef = useRef('');
  const [newPatientForm, setNewPatientForm] = useState({
    full_name: '',
    phone: '',
    iin: '',
    birth_date: '',
    gender: '',
    source: '',
    source_id: '',
    referrer: '',
    notes: ''
  });
  // Храним только что созданного пациента отдельно (решает проблему race condition с props)
  const [justCreatedPatient, setJustCreatedPatient] = useState(null);

  const API = import.meta.env.VITE_BACKEND_URL;
  
  // Ищем пациента в списке patients, затем в justCreatedPatient (для только что созданных),
  // затем в filteredPatients. Если не найден - создаём объект из данных формы/editingItem
  const foundPatient = patients?.find(p => p.id === appointmentForm.patient_id) 
    || (justCreatedPatient?.id === appointmentForm.patient_id ? justCreatedPatient : null)
    || filteredPatients?.find(p => p.id === appointmentForm.patient_id);
  const selectedPatient = foundPatient || (appointmentForm.patient_id && editingItem ? {
    id: appointmentForm.patient_id,
    full_name: editingItem.patient_name || 'Пациент',
    phone: editingItem.patient_phone || ''
  } : null);
  const planPatientRef = useRef(null);
  planPatientRef.current = show ? selectedPatient?.id : null;
  const currentTreatmentPlans = plansPatientId === selectedPatient?.id ? treatmentPlans : [];
  const planDataPending = plansLoading || (!plansError && plansPatientId !== selectedPatient?.id);


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
  const checkTimeConflict = (roomId, date, time, doctorId = null) => {
    setTimeConflictMessage('');

    if (!editingItem && appointments?.length > 0) { // Только для новых записей
      const conflicts = [];
      
      // Проверяем конфликты по кабинету
      if (roomId) {
        const roomConflicts = appointments.filter(apt => {
          return apt.appointment_date === date &&
            apt.room_id === roomId &&
            apt.status !== 'cancelled' && apt.status !== 'no_show' &&
            doTimesOverlap(time, appointmentForm.end_time, apt.appointment_time, apt.end_time);
        });
        
        if (roomConflicts.length > 0) {
          const conflictNames = roomConflicts.map(apt => {
            const patient = patients.find(p => p.id === apt.patient_id);
            return patient?.full_name || apt.patient_name || 'Неизвестный пациент';
          }).join(', ');
          conflicts.push(`Кабинет занят (${conflictNames})`);
        }
      }
      
      // Проверяем конфликты по врачу
      const checkDoctorId = doctorId || appointmentForm.doctor_id;
      if (checkDoctorId) {
        const doctorConflicts = appointments.filter(apt => {
          return apt.appointment_date === date &&
            apt.doctor_id === checkDoctorId &&
            apt.status !== 'cancelled' && apt.status !== 'no_show' &&
            doTimesOverlap(time, appointmentForm.end_time, apt.appointment_time, apt.end_time);
        });
        
        if (doctorConflicts.length > 0) {
          const doctor = doctors.find(d => d.id === checkDoctorId);
          const doctorName = doctor?.full_name || 'Врач';
          const conflictNames = doctorConflicts.map(apt => {
            const patient = patients.find(p => p.id === apt.patient_id);
            return patient?.full_name || apt.patient_name || 'Неизвестный пациент';
          }).join(', ');
          conflicts.push(`${doctorName} уже записан (${conflictNames})`);
        }
      }
      
      if (conflicts.length > 0) {
        setTimeConflictMessage(`⚠️ КОНФЛИКТ: ${conflicts.join('; ')}`);
      }
    }
  };

  // Функция для получения врачей, работающих в выбранном кабинете
  const fetchAvailableDoctors = async (date, time = null, roomId = null) => {
    const requestId = ++doctorRequestRef.current;
    const isCurrent = () => requestId === doctorRequestRef.current;
    setScheduleMessage('');

    if (!date) {
      setAvailableDoctors([]);
      return;
    }

// Если кабинет не выбран — ищем врачей по их расписанию на выбранную дату/время
    if (!roomId) {
      if (time) {
        try {
          setLoadingDoctors(true);
          const token = localStorage.getItem('token');
          const response = await fetch(
            `${API}/api/doctors/available/${date}?appointment_time=${encodeURIComponent(time)}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          if (!isCurrent()) return;
          if (response.ok) {
            const availableDoctorsData = await response.json();
            if (!isCurrent()) return;
            setAvailableDoctors(availableDoctorsData);
            if (availableDoctorsData.length > 0) {
              // Авто-выбор врача, у которого есть расписание на это время
              if (!appointmentFormRef.current?.doctor_id) {
                setAppointmentForm(prev => ({ ...prev, doctor_id: availableDoctorsData[0].id }));
              }
              setScheduleMessage(`Врач на ${time}: ${availableDoctorsData[0].full_name}`);
            } else {
              setScheduleMessage(`Нет врачей с расписанием на ${time}`);
            }
          } else {
            setAvailableDoctors(doctors);
            setScheduleMessage('Кабинет не выбран - доступны все врачи');
          }
        } catch (error) {
          if (!isCurrent()) return;
          console.error('Error fetching available doctors:', error);
          setAvailableDoctors(doctors);
          setScheduleMessage('Кабинет не выбран - доступны все врачи');
        } finally {
          if (isCurrent()) setLoadingDoctors(false);
        }
      } else {
        setAvailableDoctors(doctors);
        setScheduleMessage('Кабинет не выбран - доступны все врачи');
      }
      return;
    }

    setLoadingDoctors(true);
    setAvailableDoctors([]); // Очищаем только когда загружаем по кабинету

    try {
      const token = localStorage.getItem('token');

      // Получаем расписание для выбранного кабинета
      const response = await fetch(`${API}/api/rooms/${roomId}/schedule`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!isCurrent()) return;
          if (response.ok) {
        const schedules = await response.json();
        if (!isCurrent()) return;

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
              // Авто-выбор врача, у которого есть расписание на это время в этом кабинете
              if (!appointmentFormRef.current?.doctor_id) {
                setAppointmentForm(prev => ({ ...prev, doctor_id: doctor.id }));
              }
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
          if (!isCurrent()) return;
      console.error('Error fetching room schedule:', error);
      setScheduleMessage('Ошибка подключения к серверу');
    } finally {
      if (isCurrent()) setLoadingDoctors(false);
    }
  };

  // Обработчик изменения даты
  const handleDateChange = (date) => {
    setAppointmentForm({ ...appointmentForm, appointment_date: date, doctor_id: '' });
    fetchAvailableDoctors(date, appointmentForm.appointment_time, appointmentForm.room_id);
  };

  // Обработчик изменения времени
  const handleTimeChange = (time) => {
    // Сохраняем текущую длительность приёма (минимум 30 минут)
    const currentDuration = getDurationMinutes(appointmentForm.appointment_time, appointmentForm.end_time);
    const duration = currentDuration && currentDuration >= MIN_APPOINTMENT_DURATION
      ? currentDuration
      : DEFAULT_APPOINTMENT_DURATION;

    const newForm = {
      ...appointmentForm,
      appointment_time: time,
      end_time: time ? addMinutes(time, duration) : '',
      doctor_id: ''
    };
    setAppointmentForm(newForm);

    // Проверяем конфликты времени
    if (appointmentForm.appointment_date && appointmentForm.room_id && time) {
      checkTimeConflict(appointmentForm.room_id, appointmentForm.appointment_date, time);
    }

    if (appointmentForm.appointment_date) {
      fetchAvailableDoctors(appointmentForm.appointment_date, time, appointmentForm.room_id);
    }
  };

  // Обработчик изменения времени окончания / длительности
  const handleEndTimeChange = (endTime) => {
    setAppointmentForm({ ...appointmentForm, end_time: endTime });

    if (appointmentForm.appointment_date && appointmentForm.room_id && appointmentForm.appointment_time) {
      checkTimeConflict(appointmentForm.room_id, appointmentForm.appointment_date, appointmentForm.appointment_time);
    }
  };

  // Обработчик изменения кабинета
  const handleRoomChange = (roomId) => {
    console.log('🔥 handleRoomChange:', roomId);
    const newForm = { ...appointmentForm, room_id: roomId, doctor_id: '' };
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

  // Функция для загрузки типов оплаты
  const fetchPaymentTypes = async () => {
    try {
      setLoadingPaymentTypes(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`${API}/api/payment-types`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const paymentTypesData = await response.json();
        setPaymentTypes(paymentTypesData);
      }
    } catch (error) {
      console.error('Error fetching payment types:', error);
    } finally {
      setLoadingPaymentTypes(false);
    }
  };

  // Функция для загрузки источников (каналов привлечения)
  const fetchSources = async () => {
    try {
      setLoadingSources(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`${API}/api/crm/sources/`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const sourcesData = await response.json();
        console.log('📌 Loaded sources:', sourcesData);
        setSources(sourcesData);
      } else {
        console.error('❌ Failed to fetch sources:', response.status);
      }
    } catch (error) {
      console.error('Error fetching sources:', error);
    } finally {
      setLoadingSources(false);
    }
  };

  useEffect(() => {
    if (show) {
      fetchRooms();
      fetchPaymentTypes();
      fetchSources();
    }
  }, [show]); // Перезагружаем при открытии модала

  // Отдельный useEffect для загрузки врачей при изменении даты/времени/кабинета
  useEffect(() => {
    if (show && appointmentForm.appointment_date) {
      fetchAvailableDoctors(appointmentForm.appointment_date, appointmentForm.appointment_time, appointmentForm.room_id);
    } else if (show && !appointmentForm.appointment_date) {
      // Если дата не выбрана, но модал открыт - показать всех врачей
      setAvailableDoctors(doctors);
    }
    return () => { doctorRequestRef.current += 1; };
  }, [show, appointmentForm?.appointment_date, appointmentForm?.appointment_time, appointmentForm?.room_id, doctors]);

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
    setAppointmentForm({ ...appointmentForm, patient_id: patient.id });
    setPatientSearch(patient.full_name);
    setShowPatientDropdown(false);
    setFilteredPatients([]);
  };

  // Очистка выбора пациента
  const handleClearPatient = () => {
    setAppointmentForm({ ...appointmentForm, patient_id: '' });
    setPatientSearch('');
    setShowPatientDropdown(false);
    setFilteredPatients([]);
  };

  // Инициализация поискового поля и формы создания пациента при открытии модала
  useEffect(() => {
    if (show && appointmentForm.patient_id) {
      const patient = patients.find(p => p.id === appointmentForm.patient_id);
      if (patient) {
        setPatientSearch(patient.full_name);
        setShowNewPatientForm(false);
      }
    } else if (show) {
      // Если пациент не найден и есть флаг showNewPatientForm - открываем форму создания
      if (appointmentForm.showNewPatientForm) {
        setShowNewPatientForm(true);
        // Предзаполняем форму данными из лида
        console.log('📌 Initializing newPatientForm with lead data:', {
          lead_source: appointmentForm.lead_source,
          lead_source_id: appointmentForm.lead_source_id
        });
        const leadName = appointmentForm.lead_full_name || [appointmentForm.lead_first_name, appointmentForm.lead_last_name, appointmentForm.lead_middle_name].filter(Boolean).join(' ');
        prefilledLeadNameRef.current = leadName;
        setNewPatientForm({
          full_name: leadName,
          phone: appointmentForm.lead_phone || '',
          email: appointmentForm.lead_email || '',
          iin: '',
          birth_date: '',
          gender: '',
          source: appointmentForm.lead_source || 'phone',
          source_id: appointmentForm.lead_source_id || '',
          referrer: '',
          notes: `Создан из CRM заявки`
        });
        setPatientSearch('');
      } else if (appointmentForm.lead_first_name) {
        // Если просто есть данные лида - показываем их в поле поиска
        const leadName = appointmentForm.lead_full_name || [appointmentForm.lead_first_name, appointmentForm.lead_last_name, appointmentForm.lead_middle_name].filter(Boolean).join(' ');
        const leadInfo = appointmentForm.lead_phone ? ` (${appointmentForm.lead_phone})` : '';
        setPatientSearch(leadName + leadInfo);
        setShowNewPatientForm(false);
      } else {
        setPatientSearch('');
        setShowNewPatientForm(false);
      }
    }
  }, [show, appointmentForm?.patient_id, appointmentForm?.lead_full_name, appointmentForm?.lead_first_name, appointmentForm?.lead_source_id, appointmentForm?.showNewPatientForm, patients]);

  // Сброс всех состояний при закрытии модала
  useEffect(() => {
    if (!show) {
      // Сбрасываем все внутренние состояния модала
      setSubmitError('');
      setActiveTab('appointment');
      setShowNewPatientForm(false);
      setDocuments([]);
      setTreatmentPlans([]); setPlansPatientId(null); setPlansLoading(false); setPlansError('');
      setShowPlanForm(false); setPaymentFilter('all'); setProcedureFilter('all');
      setUploading(false);
      setSelectedFile(null);
      setDocumentDescription('');
      setAvailableDoctors([]);
      setLoadingDoctors(false);
      setScheduleMessage('');
      setPatientSearch('');
      setShowPatientDropdown(false);
      setFilteredPatients([]);
      setJustCreatedPatient(null); // Сбрасываем только что созданного пациента
      setConsentFile(null);
      setConsentFileError('');
      setConsentDragOver(false);
      setHasSignature(false);
      if (signaturePadRef.current) {
        signaturePadRef.current.clear();
      }
      setAcceptedConsents({});
      setRequiredConsents([CONSENT_DOCUMENTS.base]);
      setEditingPlan(null);
      setNewPatientForm({
        full_name: '',
        phone: '',
        iin: '',
        birth_date: '',
        gender: '',
        source: '',
        source_id: '',
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
      if (selectedPatient && (activeTab === 'plans' || activeTab === 'payment')) {
        fetchTreatmentPlans();
      }
    }, [selectedPatient?.id, activeTab]);

  // Автоматическое определение необходимых согласий на основе планов лечения пациента
  useEffect(() => {
    if (treatmentPlans && treatmentPlans.length > 0) {
      // Собираем все услуги из всех планов лечения
      const allServices = treatmentPlans.reduce((acc, plan) => {
        if (plan.services && Array.isArray(plan.services)) {
          return [...acc, ...plan.services];
        }
        return acc;
      }, []);

      // Определяем необходимые согласия на основе услуг
      const consents = getRequiredConsents(allServices);
      setRequiredConsents(consents);

      console.log('📋 Определены необходимые согласия:', consents.map(c => c.title));
    } else {
      // Если нет планов лечения, показываем только базовое согласие
      setRequiredConsents([CONSENT_DOCUMENTS.base]);
    }
  }, [treatmentPlans]);

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
    const patientId = selectedPatient?.id;
    if (!patientId) return;
    setPlansLoading(true); setPlansError('');
    try {
      const response = await fetch(`${API}/api/patients/${patientId}/treatment-plans`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!response.ok) throw new Error('Не удалось загрузить планы лечения');
      const plans = await response.json();
      if (!Array.isArray(plans)) throw new Error('Некорректный ответ при загрузке планов');
      if (planPatientRef.current !== patientId) return;
      setTreatmentPlans(plans); setPlansPatientId(patientId);
    } catch (error) {
      if (planPatientRef.current === patientId) setPlansError(error.message || 'Не удалось загрузить планы лечения');
    } finally {
      if (planPatientRef.current === patientId) setPlansLoading(false);
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

      // ВАЖНО: Добавляем assigned_doctor_id из выбранного врача в записи
      const planData = {
        ...planForm,
        assigned_doctor_id: appointmentForm.doctor_id // Привязываем к врачу из записи
      };

      const response = await fetch(url, {
        method: editingPlan ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(planData)
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
        setEditingPlan(null); setShowPlanForm(false);
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

    // Источник выбирается один раз в форме записи; без него нельзя создать пациента.
    if (!appointmentForm.source_id) {
      setAppointmentSourceError('Выберите канал привлечения — это обязательное поле');
      return;
    }
    setAppointmentSourceError('');

    try {
      const result = await onCreatePatient({
        ...newPatientForm,
        phone: formatPhoneChange(newPatientForm.phone || appointmentForm.lead_phone || ''),
        source: appointmentForm.source,
        source_id: appointmentForm.source_id
      });
      
      // Поддерживаем оба формата ответа:
      // 1. { success: true, data: newPatient } - из CalendarPage
      // 2. newPatient напрямую - из CRM
      const newPatient = result?.success ? result.data : (result?.id || result?._id ? result : null);
      
      if (newPatient) {
        const newPatientId = newPatient.id || newPatient._id;
        
        // Сохраняем созданного пациента в отдельный state для решения race condition
        setJustCreatedPatient(newPatient);
        
        // Автоматически выбираем нового пациента
        setAppointmentForm({...appointmentForm, patient_id: newPatientId});
        setPatientSearch(newPatient.full_name);
        setShowPatientDropdown(false);
        
        // Добавляем нового пациента в список отфильтрованных пациентов для немедленного отображения
        // Это дополнительная защита от race condition когда props.patients ещё не обновился
        setFilteredPatients([newPatient]);
        
        console.log('✅ Пациент создан и автоматически выбран:', newPatient.full_name, 'ID:', newPatientId);
      } else {
        console.warn('⚠️ Не удалось получить данные созданного пациента:', result);
      }
      
      // Reset form and hide the new patient section
      setShowNewPatientForm(false);
      setNewPatientForm({
        full_name: '',
        phone: '',
        iin: '',
        birth_date: '',
        gender: '',
        source: '',
        source_id: '',
        referrer: '',
        notes: ''
      });
    } catch (error) {
      console.error('Error creating patient:', error);
    }
  };

  // Очистка подписи
  const clearSignature = () => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
      setHasSignature(false);
      setConsentFileError('');
    }
  };

  // Конвертировать подпись в файл
  const signatureToFile = () => {
    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) {
      return null;
    }

    const canvas = signaturePadRef.current.getCanvas();
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        const file = new File([blob], 'signature.png', { type: 'image/png' });
        resolve(file);
      }, 'image/png');
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    let payload;
    try {
      const base = { ...appointmentForm };
      delete base.operation_id;
      // Status changes belong to the calendar. Omit even the opening snapshot
      // on edits so a later status change cannot be overwritten by this form.
      delete base.status;
      if (!editingItem) base.status = 'unconfirmed';
      delete base.patient_full_name;
      // CRM conversion creates the patient in schedule-appointment, bypassing
      // onCreatePatient. Only an edited name is an official-name override: the
      // prefilled CRM name uses first/last order, while the parser is surname-first.
      const patientFullName = newPatientForm.full_name.trim();
      if (hideCreatePatientButton && showNewPatientForm && !appointmentForm.patient_id && !editingItem &&
          patientFullName && patientFullName !== prefilledLeadNameRef.current.trim()) {
        base.patient_full_name = patientFullName;
      }
      payload = appointmentPayment(base);
    } catch (error) { alert(error.message); return; }
    setSubmitting(true);

// Минимальная длительность сеанса — 30 минут
    const durationCheck = validateAppointmentDuration(
      appointmentForm.appointment_time,
      appointmentForm.end_time
    );
    if (!durationCheck.valid) {
      alert(durationCheck.message);
      setSubmitting(false);
      return;
    }

    // Валидация: источник (канал привлечения) обязателен при создании записи
    if (!editingItem && !appointmentForm.source_id) {
      setAppointmentSourceError('Выберите канал привлечения — это обязательное поле');
      setSubmitting(false);
      return;
    }
    setAppointmentSourceError('');
    // Если время окончания не указано — ставим 30 минут по умолчанию
    if (appointmentForm.appointment_time && !appointmentForm.end_time) {
      setAppointmentForm({
        ...appointmentForm,
        end_time: addMinutes(appointmentForm.appointment_time, DEFAULT_APPOINTMENT_DURATION)
      });
    }

    // Подпись теперь не обязательна (факсимиле опционально)
    // if (!editingItem && !hasSignature) {
    //   setConsentFileError('Необходимо поставить подпись пациента');
    //   return;
    // }

    // Проверка согласий отключена (блок скрыт)
    // const missingConsents = requiredConsents.filter(consent => !acceptedConsents[consent.id]);
    // if (!editingItem && missingConsents.length > 0) {
    //   setConsentFileError(`Необходимо принять все согласия: ${missingConsents.map(c => c.title).join(', ')}`);
    //   return;
    // }

    // Если есть подпись — конвертируем и загружаем к документам пациента
    if (hasSignature && appointmentForm.patient_id) {
      try {
        const signatureFile = await signatureToFile();
        if (signatureFile) {
          const token = localStorage.getItem('token');
          const formData = new FormData();
          formData.append('file', signatureFile);
          formData.append('description', 'Подпись согласия на обработку персональных данных');

          const response = await fetch(`${API}/api/patients/${appointmentForm.patient_id}/documents`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
          });

          if (response.ok) {
            console.log('✅ Подпись успешно сохранена в документы пациента');
          } else {
            console.warn('⚠️ Не удалось сохранить подпись, но запись будет создана');
          }
        }
      } catch (err) {
        console.warn('⚠️ Ошибка при загрузке подписи, но запись будет создана:', err);
      }
    }

    // Передаём управление родительскому обработчику
    // Передаём данные формы, а не event
    try {
      setSubmitError('');
      await onSave(payload);
    } catch (error) {
      const detail = error?.response?.data?.detail;
      setSubmitError(typeof detail === 'string' ? detail : error?.message || 'Не удалось сохранить запись');
    } finally {
      setSubmitting(false);
    }
  };

  if (!show) return null;

  return (
    <Modal
      show={show}
      onClose={onClose}
      title={editingItem ? 'Редактировать запись' : 'Новая запись на прием'}
      errorMessage={submitError || errorMessage}
      className={`curai-patient-dialog curai-appointment-dialog${['plans','payment'].includes(activeTab) && !(activeTab === 'plans' && !hideAddPlanForm && (showPlanForm || editingPlan)) ? ' curai-patient-workspace-dialog' : ''}`}
      size={['plans','payment'].includes(activeTab) ? 'max-w-[1240px]' : 'max-w-4xl'}
      subheader={<div className="curai-patient-tabbar"><nav className="curai-patient-tabs" role="tablist" aria-label="Разделы записи">
          <button
            onClick={() => setActiveTab('appointment')}
            className={tabClasses(activeTab === 'appointment')} role="tab" aria-selected={activeTab === 'appointment'}
          >
            Запись на прием
          </button>
          {selectedPatient && (
            <>
              <button
                onClick={() => setActiveTab('documents')}
                className={tabClasses(activeTab === 'documents')} role="tab" aria-selected={activeTab === 'documents'}
              >
                Документы пациента
              </button>
              <button
                onClick={() => setActiveTab('plans')}
                className={tabClasses(activeTab === 'plans')} role="tab" aria-selected={activeTab === 'plans'}
              >
                План лечения
              </button>
              <button
                onClick={() => setActiveTab('payment')}
                className={tabClasses(activeTab === 'payment')} role="tab" aria-selected={activeTab === 'payment'}
              >
                Оплата
              </button>
            </>
          )}
        </nav></div>}
    >

      {/* Tabs */}
      

      {/* Appointment Tab Content */}
      {activeTab === 'appointment' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-curai-ink mb-1">Пациент *</label>
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
                    className="w-full px-3 py-2 pr-8 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus focus:border-curai-control"
                    required={!appointmentForm.patient_id && !showNewPatientForm}
                    disabled={showNewPatientForm}
                  />

                  {/* Иконка поиска или очистки */}
                  {patientSearch ? (
                    <button
                      type="button"
                      onClick={handleClearPatient}
                      className="absolute right-2 top-2 text-curai-muted hover:text-curai-muted"
                    >
                      ✕
                    </button>
                  ) : (
                    <div className="absolute right-2 top-2 text-curai-muted">
                      🔍
                    </div>
                  )}
                </div>

                {/* Выпадающий список результатов */}
                {showPatientDropdown && filteredPatients.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-curai-surface border border-curai-control rounded-md shadow-none max-h-60 overflow-y-auto">
                    {filteredPatients.map(patient => (
                      <div
                        key={patient.id}
                        onClick={() => handlePatientSelect(patient)}
                        className="px-4 py-3 hover:bg-curai-selected cursor-pointer border-b border-curai-border last:border-b-0"
                      >
                        <div className="font-medium text-curai-ink">{patient.full_name}</div>
                        <div className="text-sm text-curai-muted">
                          {patient.phone && `📞 ${patient.phone}`}
                          {patient.phone && patient.birth_date && ' • '}
                          {patient.birth_date && `🎂 ${patient.birth_date}`}
                        </div>
                        {patient.iin && (
                          <div className="text-xs text-curai-muted">ИИН: {patient.iin}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Показать сообщение если ничего не найдено */}
                {patientSearch && filteredPatients.length === 0 && patientSearch.length >= 2 && !appointmentForm.patient_id && (
                  <div className="absolute z-50 w-full mt-1 bg-curai-surface border border-curai-control rounded-md shadow-none p-4 text-center text-curai-muted">
                    <div className="text-sm">Пациенты не найдены</div>
                    <div className="text-xs mt-1">Попробуйте изменить поисковый запрос</div>
                  </div>
                )}
              </div>

              {!hideCreatePatientButton && (
                <button
                  type="button"
                  onClick={() => setShowNewPatientForm(!showNewPatientForm)}
                  className="px-3 py-2 bg-curai-positive text-white rounded-md hover:bg-curai-positive text-sm"
                >
                  {showNewPatientForm ? 'Отмена' : '+ Новый'}
                </button>
              )}
            </div>

            {/* Выбранный пациент */}
            {appointmentForm.patient_id && selectedPatient && (
              <div className="mt-2 p-3 bg-curai-positiveBg border border-curai-positive rounded-md">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-curai-positive">✓ Выбран: {selectedPatient.full_name}</div>
                    <div className="text-sm text-curai-positive">
                      {selectedPatient.phone && `📞 ${selectedPatient.phone}`}
                      {selectedPatient.phone && selectedPatient.birth_date && ' • '}
                      {selectedPatient.birth_date && `🎂 ${selectedPatient.birth_date}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearPatient}
                    className="text-curai-positive hover:text-curai-positive text-sm"
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
                  onChange={(e) => setNewPatientForm({ ...newPatientForm, full_name: e.target.value })}
                  className="px-3 py-2 border border-curai-control rounded-md text-sm"
                />
                <input
                  type="tel"
                  placeholder="Телефон *"
                  value={newPatientForm.phone || appointmentForm.lead_phone || ''}
                  onChange={(e) => setNewPatientForm({ ...newPatientForm, phone: formatPhoneChange(e.target.value) })}
                  className="px-3 py-2 border border-curai-control rounded-md text-sm"
                />
                <input
                  type="text"
                  placeholder="ИИН"
                  value={newPatientForm.iin}
                  onChange={(e) => setNewPatientForm({ ...newPatientForm, iin: e.target.value })}
                  className="px-3 py-2 border border-curai-control rounded-md text-sm"
                />
                <input
                  type="date"
                  placeholder="Дата рождения"
                  value={newPatientForm.birth_date}
                  onChange={(e) => setNewPatientForm({ ...newPatientForm, birth_date: e.target.value })}
                  className="px-3 py-2 border border-curai-control rounded-md text-sm"
                />
                <select
                  value={newPatientForm.gender}
                  onChange={(e) => setNewPatientForm({ ...newPatientForm, gender: e.target.value })}
                  className="px-3 py-2 border border-curai-control rounded-md text-sm"
                >
                  <option value="">Пол</option>
                  <option value="male">Мужской</option>
                  <option value="female">Женский</option>
                </select>

              </div>
              <div className="mt-3">
                <input
                  type="text"
                  placeholder="Кто направил"
                  value={newPatientForm.referrer}
                  onChange={(e) => setNewPatientForm({ ...newPatientForm, referrer: e.target.value })}
                  className="w-full px-3 py-2 border border-curai-control rounded-md text-sm"
                />
              </div>
              <div className="mt-3">
                <input
                  type="email"
                  placeholder="Email"
                  value={newPatientForm.email || appointmentForm.lead_email || ''}
                  onChange={(e) => setNewPatientForm({ ...newPatientForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-curai-control rounded-md text-sm"
                />
              </div>
              {!hideCreatePatientButton && (
                <button
                  type="button"
                  onClick={handleCreateNewPatient}
                  className="mt-3 px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue text-sm"
                >
                  Создать пациента
                </button>
              )}
            </div>
          )}

          {/* Дата, время начала, длительность (по умолчанию 30 мин) и время окончания */}
          <AppointmentTimeFields
            appointmentForm={appointmentForm}
            onDateChange={handleDateChange}
            onTimeChange={handleTimeChange}
            onEndTimeChange={handleEndTimeChange}
          />

          {/* Предупреждение о конфликте времени */}
          {timeConflictMessage && (
            <div className="bg-curai-negativeBg border border-curai-negative rounded-md p-3 text-curai-negative text-sm">
              {timeConflictMessage}
            </div>
          )}

          {/* Выбор кабинета */}
          <div>
            <label className="block text-sm font-medium text-curai-ink mb-1">
              Кабинет <span className="text-curai-muted text-xs">(опционально)</span>
            </label>
            <select
              value={appointmentForm.room_id || ''}
              onChange={(e) => handleRoomChange(e.target.value)}
              className={inputClasses}
            >
              <option value="">Без привязки к кабинету (все врачи)</option>
              {rooms.map(room => (
                <option key={room.id} value={room.id}>
                  {room.name} {room.number ? `(№${room.number})` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-curai-muted mt-1">
              Выберите кабинет для фильтрации врачей по расписанию или оставьте пустым
            </p>
          </div>

          {/* Выбор врача с учетом расписания */}
          <div>
            <label className="block text-sm font-medium text-curai-ink mb-1">
              Врач *
              {loadingDoctors && <span className="text-curai-blue ml-2">Загружаем доступных врачей...</span>}
            </label>

            {scheduleMessage && (
              <div className={`mb-2 p-2 rounded text-sm ${availableDoctors.length === 0 ? "bg-curai-negativeBg text-curai-negative" : "bg-curai-positiveBg text-curai-positive"
                }`}>
                {scheduleMessage}
              </div>
            )}

            <select
              value={appointmentForm.doctor_id}
              onChange={(e) => {
                const newDoctorId = e.target.value;
                setAppointmentForm({ ...appointmentForm, doctor_id: newDoctorId });
                // Проверяем конфликты с новым врачом
                if (appointmentForm.appointment_date && appointmentForm.appointment_time) {
                  checkTimeConflict(appointmentForm.room_id, appointmentForm.appointment_date, appointmentForm.appointment_time, newDoctorId);
                }
              }}
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
              <div className="mt-2 p-3 bg-curai-selected rounded-md">
                <div className="text-sm text-curai-blue">
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

{/* Выбор источника (канал привлечения) */}
          <div>
            <label className="block text-sm font-medium text-curai-ink mb-1">
              Канал привлечения
              {!editingItem && <span className="text-curai-negative">*</span>}
              {loadingSources && <span className="text-curai-muted ml-2 text-xs">Загрузка...</span>}
            </label>
            <select
              value={appointmentForm.source_id || ''}
              onChange={(e) => {
                const selectedValue = e.target.value;
                const selectedSource = sources.find(s => s.id === selectedValue);
                if (selectedSource) {
                  setAppointmentForm({ 
                    ...appointmentForm, 
                    source_id: selectedValue,
                    source: selectedSource.type 
                  });
                } else {
                  setAppointmentForm({ 
                    ...appointmentForm, 
                    source_id: selectedValue,
                    source: '' 
                  });
                }
                setAppointmentSourceError('');
              }}
              className={`w-full border rounded-md px-3 py-2 text-sm ${appointmentSourceError ? "border-curai-negative" : "border-curai-control"}`}
              disabled={loadingSources}
            >
              <option value="">Выберите источник</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
            {appointmentSourceError && (
              <p className="text-xs text-curai-negative mt-1">{appointmentSourceError}</p>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Цена (₸) - СКРЫТО (не требуется)
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Цена (₸)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={appointmentForm.price || ''}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, price: e.target.value })}
                  className={inputClasses}
                />
              </div>
              */}

              {/* Тип оплаты — скрыт, используется в плане лечения
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип оплаты</label>
                <select
                  value={appointmentForm.payment_type_id || ''}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, payment_type_id: e.target.value })}
                  className={selectClasses}
                  disabled={loadingPaymentTypes}
                >
                  <option value="">Не выбрано</option>
                  {paymentTypes.map(paymentType => (
                    <option key={paymentType.id} value={paymentType.id}>
                      {paymentType.name} {paymentType.commission_rate > 0 ? `(${paymentType.commission_rate}%)` : ''}
                    </option>
                  ))}
                </select>
              </div>
              */}

            </div>

            {/* Секция депозита */}
            <div className="border-2 rounded-md p-4 border-curai-control bg-curai-selected">
              <h4 className="font-medium text-curai-blue mb-3">Депозит</h4>
              <label className="block text-sm font-medium">Депозит
                <select value={appointmentForm.deposit_type || ''}
                  onChange={event => setAppointmentForm({ ...appointmentForm, deposit_type: event.target.value, deposit: '' })}
                  className={selectClasses} disabled={submitting}>
                  <option value="">Без депозита</option>
                  <option value="fixed">Фиксированная сумма</option>
                  <option value="percent">Процент от стоимости</option>
                </select>
              </label>
              {appointmentForm.deposit_type && (
                <label className="block text-sm font-medium mt-3">
                  {appointmentForm.deposit_type === 'percent' ? 'Депозит, %' : 'Депозит, \u20b8'}
                  <input type="number" min="0"
                    max={appointmentForm.deposit_type === 'percent' ? '100' : undefined}
                    step={appointmentForm.deposit_type === 'percent' ? '1' : '0.01'}
                    placeholder={appointmentForm.deposit_type === 'percent' ? '0-100' : '0'}
                    value={appointmentForm.deposit ?? ''}
                    onChange={event => setAppointmentForm({ ...appointmentForm, deposit: event.target.value })}
                    className={inputClasses} disabled={submitting} />
                </label>
              )}
            </div>
          </div>

          <div className="hidden">
            {/* Тип оплаты — скрыт, используется в плане лечения
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Тип оплаты</label>
              <select
                value={appointmentForm.payment_type_id || ''}
                onChange={(e) => setAppointmentForm({ ...appointmentForm, payment_type_id: e.target.value })}
                className={selectClasses}
                disabled={loadingPaymentTypes}
              >
                <option value="">Не выбрано</option>
                {paymentTypes.map(paymentType => (
                  <option key={paymentType.id} value={paymentType.id}>
                    {paymentType.name} {paymentType.commission_rate > 0 ? `(${paymentType.commission_rate}%)` : ''}
                  </option>
                ))}
              </select>
            </div>
            */}

          </div>

          <div>
            <label className="block text-sm font-medium text-curai-ink mb-1">Причина обращения</label>
            <input
              type="text"
              placeholder="Причина визита"
              value={appointmentForm.reason}
              onChange={(e) => setAppointmentForm({ ...appointmentForm, reason: e.target.value })}
              className={inputClasses}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-curai-ink mb-1">Заметки о записи</label>
              <textarea
                placeholder="Заметки о записи"
                value={appointmentForm.notes}
                onChange={(e) => setAppointmentForm({ ...appointmentForm, notes: e.target.value })}
                className={inputClasses}
                rows="3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-curai-ink mb-1">Заметки о пациенте</label>
              <textarea
                placeholder="Заметки о пациенте"
                value={appointmentForm.patient_notes || ''}
                onChange={(e) => setAppointmentForm({ ...appointmentForm, patient_notes: e.target.value })}
                className={inputClasses}
                rows="3"
              />
            </div>
          </div>

          {/* Подпись пациента на обработку персональных данных - СКРЫТО (не требуется)
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Подпись согласия пациента на обработку персональных данных
            </label>
            <div className="border-2 border-gray-300 rounded-lg p-4 bg-white">
              <div className="mb-2 text-sm text-gray-600">
                Пожалуйста, поставьте подпись в области ниже:
              </div>
              <div className={`border-2 rounded-lg overflow-hidden ${consentFileError ? 'border-red-400' : 'border-gray-400'
                }`}>
                <SignatureCanvas
                  ref={signaturePadRef}
                  canvasProps={{
                    className: 'signature-canvas',
                    style: {
                      width: '100%',
                      height: '200px',
                      background: '#f9fafb',
                      cursor: 'crosshair'
                    }
                  }}
                  onEnd={() => {
                    if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
                      setHasSignature(true);
                      setConsentFileError('');
                    }
                  }}
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={clearSignature}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm border border-gray-300"
                >
                  🔄 Очистить подпись
                </button>
                {hasSignature && (
                  <div className="flex-1 flex items-center justify-end text-green-600 text-sm font-medium">
                    ✓ Подпись поставлена
                  </div>
                )}
              </div>
            </div>
            {consentFileError && (
              <p className="mt-1 text-sm text-red-600">{consentFileError}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">При редактировании подпись не обязательна</p>
          </div>
          */}

          {/* Документы согласий - СКРЫТО (не требуется)
          <div className="border-2 border-indigo-200 rounded-lg p-4 bg-indigo-50">
            <h4 className="font-medium text-indigo-900 mb-3">📄 Информированные согласия</h4>
            <div className="space-y-3">
              {requiredConsents.map(consent => (
                <div key={consent.id} className="bg-white p-3 rounded-lg border border-indigo-200">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acceptedConsents[consent.id] || false}
                      onChange={(e) => {
                        setAcceptedConsents(prev => ({
                          ...prev,
                          [consent.id]: e.target.checked
                        }));
                        if (e.target.checked) {
                          setConsentFileError('');
                        }
                      }}
                      disabled={editingItem}
                      className="mt-1 w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{consent.title}</div>
                      <div className="text-sm text-gray-600 mt-1">{consent.description}</div>
                      {consent.url && consent.url !== 'undefined' && (
                        <a
                          href={consent.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-indigo-600 hover:text-indigo-800 mt-1 inline-flex items-center"
                        >
                          📎 Открыть документ
                          <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                    </div>
                    {acceptedConsents[consent.id] && (
                      <div className="text-green-600 font-medium text-sm">✓ Согласен</div>
                    )}
                  </label>
                </div>
              ))}
            </div>
            {!editingItem && Object.keys(acceptedConsents).length < requiredConsents.length && (
              <div className="mt-3 text-sm text-orange-600 bg-orange-50 p-2 rounded border border-orange-200">
                ⚠️ Необходимо принять все согласия перед созданием записи
              </div>
            )}
            {editingItem && (
              <div className="mt-3 text-xs text-gray-500">
                При редактировании согласия уже приняты и изменению не подлежат
              </div>
            )}
          </div>
          */}

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading || uploadingConsent || submitting}
              className="flex-1 bg-curai-blue text-white py-2 rounded-md hover:bg-curai-blue disabled:opacity-50 flex items-center justify-center gap-2"
              data-guide="save-appointment-btn"
            >
              {(loading || uploadingConsent || submitting) && (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {uploadingConsent ? 'Сохранение подписи...' : (loading || submitting) ? 'Сохранение записи...' : (editingItem ? 'Обновить' : 'Создать')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-curai-control text-curai-ink py-2 rounded-md hover:bg-curai-disabled"
            >
              Отмена
            </button>
          </div>
        </form>
      )}

      {/* Documents Tab Content */}
      {activeTab === 'documents' && selectedPatient && (
        <div className="space-y-4">
          <div className="bg-curai-selected p-3 rounded-md">
            <h4 className="font-medium text-curai-blue">
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
                <p className="text-sm text-curai-muted mt-1">
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
                className="px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue disabled:opacity-50"
              >
                {uploading ? 'Загрузка...' : 'Загрузить документ'}
              </button>
            </div>
          </div>

          {/* Documents List */}
          <div>
            <h4 className="font-medium mb-3">Загруженные документы</h4>
            {documents.length === 0 ? (
              <p className="text-curai-muted text-center py-4">
                Документы не найдены
              </p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 border rounded-md">
                    <div className="flex-1">
                      <div className="font-medium">{doc.original_filename}</div>
                      <div className="text-sm text-curai-muted">
                        Загружен {new Date(doc.created_at).toLocaleDateString('ru-RU')}
                        {' '}пользователем {doc.uploaded_by_name}
                      </div>
                      {doc.description && (
                        <div className="text-sm text-curai-muted">{doc.description}</div>
                      )}
                      <div className="text-xs text-curai-muted">
                        Размер: {(doc.file_size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <a
                        href={`${API}/api/uploads/${doc.filename}`}
                        download={doc.original_filename}
                        className="px-3 py-1 text-curai-blue border border-curai-control rounded hover:bg-curai-selected text-sm"
                      >
                        Скачать
                      </a>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="px-3 py-1 text-curai-negative border border-curai-negative rounded hover:bg-curai-negativeBg text-sm"
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
              className="px-6 py-2 bg-curai-control text-curai-ink rounded-md hover:bg-curai-disabled"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Treatment Plans Tab Content */}
      {activeTab === 'plans' && selectedPatient && (<>
        {!hideAddPlanForm && (showPlanForm || editingPlan) && <button type="button" className="curai-button curai-button-secondary" onClick={() => { setEditingPlan(null); setShowPlanForm(false); }}>К списку планов</button>}
        {!hideAddPlanForm && (showPlanForm || editingPlan) && (
          <div className={cardHeaderClasses}>
            <h4 className="font-medium mb-3">
              {editingPlan ? 'Редактировать план лечения' : 'Добавить план лечения'}
            </h4>

            <div className="space-y-4">
              <input
                type="text"
                placeholder="Название плана лечения *"
                value={planForm.title}
                onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })}
                className={inputClasses}
                required
              />

              <textarea
                placeholder="Описание плана"
                value={planForm.description}
                onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
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
                <div className="bg-curai-surface p-4 rounded-md border">
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
                                className="text-curai-negative hover:text-curai-negative text-xs"
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
                          <td className="py-2 text-right text-lg text-curai-positive">
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
                  <label className="block text-sm font-medium text-curai-ink mb-1">Статус плана</label>
                  <select
                    value={planForm.status}
                    onChange={(e) => setPlanForm({ ...planForm, status: e.target.value })}
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
                  <label className="block text-sm font-medium text-curai-ink mb-1">Статус выполнения</label>
                  <select
                    value={planForm.execution_status}
                    onChange={(e) => setPlanForm({ ...planForm, execution_status: e.target.value })}
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
                  <label className="block text-sm font-medium text-curai-ink mb-1">Статус оплаты</label>
                  <select
                    value={planForm.payment_status}
                    onChange={(e) => setPlanForm({ ...planForm, payment_status: e.target.value })}
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
                  <label className="block text-sm font-medium text-curai-ink mb-1">Сумма к оплате</label>
                  <div className="px-3 py-2 bg-curai-subtle border border-curai-control rounded-md font-medium">
                    {(planForm.total_cost || 0).toFixed(0)} ₸
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-curai-ink mb-1">Оплачено</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={planForm.total_cost}
                    value={planForm.paid_amount}
                    onChange={(e) => setPlanForm({ ...planForm, paid_amount: parseFloat(e.target.value) || 0 })}
                    className={inputClasses}
                    placeholder="0"
                  />
                </div>
              </div>

              <textarea
                placeholder="Дополнительные заметки"
                value={planForm.notes}
                onChange={(e) => setPlanForm({ ...planForm, notes: e.target.value })}
                className={inputClasses}
                rows="2"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveTreatmentPlan}
                  className="px-4 py-2 bg-curai-positive text-white rounded-md hover:bg-curai-positive"
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
                    className="px-4 py-2 bg-curai-control text-curai-ink rounded-md hover:bg-curai-disabled"
                  >
                    Отмена
                  </button>
                )}
              </div>
            </div>
          </div>
          )}
        {!(!hideAddPlanForm && (showPlanForm || editingPlan)) && (planDataPending || plansError ? <PlanEmptyState title={plansError || 'Загрузка планов лечения…'} action={plansError && <button type="button" className="curai-button curai-button-secondary" onClick={fetchTreatmentPlans}>Повторить</button>}/> : <PatientTreatmentWorkspace includeEmptyPlans={!hideAddPlanForm} patientId={selectedPatient.id} plans={currentTreatmentPlans} paymentFilter={paymentFilter} onPaymentFilter={setPaymentFilter} procedureFilter={procedureFilter} onProcedureFilter={setProcedureFilter} onUpdate={updated => setTreatmentPlans(plans => plans.map(plan => plan.id === updated.id ? updated : plan))} onCreatePlan={hideAddPlanForm ? undefined : () => { setEditingPlan(null); setPlanForm({
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
  }); setShowPlanForm(true); }} createLabel="Создать план лечения" createEmptyLabel="Создать план лечения" creationHint={hideAddPlanForm ? 'Планы формируются из услуг консультационного листа.' : 'Планы лечения пациента'} emptyDescription={hideAddPlanForm ? 'Добавьте услуги в консультационный лист в карточке пациента.' : 'Создайте план лечения для выбранного пациента.'} planActions={hideAddPlanForm ? undefined : plan => <><button type="button" className="curai-button curai-button-secondary" onClick={() => handleEditTreatmentPlan(plan)}>Редактировать план</button><button type="button" className="curai-button curai-button-secondary" onClick={() => handleDeleteTreatmentPlan(plan.id)}>Удалить план</button></>}/>)}</>)}

      {/* Payment Tab - поэтапная оплата (дубль из карточки пациента) */}
      {activeTab === 'payment' && selectedPatient && (planDataPending || plansError ? <PlanEmptyState title={plansError || 'Загрузка планов лечения…'} action={plansError && <button type="button" className="curai-button curai-button-secondary" onClick={fetchTreatmentPlans}>Повторить</button>}/> : <PatientPaymentWorkspace plans={currentTreatmentPlans} patientId={selectedPatient.id} onUpdate={updated => setTreatmentPlans(plans => plans.map(plan => plan.id === updated.id ? updated : plan))} onCreatePlan={hideAddPlanForm ? undefined : () => { setActiveTab('plans'); setEditingPlan(null); setPlanForm({
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
  }); setShowPlanForm(true); }}/>)}
    </Modal>
  );
};

export default AppointmentModal;
