import React, { useState, useEffect, useRef } from 'react';
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
  const { openModal, closeModal, updateModalProps } = useModal();

  const patientSessionRef = useRef(null);
  const patientSaveRef = useRef(false);

  const openPatientModal = ({ patientForm, editingItem }) => {
    const session = { patientId: editingItem?.id || editingItem?._id || null, patientForm };
    patientSessionRef.current = session;
    openModal('patient', {
      patientForm,
      editingItem,
      loading,
      errorMessage,
      setPatientForm: (form) => {
        if (patientSessionRef.current !== session) return;
        session.patientForm = form;
        updateModalProps('patient', { patientForm: form });
      },
      onClose: () => {
        if (patientSessionRef.current !== session) return;
        patientSessionRef.current = null;
        closeModal('patient');
      },
      onSave: (event, form) => handleSavePatient(event, form, session)
    });
  };

  // UI состояния
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, returning, new
  const [planStatusFilter, setPlanStatusFilter] = useState('all'); // all, closed, open
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
      date_to: dateTo,
      plan_status: planStatusFilter
    };
    patientsHook.fetchPatients(filters);
  }, [searchTerm, filterType, dateFrom, dateTo, planStatusFilter, patientsHook.fetchPatients]);

  // Загрузка планов лечения после загрузки пациентов
  useEffect(() => {
    if (patientsHook.patients.length > 0) {
      fetchAllTreatmentPlans();
    }
  }, [patientsHook.patients]);

  // Слушаем глобальный триггер для обновления планов лечения
  useEffect(() => {
    if (refreshTriggers.treatmentPlans > 0 && patientsHook.patients.length > 0) {
      console.log('🔄 Получен триггер обновления планов лечения, перезагружаем данные');
      fetchAllTreatmentPlans();
    }
  }, [refreshTriggers.treatmentPlans, patientsHook.patients.length]);

  // Слушаем глобальные триггеры для обновления данных
  useEffect(() => {
    console.log('🔄 Получен триггер обновления пациентов, перезагружаем список');
    const filters = {
      search: searchTerm,
      is_returning: filterType,
      date_from: dateFrom,
      date_to: dateTo,
      plan_status: planStatusFilter
    };
    patientsHook.fetchPatients(filters);
  }, [refreshTriggers.patients, searchTerm, filterType, dateFrom, dateTo, planStatusFilter, patientsHook.fetchPatients]);

  // Автоматическое скрытие ошибок через 5 секунд
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Обработчики пациентов
  const handleAddPatient = () => {
    openPatientModal({
      patientForm: {
        full_name: '',
        phone: '',
        last_name: '',
        iin: '',
        birth_date: '',
        gender: '',
        source: 'other',
        source_id: '',
        notes: '',
        revenue: 0,
        debt: 0,
        overpayment: 0
      },
      editingItem: null
    });
  };

  const handleEditPatient = (patient) => {
    console.log('🔍 handleEditPatient вызван с пациентом:', patient);
    const patientId = patient.id || patient._id;
    console.log('🔍 ID пациента:', patientId);
    console.log('🔍 Все ключи пациента:', Object.keys(patient));
    
    // Проверка ID при открытии
    if (!patientId) {
      alert('⚠️ У пациента нет ID!\n\nKeys: ' + Object.keys(patient).join(', '));
    }

    openPatientModal({
      patientForm: {
        id: patientId, // Сохраняем ID в форме для надёжного обновления
        full_name: patient.full_name || '',
        phone: patient.phone || '',
        last_name: patient.last_name || '',
        iin: patient.iin || '',
        birth_date: patient.birth_date || '',
        gender: patient.gender || '',
        source: patient.source || 'other',
        source_id: patient.source_id || '',
        notes: patient.notes || '',
        revenue: patient.revenue || 0,
        debt: patient.debt || 0,
        overpayment: patient.overpayment || 0
      },
      editingItem: patient
    });
  };

  const handleSavePatient = async (e, formData, session) => {
    e.preventDefault();
    
    if (patientSessionRef.current !== session || patientSaveRef.current) return;
    patientSaveRef.current = true;
    setLoading(true);
    updateModalProps('patient', { loading: true });
    const patientForm = formData || session.patientForm;

    try {
      let result;
      // Save to the edit target captured when this session opened.
      const patientId = session.patientId;
      
      if (patientId) {
        // Убираем служебные поля из данных для отправки
        const { id, _id, _editingItemId, ...dataToSend } = patientForm;
        console.log('📝 Обновление пациента ID:', patientId, 'Данные:', dataToSend);
        result = await patientsHook.updatePatient(patientId, dataToSend);
      } else {
        // Убираем служебные поля
        const { id, _id, _editingItemId, ...dataToCreate } = patientForm;
        console.log('➕ Создание нового пациента. Данные:', dataToCreate);
        result = await patientsHook.createPatient(dataToCreate);
        if (result.success && patientSessionRef.current === session) {
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
      if (patientSessionRef.current === session) {
        patientSessionRef.current = null;
        closeModal('patient');
      }
    } catch (error) {
      console.error('Error saving patient:', error);
      if (patientSessionRef.current === session) setErrorMessage('Ошибка при сохранении пациента');
    } finally {
      patientSaveRef.current = false;
      setLoading(false);
      if (patientSessionRef.current) updateModalProps('patient', { loading: false });
    }
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
      last_name: '',
      iin: '',
      birth_date: '',
      gender: '',
      source: 'other',
      source_id: '',
      notes: '',
      revenue: 0,
      debt: 0,
      overpayment: 0
    });
  };

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {errorMessage && (
        <div className={`border px-4 py-3 rounded mb-4 ${
          errorMessage.includes('✅') 
            ? "bg-curai-positiveBg border-curai-positive text-curai-positive"
            : "bg-curai-negativeBg border-curai-negative text-curai-negative"
        }`}>
          {errorMessage}
          <button 
            onClick={() => setErrorMessage(null)}
            className={`float-right font-semibold hover:opacity-75 ${
              errorMessage.includes('✅') ? "text-curai-positive" : "text-curai-negative"
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
        user={user}
        patients={patientsHook.patients}
        patientsTreatmentPlans={patientsTreatmentPlans}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filterType={filterType}
        setFilterType={setFilterType}
        planStatusFilter={planStatusFilter}
        setPlanStatusFilter={setPlanStatusFilter}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        onAddPatient={handleAddPatient}
        onEditPatient={handleEditPatient}
        onDeletePatient={handleDeletePatient}
        canManage={user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'doctor'}
      />

      {/* Модальные окна теперь управляются через ModalManager */}
    </div>
  );
};

export default PatientsPage;
