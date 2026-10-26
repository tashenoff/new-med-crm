import React, { useState, useEffect, useId } from 'react';
import { flushSync } from 'react-dom';
import Modal from './Modal';
import PermissionEditor from '../staff/PermissionEditor';

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
  const [activeTab, setActiveTab] = useState('profile');
  const tabId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [resetPasswordMode, setResetPasswordMode] = useState(false);
  const [resetPasswordData, setResetPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState('');

  useEffect(() => {
    setActiveTab('profile');
    setResetPasswordMode(false);
    setResetPasswordData({ newPassword: '', confirmPassword: '' });
    setResetPasswordError('');
    setResetPasswordSuccess('');
    setShowPassword(false);
  }, [isOpen, editingItem?.id]);

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
          <div className="border-t border-curai-border pt-4 mt-4">
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
                  className="px-4 py-2 bg-curai-warning text-white rounded-md hover:bg-curai-warning transition-colors text-sm"
                >
                  <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Сбросить пароль
                </button>
                <p className="text-xs text-curai-muted mt-2">
                  Установите новый пароль для сотрудника без знания текущего
                </p>
              </div>
            ) : (
              <div className="bg-curai-warningBg border border-curai-warning rounded-md p-4">
                <h4 className="text-sm font-medium text-curai-warning mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  Сброс пароля: {editingItem.full_name}
                </h4>

                {resetPasswordError && (
                  <div role="alert" className="bg-curai-negativeBg border border-curai-negative text-curai-negative px-3 py-2 rounded mb-3 text-sm">
                    {resetPasswordError}
                  </div>
                )}

                {resetPasswordSuccess && (
                  <div className="bg-curai-positiveBg border border-curai-positive text-curai-positive px-3 py-2 rounded mb-3 text-sm">
                    {resetPasswordSuccess}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-curai-ink mb-1">
                      Новый пароль
                    </label>
                    <input
                      type="password"
                      value={resetPasswordData.newPassword}
                      onChange={(e) => setResetPasswordData({ ...resetPasswordData, newPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus focus:border-transparent"
                      placeholder="Минимум 6 символов"
                      minLength={6}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-curai-ink mb-1">
                      Подтверждение пароля
                    </label>
                    <input
                      type="password"
                      value={resetPasswordData.confirmPassword}
                      onChange={(e) => setResetPasswordData({ ...resetPasswordData, confirmPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus focus:border-transparent"
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
                      className="px-3 py-2 border border-curai-control rounded-md text-curai-ink hover:bg-curai-subtle transition-colors text-sm"
                      disabled={resetPasswordLoading}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      disabled={resetPasswordLoading}
                      className="px-3 py-2 bg-curai-warning text-white rounded-md hover:bg-curai-warning transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
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
      subheader={editingItem && (
        <nav className="curai-patient-tabs px-4 pt-2" role="tablist" aria-label="Разделы сотрудника">
          {[['profile', 'Профиль'], ['permissions', 'Права']].map(([tab, label]) => (
            <button
              key={tab}
              id={`${tabId}-${tab}-tab`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`${tabId}-${tab}-panel`}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 'profile'
                  : event.key === 'End' ? 'permissions'
                  : tab === 'profile' ? 'permissions' : 'profile';
                setActiveTab(next);
                document.getElementById(`${tabId}-${next}-tab`)?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
    >
      <form onSubmit={handleSubmit} className="space-y-4" onInvalidCapture={(event) => {
        const panel = event.target.closest('[data-staff-tab]');
        if (editingItem && panel?.hidden) {
          event.preventDefault();
          flushSync(() => setActiveTab(panel.dataset.staffTab));
          event.target.reportValidity();
        }
      }}>
        {errorMessage && (
          <div className="bg-curai-negativeBg border border-curai-negative text-curai-negative px-4 py-3 rounded relative">
            {errorMessage}
          </div>
        )}

        <div
          id={`${tabId}-profile-panel`}
          role={editingItem ? 'tabpanel' : undefined}
          aria-labelledby={editingItem ? `${tabId}-profile-tab` : undefined}
          data-staff-tab="profile"
          hidden={Boolean(editingItem) && activeTab !== 'profile'}
          className="space-y-4"
        >
        {/* Информация о враче (только при редактировании врача) */}
        {isEditingDoctor && (
          <div className="bg-curai-selected border border-curai-control rounded-md p-4 mb-4">
            <p className="text-sm text-curai-blue">
              <strong>Врач:</strong> {editingItem.full_name}<br />
              <strong>Специальность:</strong> {editingItem.specialty || 'Не указана'}<br />
              <strong>Email:</strong> {editingItem.email || 'Не указан'}
            </p>
            <p className="text-xs text-curai-blue mt-2">
              Базовые данные врача редактируются в разделе "Врачи"
            </p>
          </div>
        )}

        {/* Поле логина для врачей (доступно при редактировании) */}
        {isEditingDoctor && (
          <div>
            <label className="block text-sm font-medium text-curai-ink mb-1">
              Логин (для входа)
            </label>
            <input
              type="text"
              value={staffForm.login || ''}
              onChange={(e) => setStaffForm({ ...staffForm, login: e.target.value })}
              className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus focus:border-transparent"
              placeholder="myusername"
            />
            <p className="text-xs text-curai-muted mt-1">
              Вход возможен как по email, так и по логину
            </p>
          </div>
        )}

        {/* Для врачей не показываем основные поля (кроме логина) */}
        {!isEditingDoctor && (
          <>
            {/* Полное имя */}
            <div>
              <label className="block text-sm font-medium text-curai-ink mb-1">
                Полное имя <span className="text-curai-negative">*</span>
              </label>
              <input
                type="text"
                value={staffForm.full_name || ''}
                onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })}
                className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus focus:border-transparent"
                placeholder="Иванов Иван Иванович"
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-curai-ink mb-1">
                Email
              </label>
              <input
                type="email"
                value={staffForm.email || ''}
                onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus focus:border-transparent"
                placeholder="user@example.com"
                disabled={editingItem} // Email нельзя изменить при редактировании
              />
              {editingItem && (
                <p className="text-xs text-curai-muted mt-1">
                  Email нельзя изменить после создания
                </p>
              )}
            </div>

            {/* Логин (для входа вместо email) */}
            <div>
              <label className="block text-sm font-medium text-curai-ink mb-1">
                Логин (для входа)
              </label>
              <input
                type="text"
                value={staffForm.login || ''}
                onChange={(e) => setStaffForm({ ...staffForm, login: e.target.value })}
                className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus focus:border-transparent"
                placeholder="myusername"
              />
              <p className="text-xs text-curai-muted mt-1">
                Можно войти как по email, так и по логину
              </p>
            </div>


            {/* Пароль (только при создании) */}
            {!editingItem && (
              <div>
                <label className="block text-sm font-medium text-curai-ink mb-1">
                  Пароль <span className="text-curai-negative">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={staffForm.password || ''}
                    onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                    className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus focus:border-transparent pr-10"
                    placeholder="Минимум 6 символов"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-curai-muted hover:text-curai-ink"
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
                <p className="text-xs text-curai-muted mt-1">
                  Пароль должен содержать минимум 6 символов
                </p>
              </div>
            )}


            {/* Телефон */}
            <div>
              <label className="block text-sm font-medium text-curai-ink mb-1">
                Телефон
              </label>
              <input
                type="tel"
                value={staffForm.phone || ''}
                onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus focus:border-transparent"
                placeholder="+7 (777) 123-45-67"
              />
            </div>

          </>
        )}

        {editingItem && resetPasswordSection}
        </div>

        <div
          id={`${tabId}-permissions-panel`}
          role={editingItem ? 'tabpanel' : undefined}
          aria-labelledby={editingItem ? `${tabId}-permissions-tab` : undefined}
          data-staff-tab="permissions"
          hidden={Boolean(editingItem) && activeTab !== 'permissions'}
          className="space-y-4"
        >
          {!isEditingDoctor && (<>
            <div>
              <label className="block text-sm font-medium text-curai-ink mb-1">
                Роль <span className="text-curai-negative">*</span>
              </label>
              <select
                value={staffForm.role || ''}
                onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus focus:border-transparent"
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

          </>)}
        {/* Дополнительные права доступа */}
        {staffForm.role && <PermissionEditor form={staffForm} onChange={setStaffForm} />}

        </div>

        {/* Кнопки */}
        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-curai-control rounded-md text-curai-ink hover:bg-curai-subtle transition-colors"
            disabled={loading}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-curai-blue text-white rounded-md hover:bg-curai-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
