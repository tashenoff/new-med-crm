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
  onSave,
  onResetPassword
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [resetPasswordMode, setResetPasswordMode] = useState(false);
  const [resetPasswordData, setResetPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState('');

  // ВАЖНО: Роль "Врач" исключена - врачи создаются только в разделе "Врачи"
  const roleOptions = [
    { value: 'super_admin', label: 'Супер Администратор' },
    { value: 'admin', label: 'Администратор' },
    { value: 'marketer', label: 'Маркетолог' }
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(e, staffForm);
  };

  // Проверяем, редактируем ли мы врача
  const isEditingDoctor = editingItem && editingItem.type === 'doctor';

  // Обработчик сброса пароля
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetPasswordError('');
    setResetPasswordSuccess('');

    // Валидация
    if (!resetPasswordData.newPassword || !resetPasswordData.confirmPassword) {
      setResetPasswordError('Все поля обязательны для заполнения');
      return;
    }

    if (resetPasswordData.newPassword !== resetPasswordData.confirmPassword) {
      setResetPasswordError('Новый пароль и подтверждение не совпадают');
      return;
    }

    if (resetPasswordData.newPassword.length < 6) {
      setResetPasswordError('Пароль должен содержать минимум 6 символов');
      return;
    }

    setResetPasswordLoading(true);

    try {
      const result = await onResetPassword(editingItem.id, resetPasswordData.newPassword);
      
      if (result.success) {
        setResetPasswordSuccess('✅ Пароль успешно сброшен!');
        setResetPasswordData({ newPassword: '', confirmPassword: '' });
        setTimeout(() => {
          setResetPasswordMode(false);
          setResetPasswordSuccess('');
        }, 2000);
      } else {
        setResetPasswordError(result.error || 'Ошибка при сбросе пароля');
      }
    } catch (err) {
      setResetPasswordError('Ошибка сети. Попробуйте еще раз.');
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const resetPasswordSection = (
          <div className="border-t border-gray-200 pt-4 mt-4">
            {!resetPasswordMode ? (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setResetPasswordMode(true);
                    setResetPasswordError('');
                    setResetPasswordSuccess('');
                    setResetPasswordData({ newPassword: '', confirmPassword: '' });
                  }}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm"
                >
                  <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Сбросить пароль
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  Установите новый пароль для сотрудника без знания текущего
                </p>
              </div>
            ) : (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-orange-900 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Сброс пароля: {editingItem.full_name}
                </h4>

                {resetPasswordError && (
                  <div className="bg-red-100 border border-red-300 text-red-700 px-3 py-2 rounded mb-3 text-sm">
                    {resetPasswordError}
                  </div>
                )}

                {resetPasswordSuccess && (
                  <div className="bg-green-100 border border-green-300 text-green-700 px-3 py-2 rounded mb-3 text-sm">
                    {resetPasswordSuccess}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Новый пароль
                    </label>
                    <input
                      type="password"
                      value={resetPasswordData.newPassword}
                      onChange={(e) => setResetPasswordData({ ...resetPasswordData, newPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="Минимум 6 символов"
                      minLength={6}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Подтверждение пароля
                    </label>
                    <input
                      type="password"
                      value={resetPasswordData.confirmPassword}
                      onChange={(e) => setResetPasswordData({ ...resetPasswordData, confirmPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="Повторите новый пароль"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setResetPasswordMode(false);
                        setResetPasswordError('');
                        setResetPasswordSuccess('');
                        setResetPasswordData({ newPassword: '', confirmPassword: '' });
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm"
                      disabled={resetPasswordLoading}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      disabled={resetPasswordLoading}
                      className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      {resetPasswordLoading && (
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                      {resetPasswordLoading ? 'Сброс...' : 'Сбросить пароль'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );


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

        {/* Поле логина для врачей (доступно при редактировании) */}
        {isEditingDoctor && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Логин (для входа)
            </label>
            <input
              type="text"
              value={staffForm.login || ''}
              onChange={(e) => setStaffForm({ ...staffForm, login: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="myusername"
            />
            <p className="text-xs text-gray-500 mt-1">
              Вход возможен как по email, так и по логину
            </p>
          </div>
        )}

        {editingItem && resetPasswordSection}

        {/* Для врачей не показываем основные поля (кроме логина) */}
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

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={staffForm.email || ''}
                onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="user@example.com"
                disabled={editingItem} // Email нельзя изменить при редактировании
              />
              {editingItem && (
                <p className="text-xs text-gray-500 mt-1">
                  Email нельзя изменить после создания
                </p>
              )}
            </div>

            {/* Логин (для входа вместо email) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Логин (для входа)
              </label>
              <input
                type="text"
                value={staffForm.login || ''}
                onChange={(e) => setStaffForm({ ...staffForm, login: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="myusername"
              />
              <p className="text-xs text-gray-500 mt-1">
                Можно войти как по email, так и по логину
              </p>
            </div>

            {editingItem && resetPasswordSection}

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
            
            {/* Чекбокс "Все" */}
            <div className="mb-4 pb-3 border-b border-gray-200">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="select_all_permissions"
                  checked={
                    staffForm.custom_permissions?.length === 9 &&
                    ['patients_view', 'patients_edit', 'doctors_view', 'calendar_view', 
                     'crm_view', 'warehouse_view', 'directory_view', 'finance_view', 'statistics_view']
                    .every(p => staffForm.custom_permissions?.includes(p))
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      // Выбрать все права
                      setStaffForm({ 
                        ...staffForm, 
                        custom_permissions: [
                          'patients_view', 'patients_edit', 'doctors_view', 'calendar_view',
                          'crm_view', 'warehouse_view', 'directory_view', 'finance_view', 'statistics_view'
                        ]
                      });
                    } else {
                      // Снять все права
                      setStaffForm({ ...staffForm, custom_permissions: [] });
                    }
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="select_all_permissions" className="ml-2 text-sm font-medium text-gray-900">
                  Все
                </label>
              </div>
            </div>
            
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
