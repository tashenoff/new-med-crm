import React, { useState, useEffect } from 'react';
import { usePatients } from '../hooks/usePatients';
import { useGlobalRefresh } from '../hooks/useGlobalRefresh';
import { useModal } from '../context/ModalContext';
import PatientsView from '../components/patients/PatientsView';
import PatientBonusWidget from '../components/loyalty/PatientBonusWidget';

const PatientsPage = ({ user }) => {
  // Data hook
  const patientsHook = usePatients();
  const { refreshTriggers } = useGlobalRefresh();
  
  // Modal hook
  const { openModal, closeModal, updateModalProps, getModalProps } = useModal();

  // UI состояния
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, returning, new
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [patientsTreatmentPlans, setPatientsTreatmentPlans] = useState({});

  // Форма пациента теперь управляется через ModalContext

  // Загрузка планов лечения для всех пациентов
  const fetchAllTreatmentPlans = async () => {
    if (!patientsHook.patients || patientsHook.patients.length === 0) return;
    
    const API = import.meta.env.VITE_BACKEND_URL;
    const token = localStorage.getItem('token');
    const plansMap = {};

    for (const patient of patientsHook.patients) {
      try {
        const response = await fetch(`${API}/api/patients/${patient.id}/treatment-plans`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const plans = await response.json();
          plansMap[patient.id] = plans;
        }
      } catch (error) {
        console.error(`Error fetching treatment plans for patient ${patient.id}:`, error);
      }
    }
    
    setPatientsTreatmentPlans(plansMap);
  };

  // Загрузка данных при монтировании и при изменении фильтров
  useEffect(() => {
    const filters = {
      search: searchTerm,
      is_returning: filterType,
      date_from: dateFrom,
      date_to: dateTo
    };
    patientsHook.fetchPatients(filters);
  }, [searchTerm, filterType, dateFrom, dateTo, patientsHook.fetchPatients]);

  // Загрузка планов лечения после загрузки пациентов
  useEffect(() => {
    if (patientsHook.patients.length > 0) {
      fetchAllTreatmentPlans();
    }
  }, [patientsHook.patients.length]);

  // Слушаем глобальные триггеры для обновления данных
  useEffect(() => {
    console.log('🔄 Получен триггер обновления пациентов, перезагружаем список');
    const filters = {
      search: searchTerm,
      is_returning: filterType,
      date_from: dateFrom,
      date_to: dateTo
    };
    patientsHook.fetchPatients(filters);
  }, [refreshTriggers.patients, searchTerm, filterType, dateFrom, dateTo, patientsHook.fetchPatients]);

  // Автоматическое скрытие ошибок через 5 секунд
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Обработчики пациентов
  const handleAddPatient = () => {
    openModal('patient', {
      patientForm: {
        full_name: '',
        phone: '',
        iin: '',
        birth_date: '',
        gender: '',
        source: 'other',
        referrer: '',
        notes: '',
        revenue: 0,
        debt: 0,
        overpayment: 0,
        appointments_count: 0,
        records_count: 0
      },
      setPatientForm: (form) => updateModalProps('patient', { patientForm: form }),
      editingItem: null,
      loading,
      errorMessage,
      onSave: handleSavePatient
    });
  };

  const handleEditPatient = (patient) => {
    console.log('🔍 handleEditPatient вызван с пациентом:', patient);
    console.log('🔍 ID пациента:', patient.id || patient._id);
    console.log('🔍 Все ключи пациента:', Object.keys(patient));

    openModal('patient', {
      patientForm: {
        full_name: patient.full_name || '',
        phone: patient.phone || '',
        iin: patient.iin || '',
        birth_date: patient.birth_date || '',
        gender: patient.gender || '',
        source: patient.source || 'other',
        referrer: patient.referrer || '',
        notes: patient.notes || '',
        revenue: patient.revenue || 0,
        debt: patient.debt || 0,
        overpayment: patient.overpayment || 0,
        appointments_count: patient.appointments_count || 0,
        records_count: patient.records_count || 0
      },
      setPatientForm: (form) => updateModalProps('patient', { patientForm: form }),
      editingItem: patient,
      loading,
      errorMessage,
      onSave: handleSavePatient
    });
  };

  const handleSavePatient = async (e, formData = null) => {
    e.preventDefault();
    setLoading(true);
    
    // Получаем данные из модального контекста или используем переданные данные
    const modalProps = getModalProps('patient');
    const { editingItem } = modalProps;
    const patientForm = formData || modalProps.patientForm;
    
    try {
      console.log('🔍 Отправляемые данные пациента в PatientsPage:', patientForm);
      console.log('🔍 Тип patientForm:', typeof patientForm);
      console.log('🔍 Ключи patientForm:', Object.keys(patientForm || {}));
      console.log('🔍 editingItem:', editingItem);
      
      let result;
      if (editingItem) {
        const patientId = editingItem.id || editingItem._id;
        console.log('🔍 Обновление пациента:', patientId);
        console.log('🔍 editingItem:', editingItem);
        console.log('🔍 Все ключи editingItem:', Object.keys(editingItem));
        result = await patientsHook.updatePatient(patientId, patientForm);
      } else {
        result = await patientsHook.createPatient(patientForm);
        if (result.success) {
          // Обновляем список пациентов после создания
          await patientsHook.fetchPatients();
          // Показываем уведомление о создании медкарты
          setErrorMessage(`✅ Пациент создан успешно! Медицинская карта создана автоматически.`);
          setTimeout(() => setErrorMessage(null), 3000); // Убираем через 3 секунды
        }
      }
      
      if (!result.success) {
        throw new Error(result.error);
      }

      // Обновляем список пациентов после обновления
      await patientsHook.fetchPatients();
      closeModal('patient');
    } catch (error) {
      console.error('Error saving patient:', error);
      setErrorMessage('Ошибка при сохранении пациента');
    }
    setLoading(false);
  };

  const handleDeletePatient = async (id) => {
    if (window.confirm('Вы уверены, что хотите удалить этого пациента?')) {
      try {
        console.log('Deleting patient:', id);
        const result = await patientsHook.deletePatient(id);
        
        if (!result.success) {
          throw new Error(result.error);
        }

        // Обновляем список пациентов после удаления
        await patientsHook.fetchPatients();
        setSearchTerm('');
        console.log('Patient deleted successfully');
      } catch (error) {
        console.error('Error deleting patient:', error);
        setErrorMessage('Ошибка при удалении пациента');
      }
    }
  };

  const handleClosePatientModal = () => {
    setShowPatientModal(false);
    setEditingItem(null);
    setPatientForm({
      full_name: '',
      phone: '',
      iin: '',
      birth_date: '',
      gender: '',
      source: 'other',
      referrer: '',
      notes: '',
      revenue: 0,
      debt: 0,
      overpayment: 0,
      appointments_count: 0,
      records_count: 0
    });
  };

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {errorMessage && (
        <div className={`border px-4 py-3 rounded mb-4 ${
          errorMessage.includes('✅') 
            ? 'bg-green-100 border-green-400 text-green-700'
            : 'bg-red-100 border-red-400 text-red-700'
        }`}>
          {errorMessage}
          <button 
            onClick={() => setErrorMessage(null)}
            className={`float-right font-bold hover:opacity-75 ${
              errorMessage.includes('✅') ? 'text-green-700' : 'text-red-700'
            }`}
          >
            ×
          </button>
        </div>
      )}

      {/* Виджет бонусов для пациентов */}
      {user?.role === 'patient' && user?.id && (
        <PatientBonusWidget patientId={user.id} />
      )}

      {/* Patients View */}
      <PatientsView
        patients={patientsHook.patients}
        patientsTreatmentPlans={patientsTreatmentPlans}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filterType={filterType}
        setFilterType={setFilterType}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        onAddPatient={handleAddPatient}
        onEditPatient={handleEditPatient}
        onDeletePatient={handleDeletePatient}
        canManage={user?.role === 'admin' || user?.role === 'doctor'}
      />

      {/* Модальные окна теперь управляются через ModalManager */}
    </div>
  );
};

export default PatientsPage;
