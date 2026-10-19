import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import CuraiButton from '../common/CuraiButton';
import AuthDots from './AuthDots';
import '../../theme/curai-auth.css';

function LoginForm() {
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
    <main className="curai-surface-root curai-auth-page">
      <AuthDots />
      <section className="curai-auth-panel" aria-labelledby="login-title">
        <div className="curai-auth-brand">Curai</div>
        <form className="curai-auth-form" onSubmit={handleSubmit} aria-busy={loading} aria-describedby={error ? 'login-error' : undefined}>
          <header className="curai-auth-heading"><h1 id="login-title">Вход в систему</h1><p>Рады видеть вас в Curai.</p></header>
          {error && <div id="login-error" className="curai-auth-error" role="alert"><strong>Ошибка входа</strong><p>{error}</p></div>}
          <div className="curai-auth-credentials">
            <div className="curai-auth-field"><label htmlFor="email">Email или логин</label><input id="email" name="email" type="text" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} placeholder="Введите email или логин" /></div>
            <div className="curai-auth-field"><label htmlFor="password">Пароль</label><input id="password" name="password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Введите пароль" /></div>
          </div>
          <label className="curai-auth-remember" htmlFor="rememberMe"><input id="rememberMe" name="rememberMe" type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} /><span>Запомнить меня</span></label>
          <CuraiButton variant="primary" type="submit" className="curai-auth-submit" disabled={loading || !isFormValid}>{loading ? 'Вход...' : 'Войти'}</CuraiButton>
        </form>
      </section>
    </main>
  );
}

export default LoginForm;
