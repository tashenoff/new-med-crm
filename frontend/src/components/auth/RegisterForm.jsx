import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

function RegisterForm({ onSwitchToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('patient');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  // Проверка заполненности полей
  const isFormValid = fullName.trim() !== '' && email.trim() !== '' && password.trim() !== '' && confirmPassword.trim() !== '' && password === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      setLoading(false);
      return;
    }

    const result = await register(email, password, fullName, role);
    if (!result.success) {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{
      background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #60a5fa 100%)',
      backgroundAttachment: 'fixed'
    }}>
      <div className="max-w-md w-full space-y-8">
        <div className="backdrop-blur-xl bg-white/10 rounded-2xl p-8 border border-white/20 shadow-2xl">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
              Регистрация
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600 dark:text-sky-100">
              Создайте новый аккаунт
            </p>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-100/80 backdrop-blur-sm border border-red-400/50 text-red-700 px-4 py-3 rounded-lg shadow-sm">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="fullName" className="sr-only">Полное имя</label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="appearance-none rounded-lg relative block w-full px-4 py-3 bg-white/90 backdrop-blur-sm border border-white/30 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 focus:bg-white/95 transition-all duration-200 shadow-sm"
                placeholder="Полное имя"
              />
            </div>
            <div>
              <label htmlFor="email" className="sr-only">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-lg relative block w-full px-4 py-3 bg-white/90 backdrop-blur-sm border border-white/30 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 focus:bg-white/95 transition-all duration-200 shadow-sm"
                placeholder="Email"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Пароль</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-lg relative block w-full px-4 py-3 bg-white/90 backdrop-blur-sm border border-white/30 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 focus:bg-white/95 transition-all duration-200 shadow-sm"
                placeholder="Пароль"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">Подтверждение пароля</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none rounded-lg relative block w-full px-4 py-3 bg-white/90 backdrop-blur-sm border border-white/30 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 focus:bg-white/95 transition-all duration-200 shadow-sm"
                placeholder="Подтверждение пароля"
              />
            </div>
            <div>
              <label htmlFor="role" className="sr-only">Роль</label>
              <select
                id="role"
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="appearance-none rounded-lg relative block w-full px-4 py-3 bg-white/90 backdrop-blur-sm border border-white/30 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 focus:bg-white/95 transition-all duration-200 shadow-sm"
              >
                <option value="patient">Пациент</option>
                <option value="doctor">Врач</option>
                <option value="admin">Администратор</option>
              </select>
            </div>
            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white disabled:opacity-50 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                style={{
                  background: 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)',
                  color: '#9a3412',
                  boxShadow: '0 10px 30px rgba(253, 186, 116, 0.4)',
                  border: '1px solid rgba(253, 186, 116, 0.3)'
                }}
              >
                {loading ? 'Регистрация...' : 'Зарегистрироваться'}
              </button>
            </div>
            <div className="text-center">
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="text-white/90 hover:text-white font-medium transition-colors duration-200 underline underline-offset-2"
              >
                Уже есть аккаунт? Войти
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default RegisterForm;
