import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { AppLoading } from '../common/LoadingIndicator';
import CuraiButton from '../common/CuraiButton';
import ChangePasswordModal from '../modals/ChangePasswordModal';

// Keep protected screens unmounted until the saved session is verified.
export default function SessionGate({ children }) {
  const { user, token, loading, verificationError, retrySession, logout,
    showPasswordExpiredModal, handlePasswordChanged } = useAuth();

  if (showPasswordExpiredModal) {
    return <main className="curai-surface-root min-h-screen">
      <ChangePasswordModal isOpen onClose={() => {}} onPasswordChanged={handlePasswordChanged} />
    </main>;
  }
  if (loading) return <AppLoading />;
  if (token && !user) {
    return <main className="curai-surface-root min-h-screen flex items-center justify-center p-6">
      <section className="max-w-md rounded-2xl border border-curai-border bg-curai-surface p-6 shadow-lg" aria-labelledby="session-recovery-title">
        <h1 id="session-recovery-title" className="text-xl font-semibold text-curai-ink">Проверка доступа к кабинету</h1>
        <p className="my-4 text-curai-muted" role="status">{verificationError || 'Проверяем сохранённый вход.'}</p>
        <div className="flex flex-wrap gap-3">
          <CuraiButton variant="primary" onClick={retrySession}>Повторить проверку</CuraiButton>
          <CuraiButton onClick={logout}>Выйти</CuraiButton>
        </div>
      </section>
    </main>;
  }
  return children;
}
