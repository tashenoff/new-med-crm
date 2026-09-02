import React from 'react';
import { themeClasses } from '../../../hooks/useTheme';

/**
 * Компонент навигации по датам календаря
 */
const DateNavigation = ({ currentDate, onDateChange, onNewAppointment, isFullscreen, onToggleFullscreen }) => {
  // Функции для изменения даты
  const goToPreviousDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 1);
    onDateChange(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 1);
    onDateChange(newDate);
  };

  const goToToday = () => {
    onDateChange(new Date());
  };

  // Форматирование даты
  const formatDate = (date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dateString = date.toDateString();
    const todayString = today.toDateString();
    const yesterdayString = yesterday.toDateString();
    const tomorrowString = tomorrow.toDateString();

    if (dateString === todayString) {
      return 'Сегодня';
    } else if (dateString === yesterdayString) {
      return 'Вчера';
    } else if (dateString === tomorrowString) {
      return 'Завтра';
    } else {
      return date.toLocaleDateString('ru-RU', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  };

  const formatShortDate = (date) => {
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const isToday = currentDate.toDateString() === new Date().toDateString();

  return (
    <div className="calendar-date-nav flex items-center justify-end p-4 space-x-2">
      {/* Кнопка "Новая запись" */}
      {onNewAppointment && (
        <button
          onClick={onNewAppointment}
          data-guide="add-appointment-btn"
          className={`px-4 py-2 rounded-lg text-sm font-medium ${themeClasses.button.primary} transition-colors flex items-center space-x-2 calendar-new-appointment-btn`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Новая запись</span>
        </button>
      )}

      {/* Кнопка полноэкранного режима */}
      {onToggleFullscreen && (
        <button
          onClick={onToggleFullscreen}
          className={`p-2 rounded-lg border ${themeClasses.border.default} ${themeClasses.bg.secondary} hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
          title={isFullscreen ? "Выйти из полноэкранного режима" : "Полноэкранный режим"}
        >
          {isFullscreen ? (
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
};

export default DateNavigation;
