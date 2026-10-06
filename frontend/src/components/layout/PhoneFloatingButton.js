import React from 'react';
import { createPortal } from 'react-dom';

// Плавающая кнопка телефонии, открывающая виджет набора номера.
// Рендерится через portal в document.body, чтобы position:fixed не ломался стеклянной обёрткой CRM.
const PhoneFloatingButton = ({ isOpen, onToggle }) => {
  if (isOpen) return null;
  return createPortal(
    <div
      className='fixed bottom-5 right-24 z-[9999] cursor-pointer hover:scale-105 transition-transform'
      onClick={onToggle}
      title='Телефония'
    >
      <div className='w-14 h-14 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all'>
        <svg className='w-7 h-7' fill='currentColor' viewBox='0 0 24 24'>
          <path d='M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z' />
        </svg>
      </div>
    </div>,
    document.body
  );
};

export default PhoneFloatingButton;

