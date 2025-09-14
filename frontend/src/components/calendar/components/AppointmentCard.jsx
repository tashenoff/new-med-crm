import React from 'react';

/**
 * Карточка записи пациента
 */
const AppointmentCard = ({
  appointment,
  patient,
  doctor,
  canEdit,
  onEdit,
  onDragStart,
  onDragEnd
}) => {
  // Обработчик начала перетаскивания
  const handleDragStart = (e) => {
    console.log('🚀 CARD DRAG START:', appointment.id);
    
    // Настраиваем drag операцию
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData('text/plain', appointment.id);
    
    if (onDragStart) {
      onDragStart(appointment);
    }
  };

  // Обработчик окончания перетаскивания
  const handleDragEnd = (e) => {
    console.log('🏁 CARD DRAG END:', appointment.id);
    
    if (onDragEnd) {
      onDragEnd();
    }
  };

  // Обработчик клика по карточке
  const handleClick = (e) => {
    e.stopPropagation(); // Предотвращаем всплытие к слоту
    
    if (onEdit) {
      onEdit(appointment);
    }
  };

  // Цвет карточки в зависимости от статуса
  const getStatusColor = (status) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'confirmed': return 'bg-green-100 border-green-300 text-green-800';
      case 'completed': return 'bg-gray-100 border-gray-300 text-gray-800';
      case 'cancelled': return 'bg-red-100 border-red-300 text-red-800';
      default: return 'bg-blue-100 border-blue-300 text-blue-800';
    }
  };

  return (
    <div
      draggable={canEdit}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={`
        appointment-card absolute inset-1 p-2 rounded border-2 cursor-pointer
        transition-all duration-200 hover:shadow-md
        ${getStatusColor(appointment.status)}
        ${canEdit ? 'cursor-move' : 'cursor-pointer'}
      `}
    >
      {/* Время */}
      <div className="text-xs font-medium mb-1">
        {appointment.appointment_time}
      </div>
      
      {/* Имя пациента */}
      <div className="text-sm font-semibold mb-1 truncate">
        {patient?.name || 'Неизвестный пациент'}
      </div>
      
      {/* Врач */}
      {doctor && (
        <div className="text-xs text-gray-600 truncate">
          Врач: {doctor.name}
        </div>
      )}
      
      {/* Статус */}
      <div className="text-xs opacity-75 mt-1">
        {appointment.status === 'scheduled' && 'Запланировано'}
        {appointment.status === 'confirmed' && 'Подтверждено'}
        {appointment.status === 'completed' && 'Выполнено'}
        {appointment.status === 'cancelled' && 'Отменено'}
      </div>
    </div>
  );
};

export default AppointmentCard;