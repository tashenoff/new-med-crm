import React, { useState, useEffect, useRef } from 'react';
import { useAppointments } from '../hooks/useAppointments';
import { usePatients } from '../hooks/usePatients';
import { useDoctors } from '../hooks/useDoctors';
import { useRooms } from '../hooks/useRooms';
import { useGlobalRefresh } from '../hooks/useGlobalRefresh';
import { useModal } from '../context/ModalContext';
import CalendarView from '../components/calendar/CalendarView';

const CalendarPage = ({ user }) => {
  // Data hooks
  const appointmentsHook = useAppointments();
  const patientsHook = usePatients();
  const doctorsHook = useDoctors();
  const roomsHook = useRooms();
  const { refreshTriggers } = useGlobalRefresh();
  
  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Modal hook
  const { openModal, closeModal, updateModalProps, getModalProps } = useModal();

  // UI состояния
  const [pendingAppointment, setPendingAppointment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  
  // Состояние формы записи
  const [currentAppointmentForm, setCurrentAppointmentForm] = useState({});
  const [currentEditingItem, setCurrentEditingItem] = useState(null);
  
  // Ref для хранения актуальной формы (решение проблемы с React batching)
  const appointmentFormRef = useRef({});
  const editingItemRef = useRef(null);

  // Форма записи теперь управляется через ModalContext

  // Загрузка данных при монтировании
  useEffect(() => {
    appointmentsHook.fetchAppointments();
    patientsHook.fetchPatients();
    doctorsHook.fetchDoctors();
    roomsHook.fetchRooms();
  }, [appointmentsHook.fetchAppointments, patientsHook.fetchPatients, doctorsHook.fetchDoctors, roomsHook.fetchRooms]);


  // Слушаем глобальные триггеры для обновления данных (отключено для drag & drop)
  // useEffect(() => {
  //   console.log('🔄 Получен триггер обновления записей, перезагружаем список');
  //   appointmentsHook.fetchAppointments();
  // }, [refreshTriggers.appointments, appointmentsHook.fetchAppointments]);

  useEffect(() => {
    patientsHook.fetchPatients();
  }, [refreshTriggers.patients, patientsHook.fetchPatients]);

  useEffect(() => {
    doctorsHook.fetchDoctors();
  }, [refreshTriggers.doctors, doctorsHook.fetchDoctors]);


  useEffect(() => {
    roomsHook.fetchRooms();
  }, [refreshTriggers.rooms, roomsHook.fetchRooms]);

  // Автоматическое скрытие ошибок через 5 секунд
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Утилита для проверки пересечений времени
  const doTimesOverlapSimple = (start1, end1, start2, end2) => {
    if (!end1 || !end2) return false;
    
    const parseTime = (timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };
    
    const start1Minutes = parseTime(start1);
    const end1Minutes = parseTime(end1);
    const start2Minutes = parseTime(start2);
    const end2Minutes = parseTime(end2);
    
    return start1Minutes < end2Minutes && end1Minutes > start2Minutes;
  };

  // Обработчики записей
  const handleNewAppointment = () => {
    openModal('appointment', {
      appointmentForm: {
        patient_id: '',
        doctor_id: '',
        appointment_date: '',
        appointment_time: '',
        end_time: '',
        price: '',
        status: 'unconfirmed',
        reason: '',
        notes: '',
        patient_notes: '',
        room_id: ''
      },
      setAppointmentForm: (form) => updateModalProps('appointment', { appointmentForm: form }),
      patients: patientsHook.patients,
      doctors: doctorsHook.doctors,
      editingItem: null,
      loading,
      errorMessage,
      onSave: handleSaveAppointment,
      onCreatePatient: handleCreatePatientFromAppointment,
      appointments: appointmentsHook.appointments
    });
  };

  const handleSlotClick = (date, time, roomId = null) => {
    
    const appointmentForm = {
      patient_id: '',
      doctor_id: '',
      appointment_date: date,
      appointment_time: time,
      end_time: '',
      price: '',
      status: 'unconfirmed',
      reason: '',
      notes: '',
      patient_notes: '',
      room_id: roomId || ''
    };
    
    // Сохраняем данные в локальном состоянии и ref
    setCurrentAppointmentForm(appointmentForm);
    setCurrentEditingItem(null);
    appointmentFormRef.current = appointmentForm;
    editingItemRef.current = null;
    
    const modalProps = {
      appointmentForm,
      setAppointmentForm: (form) => {
        console.log('🔥 DEBUG: setAppointmentForm вызван с:', form);
        console.log('🔥 DEBUG: form.patient_id:', form.patient_id);
        appointmentFormRef.current = form; // Сохраняем в ref немедленно
        setCurrentAppointmentForm(form);
        updateModalProps('appointment', { appointmentForm: form });
      },
      patients: patientsHook.patients,
      doctors: doctorsHook.doctors,
      editingItem: null,
      loading,
      errorMessage,
      onSave: handleSaveAppointment,
      onCreatePatient: handleCreatePatientFromAppointment,
      appointments: appointmentsHook.appointments
    };
    
    openModal('appointment', modalProps);
  };

  const handleEditAppointment = (appointment) => {
    const appointmentForm = {
      patient_id: appointment.patient_id,
      doctor_id: appointment.doctor_id,
      room_id: appointment.room_id || '',
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time,
      end_time: appointment.end_time || '',
      price: appointment.price || '',
      status: appointment.status || 'unconfirmed',
      reason: appointment.reason || '',
      notes: appointment.notes || '',
      patient_notes: appointment.patient_notes || ''
    };
    
    // Сохраняем данные в локальном состоянии и ref
    setCurrentAppointmentForm(appointmentForm);
    setCurrentEditingItem(appointment);
    appointmentFormRef.current = appointmentForm;
    editingItemRef.current = appointment;
    
    const modalProps = {
      appointmentForm,
      setAppointmentForm: (form) => {
        console.log('🔥 DEBUG: setAppointmentForm (edit) вызван с:', form);
        appointmentFormRef.current = form; // Сохраняем в ref немедленно
        setCurrentAppointmentForm(form);
        updateModalProps('appointment', { appointmentForm: form });
      },
      patients: patientsHook.patients,
      doctors: doctorsHook.doctors,
      editingItem: appointment,
      loading,
      errorMessage,
      onSave: handleSaveAppointment,
      onCreatePatient: handleCreatePatientFromAppointment,
      appointments: appointmentsHook.appointments
    };
    
    openModal('appointment', modalProps);
  };

  const handleSaveAppointment = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    
    // Используем ref для получения актуальных данных
    const appointmentForm = appointmentFormRef.current;
    const editingItem = editingItemRef.current;
    
    console.log('🔥 DEBUG: appointmentFormRef.current:', appointmentForm);
    console.log('🔥 DEBUG: patient_id:', appointmentForm.patient_id);
    
    try {
      
      // Проверяем обязательные поля
      if (!appointmentForm.patient_id) {
        alert('Выберите пациента!');
        setLoading(false);
        return;
      }
      if (!appointmentForm.doctor_id) {
        alert('Выберите врача!');
        setLoading(false);
        return;
      }
      if (!appointmentForm.appointment_date) {
        alert('Выберите дату!');
        setLoading(false);
        return;
      }
      if (!appointmentForm.appointment_time) {
        alert('Выберите время!');
        setLoading(false);
        return;
      }
      
      // Проверяем конфликты времени перед сохранением
      if (!editingItem) {
        // Простая проверка пересечений по времени
        const conflictingAppointments = appointmentsHook.appointments.filter(apt => {
          if (apt.appointment_date === appointmentForm.appointment_date) {
            // Проверяем записи в том же кабинете
            if (apt.room_id === appointmentForm.room_id) {
              return doTimesOverlapSimple(
                appointmentForm.appointment_time,
                appointmentForm.end_time,
                apt.appointment_time,
                apt.end_time
              );
            }
          }
          return false;
        });
        
        if (conflictingAppointments.length > 0) {
          const conflictNames = conflictingAppointments.map(apt => {
            const patient = patientsHook.patients.find(p => p.id === apt.patient_id);
            return patient ? patient.full_name : 'Неизвестный пациент';
          }).join(', ');
          
          alert(`ОШИБКА: Время пересекается с записями: ${conflictNames}\n\nИзмените время записи.`);
          setLoading(false);
          return;
        }
      }
      
      if (editingItem) {
        const appointmentId = editingItem._id || editingItem.id;
        const result = await appointmentsHook.updateAppointment(appointmentId, appointmentForm);
        if (!result.success) {
          throw new Error(result.error);
        }
      } else {
        const result = await appointmentsHook.createAppointment(appointmentForm);
        if (!result.success) {
          throw new Error(result.error);
        }
      }

      // Принудительно обновляем календарь для отображения изменений
      await appointmentsHook.fetchAppointments();
      
      closeModal('appointment');
    } catch (error) {
      console.error('Error saving appointment:', error);
      const errorMessage = error.message || 'Ошибка при сохранении записи';
      setErrorMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAppointment = async (id) => {
    if (window.confirm('Вы уверены, что хотите переместить эту запись в архив?')) {
      try {
        console.log('Archiving appointment:', id);
        const result = await appointmentsHook.updateAppointmentStatus(id, 'cancelled');
        
        if (!result.success) {
          throw new Error(result.error);
        }
        
        console.log('Appointment archived successfully');
      } catch (error) {
        console.error('Error archiving appointment:', error);
        setErrorMessage('Ошибка при архивировании записи');
      }
    }
  };

  const handleStatusChange = async (appointmentId, newStatus) => {
    try {
      const result = await appointmentsHook.updateAppointmentStatus(appointmentId, newStatus);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      // Если прием завершен, можно добавить дополнительную логику
      if (newStatus === 'completed') {
        console.log('✅ Прием завершен');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      setErrorMessage('Ошибка при обновлении статуса');
    }
  };

  const handleMoveAppointment = async (appointmentId, newDoctorId, newDate, newTime, newRoomId = null) => {
    try {
      setLoading(true);
      
      // Находим оригинальную запись чтобы сохранить все её данные
      const originalAppointment = appointmentsHook.appointments.find(apt => 
        (apt._id || apt.id) === appointmentId
      );
      
      if (!originalAppointment) {
        throw new Error('Запись не найдена');
      }
      
      // Сохраняем все данные оригинальной записи и обновляем только нужные поля
      const updateData = {
        ...originalAppointment,
        doctor_id: newDoctorId,
        appointment_date: newDate,
        appointment_time: newTime,
        room_id: newRoomId,
        // ПРИНУДИТЕЛЬНО сохраняем оригинальное время окончания
        end_time: originalAppointment.end_time
      };
      
      // Удаляем поля которые не нужны для API
      delete updateData._id;
      delete updateData.id;
      
      const result = await appointmentsHook.updateAppointment(appointmentId, updateData);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      // Принудительно обновляем календарь для отображения изменений
      await appointmentsHook.fetchAppointments();
    } catch (error) {
      console.error('Error moving appointment:', error);
      
      // Определяем тип ошибки для пользователя
      let userMessage = 'Ошибка при перемещении записи';
      if (error.message.includes('Time slot already booked')) {
        userMessage = 'Этот временной слот уже занят';
      } else if (error.message.includes('400')) {
        userMessage = 'Неверные данные для перемещения';
      }
      
      setErrorMessage(userMessage);
      
      // ВАЖНО: Обновляем календарь чтобы вернуть карточку на место
      await appointmentsHook.fetchAppointments();
    } finally {
      setLoading(false);
    }
  };

  const handleCloseAppointmentModal = () => {
    setShowAppointmentModal(false);
    setEditingItem(null);
    setAppointmentForm({
      patient_id: '',
      doctor_id: '',
      appointment_date: '',
      appointment_time: '',
      end_time: '',
      price: '',
      status: 'unconfirmed',
      reason: '',
      notes: '',
      patient_notes: '',
      room_id: ''
    });
  };

  // Заглушка для создания пациента из записи
  const handleCreatePatientFromAppointment = async (newPatientData) => {
    try {
      setLoading(true);
      const result = await patientsHook.createPatient(newPatientData);
      
      if (result.success) {
        // Обновляем форму записи с новым пациентом
        setAppointmentForm(prev => ({
          ...prev,
          patient_id: result.data.id || result.data._id
        }));
      }
      
      return result;
    } catch (error) {
      console.error('Error creating patient from appointment:', error);
      return { success: false, error: 'Ошибка при создании пациента' };
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {errorMessage && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {errorMessage}
          <button 
            onClick={() => setErrorMessage(null)}
            className="float-right font-bold text-red-700 hover:text-red-900"
          >
            ×
          </button>
        </div>
      )}

      {/* Calendar View */}
      <CalendarView
        appointments={appointmentsHook.appointments}
        doctors={doctorsHook.doctors}
        patients={patientsHook.patients}
        rooms={roomsHook.rooms}
        currentDate={currentDate}
        onDateChange={setCurrentDate}
        user={user}
        onNewAppointment={handleNewAppointment}
        onSlotClick={handleSlotClick}
        onEditAppointment={handleEditAppointment}
        onDeleteAppointment={handleDeleteAppointment}
        onStatusChange={handleStatusChange}
        onMoveAppointment={handleMoveAppointment}
        onRefreshCalendar={appointmentsHook.fetchAppointments}
        canEdit={user?.role === 'admin' || user?.role === 'doctor'}
      />

      {/* Модальные окна теперь управляются через ModalManager */}
    </div>
  );
};

export default CalendarPage;
