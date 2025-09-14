import React, { useState, useEffect } from 'react';
import { usePatients } from '../hooks/usePatients';
import { useGlobalRefresh } from '../hooks/useGlobalRefresh';
import { useModal } from '../context/ModalContext';
import PatientsView from '../components/patients/PatientsView';

const PatientsPage = ({ user }) => {
  // Data hook
  const patientsHook = usePatients();
  const { refreshTriggers } = useGlobalRefresh();
  
  // Modal hook
  const { openModal, closeModal, updateModalProps, getModalProps } = useModal();

  // UI состояния
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Форма пациента теперь управляется через ModalContext

  // Загрузка данных при монтировании
  useEffect(() => {
    patientsHook.fetchPatients();
  }, [patientsHook.fetchPatients]);

  // Слушаем глобальные триггеры для обновления данных
  useEffect(() => {
    console.log('🔄 Получен триггер обновления пациентов, перезагружаем список');
    patientsHook.fetchPatients();
  }, [refreshTriggers.patients, patientsHook.fetchPatients]);

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

  const handleSavePatient = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // Получаем данные из модального контекста
    const modalProps = getModalProps('patient');
    const { patientForm, editingItem } = modalProps;
    
    try {
      let result;
      if (editingItem) {
        const patientId = editingItem._id || editingItem.id;
        result = await patientsHook.updatePatient(patientId, patientForm);
      } else {
        result = await patientsHook.createPatient(patientForm);
        if (result.success) {
          // Показываем уведомление о создании медкарты
          setErrorMessage(`✅ Пациент создан успешно! Медицинская карта создана автоматически.`);
          setTimeout(() => setErrorMessage(null), 3000); // Убираем через 3 секунды
        }
      }
      
      if (!result.success) {
        throw new Error(result.error);
      }

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

      {/* Patients View */}
      <PatientsView
        patients={patientsHook.patients}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
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
