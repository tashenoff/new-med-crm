import React, { useState, useEffect } from 'react';
import { useDoctors } from '../hooks/useDoctors';
import { useGlobalRefresh } from '../hooks/useGlobalRefresh';
import { useModal } from '../context/ModalContext';
import DoctorsView from '../components/doctors/DoctorsView';

const DoctorsPage = ({ user }) => {
  // Data hook
  const doctorsHook = useDoctors();
  const { refreshTriggers } = useGlobalRefresh();
  
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
      doctorForm: {
        full_name: '',
        specialty: '',
        phone: '',
        calendar_color: '#3B82F6',
        payment_type: 'percentage',
        payment_value: 0,
        currency: 'KZT',
        services: []
      },
      setDoctorForm: (form) => updateModalProps('doctor', { doctorForm: form }),
      editingItem: null,
      loading,
      errorMessage,
      onSave: handleSaveDoctor
    });
  };

  const handleEditDoctor = (doctor) => {
    openModal('doctor', {
      doctorForm: {
        full_name: doctor.full_name || '',
        specialty: doctor.specialty || '',
        phone: doctor.phone || '',
        calendar_color: doctor.calendar_color || '#3B82F6',
        payment_type: doctor.payment_type || 'percentage',
        payment_value: doctor.payment_value || 0,
        currency: doctor.currency || 'KZT',
        services: doctor.services || []
      },
      setDoctorForm: (form) => updateModalProps('doctor', { doctorForm: form }),
      editingItem: doctor,
      loading,
      errorMessage,
      onSave: handleSaveDoctor
    });
  };

  const handleSaveDoctor = async (e, formData = null) => {
    e.preventDefault();
    setLoading(true);
    
    // Получаем данные из модального контекста или используем переданные данные
    const modalProps = getModalProps('doctor');
    const { editingItem } = modalProps;
    const doctorForm = formData || modalProps.doctorForm;
    
    try {
      console.log('🔍 ФИНАЛЬНЫЕ ДАННЫЕ ДЛЯ ОТПРАВКИ НА API:');
      console.log('  - formData (переданные из модала):', formData);
      console.log('  - modalProps.doctorForm:', modalProps.doctorForm);
      console.log('  - Финальный doctorForm:', doctorForm);
      console.log('  - services в финальном doctorForm:', doctorForm?.services);
      console.log('  - payment_mode в финальном doctorForm:', doctorForm?.payment_mode);
      
      // Временно убираем жесткую проверку для диагностики
      // if (!doctorForm.full_name || !doctorForm.specialty) {
      //   throw new Error('Заполните обязательные поля: ФИО и Специальность');
      // }
      
      // Очищаем данные от лишних полей, которых нет в API
      const cleanDoctorData = {
        full_name: doctorForm?.full_name?.trim() || '',
        specialty: doctorForm?.specialty?.trim() || '',
        phone: doctorForm.phone || null,
        calendar_color: doctorForm.calendar_color || '#3B82F6',
        payment_type: doctorForm.payment_type || 'percentage',
        payment_value: (doctorForm.payment_value && doctorForm.payment_value !== '') ? parseFloat(doctorForm.payment_value) : 0.0,
        currency: doctorForm.currency || 'KZT',
        services: doctorForm.services || []
      };
      
      console.log('🧹 Очищенные данные врача:', cleanDoctorData);
      
      let result;
      if (editingItem) {
        const doctorId = editingItem._id || editingItem.id;
        console.log('📝 Обновляем врача ID:', doctorId);
        result = await doctorsHook.updateDoctor(doctorId, cleanDoctorData);
      } else {
        console.log('➕ Создаем нового врача');
        result = await doctorsHook.createDoctor(cleanDoctorData);
      }
      
      if (!result.success) {
        throw new Error(result.error);
      }

      closeModal('doctor');
    } catch (error) {
      console.error('Error saving doctor:', error);
      setErrorMessage('Ошибка при сохранении врача');
    }
    setLoading(false);
  };

  const handleDeleteDoctor = async (id) => {
    if (window.confirm('Вы уверены, что хотите деактивировать этого врача?')) {
      try {
        console.log('Deactivating doctor:', id);
        const result = await doctorsHook.deleteDoctor(id);
        
        if (!result.success) {
          throw new Error(result.error);
        }
        
        console.log('Doctor deactivated successfully');
      } catch (error) {
        console.error('Error deleting doctor:', error);
        setErrorMessage('Ошибка при деактивации врача');
      }
    }
  };

  const handleCloseDoctorModal = () => {
    setShowDoctorModal(false);
    setEditingItem(null);
    setDoctorForm({
      full_name: '',
      specialty: '',
      phone: '',
      email: '',
      calendar_color: '#3B82F6',
      payment_type: 'percentage',
      payment_value: 0,
      currency: 'KZT',
      services: []
    });
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

      {/* Doctors View */}
      <DoctorsView
        doctors={doctorsHook.doctors}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onAddDoctor={handleAddDoctor}
        onEditDoctor={handleEditDoctor}
        onDeleteDoctor={handleDeleteDoctor}
        canManage={user?.role === 'admin'}
      />

      {/* Модальные окна теперь управляются через ModalManager */}
    </div>
  );
};

export default DoctorsPage;
