import React, { useState } from 'react';
import Modal from './Modal';

const StaffModal = ({
  isOpen,
  onClose,
  staffForm,
  setStaffForm,
  editingItem,
  loading,
  errorMessage,
  onSave
}) => {
  const [showPassword, setShowPassword] = useState(false);

  // ВАЖНО: Роль "Врач" исключена - врачи создаются только в разделе "Врачи"
  const roleOptions = [
    { value: 'super_admin', label: 'Супер Администратор' },
    { value: 'admin', label: 'Администратор' },
    { value: 'marketer', label: 'Маркетолог' },
    { value: 'administrator', label: 'Администратор клиники' }
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(e, staffForm);
  };

  // Проверяем, редактируем ли мы врача
  const isEditingDoctor = editingItem && editingItem.type === 'doctor';

  return (
    <Modal
      show={isOpen}
      onClose={onClose}
      title={isEditingDoctor ? `Права доступа: ${editingItem.full_name}` : (editingItem ? 'Редактировать сотрудника' : 'Добавить сотрудника')}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
            {errorMessage}
          </div>
        )}

        {/* Информация о враче (только при редактировании врача) */}
        {isEditingDoctor && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-blue-800">
              <strong>Врач:</strong> {editingItem.full_name}<br />
              <strong>Специальность:</strong> {editingItem.specialty || 'Не указана'}<br />
              <strong>Email:</strong> {editingItem.email || 'Не указан'}
            </p>
            <p className="text-xs text-blue-600 mt-2">
              Базовые данные врача редактируются в разделе "Врачи"
            </p>
          </div>
        )}

        {/* Для врачей не показываем основные поля */}
        {!isEditingDoctor && (
          <>
            {/* Полное имя */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Полное имя <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={staffForm.full_name || ''}
                onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Иванов Иван Иванович"
                required
              />
            </div>

            {/* Email (логин) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email (логин) <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={staffForm.email || ''}
                onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="user@example.com"
                required
                disabled={editingItem} // Email нельзя изменить при редактировании
              />
              {editingItem && (
                <p className="text-xs text-gray-500 mt-1">
                  Email нельзя изменить после создания
                </p>
              )}
            </div>

            {/* Пароль (только при создании) */}
            {!editingItem && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Пароль <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={staffForm.password || ''}
                    onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                    placeholder="Минимум 6 символов"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Пароль должен содержать минимум 6 символов
                </p>
              </div>
            )}

            {/* Роль */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Роль <span className="text-red-500">*</span>
              </label>
              <select
                value={staffForm.role || ''}
                onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Выберите роль</option>
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Телефон */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Телефон
              </label>
              <input
                type="tel"
                value={staffForm.phone || ''}
                onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="+7 (777) 123-45-67"
              />
            </div>

            {/* Информация о правах */}
            {staffForm.role && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">
                  Базовые права для роли "{roleOptions.find(r => r.value === staffForm.role)?.label}"
                </h4>
                <p className="text-xs text-blue-700">
                  {staffForm.role === 'super_admin' && 'Полный доступ ко всем функциям системы'}
                  {staffForm.role === 'admin' && 'Управление пациентами, врачами, CRM, складом, справочниками, просмотр финансов'}
                  {staffForm.role === 'doctor' && 'Работа с пациентами, доступ к календарю, просмотр справочников'}
                  {staffForm.role === 'marketer' && 'Просмотр пациентов, полный доступ к CRM, просмотр статистики'}
                  {staffForm.role === 'administrator' && 'Просмотр пациентов, доступ к календарю, просмотр справочников'}
                </p>
              </div>
            )}
          </>
        )}

        {/* Дополнительные права доступа */}
        {staffForm.role && (
          <div className="border border-gray-300 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">
              Дополнительные права доступа
            </h4>
            <p className="text-xs text-gray-600 mb-3">
              Выберите разделы, к которым у сотрудника будет доступ
            </p>
            
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {/* Пациенты */}
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="patients_view"
                    checked={staffForm.custom_permissions?.includes('patients_view') || false}
                    onChange={(e) => {
                      const perms = staffForm.custom_permissions || [];
                      if (e.target.checked) {
                        setStaffForm({ ...staffForm, custom_permissions: [...perms, 'patients_view'] });
                      } else {
                        setStaffForm({ ...staffForm, custom_permissions: perms.filter(p => p !== 'patients_view') });
                      }
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="patients_view" className="ml-2 text-sm text-gray-700">
                    Просмотр пациентов
                  </label>
                </div>
                <div className="flex items-center ml-6">
                  <input
                    type="checkbox"
                    id="patients_edit"
                    checked={staffForm.custom_permissions?.includes('patients_edit') || false}
                    onChange={(e) => {
                      const perms = staffForm.custom_permissions || [];
                      if (e.target.checked) {
                        setStaffForm({ ...staffForm, custom_permissions: [...perms, 'patients_edit'] });
                      } else {
                        setStaffForm({ ...staffForm, custom_permissions: perms.filter(p => p !== 'patients_edit') });
                      }
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="patients_edit" className="ml-2 text-sm text-gray-600">
                    Редактирование пациентов
                  </label>
                </div>
              </div>

              {/* Врачи */}
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="doctors_view"
                    checked={staffForm.custom_permissions?.includes('doctors_view') || false}
                    onChange={(e) => {
                      const perms = staffForm.custom_permissions || [];
                      if (e.target.checked) {
                        setStaffForm({ ...staffForm, custom_permissions: [...perms, 'doctors_view'] });
                      } else {
                        setStaffForm({ ...staffForm, custom_permissions: perms.filter(p => p !== 'doctors_view') });
                      }
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="doctors_view" className="ml-2 text-sm text-gray-700">
                    Просмотр врачей
                  </label>
                </div>
              </div>

              {/* Календарь */}
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="calendar_view"
                    checked={staffForm.custom_permissions?.includes('calendar_view') || false}
                    onChange={(e) => {
                      const perms = staffForm.custom_permissions || [];
                      if (e.target.checked) {
                        setStaffForm({ ...staffForm, custom_permissions: [...perms, 'calendar_view'] });
                      } else {
                        setStaffForm({ ...staffForm, custom_permissions: perms.filter(p => p !== 'calendar_view') });
                      }
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="calendar_view" className="ml-2 text-sm text-gray-700">
                    Доступ к календарю
                  </label>
                </div>
              </div>

              {/* CRM */}
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="crm_view"
                    checked={staffForm.custom_permissions?.includes('crm_view') || false}
                    onChange={(e) => {
                      const perms = staffForm.custom_permissions || [];
                      if (e.target.checked) {
                        setStaffForm({ ...staffForm, custom_permissions: [...perms, 'crm_view'] });
                      } else {
                        setStaffForm({ ...staffForm, custom_permissions: perms.filter(p => p !== 'crm_view') });
                      }
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="crm_view" className="ml-2 text-sm text-gray-700">
                    Доступ к CRM
                  </label>
                </div>
              </div>

              {/* Склад */}
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="warehouse_view"
                    checked={staffForm.custom_permissions?.includes('warehouse_view') || false}
                    onChange={(e) => {
                      const perms = staffForm.custom_permissions || [];
                      if (e.target.checked) {
                        setStaffForm({ ...staffForm, custom_permissions: [...perms, 'warehouse_view'] });
                      } else {
                        setStaffForm({ ...staffForm, custom_permissions: perms.filter(p => p !== 'warehouse_view') });
                      }
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="warehouse_view" className="ml-2 text-sm text-gray-700">
                    Доступ к складу
                  </label>
                </div>
              </div>

              {/* Справочники */}
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="directory_view"
                    checked={staffForm.custom_permissions?.includes('directory_view') || false}
                    onChange={(e) => {
                      const perms = staffForm.custom_permissions || [];
                      if (e.target.checked) {
                        setStaffForm({ ...staffForm, custom_permissions: [...perms, 'directory_view'] });
                      } else {
                        setStaffForm({ ...staffForm, custom_permissions: perms.filter(p => p !== 'directory_view') });
                      }
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="directory_view" className="ml-2 text-sm text-gray-700">
                    Просмотр справочников
                  </label>
                </div>
              </div>

              {/* Финансы */}
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="finance_view"
                    checked={staffForm.custom_permissions?.includes('finance_view') || false}
                    onChange={(e) => {
                      const perms = staffForm.custom_permissions || [];
                      if (e.target.checked) {
                        setStaffForm({ ...staffForm, custom_permissions: [...perms, 'finance_view'] });
                      } else {
                        setStaffForm({ ...staffForm, custom_permissions: perms.filter(p => p !== 'finance_view') });
                      }
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="finance_view" className="ml-2 text-sm text-gray-700">
                    Просмотр финансов
                  </label>
                </div>
              </div>

              {/* Статистика */}
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="statistics_view"
                    checked={staffForm.custom_permissions?.includes('statistics_view') || false}
                    onChange={(e) => {
                      const perms = staffForm.custom_permissions || [];
                      if (e.target.checked) {
                        setStaffForm({ ...staffForm, custom_permissions: [...perms, 'statistics_view'] });
                      } else {
                        setStaffForm({ ...staffForm, custom_permissions: perms.filter(p => p !== 'statistics_view') });
                      }
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="statistics_view" className="ml-2 text-sm text-gray-700">
                    Просмотр статистики
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Кнопки */}
        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            disabled={loading}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            disabled={loading}
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {editingItem ? 'Сохранить' : 'Добавить'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default StaffModal;
