import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import { themeClasses } from '../../../hooks/useTheme';
import CalendarWidget from './CalendarWidget';

const CalendarDatePicker = ({ currentDate, onDateChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({});
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const popoverId = useId();

  useLayoutEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const anchor = buttonRef.current.getBoundingClientRect();
      const width = Math.min(256, window.innerWidth - 16);
      setPosition({
        left: Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8)),
        top: anchor.bottom + 6,
        width,
        maxHeight: Math.max(0, window.innerHeight - anchor.bottom - 14)
      });
    };
    const onPointerDown = (event) => {
      if (!buttonRef.current.contains(event.target) && !popoverRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        buttonRef.current.focus();
      }
    };

    updatePosition();
    popoverRef.current.querySelector('button')?.focus();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  const selectDate = (date) => {
    onDateChange(date);
    setIsOpen(false);
    buttonRef.current.focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title="Выбрать дату"
        aria-label="Выбрать дату"
        aria-expanded={isOpen}
        aria-controls={popoverId}
        aria-haspopup="dialog"
        onClick={() => setIsOpen(open => !open)}
        className={`p-2 flex-shrink-0 rounded-lg border ${themeClasses.border.default} ${themeClasses.bg.secondary} hover:bg-gray-100 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors`}
      >
        <CalendarDaysIcon aria-hidden="true" className="w-5 h-5 text-gray-600 dark:text-gray-300" />
      </button>
      {isOpen && createPortal(
        <div
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-label="Выбор даты"
          className="fixed z-[60] overflow-auto rounded-xl shadow-xl"
          style={position}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
        >
          <CalendarWidget currentDate={currentDate} onDateChange={selectDate} />
        </div>,
        document.body
      )}
    </>
  );
};

export default CalendarDatePicker;
