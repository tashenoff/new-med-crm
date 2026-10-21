import { canAction, hasPermission } from '../utils/permissions.js';
import React, { useState, useEffect, useRef } from 'react';
import { useDoctors } from '../hooks/useDoctors';
import { useGlobalRefresh } from '../hooks/useGlobalRefresh';
import { useModal } from '../context/ModalContext';
import DoctorsView from '../components/doctors/DoctorsView';
import DoctorCashbackWidget from '../components/loyalty/DoctorCashbackWidget';
import { formatDoctorError } from '../utils/doctorErrors';
import { initializeDoctorForm, buildDoctorPayload } from '../utils/doctorCompensation';

const DoctorsPage = ({ user }) => {
  // Data hook
  const doctorsHook = useDoctors(user);
  const { refreshTriggers, refreshDoctors } = useGlobalRefresh();
  
  // Modal hook
  const { openModal, closeModal, updateModalProps, getModalProps } = useModal();

  // UI состояния
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const savePending = useRef(false);

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
    setErrorMessage(null);
    openModal('doctor', {
      doctorForm: initializeDoctorForm(),
      setDoctorForm: (form) => updateModalProps('doctor', { doctorForm: form }),
      editingItem: null,
      loading: false,
      errorMessage: null,
      onSave: handleSaveDoctor
    });
  };

  const handleEditDoctor = (doctor) => {
    setErrorMessage(null);
    openModal('doctor', {
      doctorForm: initializeDoctorForm(doctor),
      setDoctorForm: (form) => updateModalProps('doctor', { doctorForm: form }),
      editingItem: doctor,
      loading: false,
      errorMessage: null,
      onSave: handleSaveDoctor
    });
  };

  const handleSaveDoctor = async (e, doctorFormWithEditingItem) => {
    e.preventDefault();
    if (savePending.current) return;
    savePending.current = true;
    setLoading(true);
    setErrorMessage(null);
    updateModalProps('doctor', { loading: true, errorMessage: null });

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
        throw new Error(formatDoctorError(result.error));
      }

      // Триггерим глобальное обновление списка врачей для других компонентов (например, расписание)
      refreshDoctors();
      
      closeModal('doctor');
    } catch (error) {
      console.error('Ошибка при сохранении врача:', error);
      const apiError = formatDoctorError(error);
      setErrorMessage(apiError);
      updateModalProps('doctor', { errorMessage: apiError });
    } finally {
      savePending.current = false;
      setLoading(false);
      updateModalProps('doctor', { loading: false });
    }
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
        <div className="bg-curai-negativeBg border border-curai-negative text-curai-negative px-4 py-3 rounded mb-4">
          {errorMessage}
          <button 
            onClick={() => setErrorMessage(null)}
            className="float-right font-semibold text-curai-negative hover:text-curai-negative"
          >
            ×
          </button>
        </div>
      )}

      {/* Виджет кэшбэка для врачей */}
      {user?.role === 'doctor' && user?.id && hasPermission(user, 'payroll_view') && (
        <DoctorCashbackWidget doctorId={user.id} />
      )}

      {/* Doctors View */}
      <DoctorsView
        user={user}
        doctors={doctorsHook.doctors}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onAddDoctor={handleAddDoctor}
        onEditDoctor={handleEditDoctor}
        onDeleteDoctor={handleDeleteDoctor}
        canManage={['admin', 'super_admin'].includes(user?.role) && (canAction(user, 'doctors_view', 'doctors_edit', 'payroll_view') || canAction(user, 'doctors_view', 'doctors_delete'))}
      />

      {/* Модальные окна теперь управляются через ModalManager */}
    </div>
  );
};

export default DoctorsPage;
