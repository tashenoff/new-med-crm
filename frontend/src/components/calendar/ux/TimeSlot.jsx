import React from 'react';
import { themeClasses } from '../../../hooks/useTheme';

/**
 * Компонент временного слота
 * @param {Object} props
 * @param {string} props.time - Время слота (например "10:00")
 * @param {string} props.roomId - ID кабинета
 * @param {string} props.date - Дата (YYYY-MM-DD)
 * @param {Object} props.appointment - Запись в этом слоте (если есть)
 * @param {Object} props.availableDoctor - Доступный врач в этом слоте
 * @param {boolean} props.isOccupied - Занят ли слот
 * @param {boolean} props.canEdit - Можно ли редактировать
 * @param {Function} props.onSlotClick - Обработчик клика по слоту
 * @param {Function} props.onDragOver - Обработчик drag over
 * @param {Function} props.onDrop - Обработчик drop
 * @param {Function} props.onEditAppointment - Обработчик редактирования записи
 */
// Конвертирует hex-цвет (#RRGGBB) в rgba строку
const hexToRgba = (hex, alpha = 0.15) => {
  if (!hex || hex.length < 7) return undefined;
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } catch {
    return undefined;
  }
};

const TimeSlot = ({
  time,
  roomId,
  date,
  appointment,
  availableDoctor,
  isOccupied,
  canEdit,
  onSlotClick,
  onDragOver,
  onDrop,
  onEditAppointment,
  dragOverSlot,
  isDragOver
}) => {
  const handleSlotClick = () => {
    if (!appointment && availableDoctor) {
      onSlotClick(date, time, roomId);
    }
  };

  const handleDragOver = (e) => {
    // КРИТИЧНО: Предотвращаем стандартное поведение браузера
    e.preventDefault();
    e.stopPropagation();
    
    // Показываем что drop разрешен
    e.dataTransfer.dropEffect = "move";
    
    // Логируем только каждый 10-й dragOver чтобы не спамить
    if (Math.random() < 0.1) {
      console.log(`🎯 DRAG OVER: roomId=${roomId}, time=${time}, hasDoctor=${!!availableDoctor}`);
    }
    
    if (onDragOver) {
      onDragOver(e, roomId, time);
    }
  };

  const handleDragLeave = (e) => {
    // КРИТИЧНО: Предотвращаем стандартное поведение браузера
    e.preventDefault();
    e.stopPropagation();
    
    if (onDragOver) {
      onDragOver(e, null, null);
    }
  };

  const handleDrop = (e) => {
    console.log(`📥 DROP: roomId=${roomId}, time=${time}, hasDoctor=${!!availableDoctor}`);
    
    // ЭКСТРЕННОЕ УВЕДОМЛЕНИЕ - это должно быть видно всегда
    if (time >= '18:00') {
      console.error(`🚨 ПОЗДНИЙ СЛОТ DROP: ${time} - это может вызвать исчезновение карточки!`);
      alert(`🚨 DROP на поздний слот ${time}! Смотрите консоль.`);
    }
    
    // КРИТИЧНО: Предотвращаем стандартное поведение браузера
    e.preventDefault();
    e.stopPropagation();
    
    // Говорим браузеру что drop успешен
    e.dataTransfer.dropEffect = "move";
    
    if (onDrop) {
      onDrop(e, roomId, date, time);
    }
  };

  // Цвет фона на основе цвета врача
  const doctorColor = availableDoctor?.calendar_color;
  const slotBgColor = doctorColor ? hexToRgba(doctorColor, 0.12) : undefined;

  const slotClassNames = [
    'calendar-timeslot',
    availableDoctor ? 'calendar-timeslot-available' : 'calendar-timeslot-empty',
    isDragOver ? 'calendar-timeslot-dragover' : ''
  ].filter(Boolean).join(' ');

  return (
    <div
      className={`h-16 border-b border-l ${themeClasses.border.light} relative cursor-pointer transition-all duration-200 ${slotClassNames}`}
      onClick={handleSlotClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={slotBgColor ? { backgroundColor: slotBgColor } : undefined}
    >
      {/* Пустой слот - ничего не показываем */}
    </div>
  );
};

export default TimeSlot;
