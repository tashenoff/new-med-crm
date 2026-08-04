import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

function LoginForm({ onSwitchToRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  // Проверка заполненности полей
  const isFormValid = email.trim() !== '' && password.trim() !== '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(email, password, rememberMe);
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
              Вход в систему
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600 dark:text-sky-100">
              Система управления клиникой
            </p>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-100/80 backdrop-blur-sm border border-red-400/50 text-red-700 px-4 py-3 rounded-lg shadow-sm">
                {error}
              </div>
            )}
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
            <div className="flex items-center">
              <input
                id="rememberMe"
                name="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-orange-500 focus:ring-orange-400 border-white/30 rounded bg-white/90 cursor-pointer"
              />
              <label htmlFor="rememberMe" className="ml-2 block text-sm text-white cursor-pointer select-none">
                Запомнить меня
              </label>
            </div>
            <div>
              <button
                type="submit"
                disabled={loading || !isFormValid}
                className={`group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] ${
                  isFormValid && !loading
                    ? 'hover:shadow-2xl transform hover:scale-[1.03]'
                    : 'opacity-60 cursor-not-allowed'
                }`}
                style={{
                  background: isFormValid
                    ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
                    : 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)',
                  color: isFormValid ? '#ffffff' : '#9a3412',
                  boxShadow: isFormValid
                    ? '0 15px 40px rgba(249, 115, 22, 0.5)'
                    : '0 10px 30px rgba(253, 186, 116, 0.4)',
                  border: isFormValid
                    ? '1px solid rgba(249, 115, 22, 0.4)'
                    : '1px solid rgba(253, 186, 116, 0.3)'
                }}
              >
                {loading ? 'Вход...' : 'Войти'}
              </button>
            </div>
            <div className="text-center">
              <button
                type="button"
                onClick={onSwitchToRegister}
                className="text-white/90 hover:text-white font-medium transition-colors duration-200 underline underline-offset-2"
              >
                Нет аккаунта? Зарегистрироваться
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LoginForm;
