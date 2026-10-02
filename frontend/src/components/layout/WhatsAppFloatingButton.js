import React from 'react';
import { createPortal } from 'react-dom';

// Плавающая кнопка WhatsApp, открывающая инбокс чатов (аналог FloatingInsightBadge для ИИ).
// Рендерится через portal в document.body, чтобы position:fixed не ломался:
// стеклянная обёртка CRM (backdrop-blur) превращает себя в containing block
// и кнопка иначе паркуется в низу скроллящегося контента, а не вьюпорта.
const WhatsAppFloatingButton = ({ isOpen, onToggle }) => {
  if (isOpen) return null;
  return createPortal(
    <div
      className="fixed bottom-5 right-5 z-[9999] cursor-pointer hover:scale-105 transition-transform"
      onClick={onToggle}
      title="WhatsApp чаты"
    >
      <div className="w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all">
        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 004.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2zm5.83 14.06c-.25.7-1.45 1.36-2.02 1.4-.54.05-.57.38-3.6-.75-2.83-1.05-4.64-3.78-4.78-3.96-.14-.18-1.14-1.51-1.14-2.89 0-1.37.72-2.04.98-2.32.25-.28.55-.35.73-.35.18 0 .37 0 .53.01.17.01.4-.06.62.48.25.6.84 2.05.91 2.2.07.14.12.31.02.5-.09.18-.14.29-.28.45-.14.16-.3.36-.43.48-.14.14-.29.29-.13.57.16.28.72 1.18 1.54 1.91 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.18.7-.81.88-1.09.18-.28.37-.23.62-.14.25.09 1.6.75 1.88.89.28.14.46.21.53.33.07.11.07.65-.18 1.33z" />
        </svg>
      </div>
    </div>,
    document.body
  );
};

export default WhatsAppFloatingButton;
