import React from 'react';

/**
 * Заголовок с временными метками
 */
const TimeHeader = ({ timeSlots }) => {
  return (
    <div className="time-header bg-gray-50 border-b border-gray-200">
      <div className="flex">
        {/* Пустая колонка для названий кабинетов */}
        <div className="w-32 px-4 py-2 border-r border-gray-200">
          <span className="font-semibold text-gray-700">Кабинеты</span>
        </div>
        
        {/* Временные метки */}
        <div className="flex flex-1">
          {timeSlots.map((time) => (
            <div 
              key={time}
              className="flex-1 px-2 py-2 text-center text-sm font-medium text-gray-600 border-r border-gray-200 last:border-r-0"
            >
              {time}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TimeHeader;