import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

const Modal = ({ 
  show, 
  onClose, 
  title, 
  children, 
  size = 'max-w-4xl',
  dialogLabel,
  className = '',
  onKeyDown,
  footer = null,
  subheader = null,
  errorMessage = null 
}) => {
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (show) {
      document.addEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = document.querySelector('.curai-dialog[role="dialog"]') ? 'hidden' : 'unset';
    };
  }, [show, onClose]);

  if (!show) return null;

  const modalContent = (
    <div className="modal-wrapper curai-surface-root">
      <div 
        className="modal-overlay curai-dialog-backdrop"
        onClick={onClose}
      />
      <div 
        className={`modal-content curai-dialog curai-glass-shell bg-curai-surface rounded-md w-full ${size} max-h-[90vh] flex flex-col relative ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel || title}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Фиксированная шапка модального окна */}
        <div className="curai-dialog-header flex-shrink-0 curai-glass-header">
          {/* Кнопка закрытия (крестик) */}
          <button
            onClick={onClose}
            className="curai-dialog-close z-10"
            aria-label="Закрыть"
          >
            <svg 
              className="w-6 h-6" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M6 18L18 6M6 6l12 12" 
              />
            </svg>
          </button>

          {title && (
            <h3 className="text-lg font-semibold text-curai-ink pr-8">
              {title}
            </h3>
          )}
        </div>

        {subheader && <div className="curai-glass-body curai-dialog-subheader">{subheader}</div>}
        {/* Прокручиваемое содержимое */}
        <div className="curai-dialog-body flex-1 overflow-y-auto curai-glass-body">
          {errorMessage && (
            <div className={`border px-4 py-3 rounded mb-4 ${
              typeof errorMessage === 'string' && errorMessage.startsWith('✅') 
                ? "bg-curai-positiveBg border-curai-positive text-curai-positive "
                : "bg-curai-negativeBg border-curai-negative text-curai-negative "
            }`}>
              <span className="block">{errorMessage}</span>
            </div>
          )}

          {children}
        </div>
        {footer && <div className="curai-dialog-footer curai-glass-body">{footer}</div>}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default Modal;
