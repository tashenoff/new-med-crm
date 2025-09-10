import React, { useEffect } from 'react';

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
      // Предотвращаем скролл фона
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = 'unset';
    };
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="modal-wrapper">
      <div 
        className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div 
          className={`modal-content bg-white dark:bg-gray-800 rounded-lg p-6 w-full ${size} max-h-[90vh] overflow-y-auto`}
          onClick={(e) => e.stopPropagation()}
        >
        {title && (
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            {title}
          </h3>
        )}
        
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
};

export default Modal;
