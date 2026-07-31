import React from 'react';

/**
 * Компонент карточки записи
 * @param {Object} props
 * @param {Object} props.appointment - Данные записи
 * @param {Object} props.patient - Данные пациента
 * @param {Object} props.doctor - Данные врача
 * @param {number} props.height - Высота карточки в пикселях
 * @param {string} props.statusColor - CSS класс цвета статуса
 * @param {boolean} props.canEdit - Можно ли редактировать
 * @param {Function} props.onEdit - Обработчик редактирования
 * @param {Function} props.onDragStart - Обработчик начала перетаскивания
 */
const AppointmentCard = ({
  appointment,
  patient,
  doctor,
  height,
  statusColor, // Оставляем для обратной совместимости, но не используем
  canEdit,
  onEdit,
  onDragStart,
  onDragEnd
}) => {
  // Получаем цвет календаря врача
  const doctorColor = doctor?.calendar_color || '#3B82F6';
  
  // Конвертируем hex в rgba с прозрачностью для фона
  const hexToRgba = (hex, alpha = 0.15) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  
  // Вычисляем цвет текста на основе яркости фона
  const getTextColor = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#1F2937' : '#FFFFFF';
  };
  const handleDragStart = (e) => {
    console.log(`🚀 DRAG START: appointmentId=${appointment._id || appointment.id}, patient=${patient?.name}`);
    
    // Настраиваем drag операцию
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData('text/plain', ''); // Для совместимости
    
    if (onDragStart) {
      onDragStart(e, appointment._id || appointment.id);
    }
  };

  const handleDragEnd = (e) => {
    console.log(`🏁 DRAG END: appointmentId=${appointment._id || appointment.id}, patient=${patient?.name}, dropEffect=${e.dataTransfer.dropEffect}`);
    
    if (onDragEnd) {
      onDragEnd(e);
    }
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit(appointment);
    }
  };

  return (
    <div
      draggable={canEdit}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className="absolute top-1 left-1 right-1 rounded text-xs cursor-move z-50 transition-none overflow-hidden"
      style={{ 
        height: `${height - 8}px`,
        backgroundColor: hexToRgba(doctorColor, 0.15),
        color: getTextColor(doctorColor),
        padding: '6px 10px 6px 14px'
      }}
      onClick={handleClick}
    >
      {/* Цветная полоска слева */}
      <div 
        className="absolute top-0 left-0 bottom-0"
        style={{
          width: '4px',
          backgroundColor: doctorColor
        }}
      />
      {/* Имя пациента */}
      <div className="font-semibold">
        {patient?.full_name || 'Неизвестный пациент'}
      </div>
      
      {/* Имя врача */}
      <div className="text-xs opacity-75">
        {doctor?.full_name || 'Неизвестный врач'}
      </div>
      
      {/* Причина приема */}
      {appointment.reason && (
        <div className="text-xs opacity-75 mt-1">
          {appointment.reason}
        </div>
      )}
      
      {/* Время записи */}
      <div className="text-xs opacity-60 mt-1">
        {appointment.appointment_time}
        {appointment.end_time && ` - ${appointment.end_time}`}
      </div>
    </div>
  );
};

export default AppointmentCard;
