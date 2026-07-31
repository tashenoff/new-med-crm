import React from 'react';
import { themeClasses } from '../../../hooks/useTheme';

/**
 * Компонент навигации по датам календаря
 */
const DateNavigation = ({ currentDate, onDateChange, onNewAppointment }) => {
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
    <div className="calendar-date-nav flex items-center justify-between p-4">
      {/* Объединенный блок: Стрелка - Дата - Стрелка */}
      <div className="flex items-center space-x-4 calendar-nav-date-block">
        {/* Кнопка "Предыдущий день" */}
        <button
          onClick={goToPreviousDay}
          className="calendar-nav-btn"
          title="Предыдущий день"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Текущая дата */}
        <div className="flex flex-col items-center calendar-date-heading">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white calendar-date-title">
            {formatDate(currentDate)}
          </h2>
          <p className="text-sm text-gray-600 dark:text-sky-100 calendar-date-subtitle">
            {formatShortDate(currentDate)}
          </p>
        </div>

        {/* Кнопка "Следующий день" */}
        <button
          onClick={goToNextDay}
          className="calendar-nav-btn"
          title="Следующий день"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Кнопка "Сегодня" */}
        {!isToday && (
          <button
            onClick={goToToday}
            className="calendar-date-pill ml-4"
          >
            Сегодня
          </button>
        )}
      </div>

      {/* Быстрые переходы и действия */}
      <div className="flex items-center space-x-2 calendar-date-actions">
        {/* Кнопка "Новая запись" */}
        {onNewAppointment && (
          <button
            onClick={onNewAppointment}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${themeClasses.button.primary} transition-colors flex items-center space-x-2 calendar-new-appointment-btn`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Новая запись</span>
          </button>
        )}

        {/* Выбор даты */}
        <input
          type="date"
          value={currentDate.toISOString().split('T')[0]}
          onChange={(e) => onDateChange(new Date(e.target.value))}
          className={`px-3 py-2 rounded-lg border ${themeClasses.input.default} ${themeClasses.input.focus} transition-colors calendar-date-input`}
        />
      </div>
    </div>
  );
};

export default DateNavigation;
