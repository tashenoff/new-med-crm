import React, { useState, useEffect } from 'react';
import { useStaff } from '../hooks/useStaff';
import StaffView from '../components/staff/StaffView';
import StaffModal from '../components/modals/StaffModal';
import AssignDoctorAccessModal from '../components/modals/AssignDoctorAccessModal';

const StaffManagementPage = ({ user }) => {
  // Data hook
  const staffHook = useStaff();

  // UI состояния
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showDoctorAccessModal, setShowDoctorAccessModal] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [staffForm, setStaffForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: '',
    phone: '',
    custom_permissions: []
  });

  // Загрузка данных при монтировании - включая врачей
  useEffect(() => {
    staffHook.fetchAllPersonnel();
  }, []);

  // Автоматическое скрытие ошибок через 5 секунд
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Обработчики персонала
  const handleAddStaff = () => {
    setEditingItem(null);
    setStaffForm({
      full_name: '',
      email: '',
      password: '',
      role: '',
      phone: '',
      custom_permissions: []
    });
    setShowStaffModal(true);
  };

  const handleEditStaff = async (staffMember) => {
    setEditingItem(staffMember);
    
    // Для врачей загружаем custom_permissions из staff коллекции
    if (staffMember.type === 'doctor') {
      const result = await staffHook.fetchStaffMember(staffMember.id);
      setStaffForm({
        full_name: staffMember.full_name || '',
        email: staffMember.email || '',
        role: staffMember.role || 'doctor',
        phone: staffMember.phone || '',
        custom_permissions: result.data?.custom_permissions || []
      });
    } else {
      setStaffForm({
        full_name: staffMember.full_name || '',
        email: staffMember.email || '',
        role: staffMember.role || '',
        phone: staffMember.phone || '',
        custom_permissions: staffMember.custom_permissions || []
      });
    }
    
    setShowStaffModal(true);
  };

  const handleSaveStaff = async (e, formData = null) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    const dataToSave = formData || staffForm;

    try {
      let result;
      if (editingItem) {
        // Для врачей обновляем только custom_permissions
        if (editingItem.type === 'doctor') {
          const updateData = {
            custom_permissions: dataToSave.custom_permissions || []
          };
          result = await staffHook.updateStaffMember(editingItem.id, updateData);
        } else {
          // Для обычного персонала обновляем основные данные
          const updateData = {
            full_name: dataToSave.full_name,
            role: dataToSave.role,
            phone: dataToSave.phone,
            custom_permissions: dataToSave.custom_permissions || []
          };
          result = await staffHook.updateStaffMember(editingItem.id, updateData);
        }
      } else {
        // При создании отправляем все данные включая пароль
        result = await staffHook.createStaffMember(dataToSave);
      }

      if (!result.success) {
        throw new Error(result.error);
      }

      // Обновляем список персонала
      await staffHook.fetchAllPersonnel();
      setShowStaffModal(false);
      setEditingItem(null);
      setStaffForm({
        full_name: '',
        email: '',
        password: '',
        role: '',
        phone: '',
        custom_permissions: []
      });
      
      const messageType = editingItem?.type === 'doctor' ? 'Права врача обновлены' : `Сотрудник ${editingItem ? 'обновлен' : 'создан'}`;
      setErrorMessage(`✅ ${messageType} успешно!`);
      setTimeout(() => setErrorMessage(null), 3000);
    } catch (error) {
      console.error('Error saving staff member:', error);
      setErrorMessage(error.message || 'Ошибка при сохранении сотрудника');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStaff = async (id) => {
    if (window.confirm('Вы уверены, что хотите удалить этого сотрудника?')) {
      try {
        const result = await staffHook.deleteStaffMember(id);

        if (!result.success) {
          throw new Error(result.error);
        }

        // Обновляем список персонала
        await staffHook.fetchStaff();
        setErrorMessage('✅ Сотрудник удален успешно!');
        setTimeout(() => setErrorMessage(null), 3000);
      } catch (error) {
        console.error('Error deleting staff member:', error);
        setErrorMessage(error.message || 'Ошибка при удалении сотрудника');
      }
    }
  };

  const handleCloseStaffModal = () => {
    setShowStaffModal(false);
    setEditingItem(null);
    setStaffForm({
      full_name: '',
      email: '',
      password: '',
      role: '',
      phone: ''
    });
    setErrorMessage(null);
  };

  // Обработчики для врачей
  const handleAssignAccess = (doctor) => {
    setSelectedDoctor(doctor);
    setShowDoctorAccessModal(true);
  };

  const handleRevokeAccess = async (doctor) => {
    if (window.confirm(`Вы уверены, что хотите отозвать доступ у врача ${doctor.full_name}?`)) {
      setLoading(true);
      const result = await staffHook.revokeDoctorAccess(doctor.id);
      setLoading(false);
      
      if (result.success) {
        setErrorMessage('✅ Доступ врача отозван успешно!');
        setTimeout(() => setErrorMessage(null), 3000);
      } else {
        setErrorMessage(result.error || 'Ошибка при отзыве доступа');
      }
    }
  };

  const handleAssignAccessSubmit = async (doctorId, email, password) => {
    return await staffHook.assignAccessToDoctor(doctorId, email, password);
  };

  // Проверка прав доступа
  const canManage = user?.role === 'admin' || user?.role === 'super_admin';

  return (
    <div className="space-y-6">
      {/* Error/Success Message */}
      {errorMessage && (
        <div
          className={`border px-4 py-3 rounded mb-4 ${
            errorMessage.includes('✅')
              ? 'bg-green-100 border-green-400 text-green-700'
              : 'bg-red-100 border-red-400 text-red-700'
          }`}
        >
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

      {/* Staff View */}
      <StaffView
        staff={staffHook.staff}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filterRole={filterRole}
        setFilterRole={setFilterRole}
        onAddStaff={handleAddStaff}
        onEditStaff={handleEditStaff}
        onDeleteStaff={handleDeleteStaff}
        onAssignAccess={handleAssignAccess}
        onRevokeAccess={handleRevokeAccess}
        canManage={canManage}
      />

      {/* Staff Modal */}
      <StaffModal
        isOpen={showStaffModal}
        onClose={handleCloseStaffModal}
        staffForm={staffForm}
        setStaffForm={setStaffForm}
        editingItem={editingItem}
        loading={loading}
        errorMessage={errorMessage}
        onSave={handleSaveStaff}
      />

      {/* Doctor Access Modal */}
      <AssignDoctorAccessModal
        isOpen={showDoctorAccessModal}
        onClose={() => {
          setShowDoctorAccessModal(false);
          setSelectedDoctor(null);
        }}
        doctor={selectedDoctor}
        onAssign={handleAssignAccessSubmit}
        loading={loading}
      />
    </div>
  );
};

export default StaffManagementPage;
