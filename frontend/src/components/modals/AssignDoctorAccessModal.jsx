import { LoadingSpinner } from '../common/LoadingIndicator';
import React, { useState } from 'react';
import Modal from './Modal';

const AssignDoctorAccessModal = ({
  isOpen,
  onClose,
  doctor,
  onAssign,
  loading
}) => {
  const [email, setEmail] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if ((!email && !login) || !password) {
      setError('Заполните email или логин и пароль');
      return;
    }

    if (password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов');
      return;
    }

    const result = await onAssign(doctor.id, email, password, login);
    if (result.success) {
      setEmail('');
      setLogin('');
      setPassword('');
      onClose();
    } else {
      setError(result.error || 'Ошибка при назначении доступа');
    }
  };

  const handleClose = () => {
    setEmail('');
    setLogin('');
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <Modal
      show={isOpen}
      onClose={handleClose}
      title={`Назначить доступ врачу: ${doctor?.full_name || ''}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-curai-negativeBg border border-curai-negative text-curai-negative px-4 py-3 rounded relative">
            {error}
          </div>
        )}

        <div className="bg-curai-selected border border-curai-control rounded-md p-4 mb-4">
          <p className="text-sm text-curai-blue">
            <strong>Врач:</strong> {doctor?.full_name}<br />
            <strong>Специальность:</strong> {doctor?.specialty || 'Не указана'}<br />
            <strong>Телефон:</strong> {doctor?.phone || 'Не указан'}
          </p>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-curai-ink mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus focus:border-transparent"
            placeholder="doctor@example.com"
            autoFocus
          />
          <p className="text-xs text-curai-muted mt-1">
            Email для входа (необязательно, если указан логин)
          </p>
        </div>

        {/* Логин */}
        <div>
          <label className="block text-sm font-medium text-curai-ink mb-1">
            Логин (для входа)
          </label>
          <input
            type="text"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            className="w-full px-3 py-2 border border-curai-control rounded-md focus:ring-2 focus:ring-curai-focus focus:border-transparent"
            placeholder="myusername"
          />
          <p className="text-xs text-curai-muted mt-1">
            Можно войти как по email, так и по логину
          </p>
        </div>

        {/* Пароль */}
        <div>
          <label className="block text-sm font-medium text-curai-ink mb-1">
            Пароль <span className="text-curai-negative">*</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

        {/* Кнопки */}
        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 border border-curai-control rounded-md text-curai-ink hover:bg-curai-subtle transition-colors"
            disabled={loading}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-curai-positive text-white rounded-md hover:bg-curai-positive transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            disabled={loading}
          >
            {loading && (
              <LoadingSpinner size="sm" />
            )}
            Назначить доступ
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AssignDoctorAccessModal;
