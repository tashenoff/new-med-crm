import React, { useState, useEffect } from 'react';

/**
 * Боковой виджет календаря для навигации по датам
 */
const CalendarWidget = ({ currentDate, onDateChange }) => {
  const [viewDate, setViewDate] = useState(currentDate);

  useEffect(() => {
    setViewDate(currentDate);
  }, [currentDate]);

  const goToPreviousMonth = () => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setViewDate(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setViewDate(newDate);
  };

  const goToToday = () => {
    const today = new Date();
    setViewDate(today);
    onDateChange(today);
  };

  const formatMonthYear = (date) => {
    return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  };

  // Получение дней для отображения в календаре
  const getDaysInMonth = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    
    // Первый день месяца
    const firstDay = new Date(year, month, 1);
    // Последний день месяца
    const lastDay = new Date(year, month + 1, 0);
    
    // День недели первого дня (0 = воскресенье, преобразуем в понедельник = 0)
    let firstDayOfWeek = firstDay.getDay() - 1;
    if (firstDayOfWeek === -1) firstDayOfWeek = 6;
    
    // Количество дней в месяце
    const daysInMonth = lastDay.getDate();
    
    // Количество дней из предыдущего месяца
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    
    const days = [];
    
    // Добавляем дни из предыдущего месяца
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      days.push({
        day: prevMonthLastDay - i,
        isCurrentMonth: false,
        isPrevMonth: true,
        date: new Date(year, month - 1, prevMonthLastDay - i)
      });
    }
    
    // Добавляем дни текущего месяца
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(year, month, i)
      });
    }
    
    // Добавляем дни из следующего месяца для заполнения недели
    const remainingDays = 7 - (days.length % 7);
    if (remainingDays < 7) {
      for (let i = 1; i <= remainingDays; i++) {
        days.push({
          day: i,
          isCurrentMonth: false,
          isNextMonth: true,
          date: new Date(year, month + 1, i)
        });
      }
    }
    
    return days;
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date) => {
    return date.toDateString() === currentDate.toDateString();
  };

  const handleDateClick = (date) => {
    onDateChange(date);
    if (date.getMonth() !== viewDate.getMonth()) {
      setViewDate(date);
    }
  };

  const days = getDaysInMonth();
  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm w-64 flex-shrink-0">
      {/* Заголовок */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <button onClick={goToPreviousMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
          «
        </button>
        <span className="text-sm font-semibold text-gray-800 dark:text-white capitalize">
          {formatMonthYear(viewDate)}
        </span>
        <button onClick={goToNextMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
          »
        </button>
      </div>

      {/* Дни недели */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
        {weekDays.map(day => (
          <div key={day} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-1.5">
            {day}
          </div>
        ))}
      </div>

      {/* Сетка дней */}
      <div className="grid grid-cols-7 p-1 gap-0.5">
        {days.map((dayObj, index) => {
          const isTodayDate = isToday(dayObj.date);
          const isSelectedDate = isSelected(dayObj.date);
          
          let bgClass = 'bg-green-50 dark:bg-green-900/10 hover:bg-green-100 dark:hover:bg-green-900/20';
          let textClass = 'text-gray-700 dark:text-gray-300';
          
          if (!dayObj.isCurrentMonth) {
            bgClass = 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30';
            textClass = 'text-red-400 dark:text-red-500';
          } else if (isSelectedDate) {
            bgClass = 'bg-yellow-400 dark:bg-yellow-500';
            textClass = 'text-gray-900 font-bold';
          } else if (isTodayDate) {
            bgClass = 'bg-green-200 dark:bg-green-800 ring-1 ring-green-500';
            textClass = 'text-green-800 dark:text-green-200 font-semibold';
          }

          return (
            <button
              key={index}
              onClick={() => handleDateClick(dayObj.date)}
              className={`w-8 h-7 rounded text-xs flex items-center justify-center transition-colors ${bgClass} ${textClass}`}
            >
              {dayObj.day}
            </button>
          );
        })}
      </div>

      {/* Футер */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 dark:border-gray-700">
        <button onClick={goToPreviousMonth} className="text-gray-400 hover:text-gray-600">&lt;</button>
        <button onClick={goToToday} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
          Сегодня
        </button>
        <button onClick={goToNextMonth} className="text-gray-400 hover:text-gray-600">&gt;</button>
      </div>
    </div>
  );
};

export default CalendarWidget;
