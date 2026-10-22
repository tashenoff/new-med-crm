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
  // Curai currently supplies a light palette; use its tokens even with a legacy dark class.
  const focusClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-curai-focus';
  const navigationClass = `p-1 hover:bg-curai-hover rounded text-curai-muted ${focusClass}`;

  return (
    <div className="bg-curai-surface text-curai-ink rounded-xl border border-curai-border shadow-sm w-full max-w-64 flex-shrink-0">
      {/* Заголовок */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-curai-border">
        <button type="button" aria-label="Предыдущий месяц" onClick={goToPreviousMonth} className={navigationClass}>
          «
        </button>
        <span className="text-sm font-semibold text-curai-ink capitalize">
          {formatMonthYear(viewDate)}
        </span>
        <button type="button" aria-label="Следующий месяц" onClick={goToNextMonth} className={navigationClass}>
          »
        </button>
      </div>

      {/* Дни недели */}
      <div className="grid grid-cols-7 border-b border-curai-border">
        {weekDays.map(day => (
          <div key={day} className="text-center text-xs font-medium text-curai-muted py-1.5">
            {day}
          </div>
        ))}
      </div>

      {/* Сетка дней */}
      <div className="grid grid-cols-7 p-1 gap-0.5">
        {days.map((dayObj, index) => {
          const isTodayDate = isToday(dayObj.date);
          const isSelectedDate = isSelected(dayObj.date);
          
          let stateClass = 'bg-curai-surface text-curai-ink hover:bg-curai-hover';
          if (isSelectedDate) {
            stateClass = 'bg-[var(--curai-color-blue)] text-[color:var(--curai-neutral-0)] hover:bg-curai-blueHover font-bold';
          } else if (isTodayDate) {
            stateClass = 'bg-curai-selected text-curai-blue ring-1 ring-inset ring-curai-blue hover:bg-curai-hover font-semibold';
          } else if (!dayObj.isCurrentMonth) {
            stateClass = 'bg-curai-surface text-curai-muted hover:bg-curai-hover';
          }

          return (
            <button
              key={index}
              type="button"
              aria-label={dayObj.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
              aria-pressed={isSelectedDate}
              aria-current={isTodayDate ? 'date' : undefined}
              onClick={() => handleDateClick(dayObj.date)}
              className={`w-8 h-7 rounded text-xs flex items-center justify-center transition-colors ${stateClass} ${focusClass}`}
            >
              {dayObj.day}
            </button>
          );
        })}
      </div>

      {/* Футер */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-curai-border">
        <button type="button" aria-label="Предыдущий месяц" onClick={goToPreviousMonth} className={navigationClass}>&lt;</button>
        <button type="button" onClick={goToToday} className={`text-sm font-medium text-curai-blue hover:underline ${focusClass}`}>
          Сегодня
        </button>
        <button type="button" aria-label="Следующий месяц" onClick={goToNextMonth} className={navigationClass}>&gt;</button>
      </div>
    </div>
  );
};

export default CalendarWidget;
