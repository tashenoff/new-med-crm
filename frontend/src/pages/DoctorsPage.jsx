import React, { useState, useEffect } from 'react';
import { useDoctors } from '../hooks/useDoctors';
import { useGlobalRefresh } from '../hooks/useGlobalRefresh';
import { useModal } from '../context/ModalContext';
import DoctorsView from '../components/doctors/DoctorsView';
import DoctorCashbackWidget from '../components/loyalty/DoctorCashbackWidget';
import { initializeDoctorForm, buildDoctorPayload } from '../utils/doctorCompensation';

const DoctorsPage = ({ user }) => {
  // Data hook
  const doctorsHook = useDoctors();
  const { refreshTriggers, refreshDoctors } = useGlobalRefresh();
  
  // Modal hook
  const { openModal, closeModal, updateModalProps, getModalProps } = useModal();

  // UI состояния
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Форма врача теперь управляется через ModalContext

  // Загрузка данных при монтировании
  useEffect(() => {
    doctorsHook.fetchDoctors();
  }, [doctorsHook.fetchDoctors]);

  // Слушаем глобальные триггеры для обновления данных
  useEffect(() => {
    console.log('🔄 Получен триггер обновления врачей, перезагружаем список');
    doctorsHook.fetchDoctors();
  }, [refreshTriggers.doctors, doctorsHook.fetchDoctors]);

  // Автоматическое скрытие ошибок через 5 секунд
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Обработчики врачей
  const handleAddDoctor = () => {
    openModal('doctor', {
      doctorForm: initializeDoctorForm(),
      setDoctorForm: (form) => updateModalProps('doctor', { doctorForm: form }),
      editingItem: null,
      loading,
      errorMessage,
      onSave: handleSaveDoctor
    });
  };

  const handleEditDoctor = (doctor) => {
    openModal('doctor', {
      doctorForm: initializeDoctorForm(doctor),
      setDoctorForm: (form) => updateModalProps('doctor', { doctorForm: form }),
      editingItem: doctor,
      loading,
      errorMessage,
      onSave: handleSaveDoctor
    });
  };

  const handleSaveDoctor = async (e, doctorFormWithEditingItem) => {
    e.preventDefault();
    setLoading(true);

    const { editingItem, ...doctorForm } = doctorFormWithEditingItem;

    try {
      // Очищаем данные от лишних полей, которых нет в API
      const cleanDoctorData = buildDoctorPayload(doctorForm);
      
      let result;
      if (editingItem) {
        const doctorId = editingItem.id || editingItem._id;
        if (!doctorId) {
          throw new Error('ID врача не найден. Невозможно обновить.');
        }
        result = await doctorsHook.updateDoctor(doctorId, cleanDoctorData);
      } else {
        result = await doctorsHook.createDoctor(cleanDoctorData);
      }
      
      if (!result.success) {
        throw new Error(result.error);
      }

      // Триггерим глобальное обновление списка врачей для других компонентов (например, расписание)
      refreshDoctors();
      
      closeModal('doctor');
    } catch (error) {
      console.error('Ошибка при сохранении врача:', error);
      const apiError = error.response?.data?.detail || error.message;
      setErrorMessage(apiError || 'Произошла неизвестная ошибка');
    }
    setLoading(false);
  };

  const handleDeleteDoctor = async (id) => {
    if (window.confirm('Вы уверены, что хотите деактивировать этого врача?')) {
      try {
        const result = await doctorsHook.deleteDoctor(id);
        
        if (!result.success) {
          throw new Error(result.error);
        }
        
      } catch (error) {
        console.error('Error deleting doctor:', error);
        setErrorMessage('Ошибка при деактивации врача');
      }
    }
  };

  const handleCloseDoctorModal = () => {
    // This function seems to be unused now, but we'll keep it for now.
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

      {/* Виджет кэшбэка для врачей */}
      {user?.role === 'doctor' && user?.id && (
        <DoctorCashbackWidget doctorId={user.id} />
      )}

      {/* Doctors View */}
      <DoctorsView
        doctors={doctorsHook.doctors}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onAddDoctor={handleAddDoctor}
        onEditDoctor={handleEditDoctor}
        onDeleteDoctor={handleDeleteDoctor}
        canManage={user?.role === 'admin' || user?.role === 'super_admin'}
      />

      {/* Модальные окна теперь управляются через ModalManager */}
    </div>
  );
};

export default DoctorsPage;
