import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

const Modal = ({ 
  show, 
  onClose, 
  title, 
  children, 
  size = 'max-w-4xl',
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
      document.body.style.overflow = 'unset';
    };
  }, [show, onClose]);

  if (!show) return null;

  const modalContent = (
    <div className="modal-wrapper">
      <div 
        className="modal-overlay"
        onClick={onClose}
      />
      <div 
        className={`modal-content bg-white dark:bg-gray-800 rounded-lg w-full ${size} max-h-[90vh] flex flex-col relative`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Фиксированная шапка модального окна */}
        <div className="flex-shrink-0 p-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          {/* Кнопка закрытия (крестик) */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full p-1"
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
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white pr-8">
              {title}
            </h3>
          )}
        </div>

        {/* Прокручиваемое содержимое */}
        <div className="flex-1 overflow-y-auto p-6">
          {errorMessage && (
            <div className={`border px-4 py-3 rounded mb-4 ${
              typeof errorMessage === 'string' && errorMessage.startsWith('✅') 
                ? 'bg-green-100 dark:bg-green-900 border-green-400 dark:border-green-600 text-green-700 dark:text-green-300'
                : 'bg-red-100 dark:bg-red-900 border-red-400 dark:border-red-600 text-red-700 dark:text-red-300'
            }`}>
              <span className="block">{errorMessage}</span>
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default Modal;
