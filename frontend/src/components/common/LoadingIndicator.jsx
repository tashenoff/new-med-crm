import React from 'react';

export function LoadingSpinner({ size = 'md', label = 'Загрузка', decorative = false, className = '' }) {
  return <span className={`curai-spinner curai-spinner-${size} ${className}`} role={decorative ? undefined : 'status'} aria-label={decorative ? undefined : label} aria-hidden={decorative ? true : undefined} />;
}

export default function LoadingIndicator({ label = 'Загрузка…', inline = false, className = '' }) {
  const Tag = inline ? 'span' : 'div';
  return <Tag className={`curai-loading-indicator ${inline ? 'is-inline' : ''} ${className}`} role="status" aria-live="polite">
    <LoadingSpinner size={inline ? 'sm' : 'md'} decorative />
    <span>{label}</span>
  </Tag>;
}

export function AppLoading() {
  return <div className="curai-app-loading curai-surface-root" aria-busy="true">
    <div className="curai-app-loading-content"><span className="curai-app-loading-brand">Curai</span><LoadingIndicator label="Загружаем систему…" /></div>
  </div>;
}
