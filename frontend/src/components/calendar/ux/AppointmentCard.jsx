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
  statusColor,
  canEdit,
  onEdit,
  onDragStart,
  onDragEnd
}) => {
  const handleDragStart = (e) => {
    if (onDragStart) {
      onDragStart(e, appointment._id || appointment.id);
    }
  };

  const handleDragEnd = (e) => {
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
      className={`
        absolute top-1 left-1 right-1 p-2 rounded text-xs border 
        cursor-move z-50 transition-none ${statusColor}
      `}
      style={{ height: `${height - 8}px` }}
      onClick={handleClick}
    >
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


